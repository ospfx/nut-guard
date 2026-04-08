-- LuCI controller for nut-guard
-- Menu path: Admin > Services > Nut Guard
-- Copyright (C) 2025 ospfx  MIT License

module("luci.controller.nut_guard", package.seeall)

local nixio = require("nixio")

function index()
	if not nixio.fs.access("/etc/config/nut_guard") then
		return
	end

	entry(
		{"admin", "services", "nut_guard"},
		firstchild(),
		_("Nut Guard"),
		60
	).dependent = false

	-- Configuration page via CBI
	entry(
		{"admin", "services", "nut_guard", "config"},
		cbi("nut_guard"),
		_("Configuration"),
		10
	)

	-- Status page: loads the JS view at
	-- /www/luci-static/resources/view/nut_guard/index.js
	entry(
		{"admin", "services", "nut_guard", "status"},
		view("nut_guard/index"),
		_("Status"),
		20
	)

	-- JSON API endpoints (leaf = true means no sub-menu entry)
	entry(
		{"admin", "services", "nut_guard", "api", "status"},
		call("action_status")
	).leaf = true

	entry(
		{"admin", "services", "nut_guard", "api", "reload"},
		call("action_reload")
	).leaf = true
end

-- ── helpers ─────────────────────────────────────────────────────────────────────────────

-- Query NUT server via TCP.
-- Returns (vars_table, nil) or (nil, error_string).
local function nut_query(host, ups, timeout)
	local sock, err = nixio.connect(host, 3493)
	if not sock then
		return nil, "Cannot connect to " .. host .. ":3493 - " .. tostring(err)
	end

	sock:setblocking(true)
	-- nixio setsockopt timeout is in milliseconds
	sock:setsockopt("socket", "rcvtimeo", math.floor(timeout * 1000))
	sock:setsockopt("socket", "sndtimeo", math.floor(timeout * 1000))

	local sent, serr = sock:send("LIST VAR " .. ups .. "\n")
	if not sent then
		sock:close()
		return nil, "Send error: " .. tostring(serr)
	end

	local vars    = {}
	local started = false
	local buf     = ""

	while true do
		local chunk = sock:recv(4096)
		if not chunk or #chunk == 0 then break end
		buf = buf .. chunk

		while true do
			local nl = buf:find("\n")
			if not nl then break end
			local line = buf:sub(1, nl - 1):gsub("\r", "")
			buf = buf:sub(nl + 1)

			if line:match("^BEGIN LIST VAR") then
				started = true
			elseif line:match("^END LIST VAR") then
				sock:close()
				if not started or next(vars) == nil then
					return nil, "No variables for UPS '" .. ups .. "'"
				end
				return vars, nil
			elseif line:match("^ERR ") then
				sock:close()
				return nil, "NUT error: " .. line:sub(5)
			elseif started and line:match("^VAR ") then
				-- VAR <upsname> <key> "<value>"
				local key, val = line:match('^VAR %S+ (%S+) "(.-)"%s*$')
				if key then vars[key] = val end
			end
		end
	end

	sock:close()
	return nil, "Incomplete response from NUT server"
end

-- ── API: status ────────────────────────────────────────────────────────────────────────

function action_status()
	local uci_mod = require("luci.model.uci")
	local http    = require("luci.http")
	local cursor  = uci_mod.cursor()

	local enabled = cursor:get("nut_guard", "main", "enabled") or "0"
	local ups     = cursor:get("nut_guard", "main", "ups")     or "myups"
	local ip      = cursor:get("nut_guard", "main", "ip")      or "127.0.0.1"
	local timeout = tonumber(
		cursor:get("nut_guard", "main", "command_timeout_seconds")
	) or 3

	http.prepare_content("application/json")

	if enabled == "0" then
		http.write_json({ code = 0, data = {
			enabled = false,
			running = false,
			ups     = ups,
			ip      = ip,
		}})
		return
	end

	local t0        = os.clock()
	local vars, err = nut_query(ip, ups, timeout)
	local took_ms   = math.floor((os.clock() - t0) * 1000)

	if err then
		http.write_json({ code = 1, error = err, data = {
			enabled = true,
			running = false,
			ups     = ups,
			ip      = ip,
			tookMs  = took_ms,
		}})
	else
		http.write_json({ code = 0, data = {
			enabled = true,
			running = true,
			ups     = ups,
			ip      = ip,
			tookMs  = took_ms,
			vars    = vars,
		}})
	end
end

-- ── API: reload ─────────────────────────────────────────────────────────────────────────

function action_reload()
	local http = require("luci.http")
	local sys  = require("luci.sys")

	http.prepare_content("application/json")

	local rc = sys.call("/etc/init.d/nut-guard reload >/dev/null 2>&1")
	if rc == 0 then
		http.write_json({ code = 0, message = "Service reloaded" })
	else
		http.write_json({ code = 1,
			message = "Reload failed (rc=" .. tostring(rc) .. ")" })
	end
end
