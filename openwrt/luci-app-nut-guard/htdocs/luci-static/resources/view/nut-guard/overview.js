'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';

/* ── RPC declarations ───────────────────────────────────────────────────── */

var callServiceList = rpc.declare({
	object : 'service',
	method : 'list',
	params : ['name'],
	expect : { '' : {} },
});

var callReadFile = rpc.declare({
	object : 'file',
	method : 'read',
	params : ['path'],
	expect : { data : '' },
});

var callExec = rpc.declare({
	object : 'file',
	method : 'exec',
	params : ['command', 'params', 'env'],
	expect : { code : -1 },
});

/* ── Helpers ────────────────────────────────────────────────────────────── */

function isRunning(res) {
	try { return res['nut-guard']['instances']['nut-guard']['running'] === true; }
	catch (_) { return false; }
}

function parseStatus(raw) {
	try { return JSON.parse(raw); }
	catch (_) { return null; }
}

function statusBadge(text, color) {
	return E('span', {
		'class' : 'label',
		'style' : 'background-color:' + color + ';color:#fff;padding:2px 8px;border-radius:3px',
	}, text);
}

function renderUpsStatus(s) {
	if (!s) {
		return E('em', {}, _('No status data yet. Start the daemon and wait for the first poll.'));
	}

	var upsStatus = (s.data && s.data['ups.status']) || 'N/A';
	var charge    = (s.data && s.data['battery.charge'])   ? s.data['battery.charge']   + ' %'   : 'N/A';
	var runtime   = (s.data && s.data['battery.runtime'])  ? Math.floor(+s.data['battery.runtime'] / 60) + ' min' : 'N/A';
	var load      = (s.data && s.data['ups.load'])         ? s.data['ups.load']          + ' %'   : 'N/A';
	var voltage   = (s.data && s.data['output.voltage'])   ? s.data['output.voltage']    + ' V'   : 'N/A';
	var model     = (s.data && (s.data['device.model'] || s.data['ups.model'])) || 'N/A';

	var badge;
	if (!s.online) {
		badge = statusBadge(_('Offline'), '#cc0000');
	} else if (upsStatus.indexOf('LB') !== -1 || upsStatus.indexOf('OB') !== -1) {
		badge = statusBadge(upsStatus, '#e67e22');
	} else {
		badge = statusBadge(upsStatus, '#27ae60');
	}

	var rows = [
		[_('Status'),             badge],
		[_('Model'),              model],
		[_('Battery Charge'),     charge],
		[_('Runtime Remaining'),  runtime],
		[_('Load'),               load],
		[_('Output Voltage'),     voltage],
		[_('Last Updated'),       s.timestamp || 'N/A'],
	];

	if (s.error) {
		rows.push([_('Error'), E('span', { 'style': 'color:#cc0000' }, s.error)]);
	}

	return E('table', { 'class': 'table' }, rows.map(function(r) {
		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td left', 'style': 'width:40%;font-weight:bold' }, r[0]),
			E('td', { 'class': 'td left' }, r[1]),
		]);
	}));
}

/* ── View ───────────────────────────────────────────────────────────────── */

return view.extend({

	load: function() {
		return Promise.all([
			uci.load('nut-guard'),
			callServiceList('nut-guard').catch(function() { return {}; }),
			callReadFile('/var/run/nut-guard/status.json').catch(function() { return ''; }),
		]);
	},

	render: function(data) {
		var svcRes  = data[1];
		var running = isRunning(svcRes);
		var status  = parseStatus(data[2]);

		/* ── Service-control bar ── */
		var svcLabel = running
			? E('span', { 'style': 'color:#27ae60;font-weight:bold' }, '● ' + _('Running'))
			: E('span', { 'style': 'color:#cc0000;font-weight:bold' }, '● ' + _('Stopped'));

		function makeBtn(label, cls, args) {
			return E('button', {
				'class'  : 'btn cbi-button ' + cls,
				'style'  : 'margin-right:4px',
				'click'  : function() {
					return callExec('/etc/init.d/nut-guard', args, {})
						.then(function() {
							return ui.addNotification(null,
								E('p', _('Command sent: /etc/init.d/nut-guard ') + args[0]), 'info');
						})
						.catch(function(err) {
							return ui.addNotification(null,
								E('p', _('Error: ') + err.message), 'warning');
						});
				},
			}, label);
		}

		var serviceSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Service Control')),
			E('div', { 'class': 'cbi-value', 'style': 'margin-bottom:8px' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Daemon Status')),
				E('div',   { 'class': 'cbi-value-field'  }, svcLabel),
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					makeBtn(_('Start'),   'cbi-button-apply',    ['start']),
					makeBtn(_('Stop'),    'cbi-button-negative', ['stop']),
					makeBtn(_('Restart'), '',                    ['restart']),
					makeBtn(_('Enable'),  '',                    ['enable']),
					makeBtn(_('Disable'), 'cbi-button-negative', ['disable']),
				]),
			]),
		]);

		/* ── UPS status card ── */
		var statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('UPS Status')),
			renderUpsStatus(status),
		]);

		/* ── Configuration form (UCI) ── */
		var m = new form.Map('nut-guard', _('Nut Guard'),
			_('Configure the NUT server connection. Changes are saved to /etc/config/nut-guard and take effect after restarting the daemon.'));

		var s = m.section(form.NamedSection, 'main', 'main', _('Connection Settings'));
		s.addremove = false;

		var o;

		o = s.option(form.Value, 'host', _('NUT Server Host'),
			_('IP address or hostname of the NUT server (upsd).'));
		o.datatype   = 'host';
		o.default    = '127.0.0.1';
		o.placeholder = '127.0.0.1';
		o.rmempty    = false;

		o = s.option(form.Value, 'port', _('NUT Server Port'));
		o.datatype   = 'port';
		o.default    = '3493';
		o.placeholder = '3493';
		o.rmempty    = false;

		o = s.option(form.Value, 'ups', _('UPS Name'),
			_('Name of the UPS device as configured in upsd (e.g. "ups" or "myups@host").'));
		o.datatype   = 'string';
		o.default    = 'ups';
		o.placeholder = 'ups';
		o.rmempty    = false;

		o = s.option(form.Value, 'refresh_seconds', _('Refresh Interval'),
			_('How often to poll the NUT server, in seconds (2–3600).'));
		o.datatype   = 'range(2, 3600)';
		o.default    = '5';
		o.placeholder = '5';
		o.rmempty    = false;

		o = s.option(form.Value, 'timeout_seconds', _('Query Timeout'),
			_('Connection timeout for each NUT query, in seconds (1–30).'));
		o.datatype   = 'range(1, 30)';
		o.default    = '3';
		o.placeholder = '3';
		o.rmempty    = false;

		return m.render().then(function(formNode) {
			return E('div', {}, [serviceSection, statusSection, formNode]);
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			ui.addNotification(null, E('p', _('Settings saved. Restart the daemon for changes to take effect.')), 'info');
		});
	},
});
