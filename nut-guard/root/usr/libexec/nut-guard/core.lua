#!/usr/bin/env lua
--[[
  nut-guard/core.lua - NUT TCP client for OpenWrt
  Connects to a NUT (Network UPS Tools) server and returns JSON status.

  Usage: lua core.lua [ups] [host] [timeout_seconds]
  Reads defaults from /etc/config/nut_guard via UCI.

  Requires: lua, libuci-lua, libnixio-lua
]]

local nixio = require("nixio")
local uci   = require("uci")

-- ── helpers ──────────────────────────────────────────────────────────────────

local function json_str(s)
	return '"' .. tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"')
	              :gsub('\n', '\\n'):gsub('\r', '\\r') .. '"'
end

local function json_obj(t)
	local parts = {}
	for k, v in pairs(t) do
		parts[#parts + 1] = json_str(k) .. ":" .. json_str(v)
	end
	return "{" .. table.concat(parts, ",") .. "}"
end

local function err_json(msg)
	return '{"ok":false,"error":' .. json_str(msg) .. '}'
end

-- ── read UCI config ───────────────────────────────────────────────────────────

local cursor  = uci.cursor()
local cfg_ups     = cursor:get("nut_guard", "main", "ups")                    or "myups"
local cfg_ip      = cursor:get("nut_guard", "main", "ip")                     or "127.0.0.1"
local cfg_timeout = tonumber(cursor:get("nut_guard", "main", "command_timeout_seconds")) or 3

-- command-line args override UCI values
local ups     = (arg and arg[1] and arg[1] ~= "") and arg[1] or cfg_ups
local host    = (arg and arg[2] and arg[2] ~= "") and arg[2] or cfg_ip
local timeout = tonumber(arg and arg[3]) or cfg_timeout

-- ── NUT TCP client ────────────────────────────────────────────────────────────

local function query_nut(host, ups, timeout)
	local sock, err = nixio.connect(host, 3493)
	if not sock then
		return nil, "Cannot connect to " .. host .. ":3493 - " .. tostring(err)
	end

	sock:setblocking(true)
	-- nixio timeout is in milliseconds
	sock:setsockopt("socket", "rcvtimeo", math.floor(timeout * 1000))
	sock:setsockopt("socket", "sndtimeo", math.floor(timeout * 1000))

	-- send LIST VAR request
	local sent, serr = sock:send("LIST VAR " .. ups .. "\n")
	if not sent then
		sock:close()
		return nil, "Send error: " .. tostring(serr)
	end

	-- read response line by line
	local vars    = {}
	local started = false
	local buf     = ""

	while true do
		local chunk = sock:recv(4096)
		if not chunk or #chunk == 0 then
			break
		end
		buf = buf .. chunk

		-- process complete lines
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
					return nil, "No variables returned for UPS '" .. ups .. "'"
				end
				return vars, nil
			elseif line:match("^ERR ") then
				sock:close()
				return nil, "NUT error: " .. line:sub(5)
			elseif started and line:match("^VAR ") then
				-- VAR <upsname> <key> "<value>"
				local key, value = line:match('^VAR %S+ (%S+) "(.-)"%s*$')
				if key then
					vars[key] = value
				end
			end
		end
	end

	sock:close()
	if not started then
		return nil, "Incomplete response from NUT server"
	end
	if next(vars) == nil then
		return nil, "No variables returned for UPS '" .. ups .. "'"
	end
	return vars, nil
end

-- ── main ──────────────────────────────────────────────────────────────────────

local vars, err = query_nut(host, ups, timeout)

if err then
	io.write(err_json(err) .. "\n")
	os.exit(1)
else
	io.write('{"ok":true,"ups":' .. json_str(ups) ..
	         ',"ip":'            .. json_str(host) ..
	         ',"data":'          .. json_obj(vars)  .. "}\n")
	os.exit(0)
end
