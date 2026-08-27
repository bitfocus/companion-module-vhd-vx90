const { combineRgb } = require('@companion-module/base')

function getPresetDefinitions(instance) {
	const basicStyle = {
		text: '',
		size: '18',
		color: combineRgb(255, 255, 255),
		bgcolor: combineRgb(0, 0, 0),
	}

	const dirButton = (label, actionId, options = {}) => ({
		type: 'button',
		category: 'Pan / Tilt',
		name: label,
		style: { ...basicStyle, text: label },
		steps: [
			{
				down: [{ actionId, options: { panSpeed: 12, tiltSpeed: 10, ...options } }],
				up: [{ actionId: 'pt_stop', options: { panSpeed: 12, tiltSpeed: 10 } }],
			},
		],
		feedbacks: [],
	})

	return {
		pt_up: dirButton('Up', 'pt_up'),
		pt_down: dirButton('Down', 'pt_down'),
		pt_left: dirButton('Left', 'pt_left'),
		pt_right: dirButton('Right', 'pt_right'),
		pt_home: {
			type: 'button',
			category: 'Pan / Tilt',
			name: 'Home',
			style: { ...basicStyle, text: 'Home' },
			steps: [{ down: [{ actionId: 'pt_home', options: {} }], up: [] }],
			feedbacks: [],
		},
		zoom_in: {
			type: 'button',
			category: 'Zoom',
			name: 'Zoom In',
			style: { ...basicStyle, text: 'Zoom\\nTele' },
			steps: [
				{ down: [{ actionId: 'zoom_tele_std', options: {} }], up: [{ actionId: 'zoom_stop', options: {} }] },
			],
			feedbacks: [],
		},
		zoom_out: {
			type: 'button',
			category: 'Zoom',
			name: 'Zoom Out',
			style: { ...basicStyle, text: 'Zoom\\nWide' },
			steps: [
				{ down: [{ actionId: 'zoom_wide_std', options: {} }], up: [{ actionId: 'zoom_stop', options: {} }] },
			],
			feedbacks: [],
		},
		connection_status: {
			type: 'button',
			category: 'Status',
			name: 'Connection status',
			style: { ...basicStyle, text: 'VX90\\n$(vhd-vx90:connection_status)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [{ feedbackId: 'connected', options: {} }],
		},
	}
}

module.exports = { getPresetDefinitions }
