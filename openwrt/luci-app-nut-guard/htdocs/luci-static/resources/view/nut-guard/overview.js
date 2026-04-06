'use strict'
'require view'
'require form'
'require rpc'
'require uci'
'require poll'

/* -------------------------------------------------------------------------
 * RPC declarations
 * ---------------------------------------------------------------------- */

var callGetStatus = rpc.declare({
	object: 'luci.nut-guard',
	method: 'get_status',
	params: [],
	expect: { '': {} }
})

var callServiceAction = rpc.declare({
	object: 'luci.nut-guard',
	method: 'service_action',
	params: [ 'action' ],
	expect: { result: false }
})

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
})

/* -------------------------------------------------------------------------
 * View
 * ---------------------------------------------------------------------- */

return view.extend({
	/** Holds the form.Map instance so handleSave/Apply can reference it */
	__map: null,

	load: function () {
		return Promise.all([
			callGetStatus(),
			callServiceList('nut-guard'),
			uci.load('nut-guard')
		])
	},

	/* ------------------------------------------------------------------
	 * Helpers: derive running state from procd's service list response
	 * ----------------------------------------------------------------*/
	_isRunning: function (serviceData) {
		var svc = (serviceData || {})['nut-guard'] || {}
		var instances = svc.instances || {}
		return Object.keys(instances).some(function (k) {
			return instances[k] && instances[k].running
		})
	},

	/* ------------------------------------------------------------------
	 * Status card — shows daemon state + Start/Stop/Restart buttons
	 * ----------------------------------------------------------------*/
	_renderServiceCard: function (status, isRunning) {
		var btnToggle = E('button', {
			class: 'cbi-button ' + (isRunning ? 'cbi-button-negative' : 'cbi-button-action'),
			style: 'margin-left:8px',
			click: function (ev) {
				ev.currentTarget.disabled = true
				callServiceAction(isRunning ? 'stop' : 'start').then(function () {
					window.location.reload()
				})
			}
		}, isRunning ? _('Stop') : _('Start'))

		var btnRestart = isRunning ? E('button', {
			class: 'cbi-button cbi-button-neutral',
			style: 'margin-left:4px',
			click: function (ev) {
				ev.currentTarget.disabled = true
				callServiceAction('restart').then(function () {
					window.location.reload()
				})
			}
		}, _('Restart')) : E([])

		var btnEnable = E('button', {
			class: 'cbi-button cbi-button-neutral',
			click: function (ev) {
				ev.currentTarget.disabled = true
				callServiceAction('enable').then(function () {
					ev.currentTarget.textContent = _('Autostart enabled')
				})
			}
		}, _('Enable autostart'))

		var btnDisable = E('button', {
			class: 'cbi-button cbi-button-neutral',
			style: 'margin-left:4px',
			click: function (ev) {
				ev.currentTarget.disabled = true
				callServiceAction('disable').then(function () {
					ev.currentTarget.textContent = _('Autostart disabled')
				})
			}
		}, _('Disable autostart'))

		var stateLabel = E('span', {
			style: 'padding:2px 10px;border-radius:3px;font-weight:bold;color:#fff;background:' +
				(isRunning ? '#46b450' : '#dc3232')
		}, isRunning ? _('Running') : _('Stopped'))

		var rows = [
			E('div', { class: 'tr' }, [
				E('div', { class: 'td left', style: 'width:30%' }, _('Daemon')),
				E('div', { class: 'td left' }, [ stateLabel, btnToggle, btnRestart ])
			]),
			E('div', { class: 'tr' }, [
				E('div', { class: 'td left' }, _('Autostart')),
				E('div', { class: 'td left' }, [ btnEnable, btnDisable ])
			])
		]

		if (status && status.timestamp) {
			rows.push(E('div', { class: 'tr' }, [
				E('div', { class: 'td left' }, _('Last poll')),
				E('div', { class: 'td left' }, status.timestamp)
			]))
		}

		if (status && status.host) {
			rows.push(E('div', { class: 'tr' }, [
				E('div', { class: 'td left' }, _('NUT server')),
				E('div', { class: 'td left' }, status.host + ':' + (status.port || 3493))
			]))
		}

		if (status && status.ups) {
			rows.push(E('div', { class: 'tr' }, [
				E('div', { class: 'td left' }, _('UPS name')),
				E('div', { class: 'td left' }, status.ups)
			]))
		}

		return E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service Status')),
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'table' }, rows)
			])
		])
	},

	/* ------------------------------------------------------------------
	 * UPS data card — metric tiles + collapsible full parameter table
	 * ----------------------------------------------------------------*/
	_renderUPSCard: function (status) {
		if (!status) return E([])

		if (!status.ok) {
			if (!status.error) return E([])
			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('UPS Status')),
				E('div', { class: 'cbi-section-node' }, [
					E('div', {
						class: 'alert-message warning',
						style: 'margin:0'
					}, E('p', { style: 'margin:0' }, status.error))
				])
			])
		}

		var data = status.data || {}
		if (!Object.keys(data).length) return E([])

		/* Metric tiles */
		var upsStatus = data['ups.status'] || ''
		var batteryCharge = parseFloat(data['battery.charge'] || 0)
		var load = parseFloat(data['ups.load'] || 0)
		var runtimeSec = data['battery.runtime'] ? parseInt(data['battery.runtime'], 10) : null
		var runtimeMin = runtimeSec !== null ? Math.floor(runtimeSec / 60) : null

		var statusNames = {
			OL: _('Online'), OB: _('On Battery'), LB: _('Low Battery'),
			HB: _('High Battery'), RB: _('Replace Battery'), CHRG: _('Charging'),
			DISCHRG: _('Discharging'), BYPASS: _('Bypass'), CAL: _('Calibrating'),
			OFF: _('Offline'), OVER: _('Overloaded'), TRIM: _('Trimming'),
			BOOST: _('Boosting'), FSD: _('Forced Shutdown'), ALARM: _('Alarm')
		}

		var stateText = upsStatus.split(' ').map(function (s) {
			return statusNames[s] || s
		}).join(' + ')

		var stateColor = (upsStatus.indexOf('OB') !== -1) ? '#ffb900' :
			((upsStatus.indexOf('LB') !== -1 || upsStatus.indexOf('FSD') !== -1) ? '#dc3232' : '#46b450')

		var metrics = []

		if (upsStatus)
			metrics.push({ label: _('Status'), value: stateText, color: stateColor })

		if (data['battery.charge'] !== undefined) {
			var bColor = batteryCharge >= 80 ? '#46b450' : (batteryCharge >= 20 ? '#ffb900' : '#dc3232')
			metrics.push({ label: _('Battery'), value: data['battery.charge'] + '%', color: bColor })
		}

		if (runtimeMin !== null) {
			var rColor = runtimeMin >= 30 ? '#46b450' : (runtimeMin >= 5 ? '#ffb900' : '#dc3232')
			metrics.push({ label: _('Runtime'), value: runtimeMin + ' min', color: rColor })
		}

		if (data['ups.load'] !== undefined) {
			var lColor = load < 50 ? '#46b450' : (load < 80 ? '#ffb900' : '#dc3232')
			metrics.push({ label: _('Load'), value: data['ups.load'] + '%', color: lColor })
		}

		if (data['output.voltage'] !== undefined)
			metrics.push({ label: _('Output Voltage'), value: data['output.voltage'] + ' V' })

		if (data['battery.voltage'] !== undefined)
			metrics.push({ label: _('Battery Voltage'), value: data['battery.voltage'] + ' V' })

		if (data['ups.realpower.nominal'] !== undefined)
			metrics.push({ label: _('Nominal Power'), value: data['ups.realpower.nominal'] + ' W' })

		if (data['ups.model'] !== undefined)
			metrics.push({ label: _('Model'), value: data['ups.model'] })

		var tiles = metrics.map(function (m) {
			return E('div', {
				style: 'flex:1 1 120px;max-width:200px;border:1px solid var(--cbi-border-color,#ccc);' +
					'border-radius:6px;padding:10px 14px;text-align:center;box-sizing:border-box'
			}, [
				E('div', { style: 'font-size:0.8em;color:#888;margin-bottom:4px' }, m.label),
				E('div', {
					style: 'font-size:1.4em;font-weight:700;color:' + (m.color || 'inherit')
				}, m.value)
			])
		})

		/* Full parameter table (collapsed by default) */
		var paramRows = Object.keys(data).sort().map(function (k) {
			return E('tr', {}, [
				E('td', { style: 'padding:3px 8px;font-family:monospace;white-space:nowrap' }, k),
				E('td', { style: 'padding:3px 8px;word-break:break-all' }, data[k])
			])
		})

		return E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('UPS Status')),
			E('div', { class: 'cbi-section-node' }, [
				E('div', {
					style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px'
				}, tiles),
				E('details', {}, [
					E('summary', {
						style: 'cursor:pointer;user-select:none;padding:4px 0;color:var(--cbi-link-color,#007bff)'
					}, _('Show all parameters (' + Object.keys(data).length + ')')),
					E('table', {
						style: 'width:100%;border-collapse:collapse;margin-top:8px'
					}, [
						E('thead', {}, E('tr', {}, [
							E('th', {
								style: 'text-align:left;padding:3px 8px;border-bottom:1px solid #ccc'
							}, _('Parameter')),
							E('th', {
								style: 'text-align:left;padding:3px 8px;border-bottom:1px solid #ccc'
							}, _('Value'))
						])),
						E('tbody', {}, paramRows)
					])
				])
			])
		])
	},

	/* ------------------------------------------------------------------
	 * Main render: service status + UPS data + UCI config form
	 * ----------------------------------------------------------------*/
	render: function (loaded) {
		var statusData  = loaded[0] || {}
		var serviceData = loaded[1] || {}
		var isRunning   = this._isRunning(serviceData)

		/* UCI config form */
		var m = new form.Map('nut-guard', _('Nut Guard'),
			_('UPS monitoring via Network UPS Tools (NUT) protocol. ' +
			  'The daemon polls the NUT server and stores status data for this page.'))

		this.__map = m

		var s = m.section(form.NamedSection, 'main', 'nut-guard', _('Connection Settings'))
		s.addremove = false
		s.anonymous = false

		var o

		o = s.option(form.Value, 'ip', _('NUT Server Host'),
			_('IP address or hostname of the NUT server'))
		o.datatype = 'host'
		o.placeholder = '127.0.0.1'
		o.rmempty = false

		o = s.option(form.Value, 'ups', _('UPS Name'),
			_('Device name as configured in the NUT server (e.g. myups)'))
		o.placeholder = 'myups'
		o.rmempty = false
		o.validate = function (section_id, value) {
			if (!value.match(/^[A-Za-z0-9_.-]+$/))
				return _('Only letters, digits, underscore, hyphen and dot are allowed')
			return true
		}

		o = s.option(form.Value, 'port', _('NUT Server Port'),
			_('TCP port of the NUT server (default: 3493)'))
		o.datatype = 'port'
		o.placeholder = '3493'
		o.optional = true

		o = s.option(form.Value, 'refresh_seconds', _('Refresh Interval (s)'),
			_('How often the daemon polls the NUT server (2 – 3600 seconds)'))
		o.datatype = 'range(2,3600)'
		o.placeholder = '5'

		o = s.option(form.Value, 'command_timeout_seconds', _('Query Timeout (s)'),
			_('Timeout for each NUT connection (1 – 30 seconds)'))
		o.datatype = 'range(1,30)'
		o.placeholder = '3'

		var self = this

		return m.render().then(function (formNode) {
			return E('div', {}, [
				self._renderServiceCard(statusData, isRunning),
				self._renderUPSCard(statusData),
				formNode
			])
		})
	},

	/* ------------------------------------------------------------------
	 * Save / Apply / Reset handlers delegate to the form.Map instance
	 * ----------------------------------------------------------------*/
	handleSave: function (ev) {
		return this.__map.save(null, true)
	},

	handleSaveApply: function (ev, apply) {
		return this.__map.save(null, true).then(L.bind(function () {
			if (apply) return this.__map.apply()
		}, this))
	},

	handleReset: function () {
		return this.__map.reset()
	}
})
