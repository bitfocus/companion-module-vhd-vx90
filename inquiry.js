// inquiry.js — reading camera state back over VISCA.
//
// Two jobs:
//  1. Parse everything the camera sends back (ACK, completion, error and
//     inquiry replies). Replies arrive as raw VISCA packets terminated by 0xFF;
//     TCP may split or merge them, so bytes are buffered until a terminator.
//  2. Poll a list of inquiry commands one at a time (VISCA has no request IDs,
//     so only one inquiry may be outstanding) and publish the decoded values
//     as Companion variables and feedback state.
//
// Inquiries the camera does not answer (error or timeout, three times in a
// row) are marked unsupported and skipped until the next reconnect, so an
// unknown command never slows the polling of the ones that do work.

const ERROR_CODES = {
	0x01: 'Message length error',
	0x02: 'Syntax error',
	0x03: 'Command buffer full',
	0x04: 'Command cancelled',
	0x05: 'No socket',
	0x41: 'Command not executable',
}

/** Combine nibble-bytes (0x0N each) into one unsigned integer. */
function nibblesToInt(bytes) {
	let v = 0
	for (const b of bytes) v = (v << 4) | (b & 0x0f)
	return v >>> 0
}

/** Same, interpreted as two's complement of (4 * bytes.length) bits. */
function nibblesToSigned(bytes) {
	const bits = bytes.length * 4
	const v = nibblesToInt(bytes)
	return v >= 2 ** (bits - 1) ? v - 2 ** bits : v
}

const lastNibbles = (n) => (p) => nibblesToInt(p.slice(-n))
const onOffReply = (p) => (p[0] === 0x02 ? 'On' : p[0] === 0x03 ? 'Off' : `0x${p[0].toString(16)}`)
const mapReply = (map) => (p) => map[p[p.length - 1]] ?? `0x${p[p.length - 1].toString(16).padStart(2, '0')}`

const AE_MODES = { 0x00: 'Auto', 0x03: 'Manual', 0x0a: 'Shutter priority', 0x0b: 'Iris priority', 0x0d: 'Bright' }
const WB_MODES = { 0x00: 'Auto', 0x01: 'Indoor', 0x02: 'Outdoor', 0x03: 'One Push', 0x05: 'Manual', 0x20: 'VAR' }
const IRIS_STOPS = [
	'Close', 'F11.0', 'F9.6', 'F8.0', 'F7.3', 'F6.8', 'F6.2', 'F5.6',
	'F5.2', 'F4.8', 'F4.4', 'F4.0', 'F3.7', 'F3.4', 'F3.1', 'F2.8',
]
const ZOOM_MAX = 16384

/**
 * Inquiry table. `bytes` go between the address header and 0xFF.
 * `tier`: 'fast' = positions (polled often), 'slow' = settings.
 * `apply(payload, state)` decodes the reply payload (bytes after 0x50) into state.
 * Standard Sony VISCA inquiries; the VX-90 implements this command family.
 */
const INQUIRIES = [
	{
		id: 'pantilt',
		label: 'Pan/Tilt position',
		bytes: [0x09, 0x06, 0x12],
		tier: 'fast',
		apply: (p, s) => {
			const half = p.length / 2
			s.pan_pos = nibblesToSigned(p.slice(0, half))
			s.tilt_pos = nibblesToSigned(p.slice(half))
		},
	},
	{
		id: 'zoom',
		label: 'Zoom position',
		bytes: [0x09, 0x04, 0x47],
		tier: 'fast',
		apply: (p, s) => {
			s.zoom_pos = nibblesToInt(p)
			s.zoom_pct = Math.round((Math.min(s.zoom_pos, ZOOM_MAX) / ZOOM_MAX) * 100)
		},
	},
	{
		id: 'focus',
		label: 'Focus position',
		bytes: [0x09, 0x04, 0x48],
		tier: 'fast',
		apply: (p, s) => {
			s.focus_pos = nibblesToInt(p)
		},
	},
	{ id: 'power', label: 'Power', bytes: [0x09, 0x04, 0x00], tier: 'slow',
		apply: (p, s) => { s.power = p[0] === 0x02 ? 'On' : p[0] === 0x03 ? 'Standby' : `0x${p[0].toString(16)}` } },
	{ id: 'focus_mode', label: 'Focus mode', bytes: [0x09, 0x04, 0x38], tier: 'slow',
		apply: (p, s) => { s.focus_mode = mapReply({ 0x02: 'Auto', 0x03: 'Manual' })(p) } },
	{ id: 'ae_mode', label: 'Exposure mode', bytes: [0x09, 0x04, 0x39], tier: 'slow',
		apply: (p, s) => { s.ae_mode = mapReply(AE_MODES)(p) } },
	{ id: 'iris', label: 'Iris', bytes: [0x09, 0x04, 0x4b], tier: 'slow',
		apply: (p, s) => {
			const v = lastNibbles(2)(p)
			s.iris_pos = v
			s.iris = IRIS_STOPS[v] ?? String(v)
		} },
	{ id: 'shutter', label: 'Shutter', bytes: [0x09, 0x04, 0x4a], tier: 'slow',
		apply: (p, s) => { s.shutter_pos = lastNibbles(2)(p) } },
	{ id: 'gain', label: 'Gain', bytes: [0x09, 0x04, 0x4c], tier: 'slow',
		apply: (p, s) => { s.gain = lastNibbles(2)(p) } },
	{ id: 'bright', label: 'Bright', bytes: [0x09, 0x04, 0x4d], tier: 'slow',
		apply: (p, s) => { s.bright = lastNibbles(2)(p) } },
	{ id: 'expcomp_mode', label: 'Exposure compensation on/off', bytes: [0x09, 0x04, 0x3e], tier: 'slow',
		apply: (p, s) => { s.expcomp_mode = onOffReply(p) } },
	{ id: 'expcomp', label: 'Exposure compensation', bytes: [0x09, 0x04, 0x4e], tier: 'slow',
		apply: (p, s) => { s.expcomp = lastNibbles(1)(p) - 7 } },
	{ id: 'backlight', label: 'Backlight', bytes: [0x09, 0x04, 0x33], tier: 'slow',
		apply: (p, s) => { s.backlight = onOffReply(p) } },
	{ id: 'wb_mode', label: 'White balance mode', bytes: [0x09, 0x04, 0x35], tier: 'slow',
		apply: (p, s) => { s.wb_mode = mapReply(WB_MODES)(p) } },
	{ id: 'r_gain', label: 'R gain', bytes: [0x09, 0x04, 0x43], tier: 'slow',
		apply: (p, s) => { s.r_gain = lastNibbles(2)(p) } },
	{ id: 'b_gain', label: 'B gain', bytes: [0x09, 0x04, 0x44], tier: 'slow',
		apply: (p, s) => { s.b_gain = lastNibbles(2)(p) } },
	{ id: 'colortemp', label: 'Colour temperature', bytes: [0x09, 0x04, 0x20], tier: 'slow', fw: 'legacy',
		apply: (p, s) => { s.colortemp = 2500 + lastNibbles(2)(p) * 100 } },
	// V8.1.97+: answers directly in Kelvin, 90 50 0p 0q 0r 0s FF.
	{ id: 'colortemp_k', label: 'Colour temperature (Kelvin)', bytes: [0x09, 0x04, 0x20, 0x01], tier: 'slow', fw: 'v8197',
		apply: (p, s) => { s.colortemp = nibblesToInt(p) } },
	{ id: 'saturation', label: 'Saturation', bytes: [0x09, 0x04, 0x49], tier: 'slow',
		apply: (p, s) => { s.saturation = lastNibbles(1)(p) } },
	{ id: 'flip_h', label: 'Horizontal flip', bytes: [0x09, 0x04, 0x61], tier: 'slow',
		apply: (p, s) => { s.flip_h = onOffReply(p) } },
	{ id: 'flip_v', label: 'Vertical flip', bytes: [0x09, 0x04, 0x66], tier: 'slow',
		apply: (p, s) => { s.flip_v = onOffReply(p) } },

	// ---- More picture settings (reply formats from VHD's VISCA list) ----
	{ id: 'gain_limit', label: 'Gain limit', bytes: [0x09, 0x04, 0x2c], tier: 'slow',
		apply: (p, s) => { s.gain_limit = lastNibbles(1)(p) } },
	{ id: 'metering', label: 'Metering mode', bytes: [0x09, 0x04, 0x3a], tier: 'slow',
		apply: (p, s) => { s.metering = mapReply({ 0: 'Average', 1: 'Center', 2: 'Smart', 3: 'Top' })(p) } },
	{ id: 'drc', label: 'DRC', bytes: [0x09, 0x04, 0xa7], tier: 'slow',
		apply: (p, s) => { s.drc = lastNibbles(1)(p) } },
	{ id: 'anti_flicker', label: 'Anti-flicker', bytes: [0x09, 0x04, 0x55], tier: 'slow',
		apply: (p, s) => { s.anti_flicker = mapReply({ 0: 'Off', 1: '50Hz', 2: '60Hz' })(p) } },
	{ id: 'rg_tuning', label: 'RG tuning', bytes: [0x09, 0x04, 0x12], tier: 'slow',
		apply: (p, s) => { s.rg_tuning = lastNibbles(2)(p) - 10 } },
	{ id: 'bg_tuning', label: 'BG tuning', bytes: [0x09, 0x04, 0x13], tier: 'slow',
		apply: (p, s) => { s.bg_tuning = lastNibbles(2)(p) - 10 } },
	{ id: 'hue', label: 'Hue', bytes: [0x09, 0x04, 0x4f], tier: 'slow',
		apply: (p, s) => { s.hue = lastNibbles(1)(p) } },
	{ id: 'luminance', label: 'Luminance', bytes: [0x09, 0x04, 0xa1], tier: 'slow',
		apply: (p, s) => { s.luminance = lastNibbles(1)(p) } },
	{ id: 'contrast', label: 'Contrast', bytes: [0x09, 0x04, 0xa2], tier: 'slow',
		apply: (p, s) => { s.contrast = lastNibbles(1)(p) } },
	{ id: 'sharpness', label: 'Sharpness', bytes: [0x09, 0x04, 0x42], tier: 'slow',
		apply: (p, s) => { s.sharpness = lastNibbles(1)(p) } },
	{ id: 'nr3d', label: '3D noise reduction', bytes: [0x09, 0x04, 0x54], tier: 'slow',
		apply: (p, s) => { s.nr3d = p[p.length - 1] === 0 ? 'Off' : p[p.length - 1] } },
	{ id: 'gamma', label: 'Gamma', bytes: [0x09, 0x04, 0x5b], tier: 'slow',
		apply: (p, s) => { s.gamma = mapReply({ 0: 'Default', 1: '0.45', 2: '0.5', 3: '0.56', 4: 'EXT', 5: 'PC' })(p) } },
	{ id: 'bw_mode', label: 'Black & white', bytes: [0x09, 0x04, 0x63], tier: 'slow',
		apply: (p, s) => { s.bw_mode = mapReply({ 2: 'Off', 4: 'On' })(p) } },
	{ id: 'af_sensitivity', label: 'AF sensitivity', bytes: [0x09, 0x04, 0x58], tier: 'slow',
		apply: (p, s) => { s.af_sensitivity = mapReply({ 1: 'High', 2: 'Normal', 3: 'Low' })(p) } },
	{ id: 'af_zone', label: 'AF zone', bytes: [0x09, 0x04, 0xaa], tier: 'slow',
		apply: (p, s) => { s.af_zone = mapReply({ 0: 'Top', 1: 'Center', 2: 'Bottom', 3: 'Front' })(p) } },
	{ id: 'osd_menu', label: 'OSD menu', bytes: [0x09, 0x06, 0x06], tier: 'slow',
		apply: (p, s) => { s.osd_menu = onOffReply(p) } },

	// ---- VHD-specific ----
	{ id: 'tally_mode', label: 'Tally mode enabled', bytes: [0x09, 0x11, 0x47], tier: 'slow',
		apply: (p, s) => { s.tally_mode = onOffReply(p) } },
	{ id: 'tally', label: 'Tally light', bytes: [0x09, 0x06, 0x6a], tier: 'slow',
		apply: (p, s) => {
			const mode = { 1: 'Blink', 2: 'On', 3: 'Off' }[p[0]] ?? `0x${p[0].toString(16)}`
			const colour = { 0: 'Green', 1: 'Red' }[p[1]] ?? ''
			s.tally_led = mode
			s.tally_colour = mode === 'Off' ? '' : colour
			s.tally = mode === 'Off' ? 'Off' : `${colour} ${mode === 'On' ? 'steady' : 'blink'}`.trim()
		} },
	// Reply format not documented by VHD; the matching set command uses 02=On/03=Off.
	{ id: 'tracking', label: 'Tracking status', bytes: [0x09, 0x7e, 0x11, 0x54], tier: 'slow',
		apply: (p, s) => { s.tracking = onOffReply(p) } },
]

/** Companion variable definitions for everything the inquiries can fill. */
const STATE_VARIABLES = [
	{ variableId: 'pan_pos', name: 'Pan position (raw)' },
	{ variableId: 'tilt_pos', name: 'Tilt position (raw)' },
	{ variableId: 'zoom_pos', name: 'Zoom position (raw 0-16384)' },
	{ variableId: 'zoom_pct', name: 'Zoom position (%)' },
	{ variableId: 'focus_pos', name: 'Focus position (raw)' },
	{ variableId: 'ptz_moving', name: 'Pan/tilt/zoom moving (true/false)' },
	{ variableId: 'power', name: 'Power state' },
	{ variableId: 'focus_mode', name: 'Focus mode' },
	{ variableId: 'ae_mode', name: 'Exposure mode' },
	{ variableId: 'iris', name: 'Iris (F-stop)' },
	{ variableId: 'iris_pos', name: 'Iris position (raw)' },
	{ variableId: 'shutter_pos', name: 'Shutter position (raw)' },
	{ variableId: 'gain', name: 'Gain' },
	{ variableId: 'bright', name: 'Bright' },
	{ variableId: 'expcomp_mode', name: 'Exposure compensation on/off' },
	{ variableId: 'expcomp', name: 'Exposure compensation (-7..7)' },
	{ variableId: 'backlight', name: 'Backlight compensation' },
	{ variableId: 'wb_mode', name: 'White balance mode' },
	{ variableId: 'r_gain', name: 'R gain' },
	{ variableId: 'b_gain', name: 'B gain' },
	{ variableId: 'colortemp', name: 'Colour temperature (K)' },
	{ variableId: 'saturation', name: 'Saturation' },
	{ variableId: 'flip_h', name: 'Horizontal flip' },
	{ variableId: 'flip_v', name: 'Vertical flip' },
	{ variableId: 'gain_limit', name: 'Gain limit' },
	{ variableId: 'metering', name: 'Metering mode' },
	{ variableId: 'drc', name: 'DRC' },
	{ variableId: 'anti_flicker', name: 'Anti-flicker' },
	{ variableId: 'rg_tuning', name: 'RG tuning (-10..10)' },
	{ variableId: 'bg_tuning', name: 'BG tuning (-10..10)' },
	{ variableId: 'hue', name: 'Hue' },
	{ variableId: 'luminance', name: 'Luminance' },
	{ variableId: 'contrast', name: 'Contrast' },
	{ variableId: 'sharpness', name: 'Sharpness' },
	{ variableId: 'nr3d', name: '3D noise reduction' },
	{ variableId: 'gamma', name: 'Gamma' },
	{ variableId: 'bw_mode', name: 'Black & white mode' },
	{ variableId: 'af_sensitivity', name: 'AF sensitivity' },
	{ variableId: 'af_zone', name: 'AF zone' },
	{ variableId: 'osd_menu', name: 'OSD menu open (On/Off)' },
	{ variableId: 'tally_mode', name: 'Tally mode enabled (On/Off)' },
	{ variableId: 'tally', name: 'Tally light (e.g. "Red steady", "Off")' },
	{ variableId: 'tally_led', name: 'Tally LED mode (On/Blink/Off)' },
	{ variableId: 'tally_colour', name: 'Tally colour (Red/Green)' },
	{ variableId: 'tracking', name: 'Auto tracking (On/Off)' },
	{ variableId: 'last_error', name: 'Last camera error' },
	{ variableId: 'unsupported_inquiries', name: 'Inquiries the camera did not answer' },
]

const INQUIRY_TIMEOUT_MS = 500
const MAX_FAILURES = 3
const SLOW_INTERVAL_MS = 5000
const SLOW_PER_ROUND = 3

class InquiryEngine {
	/**
	 * @param {object} host  needs: write(buf), address (number), log(level,msg),
	 *                       onState(changedKeys:string[]), onError(text)
	 */
	constructor(host) {
		this.host = host
		this.rx = Buffer.alloc(0)
		this.state = {}
		this.queue = []
		this.pending = null
		this.failures = {}
		this.unsupported = new Set()
		this.fastTimer = null
		this.slowTimer = null
		this.lastMotion = null
		this.slowSinceFast = SLOW_PER_ROUND
	}

	// ---------- receive side ----------

	/** Feed raw socket bytes; complete packets are dispatched. */
	handleData(data) {
		this.rx = Buffer.concat([this.rx, data])
		let end
		while ((end = this.rx.indexOf(0xff)) !== -1) {
			const packet = this.rx.subarray(0, end + 1)
			this.rx = this.rx.subarray(end + 1)
			this.handlePacket(packet)
		}
		// Guard against garbage without terminator.
		if (this.rx.length > 64) this.rx = Buffer.alloc(0)
	}

	handlePacket(p) {
		if (p.length < 3 || (p[0] & 0x80) === 0 || p[0] < 0x90) {
			this.host.log('debug', 'RX (ignored): ' + p.toString('hex'))
			return
		}
		const kind = p[1] & 0xf0
		const socket = p[1] & 0x0f
		if (kind === 0x40) return // ACK
		if (kind === 0x50) {
			if (p.length === 3) return // command completion
			this.resolvePending(p.subarray(2, p.length - 1))
			return
		}
		if (kind === 0x60) {
			const code = p[2]
			const text = ERROR_CODES[code] ?? `Error 0x${code.toString(16)}`
			// Inquiries use no socket, so an error on socket 0 while an inquiry
			// is outstanding belongs to that inquiry.
			if (this.pending && socket === 0) {
				this.failPending(text)
			} else {
				this.host.onError(text)
			}
			return
		}
		this.host.log('debug', 'RX (unknown): ' + p.toString('hex'))
	}

	resolvePending(payload) {
		if (!this.pending) {
			this.host.log('debug', 'Unexpected inquiry reply: ' + Buffer.from(payload).toString('hex'))
			return
		}
		const { inq } = this.pending
		this.clearPending()
		this.failures[inq.id] = 0
		const before = { ...this.state }
		try {
			inq.apply([...payload], this.state)
		} catch (e) {
			this.host.log('warn', `Could not decode ${inq.label}: ${e.message}`)
		}
		if (inq.tier === 'fast') this.updateMotion(before)
		const changed = Object.keys(this.state).filter((k) => this.state[k] !== before[k])
		if (changed.length) this.host.onState(changed)
		this.next()
	}

	failPending(reason) {
		if (!this.pending) return
		const { inq } = this.pending
		this.clearPending()
		const n = (this.failures[inq.id] = (this.failures[inq.id] || 0) + 1)
		if (n >= MAX_FAILURES && !this.unsupported.has(inq.id)) {
			this.unsupported.add(inq.id)
			this.host.log('info', `Camera does not answer "${inq.label}" inquiry (${reason}); no longer polling it`)
			this.state.unsupported_inquiries = [...this.unsupported].join(', ')
			this.host.onState(['unsupported_inquiries'])
		}
		this.next()
	}

	clearPending() {
		if (this.pending?.timer) clearTimeout(this.pending.timer)
		this.pending = null
	}

	/** Pan, tilt or zoom changed since the previous poll -> moving. */
	updateMotion(before) {
		const keys = ['pan_pos', 'tilt_pos', 'zoom_pos']
		const moved = keys.some((k) => before[k] !== undefined && before[k] !== this.state[k])
		const now = Date.now()
		if (moved) this.lastMotion = now
		// Hold "moving" for a short while so one equal sample mid-move does not flicker.
		this.state.ptz_moving = this.lastMotion !== null && now - this.lastMotion < 700
	}

	// ---------- send side ----------

	enqueue(tier) {
		const fw = typeof this.host.firmware === 'string' ? this.host.firmware : 'v8197'
		const batch = []
		for (const inq of INQUIRIES) {
			if (inq.tier !== tier || this.unsupported.has(inq.id)) continue
			if (inq.fw && inq.fw !== fw) continue
			if (this.queue.includes(inq) || this.pending?.inq === inq) continue
			batch.push(inq)
		}
		if (tier === 'fast') {
			// Positions jump ahead of a long settings sweep, but only after at least
			// SLOW_PER_ROUND settings have been asked since the previous position
			// round, so fast polling can never starve the settings.
			const slowWaiting = this.queue.filter((q) => q.tier === 'slow').length
			const pos = Math.min(Math.max(0, SLOW_PER_ROUND - this.slowSinceFast), slowWaiting)
			this.queue.splice(pos, 0, ...batch)
			this.slowSinceFast = 0
		} else {
			this.queue.push(...batch)
		}
		if (!this.pending) this.next()
	}

	next() {
		if (this.pending) return
		const inq = this.queue.shift()
		if (!inq) return
		if (inq.tier === 'slow') this.slowSinceFast++
		const header = 0x80 | (this.host.address & 0x07)
		const buf = Buffer.from([header, ...inq.bytes, 0xff])
		const pending = { inq, timer: null }
		pending.timer = setTimeout(() => {
			if (this.pending === pending) this.failPending('timeout')
		}, INQUIRY_TIMEOUT_MS)
		this.pending = pending
		if (!this.host.write(buf)) {
			this.clearPending()
			this.queue = []
		}
	}

	/** Re-read everything soon (e.g. right after a command changed a setting). */
	refreshSoon() {
		if (this.refreshTimer) return
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null
			this.enqueue('fast')
			this.enqueue('slow')
		}, 300)
	}

	start(fastIntervalMs) {
		this.stop()
		this.unsupported.clear()
		this.failures = {}
		this.state.unsupported_inquiries = ''
		this.enqueue('fast')
		this.enqueue('slow')
		if (fastIntervalMs > 0) this.fastTimer = setInterval(() => this.enqueue('fast'), fastIntervalMs)
		this.slowTimer = setInterval(() => this.enqueue('slow'), SLOW_INTERVAL_MS)
	}

	stop() {
		if (this.fastTimer) clearInterval(this.fastTimer)
		if (this.slowTimer) clearInterval(this.slowTimer)
		if (this.refreshTimer) clearTimeout(this.refreshTimer)
		this.fastTimer = this.slowTimer = this.refreshTimer = null
		this.clearPending()
		this.queue = []
		this.rx = Buffer.alloc(0)
	}
}

module.exports = {
	InquiryEngine,
	INQUIRIES,
	STATE_VARIABLES,
	AE_MODES,
	WB_MODES,
	nibblesToInt,
	nibblesToSigned,
}
