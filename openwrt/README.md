# OpenWrt / ImmortalWrt Build Notes

This directory contains two OpenWrt/ImmortalWrt packages:

| Directory | IPK package | Purpose |
|-----------|-------------|---------|
| `package/nut-guard/` | `nut-guard` | Node.js daemon + procd init script + default UCI config |
| `luci-app-nut-guard/` | `luci-app-nut-guard` | LuCI JS view, menu entry, rpcd ACL |

## Prerequisites

* ImmortalWrt 24.10.x (or OpenWrt 23.05+) build environment
* `node` package available in the feed (`openwrt/packages` feed provides it)
* LuCI packages included in the build

## Integrating as an external feed

```bash
# In your ImmortalWrt build root
echo 'src-link nutguard /path/to/nut-guard/openwrt' >> feeds.conf
./scripts/feeds update nutguard
./scripts/feeds install nut-guard luci-app-nut-guard
make menuconfig   # select both packages under Utilities / LuCI → Applications
make package/nut-guard/compile V=s
make package/luci-app-nut-guard/compile V=s
```

The resulting `.ipk` files land in `bin/packages/<arch>/nutguard/`.

## Installing pre-built IPKs on the router

```bash
opkg update
opkg install nut-guard_*.ipk luci-app-nut-guard_*.ipk
# Restart LuCI / uhttpd so the new menu entry is picked up
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

## Configuration

Edit `/etc/config/nut-guard` or use the LuCI page **Services → Nut Guard**:

```
config main 'main'
    option host '192.168.1.10'   # IP of your NUT server (upsd)
    option port '3493'           # NUT port (default 3493)
    option ups  'ups'            # UPS name in upsd
    option refresh_seconds '5'   # Poll interval (2–3600 s)
    option timeout_seconds '3'   # Query timeout  (1–30 s)
```

## Service management

```bash
/etc/init.d/nut-guard start
/etc/init.d/nut-guard stop
/etc/init.d/nut-guard restart
/etc/init.d/nut-guard enable   # start on boot
/etc/init.d/nut-guard disable  # remove from boot
```

The daemon writes UPS status to `/var/run/nut-guard/status.json` which
the LuCI page reads.  **No extra management port is opened.**
