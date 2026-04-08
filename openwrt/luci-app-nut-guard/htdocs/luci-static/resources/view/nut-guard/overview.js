'use strict';
'require view';
'require rpc';
'require poll';

// ── ubus RPC declarations ────────────────────────────────────
var callGetConfig = rpc.declare({
	object: 'nutguard',
	method: 'get_config',
	expect: {}
});

var callGetUps = rpc.declare({
	object: 'nutguard',
	method: 'get_ups',
	expect: {}
});

var callSetConfig = rpc.declare({
	object: 'nutguard',
	method: 'set_config',
	params: ['ups', 'ip', 'refreshSeconds', 'commandTimeoutSeconds', 'allowQueryOverride'],
	expect: {}
});

// ── Constants / mapping tables ───────────────────────────────
var STATUS_TEXT_MAP = {
	OL: '在线', OB: '电池供电', LB: '低电量', HB: '高电量',
	RB: '需要更换电池', CHRG: '充电中', DISCHRG: '放电中',
	BYPASS: '旁路模式', CAL: '校准中', OFF: '关闭',
	OVER: '过载', TRIM: '电压调整（降压）', BOOST: '电压调整（升压）',
};

var UPS_TYPE_MAP = {
	'offline / line interactive': '离线/在线互动式',
	online: '在线式',
	'line interactive': '在线互动式',
	offline: '离线式',
	standby: '备用式',
};

var BEEPER_TEXT_MAP = {
	enabled: '开启', disabled: '关闭', muted: '静音',
};

var NUT_PARAM_MAP = {
	'battery.charge': '电池电量', 'battery.charge.low': '电池低电量阈值',
	'battery.runtime': '电池续航时间', 'battery.type': '电池类型',
	'device.mfr': '设备制造商', 'device.model': '设备型号',
	'device.serial': '设备序列号', 'device.type': '设备类型',
	'driver.name': '驱动名称', 'driver.state': '驱动状态',
	'driver.version': '驱动版本', 'driver.version.data': '驱动数据版本',
	'driver.version.internal': '驱动内部版本',
	'input.transfer.high': '输入高压切换阈值',
	'input.transfer.low': '输入低压切换阈值',
	'output.frequency.nominal': '额定输出频率',
	'output.voltage': '输出电压',
	'output.voltage.nominal': '额定输出电压',
	'ups.beeper.status': '蜂鸣器状态',
	'ups.delay.shutdown': '关机延迟', 'ups.delay.start': '开机延迟',
	'ups.firmware': 'UPS固件版本', 'ups.load': 'UPS负载',
	'ups.mfr': 'UPS制造商', 'ups.model': 'UPS型号',
	'ups.power.nominal': '额定功率', 'ups.realpower': '实际功率',
	'ups.serial': 'UPS序列号', 'ups.status': 'UPS状态',
	'ups.timer.shutdown': '关机定时器', 'ups.timer.start': '开机定时器',
	'ups.type': 'UPS类型',
};

var THRESHOLDS = {
	chargeDanger: 20, chargeWarning: 80,
	runtimeDangerSeconds: 5 * 60, runtimeWarningSeconds: 30 * 60,
	loadDanger: 80, loadWarning: 50,
	powerRatioDanger: 80, powerRatioWarning: 50,
};

// ── Helper functions ─────────────────────────────────────────
function fmtRuntime(s) {
	var n = Number(s);
	if (!isFinite(n)) return '-';
	var sec = Math.max(0, Math.floor(n));
	var h = Math.floor(sec / 3600);
	var m = Math.floor((sec % 3600) / 60);
	var r = sec % 60;
	if (h > 0) return h + 'h ' + m + 'm';
	if (m > 0) return m + 'm ' + r + 's';
	return r + 's';
}

function colorByRange(value, danger, warning, reversed) {
	var n = Number(value);
	if (!isFinite(n)) return '';
	if (!reversed) {
		if (n > danger)  return 'status-danger';
		if (n > warning) return 'status-warning';
		return 'status-normal';
	}
	if (n < danger)  return 'status-danger';
	if (n < warning) return 'status-warning';
	return 'status-normal';
}

function parseUpsStatus(raw) {
	var status = raw || '-';
	var flags  = {};
	String(status).split(/\s+/).filter(Boolean).forEach(function(f) { flags[f] = true; });

	var text = STATUS_TEXT_MAP[status] || status;
	if (flags.OB && flags.LB) text = '电池供电（低电量）';
	else if (flags.OB)        text = '电池供电';
	else if (flags.LB)        text = '低电量';

	var level = 'normal';
	if (flags.OB && flags.LB) level = 'danger';
	else if (flags.LB)        level = 'danger';
	else if (flags.OB)        level = 'warning';

	return { status: status, flags: flags, text: text, level: level };
}

// ── DOM helpers ──────────────────────────────────────────────
function qs(sel, root) { return (root || document).querySelector(sel); }

function setMetric(id, v, colorClass) {
	var el = document.getElementById(id);
	if (!el) return;
	el.textContent = (v == null || v === '') ? '-' : String(v);
	el.className = 'v';
	if (colorClass) el.classList.add(colorClass);
}

function showError(msg) {
	var box = document.getElementById('errorBox');
	if (!box) return;
	if (!msg) { box.className = 'error-box hidden'; box.textContent = ''; return; }
	box.className = 'error-box';
	box.textContent = msg;
}

// ── Data rendering ───────────────────────────────────────────
function renderData(payload) {
	var data = (payload && payload.data) ? payload.data : {};
	var si   = parseUpsStatus(data['ups.status']);

	// Global alert banner
	var ga  = document.getElementById('globalAlert');
	var gai = document.getElementById('alertIcon');
	var gam = document.getElementById('alertMessage');
	if (ga) {
		ga.className = 'global-alert hidden';
		if (si.flags.OB && si.flags.LB) {
			ga.className = 'global-alert danger';
			if (gai) gai.textContent = '🚨';
			if (gam) gam.textContent = 'UPS使用电池供电且电量低，可能即将关机！';
		} else if (si.flags.LB) {
			ga.className = 'global-alert danger';
			if (gai) gai.textContent = '🚨';
			if (gam) gam.textContent = 'UPS电池电量低，可能即将关机！';
		} else if (si.flags.OB) {
			ga.className = 'global-alert warning';
			if (gai) gai.textContent = '⚠️';
			if (gam) gam.textContent = 'UPS当前使用电池供电，请检查市电连接！';
		}
	}

	// Status badge
	var mSt = document.getElementById('mStatus');
	if (mSt) {
		mSt.textContent = si.text;
		mSt.className = 'v';
		if (si.level === 'danger')  mSt.classList.add('status-danger');
		if (si.level === 'warning') mSt.classList.add('status-warning');
		if (si.level === 'normal')  mSt.classList.add('status-normal');
	}

	// Metrics
	var charge  = data['battery.charge'];
	var runtime = data['battery.runtime'];
	var load    = data['ups.load'];
	var vout    = data['output.voltage'];
	var rpow    = data['ups.realpower'];
	var npow    = data['ups.power.nominal'];

	setMetric('mCharge',  charge  != null ? charge + '%'  : '-',
		colorByRange(charge,  THRESHOLDS.chargeDanger,  THRESHOLDS.chargeWarning,  true));
	setMetric('mRuntime', runtime != null ? fmtRuntime(runtime) : '-',
		colorByRange(runtime, THRESHOLDS.runtimeDangerSeconds, THRESHOLDS.runtimeWarningSeconds, true));
	setMetric('mLoad',    load    != null ? load + '%'    : '-',
		colorByRange(load,    THRESHOLDS.loadDanger,    THRESHOLDS.loadWarning,    false));
	setMetric('mVoltage', vout    != null ? vout + ' V'   : '-');

	var rpRatio = (rpow != null && npow != null)
		? (Number(rpow) / Number(npow)) * 100 : null;
	setMetric('mRealPower', rpow != null ? rpow + ' W' : '-',
		colorByRange(rpRatio, THRESHOLDS.powerRatioDanger, THRESHOLDS.powerRatioWarning, false));

	var utype = data['ups.type'] || '-';
	setMetric('mType',         UPS_TYPE_MAP[utype] || utype);
	setMetric('mNominalPower', npow  != null ? npow + ' VA' : '-');
	setMetric('mBeeper',       BEEPER_TEXT_MAP[data['ups.beeper.status']] || (data['ups.beeper.status'] || '-'));
	setMetric('mBatteryType',  data['battery.type'] || '-');

	var dm = document.getElementById('deviceModel');
	var df = document.getElementById('deviceMfr');
	if (dm) dm.textContent = '设备型号：' + (data['device.model'] || data['ups.model'] || '-');
	if (df) df.textContent = '制造商：'   + (data['device.mfr']   || data['ups.mfr']   || '-');

	// Key-value table
	var body = document.getElementById('kvBody');
	if (body) {
		body.innerHTML = '';
		Object.keys(data).sort().forEach(function(k) {
			var tr = document.createElement('tr');
			var tk = document.createElement('td');
			var tv = document.createElement('td');
			tk.textContent = NUT_PARAM_MAP[k] || k;
			tv.textContent = data[k];
			tr.appendChild(tk);
			tr.appendChild(tv);
			body.appendChild(tr);
		});
	}

	var now = new Date();
	var ll = document.getElementById('lastLine');
	var nl = document.getElementById('netLine');
	if (ll) ll.textContent = '更新时间：' + now.toLocaleString() + (payload.cache ? '（缓存）' : '');
	if (nl) nl.textContent = payload.tookMs != null ? '采集耗时：' + payload.tookMs + 'ms' : '';
}

// ── LuCI view entry point ────────────────────────────────────
return view.extend({

	_config: null,
	_refreshSec: 5,

	load: function() {
		return callGetConfig();
	},

	render: function(config) {
		this._config     = config || {};
		this._refreshSec = this._config.refreshSeconds || 5;

		var self = this;

		var node = E('div', { 'class': 'cbi-map' }, [

			E('h2', {}, '🔋 NUT UPS Guard'),

			// Global alert banner (hidden by default)
			E('div', { 'id': 'globalAlert', 'class': 'global-alert hidden' }, [
				E('span', { 'id': 'alertIcon' }),
				E('span', { 'id': 'alertMessage' }),
			]),

			// Error box
			E('div', { 'id': 'errorBox', 'class': 'error-box hidden' }),

			// Device identity
			E('div', { 'class': 'device-info' }, [
				E('span', { 'id': 'deviceModel' }, '设备型号：-'),
				E('span', { 'id': 'deviceMfr'   }, '制造商：-'),
			]),

			E('p', { 'id': 'subtitle', 'class': 'subtitle' },
				config ? (config.ups + '@' + config.ip) : ''),

			// Key metrics grid
			E('div', { 'class': 'metrics-grid' }, [
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, 'UPS状态'),
					E('div', { 'id': 'mStatus', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '电池电量'),
					E('div', { 'id': 'mCharge', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '预计续航'),
					E('div', { 'id': 'mRuntime', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '负载'),
					E('div', { 'id': 'mLoad', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '输出电压'),
					E('div', { 'id': 'mVoltage', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '实际功率'),
					E('div', { 'id': 'mRealPower', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, 'UPS类型'),
					E('div', { 'id': 'mType', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '额定功率'),
					E('div', { 'id': 'mNominalPower', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '蜂鸣器'),
					E('div', { 'id': 'mBeeper', 'class': 'v' }, '-'),
				]),
				E('div', { 'class': 'metric-card' }, [
					E('div', { 'class': 'label' }, '电池类型'),
					E('div', { 'id': 'mBatteryType', 'class': 'v' }, '-'),
				]),
			]),

			// Status / timing line
			E('p', { 'id': 'lastLine', 'class': 'status-line' }, ''),
			E('p', { 'id': 'netLine',  'class': 'status-line' }, ''),

			// Config section
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '设置'),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title', 'for': 'ipInput'      }, 'NUT 服务器地址'),
						E('div',   { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'text', 'id': 'ipInput', 'class': 'cbi-input-text',
								'value': config ? (config.ip || '') : '',
							}),
						]),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title', 'for': 'upsInput'     }, 'UPS 名称'),
						E('div',   { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'text', 'id': 'upsInput', 'class': 'cbi-input-text',
								'value': config ? (config.ups || '') : '',
							}),
						]),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title', 'for': 'refreshInput' }, '刷新间隔（秒）'),
						E('div',   { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'number', 'id': 'refreshInput', 'class': 'cbi-input-text',
								'min': '2', 'max': '3600',
								'value': config ? String(config.refreshSeconds || 5) : '5',
							}),
						]),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('div', { 'class': 'cbi-value-field' }, [
							E('button', {
								'class': 'cbi-button cbi-button-apply',
								'id': 'saveBtn',
								'click': function(ev) { self._handleSave(ev); },
							}, '保存并刷新'),
						]),
					]),
					E('div', { 'id': 'configHint', 'class': 'config-hint' }),
				]),
			]),

			// All-variables table
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '所有 NUT 变量'),
				E('table', { 'class': 'table cbi-section-table' }, [
					E('thead', {}, [
						E('tr', {}, [
							E('th', {}, '参数'),
							E('th', {}, '值'),
						]),
					]),
					E('tbody', { 'id': 'kvBody' }),
				]),
			]),
		]);

		// Apply minimal inline styles for status colours and layout
		var style = E('style', {}, [
			'.global-alert{padding:10px 16px;border-radius:6px;margin-bottom:12px;font-weight:600}',
			'.global-alert.hidden{display:none}',
			'.global-alert.danger{background:#fee2e2;color:#991b1b}',
			'.global-alert.warning{background:#fef3c7;color:#92400e}',
			'.error-box{padding:8px 12px;background:#fee2e2;color:#991b1b;border-radius:4px;margin-bottom:10px}',
			'.error-box.hidden{display:none}',
			'.metrics-grid{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}',
			'.metric-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:130px}',
			'.metric-card .label{font-size:0.78em;color:#6b7280;margin-bottom:4px}',
			'.metric-card .v{font-size:1.3em;font-weight:700;color:#111827}',
			'.status-normal{color:#16a34a!important}',
			'.status-warning{color:#d97706!important}',
			'.status-danger{color:#dc2626!important}',
			'.device-info{color:#374151;margin-bottom:6px}',
			'.device-info span{margin-right:18px}',
			'.subtitle{color:#6b7280;font-size:0.85em;margin:0 0 10px}',
			'.status-line{color:#6b7280;font-size:0.82em;margin:2px 0}',
			'.config-hint{color:#6b7280;font-size:0.8em;margin-top:6px}',
		].join(''));
		node.insertBefore(style, node.firstChild);

		// Set config hint
		if (config) {
			var hint = document.getElementById('configHint');
			if (hint) {
				hint.textContent = [
					'后端：rpcd/ubus · nutguard',
					'NUT: ' + config.ups + '@' + config.ip,
					'连接超时：' + config.commandTimeoutSeconds + 's',
					'允许 URL 参数覆盖：' + (config.allowQueryOverride ? '是' : '否'),
				].join(' · ');
			}
		}

		// Start polling
		poll.add(function() {
			return callGetUps().then(function(payload) {
				if (!payload) return;
				showError(payload.ok ? '' : (payload.error || '采集失败'));
				if (payload.ok) {
					renderData(payload);
					var sub = document.getElementById('subtitle');
					if (sub) sub.textContent = payload.key || '';
				}
			}).catch(function(e) {
				showError(e && e.message ? e.message : String(e));
			});
		}, this._refreshSec);

		// Initial fetch
		callGetUps().then(function(payload) {
			if (!payload) return;
			showError(payload.ok ? '' : (payload.error || '采集失败'));
			if (payload.ok) {
				renderData(payload);
				var sub = document.getElementById('subtitle');
				if (sub) sub.textContent = payload.key || '';
			}
		}).catch(function(e) {
			showError(e && e.message ? e.message : String(e));
		});

		return node;
	},

	_handleSave: function(ev) {
		var self = this;
		var btn  = document.getElementById('saveBtn');
		if (btn) btn.disabled = true;

		var ip      = (document.getElementById('ipInput')      || {}).value || '';
		var ups     = (document.getElementById('upsInput')     || {}).value || '';
		var refresh = parseInt((document.getElementById('refreshInput') || {}).value || '5', 10);

		ip  = ip.trim();
		ups = ups.trim();
		if (!isFinite(refresh) || refresh < 2) refresh = 5;

		var timeout    = self._config ? (self._config.commandTimeoutSeconds || 3) : 3;
		var allowOvr   = self._config ? (self._config.allowQueryOverride  || false) : false;

		callSetConfig(ups, ip, refresh, timeout, allowOvr).then(function(result) {
			if (!result) return;
			if (!result.ok) {
				showError(result.error || '保存失败');
				return;
			}
			showError('');
			self._config     = result;
			self._refreshSec = result.refreshSeconds || 5;

			// Update config hint
			var hint = document.getElementById('configHint');
			if (hint) {
				hint.textContent = [
					'后端：rpcd/ubus · nutguard',
					'NUT: ' + result.ups + '@' + result.ip,
					'连接超时：' + result.commandTimeoutSeconds + 's',
					'允许 URL 参数覆盖：' + (result.allowQueryOverride ? '是' : '否'),
				].join(' · ');
			}

			// Restart poll with new interval
			poll.stop();
			poll.add(function() {
				return callGetUps().then(function(payload) {
					if (!payload) return;
					showError(payload.ok ? '' : (payload.error || '采集失败'));
					if (payload.ok) renderData(payload);
				});
			}, self._refreshSec);
			poll.start();

			return callGetUps();
		}).then(function(payload) {
			if (payload && payload.ok) renderData(payload);
		}).catch(function(e) {
			showError(e && e.message ? e.message : String(e));
		}).finally(function() {
			if (btn) btn.disabled = false;
		});
	},

	// LuCI view interface: disable the built-in Save / Save & Apply / Reset
	// buttons — this view manages its own save flow via _handleSave.
	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null,
});

