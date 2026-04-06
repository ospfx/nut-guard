'use strict'

/**
 * Nut Guard - Background UPS Monitor Daemon
 *
 * This script runs as a background daemon managed by procd.
 * It reads configuration from UCI (/etc/config/nut-guard),
 * connects to a NUT server via TCP, and writes UPS status to
 * /var/run/nut-guard/status.json for consumption by the LuCI UI.
 *
 * No HTTP port is opened; the LuCI interface reads the status file
 * via the rpcd file.read RPC.
 */

const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const STATUS_FILE = '/var/run/nut-guard/status.json'
const STATUS_DIR = path.dirname(STATUS_FILE)

// ── UCI config reader ────────────────────────────────────────────────────────

function uciGet(key) {
  try {
    const result = spawnSync('uci', ['-q', 'get', `nut-guard.settings.${key}`], {
      encoding: 'utf8',
      timeout: 3000,
    })
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim()
    }
  } catch {}
  return null
}

function readUCIConfig() {
  const ups = uciGet('ups_name') || 'myups'
  const ip = uciGet('nut_host') || '127.0.0.1'
  const port = parseInt(uciGet('nut_port') || '3493', 10) || 3493
  const refreshSeconds = Math.max(2, parseInt(uciGet('refresh_seconds') || '10', 10) || 10)
  const commandTimeoutSeconds = Math.max(1, Math.min(30, parseInt(uciGet('timeout_seconds') || '3', 10) || 3))

  return { ups, ip, port, refreshSeconds, commandTimeoutSeconds }
}

// ── NUT TCP client (reused from server.js) ───────────────────────────────────

function runUpscJS({ ups, ip, port, timeoutSeconds }) {
  return new Promise((resolve) => {
    const started = Date.now()
    let done = false
    let socket = null
    let buffer = ''

    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { if (socket) socket.destroy() } catch {}
      resolve({
        ok: false,
        error: `NUT 服务器连接超时（>${timeoutSeconds}s）`,
        tookMs: Date.now() - started,
      })
    }, Math.max(1000, Math.floor(timeoutSeconds * 1000)))

    try {
      socket = net.createConnection({ host: ip, port }, () => {
        socket.write(`LIST VAR ${ups}\n`)
      })

      socket.on('data', (data) => {
        buffer += data.toString('utf8')

        if (buffer.includes('END LIST VAR')) {
          if (done) return
          done = true
          clearTimeout(timer)

          const lines = buffer.split(/\r?\n/).filter(line => line.trim())
          const raw = []
          const upsData = {}
          let inVarList = false

          for (const line of lines) {
            raw.push(line)
            if (line.startsWith('BEGIN LIST VAR')) {
              inVarList = true
              continue
            }
            if (line.startsWith('END LIST VAR')) {
              break
            }
            if (inVarList && line.startsWith('VAR ')) {
              const parts = line.split(/\s+/, 3)
              if (parts.length >= 3) {
                const key = parts[2]
                const value = line.substring(parts.slice(0, 3).join(' ').length + 1).replace(/^"|"$/g, '')
                upsData[key] = value
              }
            } else if (inVarList && line.startsWith('ERR')) {
              const errorMsg = line.substring(4)
              socket.destroy()
              resolve({
                ok: false,
                error: `NUT 服务器错误: ${errorMsg}`,
                raw: raw.slice(-50),
                tookMs: Date.now() - started,
              })
              return
            }
          }

          socket.end()

          if (Object.keys(upsData).length === 0) {
            resolve({
              ok: false,
              error: '未获取到 UPS 数据，请检查 UPS 名称是否正确',
              raw: raw.slice(-50),
              tookMs: Date.now() - started,
            })
            return
          }

          resolve({
            ok: true,
            ups,
            ip,
            port,
            data: upsData,
            raw: raw.slice(-200),
            tookMs: Date.now() - started,
          })
        }
      })

      socket.on('error', (err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        const msg = String(err && err.message ? err.message : err)
        resolve({ ok: false, error: `连接 NUT 服务器失败: ${msg}`, tookMs: Date.now() - started })
      })

      socket.on('end', () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({
          ok: false,
          error: 'NUT 服务器连接意外关闭',
          tookMs: Date.now() - started,
        })
      })
    } catch (err) {
      if (done) return
      done = true
      clearTimeout(timer)
      const msg = String(err && err.message ? err.message : err)
      resolve({ ok: false, error: `连接 NUT 服务器失败: ${msg}`, tookMs: Date.now() - started })
    }
  })
}

// ── Status file writer ───────────────────────────────────────────────────────

function writeStatus(obj) {
  try {
    if (!fs.existsSync(STATUS_DIR)) {
      fs.mkdirSync(STATUS_DIR, { recursive: true })
    }
    const tmp = STATUS_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    fs.renameSync(tmp, STATUS_FILE)
  } catch (err) {
    process.stderr.write(`[nut-guard] Failed to write status file: ${err.message}\n`)
  }
}

// ── Main monitoring loop ─────────────────────────────────────────────────────

async function pollOnce() {
  const cfg = readUCIConfig()

  const result = await runUpscJS({
    ups: cfg.ups,
    ip: cfg.ip,
    port: cfg.port,
    timeoutSeconds: cfg.commandTimeoutSeconds,
  })

  if (result.ok) {
    writeStatus({
      timestamp: new Date().toISOString(),
      connected: true,
      ups: cfg.ups,
      host: cfg.ip,
      port: cfg.port,
      vars: result.data,
      tookMs: result.tookMs,
    })
    process.stdout.write(`[nut-guard] OK: ${cfg.ups}@${cfg.ip} (${result.tookMs}ms)\n`)
  } else {
    writeStatus({
      timestamp: new Date().toISOString(),
      connected: false,
      ups: cfg.ups,
      host: cfg.ip,
      port: cfg.port,
      error: result.error,
      tookMs: result.tookMs,
    })
    process.stderr.write(`[nut-guard] Error: ${result.error}\n`)
  }

  return cfg.refreshSeconds
}

async function main() {
  process.stdout.write('[nut-guard] Starting Nut Guard monitor daemon\n')

  process.on('SIGTERM', () => {
    process.stdout.write('[nut-guard] Received SIGTERM, exiting\n')
    process.exit(0)
  })
  process.on('SIGINT', () => {
    process.stdout.write('[nut-guard] Received SIGINT, exiting\n')
    process.exit(0)
  })

  while (true) {
    let delay = 10
    try {
      delay = await pollOnce()
    } catch (err) {
      process.stderr.write(`[nut-guard] Unexpected error: ${err.message}\n`)
    }
    await new Promise(r => setTimeout(r, delay * 1000))
  }
}

main().catch(err => {
  process.stderr.write(`[nut-guard] Fatal: ${err.message}\n`)
  process.exit(1)
})
