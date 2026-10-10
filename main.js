const { InstanceBase, runEntrypoint, InstanceStatus, Regex } = require('@companion-module/base')
const net = require('net')
const { UpgradeScripts } = require('./upgrades')
const { getActionDefinitions } = require('./actions')
const { getFeedbackDefinitions } = require('./feedbacks')
const { getPresetDefinitions } = require('./presets')
const { COLOR_MATRIX_AXES, COLOR_MATRIX_NEUTRAL } = require('./visca')

class VX90Instance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = null
		this.reconnectTimer = null
		this.connected = false
		this.badConfig = false
		// The colour matrix has no native up/down command, so the module tracks
		// the last value it set per axis (seeded to neutral) to support stepping.
		this.colorMatrixHue = {}
		for (const a of COLOR_MATRIX_AXES) this.colorMatrixHue[a.id] = COLOR_MATRIX_NEUTRAL
	}

	isV8197() {
		return (this.config?.firmware || 'v8197') === 'v8197'
	}

	buildVariableDefinitions() {
		const defs = [{ variableId: 'connection_status', name: 'Connection status' }]
		if (this.isV8197()) {
			for (const a of COLOR_MATRIX_AXES) {
				defs.push({ variableId: a.varId, name: `Colour matrix hue: ${a.label} (last set)` })
			}
		}
		return defs
	}

	publishColorMatrixVars() {
		if (!this.isV8197()) return
		const vals = {}
		for (const a of COLOR_MATRIX_AXES) vals[a.varId] = this.colorMatrixHue[a.id]
		this.setVariableValues(vals)
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setPresetDefinitions(getPresetDefinitions(this))
		this.setVariableDefinitions(this.buildVariableDefinitions())
		this.setVariableValues({ connection_status: 'Connecting' })
		this.publishColorMatrixVars()
		this.initConnection()
	}

	async configUpdated(config) {
		this.config = config
		// Firmware choice decides which actions and variables are offered.
		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setPresetDefinitions(getPresetDefinitions(this))
		this.setVariableDefinitions(this.buildVariableDefinitions())
		this.publishColorMatrixVars()
		this.destroyConnection()
		this.initConnection()
	}

	async destroy() {
		this.destroyConnection()
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					'Controls a VHD VX-90 PTZ camera over VISCA-over-IP (TCP). ' +
					'Default port on the VX-90 is 5678 (see the camera network settings, "PTZ port"). ' +
					'Default VISCA camera address is 1.',
			},
			{
				type: 'dropdown',
				id: 'firmware',
				label: 'Camera firmware',
				width: 12,
				default: 'v8197',
				choices: [
					{ id: 'legacy', label: 'V8.1.92 and older (up to 2026-06)' },
					{ id: 'v8197', label: 'V8.1.97 and newer (2026-09-24 and later)' },
				],
				tooltip:
					'Pick the firmware your camera runs. Both options share the full classic command set. ' +
					'Choosing V8.1.97 additionally exposes the commands that only exist in that firmware ' +
					'(fine zoom speed, Kelvin colour temperature, fan control, colour matrix, preset image ' +
					'parameters, pan/tilt speed step). You can check the version in the camera web UI or OSD.',
			},
			{
				type: 'static-text',
				id: 'fw_info',
				width: 12,
				label: '',
				value:
					'Actions marked [V8.1.97+] appear only when that firmware is selected. ' +
					'Switching firmware here re-builds the action list; buttons bound to a command ' +
					'that the other firmware does not have will show as unknown until you switch back.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Camera IP address',
				width: 6,
				regex: Regex.IP,
			},
			{
				type: 'number',
				id: 'port',
				label: 'VISCA TCP port',
				width: 3,
				min: 1,
				max: 65535,
				default: 5678,
			},
			{
				type: 'number',
				id: 'address',
				label: 'VISCA camera address',
				width: 3,
				min: 1,
				max: 7,
				default: 1,
			},
		]
	}

	initConnection() {
		if (!this.config?.host) {
			this.badConfig = true
			this.updateStatus(InstanceStatus.BadConfig, 'No camera IP configured')
			return
		}
		this.badConfig = false

		this.socket = new net.Socket()

		this.socket.on('connect', () => {
			this.connected = true
			this.updateStatus(InstanceStatus.Ok)
			this.setVariableValues({ connection_status: 'Connected' })
		})

		this.socket.on('error', (err) => {
			this.connected = false
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.setVariableValues({ connection_status: 'Error: ' + err.message })
			this.scheduleReconnect()
		})

		this.socket.on('close', () => {
			this.connected = false
			if (!this.badConfig) {
				this.updateStatus(InstanceStatus.Disconnected)
				this.setVariableValues({ connection_status: 'Disconnected' })
			}
			this.scheduleReconnect()
		})

		this.socket.on('data', (data) => {
			// VISCA ACK/completion/error packets could be parsed here if needed later.
			this.log('debug', 'RX: ' + data.toString('hex'))
		})

		this.socket.connect(this.config.port || 5678, this.config.host)
	}

	scheduleReconnect() {
		if (this.reconnectTimer) return
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			if (!this.connected) this.initConnection()
		}, 5000)
	}

	destroyConnection() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		if (this.socket) {
			this.socket.removeAllListeners()
			try {
				this.socket.destroy()
			} catch (e) {
				// ignore
			}
			this.socket = null
		}
	}

	/** Send a pre-built VISCA Buffer to the camera. */
	sendBuffer(buf) {
		if (!this.socket || !this.connected) {
			this.log('warn', 'Not connected, dropping command: ' + buf.toString('hex'))
			return
		}
		this.log('debug', 'TX: ' + buf.toString('hex'))
		this.socket.write(buf)
	}

	get viscaAddress() {
		return this.config?.address ?? 1
	}
}

runEntrypoint(VX90Instance, UpgradeScripts)
