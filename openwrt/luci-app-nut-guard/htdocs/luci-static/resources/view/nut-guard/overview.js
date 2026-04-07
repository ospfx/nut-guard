const $ = (id) => document.getElementById(id)

const state = {
  timer: null,
  refreshSeconds: 5,
  config: null,
}

// ---- 常量/映射：避免在 renderData 内重复创建 ----
const STATUS_TEXT_MAP = {
  OL: "在线",
  OB: "电池供电",
  LB: "低电量",
  HB: "高电量",
  RB: "需要更换电池",
  CHRG: "充电中",
  DISCHRG: "放电中",
  BYPASS: "旁路模式",
  CAL: "校准中",
  OFF: "关闭",
  OVER: "过载",
  TRIM: "电压调整（降压）",
  BOOST: "电压调整（升压）",
}

const UPS_TYPE_MAP = {
  "offline / line interactive": "离线/在线互动式",
  online: "在线式",
  "line interactive": "在线互动式",
  offline: "离线式",
  standby: "备用式",
}

const BEEPER_TEXT_MAP = {
  enabled: "开启",
  disabled: "关闭",
  muted: "静音",
}

// 阈值集中管理
const THRESHOLDS = {
  chargeDanger: 20,
  chargeWarning: 80,

  runtimeDangerSeconds: 5 * 60, // 5分钟
  runtimeWarningSeconds: 30 * 60, // 30分钟

  loadWarning: 50,
  loadDanger: 80,

  powerRatioWarning: 50,
  powerRatioDanger: 80,
}

// NUT参数中文映射表
const nutParamMap = {
  // 电池相关
  "battery.charge": "电池电量",
  "battery.charge.low": "电池低电量阈值",
  "battery.runtime": "电池续航时间",
  "battery.type": "电池类型",
  // 设备相关
  "device.mfr": "设备制造商",
  "device.model": "设备型号",
  "device.serial": "设备序列号",
  "device.type": "设备类型",
  // 驱动相关
  "driver.debug": "驱动调试模式",
  "driver.flag.allow_killpower": "允许断电标志",
  "driver.name": "驱动名称",
  "driver.parameter.pollfreq": "轮询频率",
  "driver.parameter.pollinterval": "轮询间隔",
  "driver.parameter.port": "端口",
  "driver.parameter.productid": "产品ID",
  "driver.parameter.synchronous": "同步模式",
  "driver.parameter.vendorid": "厂商ID",
  "driver.state": "驱动状态",
  "driver.version": "驱动版本",
  "driver.version.data": "驱动数据版本",
  "driver.version.internal": "驱动内部版本",
  "driver.version.usb": "USB驱动版本",
  // 输入相关
  "input.transfer.high": "输入高压切换阈值",
  "input.transfer.low": "输入低压切换阈值",
  // 输出相关
  "output.frequency.nominal": "额定输出频率",
  "output.voltage": "输出电压",
  "output.voltage.nominal": "额定输出电压",
  // 插座相关
  "outlet.1.desc": "插座1描述",
  "outlet.1.id": "插座1 ID",
  "outlet.1.status": "插座1状态",
  "outlet.1.switchable": "插座1是否可切换",
  "outlet.desc": "主插座描述",
  "outlet.id": "主插座ID",
  "outlet.switchable": "主插座是否可切换",
  // UPS相关
  "ups.beeper.status": "蜂鸣器状态",
  "ups.delay.shutdown": "关机延迟",
  "ups.delay.start": "开机延迟",
  "ups.firmware": "UPS固件版本",
  "ups.load": "UPS负载",
  "ups.mfr": "UPS制造商",
  "ups.model": "UPS型号",
  "ups.power.nominal": "额定功率",
  "ups.productid": "UPS产品ID",
  "ups.realpower": "实际功率",
  "ups.serial": "UPS序列号",
  "ups.status": "UPS状态",
  "ups.timer.shutdown": "关机定时器",
  "ups.timer.start": "开机定时器",
  "ups.type": "UPS类型",
  "ups.vendorid": "UPS厂商ID",
}

function getParamName(key) {
  return nutParamMap[key] || key
}

function fmtRuntimeSeconds(s) {
  const n = Number(s)
  if (!Number.isFinite(n)) return "-"
  const sec = Math.max(0, Math.floor(n))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const r = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${r}s`
  return `${r}s`
}

function showError(msg) {
  const box = $("errorBox")
  if (!msg) {
    box.classList.add("hidden")
    box.textContent = ""
    return
  }
  box.classList.remove("hidden")
  box.textContent = msg
}

async function getJSON(url, opt) {
  const res = await fetch(url, opt)
  const text = await res.text()
  let obj = null
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error(`响应不是 JSON：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg = obj && obj.error ? obj.error : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return obj
}

function setMetric(id, v, colorClass = null) {
  const element = $(id)
  element.textContent = v == null || v === "" ? "-" : String(v)

  // 保持你当前约定：基础类为 v，再按需追加状态色
  element.className = "v"
  if (colorClass) element.classList.add(colorClass)
}

function colorByRange({ value, danger, warning, reversed = false }) {
  // reversed=false: 越大越危险(如 load)；reversed=true: 越小越危险(如 runtime)
  const n = Number(value)
  if (!Number.isFinite(n)) return null

  if (!reversed) {
    if (n > danger) return "status-danger"
    if (n > warning) return "status-warning"
    return "status-normal"
  }

  // reversed
  if (n < danger) return "status-danger"
  if (n < warning) return "status-warning"
  return "status-normal"
}

function parseUpsStatus(rawStatus) {
  const status = rawStatus || "-"
  const flags = new Set(String(status).split(/\s+/).filter(Boolean))

  // 文案：优先处理常见复合状态
  let text = STATUS_TEXT_MAP[status] || status
  if (flags.has("OB") && flags.has("LB")) {
    text = "电池供电（低电量）"
  } else if (flags.has("OB")) {
    text = "电池供电"
  } else if (flags.has("LB")) {
    text = "低电量"
  }

  // level 用于统一 UI 风险等级
  let level = "normal"
  if (flags.has("OB") && flags.has("LB")) level = "danger"
  else if (flags.has("LB")) level = "danger"
  else if (flags.has("OB")) level = "warning"
  else if (status === "OL") level = "normal"

  return { status, flags, text, level }
}

function runtimeMinutesPrefix(runtimeSeconds) {
  const runtimeNum = Number(runtimeSeconds)
  if (!Number.isFinite(runtimeNum) || runtimeNum <= 0) return ""
  const minutes = Math.ceil(runtimeNum / 60)
  return `${minutes}分钟 `
}

// 根据状态更新favicon和标题
function updateFaviconAndTitle(statusFlags, runtimeSeconds) {
  const favicon = document.querySelector("link[rel='icon']")
  if (!favicon) return

  // 基础电源图标SVG（保持你原有内容；这里只是提取成常量字符串）
  const baseSvg =
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='none'/%3E%3Cpath d='M35 30 L65 30 L65 55 L75 55 L75 45 L25 45 L25 55 L35 55 Z' fill='%234b5563'/%3E%3Cpath d='M40 55 L60 55 L60 75 L40 75 Z' fill='%234b5563'/%3E"

  const prefix = runtimeMinutesPrefix(runtimeSeconds)

  if (statusFlags.has("OB") && statusFlags.has("LB")) {
    // 红色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23ef4444'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`
    document.title = `⚠️ ${prefix}UPS 低电量 - 电池供电`
    return
  }

  if (statusFlags.has("OB")) {
    // 黄色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23f59e0b'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`
    document.title = `⚠️ ${prefix}UPS 电池供电`
    return
  }

  if (statusFlags.has("LB")) {
    // 红色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23ef4444'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`
    document.title = `⚠️ ${prefix}UPS 低电量`
    return
  }

  // 默认/在线
  favicon.href = `data:image/svg+xml,${baseSvg}%3C/svg%3E`
  document.title = statusFlags.size === 1 && statusFlags.has("OL") ? "UPS 状态 - 正常" : "UPS 状态"
}

function setGlobalAlert({ flags }) {
  const globalAlert = $("globalAlert")
  const alertIcon = $("alertIcon")
  const alertMessage = $("alertMessage")

  // 默认隐藏
  globalAlert.className = "global-alert hidden"

  // 统一按 flags 判断，避免 "OB LB" 这种字符串形式差异
  if (flags.has("OB") && flags.has("LB")) {
    globalAlert.className = "global-alert danger"
    alertIcon.textContent = "🚨"
    alertMessage.textContent = "UPS使用电池供电且电量低，可能即将关机！"
    return
  }

  if (flags.has("LB")) {
    globalAlert.className = "global-alert danger"
    alertIcon.textContent = "🚨"
    alertMessage.textContent = "UPS电池电量低，可能即将关机！"
    return
  }

  if (flags.has("OB")) {
    globalAlert.className = "global-alert warning"
    alertIcon.textContent = "⚠️"
    alertMessage.textContent = "UPS当前使用电池供电，请检查市电连接！"
  }
}

function setStatusMetric({ text, level }) {
  const el = $("mStatus")
  el.textContent = text
  el.className = "v"

  if (level === "danger") el.classList.add("status-danger")
  else if (level === "warning") el.classList.add("status-warning")
  else if (level === "normal") el.classList.add("status-normal")
}

function renderData(payload) {
  const data = payload && payload.data ? payload.data : {}

  const statusInfo = parseUpsStatus(data["ups.status"])
  updateFaviconAndTitle(statusInfo.flags, data["battery.runtime"])
  setGlobalAlert(statusInfo)
  setStatusMetric(statusInfo)

  // 类型/蜂鸣器
  const upsType = data["ups.type"] || "-"
  const typeText = UPS_TYPE_MAP[upsType] || upsType

  const beeperStatus = data["ups.beeper.status"] || "-"
  const beeperText = BEEPER_TEXT_MAP[beeperStatus] || beeperStatus

  // 电量颜色
  const charge = data["battery.charge"]
  const chargeColor =
    charge == null
      ? null
      : colorByRange({
          value: charge,
          danger: THRESHOLDS.chargeDanger,
          warning: THRESHOLDS.chargeWarning,
          reversed: true, // 低电量危险
        })
  setMetric("mCharge", charge != null ? `${charge}%` : "-", chargeColor)

  // 预计可用时间颜色
  const runtime = data["battery.runtime"]
  const runtimeColor =
    runtime == null
      ? null
      : colorByRange({
          value: runtime,
          danger: THRESHOLDS.runtimeDangerSeconds,
          warning: THRESHOLDS.runtimeWarningSeconds,
          reversed: true, // 时间越少越危险
        })
  setMetric("mRuntime", runtime != null ? fmtRuntimeSeconds(runtime) : "-", runtimeColor)

  // 负载颜色
  const load = data["ups.load"]
  const loadColor =
    load == null
      ? null
      : colorByRange({
          value: load,
          danger: THRESHOLDS.loadDanger,
          warning: THRESHOLDS.loadWarning,
          reversed: false, // 越大越危险
        })
  setMetric("mLoad", load != null ? `${load}%` : "-", loadColor)

  // 电压
  setMetric("mVoltage", data["output.voltage"] != null ? `${data["output.voltage"]} V` : "-")

  // 真实功率：按 real/nominal 比例上色
  const realPower = data["ups.realpower"]
  const nominalPower = data["ups.power.nominal"]
  let realPowerColor = null
  if (realPower != null && nominalPower != null) {
    const realPowerNum = Number(realPower)
    const nominalPowerNum = Number(nominalPower)
    if (Number.isFinite(realPowerNum) && Number.isFinite(nominalPowerNum) && nominalPowerNum > 0) {
      const ratio = (realPowerNum / nominalPowerNum) * 100
      realPowerColor = colorByRange({
        value: ratio,
        danger: THRESHOLDS.powerRatioDanger,
        warning: THRESHOLDS.powerRatioWarning,
        reversed: false,
      })
    }
  }
  setMetric("mRealPower", realPower != null ? `${realPower} W` : "-", realPowerColor)

  // 其他静态信息
  setMetric("mType", typeText)
  setMetric("mNominalPower", nominalPower != null ? `${nominalPower} VA` : "-")
  setMetric("mBeeper", beeperText)
  setMetric("mBatteryType", data["battery.type"] || "-")

  // 设备信息
  const model = data["device.model"] || data["ups.model"] || "-"
  const mfr = data["device.mfr"] || data["ups.mfr"] || "-"
  $("deviceModel").textContent = `设备型号：${model}`
  $("deviceMfr").textContent = `制造商：${mfr}`

  // kv 表
  const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]))
  const body = $("kvBody")
  body.innerHTML = ""
  for (const [k, v] of entries) {
    const tr = document.createElement("tr")
    const tdK = document.createElement("td")
    const tdV = document.createElement("td")
    tdK.textContent = getParamName(k)
    tdV.textContent = v
    tr.appendChild(tdK)
    tr.appendChild(tdV)
    body.appendChild(tr)
  }

  const now = new Date()
  $("lastLine").textContent = `更新时间：${now.toLocaleString()}${payload.cache ? "（缓存）" : ""}`
  $("netLine").textContent = payload.tookMs != null ? `采集耗时：${payload.tookMs}ms` : ""
}

async function refreshOnce() {
  try {
    const payload = await getJSON("/api/ups")
    showError(payload.ok ? "" : payload.error || "采集失败")
    if (payload.ok) {
      renderData(payload)
      $("subtitle").textContent = `${payload.key || ""}`
    }
  } catch (e) {
    showError(e && e.message ? e.message : String(e))
  }
}

function restartTimer() {
  if (state.timer) window.clearInterval(state.timer)
  const sec = Math.max(2, Number(state.refreshSeconds) || 5)
  state.timer = window.setInterval(refreshOnce, sec * 1000)
}

async function loadConfig() {
  const cfg = await getJSON("/api/config")
  state.config = cfg
  state.refreshSeconds = cfg.refreshSeconds

  $("ipInput").value = cfg.ip || ""
  $("upsInput").value = cfg.ups || ""
  $("refreshInput").value = String(cfg.refreshSeconds || 5)

  const hint = []
  hint.push(`后端采集方式：JavaScript NUT 客户端 ${cfg.ups}@${cfg.ip}`)
  hint.push(`连接超时：${cfg.commandTimeoutSeconds}s`)
  hint.push(`允许 URL 参数覆盖：${cfg.allowQueryOverride ? "是" : "否"}`)
  $("configHint").textContent = hint.join(" · ")
}

async function saveConfig() {
  const ip = $("ipInput").value.trim()
  const ups = $("upsInput").value.trim()
  const refreshSeconds = Number($("refreshInput").value)

  const payload = await getJSON("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, ups, refreshSeconds }),
  })

  state.config = payload
  state.refreshSeconds = payload.refreshSeconds

  await loadConfig()
  restartTimer()
  await refreshOnce()
}

function bind() {
  $("refreshBtn").addEventListener("click", () => refreshOnce())
  $("saveBtn").addEventListener("click", async () => {
    $("saveBtn").disabled = true
    try {
      await saveConfig()
      showError("")
    } catch (e) {
      showError(e && e.message ? e.message : String(e))
    } finally {
      $("saveBtn").disabled = false
    }
  })
}

async function main() {
  bind()
  await loadConfig()
  restartTimer()
  await refreshOnce()
}

main()
