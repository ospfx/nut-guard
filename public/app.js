const $ = (id) => document.getElementById(id)

const state = {
  timer: null,
  refreshSeconds: 5,
  config: null,
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
  const element = $(id);
  element.textContent = v == null || v === "" ? "-" : String(v);
  
  // 移除所有颜色类
  element.className = "v";
  
  // 添加颜色类
  if (colorClass) {
    element.classList.add(colorClass);
  }
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
  "ups.vendorid": "UPS厂商ID"
}

function getParamName(key) {
  return nutParamMap[key] || key
}

// 根据状态更新favicon和标题
function updateFaviconAndTitle(status, runtime) {
  // 获取favicon元素
  const favicon = document.querySelector('link[rel="icon"]');
  
  // 基础电源图标SVG
  const baseSvg = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='none'/%3E%3Cpath d='M35 30 L65 30 L65 55 L75 55 L75 45 L25 45 L25 55 L35 55 Z' fill='%233b82f6'/%3E%3Cpath d='M40 60 L60 60 L55 80 L45 80 Z' fill='%233b82f6'/%3E";
  
  // 格式化运行时间
  let runtimeText = "";
  if (runtime != null) {
    const runtimeNum = Number(runtime);
    if (runtimeNum > 0) {
      const minutes = Math.ceil(runtimeNum / 60);
      runtimeText = `${minutes}分钟 `;
    }
  }
  
  // 根据状态更新favicon和标题
  if (status.includes("OB") && status.includes("LB")) {
    // 电池供电且低电量 - 红色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23ef4444'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`;
    document.title = `⚠️ ${runtimeText}UPS 低电量 - 电池供电`;  } else if (status.includes("OB")) {
    // 电池供电 - 黄色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23f59e0b'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`;
    document.title = `⚠️ ${runtimeText}UPS 电池供电`;  } else if (status.includes("LB")) {
    // 低电量 - 红色警告
    favicon.href = `data:image/svg+xml,${baseSvg}%3Ccircle cx='80' cy='20' r='15' fill='%23ef4444'/%3E%3Ctext x='80' y='25' font-size='16' font-weight='bold' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`;
    document.title = `⚠️ ${runtimeText}UPS 低电量`;  } else if (status === "OL") {
    // 在线状态 - 正常
    favicon.href = `data:image/svg+xml,${baseSvg}%3C/svg%3E`;
    document.title = "UPS 状态 - 正常";
  } else {
    // 其他状态
    favicon.href = `data:image/svg+xml,${baseSvg}%3C/svg%3E`;
    document.title = "UPS 状态";
  }
}

function renderData(payload) {
  const data = payload && payload.data ? payload.data : {}

  // 状态转换
  const statusMap = {
    "OL": "在线",
    "OB": "电池供电",
    "LB": "低电量",
    "HB": "高电量",
    "RB": "需要更换电池",
    "CHRG": "充电中",
    "DISCHRG": "放电中",
    "BYPASS": "旁路模式",
    "CAL": "校准中",
    "OFF": "关闭",
    "OVER": "过载",
    "TRIM": "电压调整（降压）",
    "BOOST": "电压调整（升压）"
  };
  
  // UPS类型转换
  const typeMap = {
    "offline / line interactive": "离线/在线互动式",
    "online": "在线式",
    "line interactive": "在线互动式",
    "offline": "离线式",
    "standby": "备用式"
  };
  
  // 蜂鸣器状态转换
  const beeperMap = {
    "enabled": "开启",
    "disabled": "关闭",
    "muted": "静音"
  };
  
  const status = data["ups.status"] || "-";
  let statusText = statusMap[status] || status;
  
  // 处理复合状态
  if (status.includes("OB") && status.includes("LB")) {
    statusText = "电池供电（低电量）";
  } else if (status.includes("OB")) {
    statusText = "电池供电";
  } else if (status.includes("LB")) {
    statusText = "低电量";
  }
  
  // 更新favicon和标题
  updateFaviconAndTitle(status, data["battery.runtime"]);
  
  const upsType = data["ups.type"] || "-";
  const typeText = typeMap[upsType] || upsType;
  
  const beeperStatus = data["ups.beeper.status"] || "-";
  const beeperText = beeperMap[beeperStatus] || beeperStatus;
  
  // 显示全局警告
  const globalAlert = document.getElementById("globalAlert");
  const alertIcon = document.getElementById("alertIcon");
  const alertMessage = document.getElementById("alertMessage");
  
  // 隐藏所有状态类
  globalAlert.className = "global-alert hidden";
  
  // 根据状态显示不同的警告
  if (status === "OB") {
    // 电池供电状态
    globalAlert.className = "global-alert warning";
    alertIcon.textContent = "⚠️";
    alertMessage.textContent = "UPS当前使用电池供电，请检查市电连接！";
  } else if (status === "LB") {
    // 低电量状态
    globalAlert.className = "global-alert danger";
    alertIcon.textContent = "🚨";
    alertMessage.textContent = "UPS电池电量低，可能即将关机！";
  } else if (status === "OB LB") {
    // 电池供电且低电量
    globalAlert.className = "global-alert danger";
    alertIcon.textContent = "🚨";
    alertMessage.textContent = "UPS使用电池供电且电量低，可能即将关机！";
  } else {
    // 其他状态，隐藏警告
    globalAlert.className = "global-alert hidden";
  }
  
  // 设置状态样式
  const statusElement = document.getElementById("mStatus");
  statusElement.textContent = statusText;
  
  // 移除所有状态类
  statusElement.className = "v";
  
  // 根据状态添加不同的类
  if (status.includes("OB") && status.includes("LB")) {
    // 电池供电且低电量状态，添加危险样式
    statusElement.classList.add("status-danger");
  } else if (status.includes("OB")) {
    // 电池供电状态，添加警告样式
    statusElement.classList.add("status-warning");
  } else if (status.includes("LB")) {
    // 低电量状态，添加危险样式
    statusElement.classList.add("status-danger");
  } else if (status === "OL") {
    // 在线状态，添加正常样式
    statusElement.classList.add("status-normal");
  }
  
  // 电量颜色区分
  const charge = data["battery.charge"];
  let chargeColor = null;
  if (charge != null) {
    const chargeNum = Number(charge);
    if (chargeNum < 20) {
      chargeColor = "status-danger";
    } else if (chargeNum < 80) {
      chargeColor = "status-warning";
    } else {
      chargeColor = "status-normal";
    }
  }
  setMetric("mCharge", charge != null ? `${charge}%` : "-", chargeColor);
  
  // 预计可用时间颜色区分
  const runtime = data["battery.runtime"];
  let runtimeColor = null;
  if (runtime != null) {
    const runtimeNum = Number(runtime);
    if (runtimeNum < 300) { // 5分钟
      runtimeColor = "status-danger";
    } else if (runtimeNum < 1800) { // 30分钟
      runtimeColor = "status-warning";
    } else {
      runtimeColor = "status-normal";
    }
  }
  setMetric("mRuntime", runtime != null ? fmtRuntimeSeconds(runtime) : "-", runtimeColor);
  
  // 负载颜色区分
  const load = data["ups.load"];
  let loadColor = null;
  if (load != null) {
    const loadNum = Number(load);
    if (loadNum > 80) {
      loadColor = "status-danger";
    } else if (loadNum > 50) {
      loadColor = "status-warning";
    } else {
      loadColor = "status-normal";
    }
  }
  setMetric("mLoad", load != null ? `${load}%` : "-", loadColor);
  
  setMetric("mVoltage", data["output.voltage"] != null ? `${data["output.voltage"]} V` : "-")
  
  // 真实功率颜色区分
  const realPower = data["ups.realpower"];
  const nominalPower = data["ups.power.nominal"];
  let realPowerColor = null;
  if (realPower != null && nominalPower != null) {
    const realPowerNum = Number(realPower);
    const nominalPowerNum = Number(nominalPower);
    if (nominalPowerNum > 0) {
      const powerRatio = (realPowerNum / nominalPowerNum) * 100;
      if (powerRatio > 80) {
        realPowerColor = "status-danger";
      } else if (powerRatio > 50) {
        realPowerColor = "status-warning";
      } else {
        realPowerColor = "status-normal";
      }
    }
  }
  setMetric("mRealPower", realPower != null ? `${realPower} W` : "-", realPowerColor);
  setMetric("mType", typeText)
  setMetric("mNominalPower", data["ups.power.nominal"] != null ? `${data["ups.power.nominal"]} VA` : "-")
  setMetric("mBeeper", beeperText)
  setMetric("mBatteryType", data["battery.type"] || "-")
  
  // 更新设备信息
  const model = data["device.model"] || data["ups.model"] || "-"
  const mfr = data["device.mfr"] || data["ups.mfr"] || "-"
  document.getElementById("deviceModel").textContent = `设备型号：${model}`
  document.getElementById("deviceMfr").textContent = `制造商：${mfr}`

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
