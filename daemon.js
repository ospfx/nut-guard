#!/usr/bin/env node
'use strict';

/**
 * nut-guard daemon
 *
 * Reads configuration from UCI (nut-guard.main.*), polls the NUT server
 * at the configured interval, and writes UPS status to
 * /var/run/nut-guard/status.json for the LuCI UI to consume.
 *
 * No HTTP server is started – all management is done through LuCI / UCI.
 */

const net  = require('net');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATUS_FILE = '/var/run/nut-guard/status.json';
const PID_FILE    = '/var/run/nut-guard.pid';

/* ── UCI helpers ────────────────────────────────────────────────────────── */

function uciGet(key, fallback) {
  try {
    const v = execSync(`uci -q get nut-guard.main.${key}`, { encoding: 'utf8' }).trim();
    return v || fallback;
  } catch (_) {
    return fallback;
  }
}

function readConfig() {
  const host           = uciGet('host', '127.0.0.1');
  const port           = Math.max(1, Math.min(65535, parseInt(uciGet('port', '3493'), 10) || 3493));
  const ups            = uciGet('ups', 'ups');
  const refreshSeconds = Math.max(2, Math.min(3600, parseInt(uciGet('refresh_seconds', '5'), 10)  || 5));
  const timeoutSeconds = Math.max(1, Math.min(30,   parseInt(uciGet('timeout_seconds', '3'), 10)  || 3));
  return { host, port, ups, refreshSeconds, timeoutSeconds };
}

/* ── NUT TCP client ─────────────────────────────────────────────────────── */

function queryNut(host, port, upsName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let   buf    = '';
    let   done   = false;

    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error('timeout'))),
      timeoutMs
    );

    socket.connect(port, host, () => {
      socket.write(`LIST VAR ${upsName}\n`);
    });

    socket.on('data', chunk => {
      buf += chunk.toString();

      if (buf.startsWith('ERR ')) {
        finish(() => reject(new Error(buf.split('\n')[0].trim())));
        return;
      }

      if (buf.includes(`END LIST VAR ${upsName}`)) {
        const vars = {};
        buf.split('\n').forEach(line => {
          const m = line.match(/^VAR \S+ (\S+) "(.*)"/);
          if (m) vars[m[1]] = m[2];
        });
        finish(() => resolve(vars));
      }
    });

    socket.on('error', err => finish(() => reject(err)));
    socket.on('close', ()  => finish(() => reject(new Error('connection closed'))));
  });
}

/* ── Status writer ──────────────────────────────────────────────────────── */

function writeStatus(status) {
  const dir = path.dirname(STATUS_FILE);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const tmp = `${STATUS_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2), 'utf8');
    fs.renameSync(tmp, STATUS_FILE);
  } catch (e) {
    process.stderr.write(`nut-guard: failed to write status: ${e.message}\n`);
  }
}

/* ── Poll loop ──────────────────────────────────────────────────────────── */

async function poll() {
  const cfg = readConfig();
  const status = {
    timestamp : new Date().toISOString(),
    online    : false,
    config    : { host: cfg.host, port: cfg.port, ups: cfg.ups },
    data      : null,
    error     : null,
  };

  try {
    status.data   = await queryNut(cfg.host, cfg.port, cfg.ups, cfg.timeoutSeconds * 1000);
    status.online = true;
  } catch (e) {
    status.error = e.message;
  }

  writeStatus(status);
  setTimeout(poll, cfg.refreshSeconds * 1000);
}

/* ── Entry point ────────────────────────────────────────────────────────── */

// Write PID so procd / init scripts can track the process.
try {
  const pidDir = path.dirname(PID_FILE);
  try { fs.mkdirSync(pidDir, { recursive: true }); } catch (_) {}
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
} catch (_) {}

poll();
