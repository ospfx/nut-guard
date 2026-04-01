const http = require("node:http")
const net = require("node:net")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const { URL } = require("node:url")

const ROOT = __dirname
const PUBLIC_DIR = path.join(ROOT, "public")
const CONFIG_PATH = path.join(ROOT, "config.json")

const CACHE = { ts: 0, payload: null }

function readConfig() {
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
  } catch {
    cfg = {}
  }
  if (!cfg || typeof cfg !== "object") cfg = {}
  return {
    ups: String(cfg.ups || "myups"),
    ip: String(cfg.ip || "127.0.0.1"),
    refreshSeconds: Number.isFinite(Number(cfg.refreshSeconds)) ? Number(cfg.refreshSeconds) : 5,
    commandTimeoutSeconds: Number.isFinite(Number(cfg.commandTimeoutSeconds)) ? Number(cfg.commandTimeoutSeconds) : 3,
    allowQueryOverride: Boolean(cfg.allowQueryOverride || false),
  }
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/
const HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9\-\.]{0,251}[A-Za-z0-9])?$/

function isValidIpOrHost(v) {
  const s = String(v || "").trim()
  if (!s) return false
  if (IPV4_RE.test(s)) {
    const parts = s.split(".")
    if (parts.length !== 4) return false
    for (const p of parts) {
      const n = Number(p)
      if (!Number.isInteger(n) || n < 0 || n > 255) return false
    }
    return true
  }
  return HOST_RE.test(s)
}

function safeUpsName(v) {
  const s = String(v || "").trim()
  if (!s || s.length > 64) return null
  if (!/^[A-Za-z0-9_\-\.]+$/.test(s)) return null
  return s
}

function parseUpscOutput(text) {
  const data = {}
  const raw = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const s = line.trimEnd()
    if (!s) continue
    raw.push(s)
    const idx = s.indexOf(":")
    if (idx <= 0) continue
    const k = s.slice(0, idx).trim()
    const v = s.slice(idx + 1).trim()
    if (k) data[k] = v
  }
  return { data, raw }
}

function runUpscJS({ ups, ip, timeoutSeconds }) {
  return new Promise((resolve) => {
    const started = Date.now()
    let done = false
    let socket = null
    let buffer = ""

    const timer = setTimeout(() => {
      if (done) return
      done = true
      try {
        if (socket) socket.destroy()
      } catch {}
      resolve({
        ok: false,
        error: `NUT 服务器连接超时（>${timeoutSeconds}s）`,
        tookMs: Date.now() - started,
      })
    }, Math.max(1000, Math.floor(timeoutSeconds * 1000)))

    try {
      socket = net.createConnection({ host: ip, port: 3493 }, () => {
        // 连接成功后发送命令
        socket.write(`LIST VAR ${ups}\n`)
      })

      socket.on("data", (data) => {
        buffer += data.toString("utf8")
        
        // 检查是否收到完整响应（以END LIST VAR结尾）
        if (buffer.includes("END LIST VAR")) {
          if (done) return
          done = true
          clearTimeout(timer)
          
          const lines = buffer.split(/\r?\n/).filter(line => line.trim())
          const raw = []
          const upsData = {}
          let inVarList = false
          
          for (const line of lines) {
            raw.push(line)
            if (line.startsWith("BEGIN LIST VAR")) {
              inVarList = true
              continue
            }
            if (line.startsWith("END LIST VAR")) {
              break
            }
            if (inVarList && line.startsWith("VAR ")) {
              const parts = line.split(/\s+/, 3)
              if (parts.length >= 3) {
                const key = parts[2]
                const value = line.substring(parts.slice(0, 3).join(" ").length + 1).replace(/^"|"$/g, "")
                upsData[key] = value
              }
            } else if (line.startsWith("ERR")) {
              const errorMsg = line.substring(4)
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
          
          // 检查是否获取到数据
          if (Object.keys(upsData).length === 0) {
            resolve({
              ok: false,
              error: "未获取到UPS数据，请检查UPS名称是否正确",
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
        }
      })

      socket.on("error", (err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        const msg = String(err && err.message ? err.message : err)
        resolve({ ok: false, error: `连接 NUT 服务器失败: ${msg}`, tookMs: Date.now() - started })
      })

      socket.on("end", () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({
          ok: false,
          error: "NUT 服务器连接意外关闭",
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

function runUpsc({ ups, ip, timeoutSeconds }) {
  return runUpscJS({ ups, ip, timeoutSeconds })
}

function sendJSON(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 0), "utf8")
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": body.length,
  })
  res.end(body)
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  const body = Buffer.from(String(text || ""), "utf8")
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Length": body.length,
  })
  res.end(body)
}

function mimeByExt(p) {
  const ext = path.extname(p).toLowerCase()
  if (ext === ".html") return "text/html; charset=utf-8"
  if (ext === ".css") return "text/css; charset=utf-8"
  if (ext === ".js") return "application/javascript; charset=utf-8"
  if (ext === ".json") return "application/json; charset=utf-8"
  if (ext === ".svg") return "image/svg+xml"
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  return "application/octet-stream"
}

async function atomicWriteJSON(filePath, obj) {
  const tmp = `${filePath}.tmp`
  const data = JSON.stringify(obj, null, 2)
  await fsp.writeFile(tmp, data, "utf8")
  await fsp.rename(tmp, filePath)
}

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (c) => {
      size += c.length
      if (size > limitBytes) {
        reject(new Error("Body too large"))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function safeJoinPublic(urlPath) {
  const rel = urlPath.replace(/^\/+/, "")
  const full = path.resolve(PUBLIC_DIR, rel)
  const base = path.resolve(PUBLIC_DIR)
  if (!full.startsWith(base)) return null
  return full
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`)
  const pathname = u.pathname || "/"

  if (req.method === "GET" && pathname === "/api/config") {
    sendJSON(res, 200, readConfig())
    return
  }

  if (pathname === "/api/config" && req.method === "POST") {
    let body = null
    try {
      body = await readBody(req)
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e && e.message ? e.message : "无效请求体" })
      return
    }
    let obj = null
    try {
      obj = JSON.parse(body.toString("utf8"))
    } catch {
      sendJSON(res, 400, { ok: false, error: "无效 JSON" })
      return
    }
    if (!obj || typeof obj !== "object") {
      sendJSON(res, 400, { ok: false, error: "无效 JSON" })
      return
    }

    const cfg = readConfig()
    const ups = Object.prototype.hasOwnProperty.call(obj, "ups") ? safeUpsName(obj.ups) : cfg.ups
    const ip = Object.prototype.hasOwnProperty.call(obj, "ip") ? String(obj.ip || "").trim() : cfg.ip
    const refreshSeconds = Object.prototype.hasOwnProperty.call(obj, "refreshSeconds")
      ? Number(obj.refreshSeconds)
      : cfg.refreshSeconds
    const commandTimeoutSeconds = Object.prototype.hasOwnProperty.call(obj, "commandTimeoutSeconds")
      ? Number(obj.commandTimeoutSeconds)
      : cfg.commandTimeoutSeconds
    const allowQueryOverride = Object.prototype.hasOwnProperty.call(obj, "allowQueryOverride")
      ? Boolean(obj.allowQueryOverride)
      : cfg.allowQueryOverride

    if (!ups) {
      sendJSON(res, 400, { ok: false, error: "ups 名称不合法" })
      return
    }
    if (!isValidIpOrHost(ip)) {
      sendJSON(res, 400, { ok: false, error: "ip/host 不合法" })
      return
    }

    const refresh = Math.max(2, Math.min(3600, Number.isFinite(refreshSeconds) ? Math.floor(refreshSeconds) : 5))
    const timeout = Math.max(1, Math.min(30, Number.isFinite(commandTimeoutSeconds) ? Math.floor(commandTimeoutSeconds) : 3))

    const newCfg = { ups, ip, refreshSeconds: refresh, commandTimeoutSeconds: timeout, allowQueryOverride }
    try {
      await atomicWriteJSON(CONFIG_PATH, newCfg)
    } catch (e) {
      sendJSON(res, 500, { ok: false, error: e && e.message ? e.message : "保存失败" })
      return
    }
    sendJSON(res, 200, { ok: true, ...newCfg })
    return
  }

  if (req.method === "GET" && pathname === "/api/ups") {
    const cfg = readConfig()
    let ups = cfg.ups
    let ip = cfg.ip
    if (cfg.allowQueryOverride) {
      const qIp = u.searchParams.get("ip")
      const qUps = u.searchParams.get("ups")
      if (qIp && isValidIpOrHost(qIp)) ip = qIp.trim()
      if (qUps) {
        const safe = safeUpsName(qUps)
        if (safe) ups = safe
      }
    }

    const key = `${ups}@${ip}`
    const now = Date.now()
    if (CACHE.payload && now - CACHE.ts < 1000) {
      sendJSON(res, 200, { ...CACHE.payload, cache: true, key })
      return
    }

    const payload = await runUpsc({ ups, ip, timeoutSeconds: cfg.commandTimeoutSeconds })
    const withMeta = { ...payload, cache: false, key }
    CACHE.ts = now
    CACHE.payload = withMeta
    sendJSON(res, 200, withMeta)
    return
  }

  if (req.method !== "GET") {
    sendText(res, 405, "Method Not Allowed")
    return
  }

  if (pathname === "/" || pathname === "") {
    const file = path.join(PUBLIC_DIR, "index.html")
    try {
      const body = await fsp.readFile(file)
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
      res.end(body)
    } catch {
      sendText(res, 404, "Not Found")
    }
    return
  }

  const filePath = safeJoinPublic(pathname)
  if (!filePath) {
    sendText(res, 404, "Not Found")
    return
  }

  let stat = null
  try {
    stat = await fsp.stat(filePath)
  } catch {
    stat = null
  }
  let finalPath = filePath
  if (stat && stat.isDirectory()) finalPath = path.join(filePath, "index.html")

  try {
    const body = await fsp.readFile(finalPath)
    res.writeHead(200, { "Content-Type": mimeByExt(finalPath), "Cache-Control": "no-store" })
    res.end(body)
  } catch {
    sendText(res, 404, "Not Found")
  }
})

const HOST = process.env.HOST || "0.0.0.0"
const PORT = Number(process.env.PORT || "8765")

server.listen(PORT, HOST, () => {
  process.stdout.write(`UPS Web: http://${HOST}:${PORT}/\n`)
})
