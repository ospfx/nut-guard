-- LuCI CBI model for nut-guard
-- Manages /etc/config/nut_guard via UCI
-- Path: /usr/lib/lua/luci/model/cbi/nut_guard.lua

m = Map("nut_guard", translate("Nut Guard"),
	translate("Configure the NUT UPS monitor. Changes are saved to /etc/config/nut_guard."))

-- ── Main section ──────────────────────────────────────────────────────────────

s = m:section(TypedSection, "main", translate("Basic Settings"))
s.anonymous = true
s.addremove = false

-- Enabled flag
enabled = s:option(Flag, "enabled", translate("Enable"))
enabled.default = "0"
enabled.rmempty = false

-- NUT server IP / hostname
ip = s:option(Value, "ip", translate("NUT Server IP / Host"))
ip.datatype    = "host"
ip.default     = "127.0.0.1"
ip.placeholder = "127.0.0.1"
ip.rmempty     = false

-- UPS name (as configured in ups.conf on the NUT server)
ups = s:option(Value, "ups", translate("UPS Name"))
ups.default     = "myups"
ups.placeholder = "myups"
ups.rmempty     = false
function ups.validate(self, value)
	if value and value:match("^[%w%.%-_]+$") and #value <= 64 then
		return value
	end
	return nil, translate("UPS name may only contain letters, digits, '.', '-' and '_'")
end

-- Refresh interval shown in the LuCI status view
refresh = s:option(Value, "refresh_seconds",
	translate("Status Refresh Interval (s)"))
refresh.datatype = "uinteger"
refresh.default  = "5"
refresh.rmempty  = false

-- Timeout for the NUT TCP connection
timeout = s:option(Value, "command_timeout_seconds",
	translate("NUT Connection Timeout (s)"))
timeout.datatype = "uinteger"
timeout.default  = "3"
timeout.rmempty  = false

-- Whether to allow URL query-param overrides (advanced)
override = s:option(Flag, "allow_query_override",
	translate("Allow Query Parameter Override"),
	translate("When enabled the status API accepts ?ups= and ?ip= overrides."))
override.default  = "0"
override.rmempty  = false

return m
