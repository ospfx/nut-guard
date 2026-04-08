'use strict';
'require view';
'require ui';
'require poll';

/*
 * LuCI JS view for nut-guard
 * Path: /www/luci-static/resources/view/nut_guard/index.js
 *
 * Fetches UPS status from the Lua controller API and renders it.
 * Everything is served through uhttpd / LuCI – no extra ports.
 */

/* ── translation helpers ──────────────────────────────────────────────────── */
var STATUS_MAP = {
	OL:      'Online',
	OB:      'On Battery',
	LB:      'Low Battery',
	HB:      'High Battery',
	RB:      'Replace Battery',
	CHRG:    'Charging',
	DISCHRG: 'Discharging',
	BYPASS:  'Bypass',
	CAL:     'Calibrating',
	OFF:     'Offline',
	OVER:    'Overloaded',
	TRIM:    'Trimming Voltage',
	BOOST:   'Boosting Voltage'
};

var NUT_LABEL = {
	'battery.charge':           'Battery Charge',
	'battery.charge.low':       'Low Charge Threshold',
	'battery.runtime':          'Battery Runtime',
	'battery.type':             'Battery Type',
	'device.mfr':               'Manufacturer',
	'device.model':             'Model',
	'device.serial':            'Serial Number',
	'device.type':              'Device Type',
	'driver.name':              'Driver',
	'driver.version':           'Driver Version',
	'driver.state':             'Driver State',
	'input.transfer.high':      'Input High Transfer',
	'input.transfer.low':       'Input Low Transfer',
	'output.voltage':           'Output Voltage',
	'output.voltage.nominal':   'Nominal Output Voltage',
	'output.frequency.nominal': 'Nominal Output Frequency',
	'ups.beeper.status':        'Beeper',
	'ups.delay.shutdown':       'Shutdown Delay',
	'ups.delay.start':          'Start Delay',
	'ups.firmware':             'Firmware',
	'ups.load':                 'Load',
	'ups.mfr':                  'UPS Manufacturer',
	'ups.model':                'UPS Model',
	'ups.power.nominal':        'Nominal Power',
	'ups.realpower':            'Real Power',
	'ups.serial':               'UPS Serial',
	'ups.status':               'UPS Status',
	'ups.type':                 'UPS Type'
};

/* ── utilities ────────────────────────────────────────────────────────────── */
function fmtSeconds(s) {
	var n = Number(s);
	if (!isFinite(n)) return '-';
	var sec = Math.max(0, Math.floor(n));
	var h   = Math.floor(sec / 3600);
	var m   = Math.floor((sec % 3600) / 60);
	var r   = sec % 60;
	if (h > 0) return h + 'h ' + m + 'm';
	if (m > 0) return m + 'm ' + r + 's';
	return r + 's';
}

function statusLabel(raw) {
	if (!raw || raw === '-') return raw;
	return raw.split(/\s+/).map(function(p) {
		return STATUS_MAP[p] || p;
	}).join(' + ');
}

function statusCls(raw) {
	if (!raw) return '';
	var ob = raw.indexOf('OB') !== -1;
	var lb = raw.indexOf('LB') !== -1;
	if (ob && lb) return 'danger';
	if (ob || lb) return ob ? 'warning' : 'danger';
	if (raw === 'OL') return 'ok';
	return '';
}

function pctCls(val, warnLow, dangerLow) {
	var n = Number(val);
	if (!isFinite(n)) return '';
	if (n < dangerLow) return 'danger';
	if (n < warnLow)   return 'warning';
	return 'ok';
}

/* ── DOM builders ─────────────────────────────────────────────────────────── */
function mkCard(label, value, cls) {
	return E('div', { 'class': 'ng-card' + (cls ? ' ng-' + cls : '') }, [
		E('span', { 'class': 'ng-card-lbl' }, label),
		E('span', { 'class': 'ng-card-val' }, value != null ? String(value) : '-')
	]);
}

function mkStyles() {
	if (document.getElementById('ng-css')) return;
	var s = document.createElement('style');
	s.id = 'ng-css';
	s.textContent =
		'.ng-banner{padding:8px 14px;border-radius:4px;margin:0 0 12px;font-weight:600;display:none}' +
		'.ng-banner.visible{display:block}' +
		'.ng-warning{background:#fff3cd;color:#856404;border:1px solid #ffc107}' +
		'.ng-danger{background:#f8d7da;color:#721c24;border:1px solid #f5c6cb}' +
		'.ng-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}' +
		'.ng-card{background:var(--main-bright,#f5f5f5);border:1px solid var(--border-color-low,#ddd);' +
		'  border-radius:6px;padding:10px 14px;min-width:130px;flex:1 1 130px}' +
		'.ng-card-lbl{display:block;font-size:.75em;color:var(--secondary-text-color,#666);margin-bottom:3px}' +
		'.ng-card-val{display:block;font-size:1.15em;font-weight:600}' +
		'.ng-ok .ng-card-val{color:#28a745}' +
		'.ng-warning .ng-card-val{color:#f59e0b}' +
		'.ng-danger .ng-card-val{color:#dc3545}' +
		'.ng-tbl{width:100%;border-collapse:collapse;font-size:.87em}' +
		'.ng-tbl th,.ng-tbl td{padding:4px 8px;border-bottom:1px solid var(--border-color-low,#eee);text-align:left}' +
		'.ng-tbl tr:hover td{background:var(--main-bright,#f9f9f9)}' +
		'.ng-meta{font-size:.8em;color:var(--secondary-text-color,#888);margin-top:6px}';
	document.head.appendChild(s);
}

/* ── status renderer ─────────────────────────────────────────────────────── */
function renderStatus(res, nodes) {
	var data = (res && res.data) ? res.data : {};
	var vars = data.vars || {};

	/* banner */
	var raw = vars['ups.status'] || '';
	var ob  = raw.indexOf('OB') !== -1;
	var lb  = raw.indexOf('LB') !== -1;
	nodes.banner.className = 'ng-banner';
	if (ob && lb) {
		nodes.banner.className += ' visible ng-danger';
		nodes.banner.textContent = _('UPS on battery AND low charge – shutdown may be imminent!');
	} else if (ob) {
		nodes.banner.className += ' visible ng-warning';
		nodes.banner.textContent = _('UPS is running on battery – check mains power.');
	} else if (lb) {
		nodes.banner.className += ' visible ng-danger';
		nodes.banner.textContent = _('UPS battery is low!');
	}

	/* cards */
	var grid = nodes.grid;
	while (grid.firstChild) grid.removeChild(grid.firstChild);

	grid.appendChild(mkCard(_('Status'),
		statusLabel(raw) || '-',  statusCls(raw)));

	var charge = vars['battery.charge'];
	grid.appendChild(mkCard(_('Battery Charge'),
		charge != null ? charge + '%' : '-',
		pctCls(charge, 80, 20)));

	var rt = vars['battery.runtime'];
	grid.appendChild(mkCard(_('Runtime'),
		rt != null ? fmtSeconds(rt) : '-',
		rt != null ? (Number(rt) < 300 ? 'danger' : Number(rt) < 1800 ? 'warning' : 'ok') : ''));

	var load = vars['ups.load'];
	grid.appendChild(mkCard(_('Load'),
		load != null ? load + '%' : '-',
		load != null ? (Number(load) > 80 ? 'danger' : Number(load) > 50 ? 'warning' : 'ok') : ''));

	grid.appendChild(mkCard(_('Output Voltage'),
		vars['output.voltage'] != null ? vars['output.voltage'] + ' V' : '-'));

	var rp = vars['ups.realpower'];
	var np = vars['ups.power.nominal'];
	var rpRatio = (rp != null && np != null && Number(np) > 0)
		? Number(rp) / Number(np) : null;
	grid.appendChild(mkCard(_('Real Power'),
		rp != null ? rp + ' W' : '-',
		rpRatio != null ? (rpRatio > 0.8 ? 'danger' : rpRatio > 0.5 ? 'warning' : 'ok') : ''));

	grid.appendChild(mkCard(_('Nominal Power'),
		np != null ? np + ' VA' : '-'));

	grid.appendChild(mkCard(_('Battery Type'),
		vars['battery.type'] || '-'));

	/* full params table */
	var tbody = nodes.tbody;
	while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
	Object.keys(vars).sort().forEach(function(k) {
		tbody.appendChild(E('tr', {}, [
			E('td', {}, NUT_LABEL[k] || k),
			E('td', {}, String(vars[k]))
		]));
	});

	/* meta line */
	var parts = [];
	if (data.ups && data.ip) parts.push(data.ups + '@' + data.ip);
	if (data.tookMs != null)   parts.push(data.tookMs + 'ms');
	parts.push(_('Updated: ') + new Date().toLocaleTimeString());
	if (res && res.code !== 0) parts.push(_('(error: ') + (res.error || '?') + ')');
	nodes.meta.textContent = parts.join('  ·  ');
}

/* ── view definition ─────────────────────────────────────────────────────── */
return view.extend({

	_nodes: null,

	load: function() {
		mkStyles();
		return Promise.resolve();
	},

	render: function() {
		var self = this;

		var banner     = E('div',   { id: 'ng-banner', 'class': 'ng-banner' });
		var grid       = E('div',   { id: 'ng-grid',   'class': 'ng-grid'   });
		var tbody      = E('tbody', { id: 'ng-tbody' });
		var meta       = E('div',   { id: 'ng-meta',   'class': 'ng-meta'  }, _('Loading…'));

		self._nodes = { banner: banner, grid: grid, tbody: tbody, meta: meta };

		var reloadBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			style:   'margin-right:8px',
			click: function() {
				reloadBtn.disabled = true;
				self._doReload().finally(function() {
					reloadBtn.disabled = false;
				});
			}
		}, _('Reload Service'));

		var refreshBtn = E('button', {
			'class': 'btn cbi-button',
			click: function() { return self._fetch(); }
		}, _('Refresh Now'));

		/* kick off initial fetch and start poll */
		self._fetch();
		poll.add(self._fetch.bind(self), 5);

		return E('div', {}, [
			E('h2', {}, _('Nut Guard – UPS Status')),
			E('div', { style: 'margin-bottom:12px' }, [ reloadBtn, refreshBtn ]),
			banner,
			grid,
			E('h3', { style: 'margin-top:4px' }, _('All Parameters')),
			E('table', { 'class': 'ng-tbl' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Parameter')),
					E('th', {}, _('Value'))
				])),
				tbody
			]),
			meta
		]);
	},

	_fetch: function() {
		var self = this;
		if (!self._nodes) return Promise.resolve();
		return fetch(L.url('admin/services/nut_guard/api/status'),
			{ credentials: 'same-origin' })
			.then(function(r) { return r.json(); })
			.then(function(res) { renderStatus(res, self._nodes); })
			.catch(function(e) {
				if (self._nodes)
					self._nodes.meta.textContent = _('Fetch error: ') + String(e);
			});
	},

	_doReload: function() {
		var self = this;
		return fetch(L.url('admin/services/nut_guard/api/reload'),
			{ method: 'POST', credentials: 'same-origin' })
			.then(function(r) { return r.json(); })
			.then(function(res) {
				if (res && res.code === 0)
					ui.addNotification(null,
						E('p', _('Service reloaded successfully')), 'info');
				else
					ui.addNotification(null,
						E('p', _('Reload failed: ') + ((res && res.message) || '?')),
						'error');
				return self._fetch();
			})
			.catch(function(e) {
				ui.addNotification(null,
					E('p', _('Reload error: ') + String(e)), 'error');
			});
	},

	/* disable default save/apply/reset since this is a status view */
	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
