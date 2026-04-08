# nut-guard – OpenWrt rpcd/ubus 后端

本目录包含 OpenWrt 专用打包文件，使用 **B 方案（rpcd/ubus）** 替代 Node.js 后端。

## 架构概览

```
NUT upsd (TCP 3493)
        │
        │ LIST VAR <ups>
        ▼
/usr/libexec/rpcd/nutguard   ← Lua rpcd exec-plugin
        │
        │ ubus JSON
        ▼
rpcd  →  ubus 总线
        │
        ├─ LuCI (luci-app-nut-guard) 调用 nutguard.*
        └─ 命令行 ubus call nutguard.*
```

无后台守护进程。每次 ubus 调用时 rpcd 按需启动 Lua 插件，结果带 1 秒文件缓存以减少高频请求压力。

---

## 包结构

| 路径 | 说明 |
|------|------|
| `nut-guard/` | 核心后端包 |
| `nut-guard/files/usr/libexec/rpcd/nutguard` | Lua rpcd exec-plugin |
| `nut-guard/files/etc/config/nut-guard` | 默认 UCI 配置 |
| `nut-guard/files/etc/init.d/nut-guard` | 触发 rpcd reload 的 init 脚本 |
| `luci-app-nut-guard/` | LuCI Web 界面包 |

---

## UCI 配置

配置文件：`/etc/config/nut-guard`

```uci
config nut-guard 'settings'
    option ups_name            'myups'      # UPS 名称（upsd 中定义的 name）
    option nut_host            '127.0.0.1'  # NUT upsd 主机地址（IPv4 或主机名）
    option nut_port            '3493'       # NUT upsd 端口（仅文档用，固定 3493）
    option refresh_seconds     '5'          # 前端刷新间隔（秒，2–3600）
    option timeout_seconds     '3'          # TCP 连接/读取超时（秒，1–30）
    option allow_query_override '0'         # 是否允许通过 ubus 参数覆盖 ups/ip
```

---

## ubus 接口

### `nutguard get_config`

读取当前 UCI 配置，无需参数。

```bash
ubus call nutguard get_config '{}'
```

示例响应：

```json
{
    "ups": "myups",
    "ip": "127.0.0.1",
    "refreshSeconds": 5,
    "commandTimeoutSeconds": 3,
    "allowQueryOverride": false
}
```

---

### `nutguard set_config`

写入 UCI 配置并持久化（执行 `uci commit`）。支持部分更新，未传字段保留原值。

```bash
ubus call nutguard set_config '{
    "ups": "myups",
    "ip": "10.0.0.9",
    "refreshSeconds": 10,
    "commandTimeoutSeconds": 5,
    "allowQueryOverride": false
}'
```

参数说明：

| 参数 | 类型 | 约束 |
|------|------|------|
| `ups` | string | 正则 `^[A-Za-z0-9_\-\.]+$`，长度 ≤ 64 |
| `ip` | string | IPv4 或合法主机名 |
| `refreshSeconds` | number | 2–3600 |
| `commandTimeoutSeconds` | number | 1–30 |
| `allowQueryOverride` | boolean | — |

成功响应（含最终生效值）：

```json
{
    "ok": true,
    "ups": "myups",
    "ip": "10.0.0.9",
    "refreshSeconds": 10,
    "commandTimeoutSeconds": 5,
    "allowQueryOverride": false
}
```

失败响应示例：

```json
{
    "ok": false,
    "error": "ups 名称不合法（允许 A-Z a-z 0-9 _ - . 且长度 ≤ 64）"
}
```

---

### `nutguard get_ups`

连接 NUT upsd，发送 `LIST VAR <ups>`，解析并返回所有 UPS 变量。
结果带 1 秒文件缓存（`/tmp/.nut-guard-cache.json`）。

```bash
# 使用 UCI 中配置的 ups/ip
ubus call nutguard get_ups '{}'

# 若 allowQueryOverride=true，可临时覆盖
ubus call nutguard get_ups '{"ups":"myups","ip":"10.0.0.9"}'
```

**成功响应**：

```json
{
    "ok": true,
    "ups": "myups",
    "ip": "10.0.0.9",
    "cache": false,
    "key": "myups@10.0.0.9",
    "tookMs": 12,
    "data": {
        "ups.status": "OL",
        "battery.charge": "100",
        "battery.runtime": "3600",
        "ups.load": "15",
        "output.voltage": "230.0",
        "ups.model": "Back-UPS CS 650",
        "..."  : "..."
    },
    "raw": [
        "BEGIN LIST VAR myups",
        "VAR myups ups.status \"OL\"",
        "..."
    ]
}
```

**失败响应**（含诊断信息）：

```json
{
    "ok": false,
    "error": "NUT 服务器连接超时（>3s）",
    "cache": false,
    "key": "myups@10.0.0.9",
    "tookMs": 3001
}
```

常见错误信息：

| 错误信息 | 原因 |
|----------|------|
| `NUT 服务器连接超时（>Ns）` | TCP 连接 / 读取超时 |
| `连接 NUT 服务器失败（errno=N）` | 主机不可达、端口未监听 |
| `NUT 服务器连接超时或意外关闭` | 连接建立后对端关闭 |
| `NUT 错误: UNKNOWN-UPS` | upsd 返回 ERR，UPS 名称不存在 |
| `未获取到 UPS 数据，请检查 UPS 名称是否正确` | 响应为空列表 |

---

## 安装步骤

### 方法 A：通过 OpenWrt SDK / buildroot

1. 将 `openwrt/nut-guard` 和 `openwrt/luci-app-nut-guard` 复制到 feeds 目录。
2. 运行 `./scripts/feeds update -a && ./scripts/feeds install nut-guard luci-app-nut-guard`。
3. 在 `make menuconfig` 中选中两个包，然后编译。

### 方法 B：手动安装（调试用）

```bash
# 1. 安装依赖
opkg update
opkg install rpcd lua libuci-lua luci-base nixio

# 2. 复制插件
scp openwrt/nut-guard/files/usr/libexec/rpcd/nutguard root@<router>:/usr/libexec/rpcd/
chmod +x /usr/libexec/rpcd/nutguard

# 3. 上传默认配置（若不存在）
scp openwrt/nut-guard/files/nut-guard.conf root@<router>:/etc/config/nut-guard

# 4. 复制 ACL 文件（如需 LuCI）
scp openwrt/luci-app-nut-guard/root/usr/share/rpcd/acl.d/luci-app-nut-guard.json \
    root@<router>:/usr/share/rpcd/acl.d/

# 5. 重载 rpcd
/etc/init.d/rpcd reload
```

### 验证

```bash
# 列出插件方法（应返回 get_config/set_config/get_ups）
/usr/libexec/rpcd/nutguard list

# 通过 ubus 调用
ubus call nutguard get_config '{}'
ubus call nutguard get_ups '{}'
```

---

## 与 Node.js 版本对比

| 特性 | Node.js (旧) | rpcd/ubus (新) |
|------|-------------|----------------|
| 运行时 | Node.js (≥50 MB RAM) | Lua + rpcd (≈2 MB) |
| 后台进程 | 常驻 | 无（按需调用）|
| 配置存储 | `config.json` | UCI (`/etc/config/nut-guard`) |
| 接口协议 | HTTP REST | ubus / rpcd |
| LuCI 集成 | 独立端口 | 原生 ubus |
| 缓存 | 进程内内存 | 文件（1 秒 TTL）|
| 重启后配置 | 需手动保存 JSON | UCI 自动持久化 |
