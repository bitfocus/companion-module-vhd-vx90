const { combineRgb } = require('@companion-module/base')
const { AE_MODES, WB_MODES } = require('./inquiry')

const GREEN = { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) }
const RED = { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) }
const AMBER = { bgcolor: combineRgb(230, 150, 0), color: combineRgb(0, 0, 0) }

const choicesFrom = (map) => Object.values(map).map((label) => ({ id: label, label }))

function getFeedbackDefinitions(instance) {
	const s = () => instance.state

	/** Boolean feedback that compares one state key against a dropdown choice. */
	const equals = (name, key, choices, def, style = GREEN) => ({
		type: 'boolean',
		name,
		defaultStyle: style,
		options: [{ id: 'value', type: 'dropdown', label: 'Value', default: def, choices }],
		callback: (fb) => s()[key] === fb.options.value,
	})

	const onOff = [
		{ id: 'On', label: 'On' },
		{ id: 'Off', label: 'Off' },
	]

	return {
		connected: {
			type: 'boolean',
			name: 'Camera connected',
			defaultStyle: GREEN,
			options: [],
			callback: () => instance.connected === true,
		},
		ptz_moving: {
			type: 'boolean',
			name: 'Pan/tilt/zoom is moving',
			description: 'True while the polled position is changing (needs position polling on).',
			defaultStyle: AMBER,
			options: [],
			callback: () => s().ptz_moving === true,
		},
		power: equals('Power state', 'power', [
			{ id: 'On', label: 'On' },
			{ id: 'Standby', label: 'Standby' },
		], 'On'),
		focus_mode: equals('Focus mode', 'focus_mode', [
			{ id: 'Auto', label: 'Auto' },
			{ id: 'Manual', label: 'Manual' },
		], 'Auto'),
		ae_mode: equals('Exposure mode', 'ae_mode', choicesFrom(AE_MODES), 'Auto'),
		wb_mode: equals('White balance mode', 'wb_mode', choicesFrom(WB_MODES), 'Auto'),
		backlight: equals('Backlight compensation', 'backlight', onOff, 'On', AMBER),
		expcomp_mode: equals('Exposure compensation on/off', 'expcomp_mode', onOff, 'On', AMBER),
		zoom_range: {
			type: 'boolean',
			name: 'Zoom position within range (%)',
			defaultStyle: GREEN,
			options: [
				{ id: 'min', type: 'number', label: 'From %', min: 0, max: 100, default: 0 },
				{ id: 'max', type: 'number', label: 'To %', min: 0, max: 100, default: 10 },
			],
			callback: (fb) => {
				const z = s().zoom_pct
				return typeof z === 'number' && z >= fb.options.min && z <= fb.options.max
			},
		},
		pt_near: {
			type: 'boolean',
			name: 'Pan/tilt near a position',
			description: 'Raw position units as shown in the pan_pos / tilt_pos variables.',
			defaultStyle: GREEN,
			options: [
				{ id: 'pan', type: 'number', label: 'Pan', min: -32768, max: 32767, default: 0 },
				{ id: 'tilt', type: 'number', label: 'Tilt', min: -32768, max: 32767, default: 0 },
				{ id: 'tol', type: 'number', label: 'Tolerance', min: 0, max: 5000, default: 20 },
			],
			callback: (fb) => {
				const { pan_pos, tilt_pos } = s()
				if (typeof pan_pos !== 'number' || typeof tilt_pos !== 'number') return false
				return Math.abs(pan_pos - fb.options.pan) <= fb.options.tol && Math.abs(tilt_pos - fb.options.tilt) <= fb.options.tol
			},
		},
		camera_error: {
			type: 'boolean',
			name: 'Camera did not answer some inquiries',
			description: 'Useful while testing: lights up when an inquiry is not supported by this firmware.',
			defaultStyle: RED,
			options: [],
			callback: () => !!s().unsupported_inquiries,
		},
	}
}

module.exports = { getFeedbackDefinitions }
