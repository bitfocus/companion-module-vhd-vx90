const { InstanceBase, runEntrypoint, InstanceStatus, Regex } = require('@companion-module/base')
const net = require('net')
const { UpgradeScripts } = require('./upgrades')
const { getActionDefinitions } = require('./actions')
const { getFeedbackDefinitions } = require('./feedbacks')
const { getPresetDefinitions } = require('./presets')

class VX90Instance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = null
		this.reconnectTimer = null
		this.connected = false
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setPresetDefinitions(getPresetDefinitions(this))
		this.setVariableDefinitions([{ variableId: 'connection_status', name: 'Connection status' }])
		this.setVariableValues({ connection_status: 'Connecting' })
		this.initConnection()
	}

	async configUpdated(config) {
		this.config = config
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
			this.updateStatus(InstanceStatus.BadConfig, 'No camera IP configured')
			return
		}

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
			if (this.currentStatus?.status !== InstanceStatus.BadConfig) {
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
