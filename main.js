const { InstanceBase, runEntrypoint, InstanceStatus, Regex } = require('@companion-module/base')
const net = require('net')
const { UpgradeScripts } = require('./upgrades')
const { getActionDefinitions } = require('./actions')
const { getFeedbackDefinitions } = require('./feedbacks')
const { getPresetDefinitions } = require('./presets')
const { COLOR_MATRIX_AXES, COLOR_MATRIX_NEUTRAL } = require('./visca')

const CONNECT_TIMEOUT_MS = 5000

class VX90Instance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = null
		this.reconnectTimer = null
		this.connected = false
		this.badConfig = false
		this.lastError = null
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

	/** Connection state changed: refresh every button that uses the `connected` feedback. */
	setConnected(value) {
		this.connected = value
		this.checkFeedbacks('connected')
	}

	/** Tear down the current socket (if any) without touching a pending reconnect timer. */
	destroySocket() {
		if (!this.socket) return
		const socket = this.socket
		this.socket = null
		socket.removeAllListeners()
		// A destroyed socket can still emit a late 'error'; swallow it so it never crashes the module.
		socket.on('error', () => {})
		try {
			socket.destroy()
		} catch (e) {
			// ignore
		}
	}

	initConnection() {
		// A reconnect must never leave the previous socket and its listeners behind.
		this.destroySocket()

		if (!this.config?.host) {
			this.badConfig = true
			this.setConnected(false)
			this.updateStatus(InstanceStatus.BadConfig, 'No camera IP configured')
			return
		}
		this.badConfig = false
		this.lastError = null

		const socket = new net.Socket()
		this.socket = socket

		// Without this, an unreachable IP keeps the status on "Connecting" for the OS TCP timeout
		// (often more than a minute) and the 5 s reconnect never runs.
		socket.setTimeout(CONNECT_TIMEOUT_MS)

		socket.on('connect', () => {
			socket.setTimeout(0) // the timeout is for connecting only, not for idle connections
			this.lastError = null
			this.setConnected(true)
			this.updateStatus(InstanceStatus.Ok)
			this.setVariableValues({ connection_status: 'Connected' })
		})

		socket.on('timeout', () => {
			// destroy(err) emits 'error' and then 'close', so the normal error/reconnect path runs.
			socket.destroy(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000} s`))
		})

		socket.on('error', (err) => {
			this.lastError = err.message
			this.setConnected(false)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.setVariableValues({ connection_status: 'Error: ' + err.message })
			this.scheduleReconnect()
		})

		socket.on('close', () => {
			this.setConnected(false)
			// Node emits 'close' right after 'error'; keep the error message visible in that case.
			if (!this.badConfig && !this.lastError) {
				this.updateStatus(InstanceStatus.Disconnected)
				this.setVariableValues({ connection_status: 'Disconnected' })
			}
			this.scheduleReconnect()
		})

		socket.on('data', (data) => {
			// VISCA ACK/completion/error packets could be parsed here if needed later.
			this.log('debug', 'RX: ' + data.toString('hex'))
		})

		socket.connect(this.config.port || 5678, this.config.host)
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
		this.destroySocket()
		this.setConnected(false)
	}

	/** Send a pre-built VISCA Buffer to the camera. */
	sendBuffer(buf) {
		if (!this.socket || !this.connected) {
			this.log('warn', 'Not connected, dropping command: ' + buf.toString('hex'))
			return
		}
		this.log('debug', 'TX: ' + buf.toString('hex'))
		this.socket.write(buf, (err) => {
			if (err) this.log('error', 'Write failed: ' + err.message)
		})
	}

	get viscaAddress() {
		return this.config?.address ?? 1
	}
}

runEntrypoint(VX90Instance, UpgradeScripts)
