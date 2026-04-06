'use strict';
'require view';
'require uci';
'require rpc';
'require ui';
'require dom';
'require poll';

// ── RPC declarations ────────────────────────────────────────────────────────

var callFileRead = rpc.declare({
	object: 'file',
	method: 'read',
	params: ['path'],
	expect: { data: '' }
});

var callGetInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: ['names'],
	expect: { result: {} }
});

var callSetInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: ['name', 'action'],
	expect: { result: false }
});

// ── UPS status helpers ───────────────────────────────────────────────────────

var STATUS_LABELS = {
	'OL':      '在线 (OL)',
	'OB':      '电池供电 (OB)',
	'LB':      '低电量 (LB)',
	'HB':      '电量充足 (HB)',
	'RB':      '请更换电池 (RB)',
	'CHRG':    '正在充电 (CHRG)',
	'DISCHRG': '正在放电 (DISCHRG)',
	'BYPASS':  '旁路模式 (BYPASS)',
	'CAL':     '校准中 (CAL)',
	'OFF':     '已关闭 (OFF)',
	'OVER':    '过载 (OVER)',
	'TRIM':    '电压修剪 (TRIM)',
	'BOOST':   '电压提升 (BOOST)',
	'FSD':     '强制关机 (FSD)'
};

function getStatusLabel(s) {
	if (!s) return _('未知');
	var parts = String(s).trim().split(/\s+/);
	var labels = parts.map(function(p) { return STATUS_LABELS[p] || p; });
	return labels.join(' + ');
}

function getStatusClass(s) {
	if (!s) return 'warning';
	var str = String(s).toUpperCase();
	if (str.indexOf('LB') !== -1 || str.indexOf('OB') !== -1) return 'danger';
	if (str.indexOf('OL') !== -1) return 'success';
	return 'warning';
}

function fmtVal(vars, key, unit) {
	var v = vars ? vars[key] : null;
	if (v == null || v === '') return '—';
	return String(v) + (unit ? '\u00a0' + unit : '');
}

function fmtRuntime(secs) {
	if (secs == null || secs === '') return '—';
	var n = parseInt(secs, 10);
	if (isNaN(n)) return String(secs);
	var h = Math.floor(n / 3600);
	var m = Math.floor((n % 3600) / 60);
	var s = n % 60;
	if (h > 0) return h + 'h ' + m + 'm';
	if (m > 0) return m + 'm ' + s + 's';
	return s + 's';
}

// ── Status card renderer ─────────────────────────────────────────────────────

function renderUPSStatus(statusData) {
	if (!statusData) {
		return E('div', { 'class': 'alert-message warning' }, [
			E('p', {}, _('状态文件不存在，请确认服务已启动'))
		]);
	}

	if (!statusData.connected) {
		return E('div', {}, [
			E('div', { 'class': 'alert-message danger' }, [
				E('p', {}, [
					E('strong', {}, _('无法连接到 NUT 服务器：')),
					statusData.error || _('未知错误')
				]),
				E('p', { 'class': 'cbi-value-description' },
					_('目标：') + (statusData.host || '—') + ':' + (statusData.port || '3493') +
					'  UPS: ' + (statusData.ups || '—'))
			]),
			E('p', { 'class': 'cbi-value-description' },
				_('最后尝试：') + (statusData.timestamp || '—'))
		]);
	}

	var vars = statusData.vars || {};
	var upsStatus = vars['ups.status'] || '';
	var cls = getStatusClass(upsStatus);

	var rows = [
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('UPS 名称'))),
			E('td', { 'class': 'td' }, statusData.ups || '—'),
			E('td', { 'class': 'td left' }, E('strong', {}, _('NUT 服务器'))),
			E('td', { 'class': 'td' }, (statusData.host || '—') + ':' + (statusData.port || '3493'))
		]),
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('UPS 状态'))),
			E('td', { 'class': 'td' }, E('span', { 'class': 'label ' + cls }, getStatusLabel(upsStatus))),
			E('td', { 'class': 'td left' }, E('strong', {}, _('型号'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.model'))
		]),
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('电池电量'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'battery.charge', '%')),
			E('td', { 'class': 'td left' }, E('strong', {}, _('续航时间'))),
			E('td', { 'class': 'td' }, fmtRuntime(vars['battery.runtime']))
		]),
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('负载'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.load', '%')),
			E('td', { 'class': 'td left' }, E('strong', {}, _('输出电压'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'output.voltage', 'V'))
		]),
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('真实功率'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.realpower', 'W')),
			E('td', { 'class': 'td left' }, E('strong', {}, _('额定功率'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.realpower.nominal', 'W'))
		]),
		E('tr', { 'class': 'tr cbi-section-table-row' }, [
			E('td', { 'class': 'td left' }, E('strong', {}, _('UPS 类型'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.type')),
			E('td', { 'class': 'td left' }, E('strong', {}, _('蜂鸣器'))),
			E('td', { 'class': 'td' }, fmtVal(vars, 'ups.beeper.status'))
		])
	];

	var varCount = Object.keys(vars).length;

	return E('div', {}, [
		E('table', { 'class': 'table cbi-section-table' }, rows),
		E('p', { 'class': 'cbi-value-description', 'style': 'margin-top:4px' },
			_('共获取 ') + varCount + _(' 个参数。最后更新：') + (statusData.timestamp || '—') +
			(statusData.tookMs != null ? '  (' + statusData.tookMs + 'ms)' : ''))
	]);
}

// ── Main view ────────────────────────────────────────────────────────────────

return view.extend({
	/* Disable built-in Save/Apply/Reset – we manage saving ourselves */
	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null,

	/* Reference to the rendered root node for poll updates */
	_root: null,

	load: function() {
		return Promise.all([
			uci.load('nut-guard'),
			callFileRead('/var/run/nut-guard/status.json').catch(function() { return ''; }),
			callGetInitList(['nut-guard']).catch(function() { return {}; })
		]);
	},

	/* ── Service control buttons ── */
	handleAction: function(action) {
		return callSetInitAction('nut-guard', action).then(function(ret) {
			if (!ret)
				ui.addNotification(null, E('p', _('操作未成功，请查看系统日志')), 'warning');
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('操作失败：') + (e.message || e)), 'danger');
		});
	},

	/* ── Save UCI config ── */
	handleSaveConfig: function() {
		var form   = this._root.querySelector('#ng-form');
		var fields = {
			enabled:         form.querySelector('[name="enabled"]').checked ? '1' : '0',
			ups_name:        form.querySelector('[name="ups_name"]').value.trim(),
			nut_host:        form.querySelector('[name="nut_host"]').value.trim(),
			nut_port:        form.querySelector('[name="nut_port"]').value.trim(),
			refresh_seconds: form.querySelector('[name="refresh_seconds"]').value.trim(),
			timeout_seconds: form.querySelector('[name="timeout_seconds"]').value.trim()
		};

		/* Basic client-side validation */
		if (!fields.ups_name || !/^[A-Za-z0-9_\-.]+$/.test(fields.ups_name))
			return void ui.addNotification(null, E('p', _('UPS 名称包含非法字符')), 'danger');
		if (!fields.nut_host)
			return void ui.addNotification(null, E('p', _('NUT 服务器地址不能为空')), 'danger');

		var self = this;
		uci.load('nut-guard').then(function() {
			if (!uci.get('nut-guard', 'settings'))
				uci.add('nut-guard', 'nut-guard', 'settings');

			Object.keys(fields).forEach(function(k) {
				uci.set('nut-guard', 'settings', k, fields[k]);
			});

			return uci.save();
		}).then(function() {
			return uci.apply();
		}).then(function() {
			ui.addNotification(null, E('p', _('配置已保存并已触发服务重载')), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('保存失败：') + (e.message || e)), 'danger');
		});
	},

	/* ── Polling update ── */
	_poll: function() {
		var self = this;
		return Promise.all([
			callFileRead('/var/run/nut-guard/status.json').catch(function() { return ''; }),
			callGetInitList(['nut-guard']).catch(function() { return {}; })
		]).then(function(res) {
			var statusData = null;
			try { statusData = JSON.parse(res[0]); } catch (e) {}

			var initData = (res[1] && res[1]['nut-guard']) ? res[1]['nut-guard'] : {};
			var isRunning = initData.running  === true;
			var isEnabled = initData.enabled  === true;

			/* Update service badge */
			var badge = self._root.querySelector('#ng-svc-badge');
			if (badge)
				dom.content(badge, [
					E('span', { 'class': 'label ' + (isRunning ? 'success' : 'danger') },
						isRunning ? _('运行中') : _('已停止')),
					'\u00a0',
					E('span', { 'class': 'label ' + (isEnabled ? 'success' : 'warning') },
						isEnabled ? _('开机自启：已开') : _('开机自启：已关'))
				]);

			/* Update UPS status card */
			var card = self._root.querySelector('#ng-status-card');
			if (card)
				dom.content(card, renderUPSStatus(statusData));
		});
	},

	/* ── Render ── */
	render: function(data) {
		var self = this;

		var statusData = null;
		try { statusData = JSON.parse(data[1]); } catch (e) {}

		var initData = (data[2] && data[2]['nut-guard']) ? data[2]['nut-guard'] : {};
		var isRunning = initData.running  === true;
		var isEnabled = initData.enabled  === true;

		/* Read current UCI values (with defaults) */
		var cfgEnabled  = uci.get('nut-guard', 'settings', 'enabled')         || '1';
		var cfgUpsName  = uci.get('nut-guard', 'settings', 'ups_name')        || 'myups';
		var cfgHost     = uci.get('nut-guard', 'settings', 'nut_host')        || '127.0.0.1';
		var cfgPort     = uci.get('nut-guard', 'settings', 'nut_port')        || '3493';
		var cfgRefresh  = uci.get('nut-guard', 'settings', 'refresh_seconds') || '10';
		var cfgTimeout  = uci.get('nut-guard', 'settings', 'timeout_seconds') || '3';

		/* ── Build DOM ── */
		var root = E('div', { 'class': 'cbi-map' }, [

			E('h2', {}, _('Nut Guard')),

			/* Service control */
			E('div', { 'class': 'cbi-section' }, [
				E('legend', {}, _('服务状态')),
				E('div', { 'id': 'ng-svc-badge', 'style': 'margin-bottom:8px' }, [
					E('span', { 'class': 'label ' + (isRunning ? 'success' : 'danger') },
						isRunning ? _('运行中') : _('已停止')),
					'\u00a0',
					E('span', { 'class': 'label ' + (isEnabled ? 'success' : 'warning') },
						isEnabled ? _('开机自启：已开') : _('开机自启：已关'))
				]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-positive',
						'click': ui.createHandlerFn(this, 'handleAction', 'start')
					}, _('启动')),
					'\u00a0',
					E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'click': ui.createHandlerFn(this, 'handleAction', 'stop')
					}, _('停止')),
					'\u00a0',
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(this, 'handleAction', 'restart')
					}, _('重启')),
					'\u00a0',
					E('button', {
						'class': 'btn cbi-button cbi-button-positive',
						'click': ui.createHandlerFn(this, 'handleAction', 'enable')
					}, _('开启自启')),
					'\u00a0',
					E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'click': ui.createHandlerFn(this, 'handleAction', 'disable')
					}, _('禁用自启'))
				])
			]),

			/* UPS status */
			E('div', { 'class': 'cbi-section' }, [
				E('legend', {}, _('UPS 实时状态')),
				E('div', { 'id': 'ng-status-card' }, renderUPSStatus(statusData))
			]),

			/* Configuration form */
			E('div', { 'class': 'cbi-section' }, [
				E('legend', {}, _('配置')),
				E('form', { 'id': 'ng-form' }, [
					E('div', { 'class': 'cbi-section-node' }, [

						/* Enabled */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-enabled' },
								_('启用服务')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type': 'checkbox',
									'id':   'ng-enabled',
									'name': 'enabled',
									'checked': cfgEnabled === '1'
								})
							])
						]),

						/* NUT Host */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-host' },
								_('NUT 服务器地址')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type':  'text',
									'id':    'ng-host',
									'name':  'nut_host',
									'value': cfgHost,
									'class': 'cbi-input-text',
									'placeholder': '127.0.0.1'
								}),
								E('div', { 'class': 'cbi-value-description' },
									_('NUT 服务器的 IP 地址或主机名'))
							])
						]),

						/* NUT Port */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-port' },
								_('NUT 端口')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type':  'number',
									'id':    'ng-port',
									'name':  'nut_port',
									'value': cfgPort,
									'min':   '1',
									'max':   '65535',
									'class': 'cbi-input-text'
								}),
								E('div', { 'class': 'cbi-value-description' },
									_('默认 3493'))
							])
						]),

						/* UPS Name */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-ups' },
								_('UPS 名称')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type':  'text',
									'id':    'ng-ups',
									'name':  'ups_name',
									'value': cfgUpsName,
									'class': 'cbi-input-text',
									'placeholder': 'myups'
								}),
								E('div', { 'class': 'cbi-value-description' },
									_('NUT 中配置的 UPS 名称（仅限字母、数字、下划线、连字符、点）'))
							])
						]),

						/* Refresh interval */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-refresh' },
								_('刷新间隔（秒）')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type':  'number',
									'id':    'ng-refresh',
									'name':  'refresh_seconds',
									'value': cfgRefresh,
									'min':   '2',
									'max':   '3600',
									'class': 'cbi-input-text'
								}),
								E('div', { 'class': 'cbi-value-description' },
									_('守护进程查询 NUT 服务器的间隔（秒），建议 5~60'))
							])
						]),

						/* Timeout */
						E('div', { 'class': 'cbi-value' }, [
							E('label', { 'class': 'cbi-value-title', 'for': 'ng-timeout' },
								_('连接超时（秒）')),
							E('div', { 'class': 'cbi-value-field' }, [
								E('input', {
									'type':  'number',
									'id':    'ng-timeout',
									'name':  'timeout_seconds',
									'value': cfgTimeout,
									'min':   '1',
									'max':   '30',
									'class': 'cbi-input-text'
								}),
								E('div', { 'class': 'cbi-value-description' },
									_('连接 NUT 服务器的超时时间（秒）'))
							])
						])
					]),

					E('div', { 'class': 'cbi-page-actions' }, [
						E('button', {
							'type':  'button',
							'class': 'btn cbi-button cbi-button-positive',
							'click': ui.createHandlerFn(this, 'handleSaveConfig')
						}, _('保存配置'))
					])
				])
			])
		]);

		this._root = root;

		poll.add(function() { return self._poll(); }, 5);

		return root;
	}
});
