#!/usr/bin/env node
'use strict'

/**
 * Nut Guard — NUT monitoring daemon for OpenWrt/ImmortalWrt
 *
 * Reads configuration from UCI (/etc/config/nut-guard), periodically
 * queries the NUT (Network UPS Tools) server via TCP, and writes the
 * result to /tmp/nut-guard/status.json for consumption by the LuCI UI.
 *
 * No HTTP server is started — management is handled by LuCI/uhttpd.
 * Run under procd via /etc/init.d/nut-guard.
 */

const net = require('node:net')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
const path = require('node:path')

const STATUS_DIR = '/tmp/nut-guard'
const STATUS_FILE = path.join(STATUS_DIR, 'status.json')

// ---------------------------------------------------------------------------
// UCI helpers
// ---------------------------------------------------------------------------

const UCI_KEY_RE = /^[A-Za-z0-9._-]+$/

function uciGet(key, defaultValue) {
  if (!UCI_KEY_RE.test(key)) return defaultValue
  try {
    const val = execSync(`uci -q get ${key}`, {
      encoding: 'utf8',
      timeout: 2000,
    }).trim()
    return val || defaultValue
  } catch {
    return defaultValue
  }
}

function readConfig() {
  const refresh = Math.max(
    2,
    Math.min(3600, parseInt(uciGet('nut-guard.main.refresh_seconds', '5'), 10) || 5)
  )
  const timeout = Math.max(
    1,
    Math.min(30, parseInt(uciGet('nut-guard.main.command_timeout_seconds', '3'), 10) || 3)
  )
  return {
    ups: uciGet('nut-guard.main.ups', 'myups'),
    ip: uciGet('nut-guard.main.ip', '127.0.0.1'),
    port: parseInt(uciGet('nut-guard.main.port', '3493'), 10) || 3493,
    refreshSeconds: refresh,
    commandTimeoutSeconds: timeout,
  }
}

// ---------------------------------------------------------------------------
// NUT client — pure JS, no external dependencies
// (logic mirrors the existing server.js implementation)
// ---------------------------------------------------------------------------

function runUpscJS({ ups, ip, port, timeoutSeconds }) {
  return new Promise((resolve) => {
    const started = Date.now()
    let done = false
    let socket = null
    let buffer = ''

    const timer = setTimeout(() => {
      if (done) return
      done = true
      try {
        if (socket) socket.destroy()
      } catch {}
      resolve({
        ok: false,
        error: `NUT server connection timed out (>${timeoutSeconds}s)`,
        tookMs: Date.now() - started,
      })
    }, Math.max(1000, Math.floor(timeoutSeconds * 1000)))

    try {
      socket = net.createConnection({ host: ip, port: port || 3493 }, () => {
        socket.write(`LIST VAR ${ups}\n`)
      })

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')

        if (!buffer.includes('END LIST VAR')) return
        if (done) return
        done = true
        clearTimeout(timer)

        const lines = buffer.split(/\r?\n/).filter((l) => l.trim())
        const raw = []
        const upsData = {}
        let inVarList = false

        for (const line of lines) {
          raw.push(line)
          if (line.startsWith('BEGIN LIST VAR')) {
            inVarList = true
            continue
          }
          if (line.startsWith('END LIST VAR')) break
          if (inVarList && line.startsWith('VAR ')) {
            const parts = line.split(/\s+/, 3)
            if (parts.length >= 3) {
              const key = parts[2]
              const value = line
                .substring(parts.slice(0, 3).join(' ').length + 1)
                .replace(/^"|"$/g, '')
              upsData[key] = value
            }
          } else if (line.startsWith('ERR')) {
            socket.destroy()
            resolve({
              ok: false,
              error: `NUT server error: ${line.substring(4).trim()}`,
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
            error: 'No UPS data received — check UPS name',
            raw: raw.slice(-50),
            tookMs: Date.now() - started,
          })
          return
        }

        resolve({
          ok: true,
          ups,
          ip,
          data: upsData,
          raw: raw.slice(-200),
          tookMs: Date.now() - started,
        })
      })

      socket.on('error', (err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({
          ok: false,
          error: `Failed to connect to NUT server: ${err.message}`,
          tookMs: Date.now() - started,
        })
      })

      socket.on('end', () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({
          ok: false,
          error: 'NUT server connection closed unexpectedly',
          tookMs: Date.now() - started,
        })
      })
    } catch (err) {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({
        ok: false,
        error: `Failed to connect to NUT server: ${err.message}`,
        tookMs: Date.now() - started,
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Status file writer
// ---------------------------------------------------------------------------

function writeStatus(data) {
  try {
    if (!fs.existsSync(STATUS_DIR)) {
      fs.mkdirSync(STATUS_DIR, { recursive: true })
    }
    const tmp = `${STATUS_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, STATUS_FILE)
  } catch (err) {
    process.stderr.write(`[nut-guard] Failed to write status: ${err.message}\n`)
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let running = true
let sleepTimer = null

process.on('SIGTERM', () => {
  running = false
  if (sleepTimer) {
    clearTimeout(sleepTimer)
    sleepTimer = null
  }
})

process.on('SIGHUP', () => {
  // Config is re-read on every iteration; SIGHUP just logs
  process.stdout.write('[nut-guard] Received SIGHUP — reloading config on next poll\n')
})

async function main() {
  process.stdout.write('[nut-guard] Daemon started\n')

  while (running) {
    const config = readConfig()
    try {
      const result = await runUpscJS({
        ups: config.ups,
        ip: config.ip,
        port: config.port,
        timeoutSeconds: config.commandTimeoutSeconds,
      })
      writeStatus({
        timestamp: new Date().toISOString(),
        ups: config.ups,
        host: config.ip,
        port: config.port,
        ...result,
      })
    } catch (err) {
      writeStatus({
        timestamp: new Date().toISOString(),
        ok: false,
        error: String(err && err.message ? err.message : err),
      })
    }

    await new Promise((r) => {
      sleepTimer = setTimeout(r, config.refreshSeconds * 1000)
    })
    sleepTimer = null
  }
}

main().catch((err) => {
  process.stderr.write(`[nut-guard] Fatal: ${err.message}\n`)
  process.exit(1)
})
