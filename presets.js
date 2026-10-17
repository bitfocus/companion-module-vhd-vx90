const { combineRgb } = require('@companion-module/base')

function getPresetDefinitions(instance) {
	const basicStyle = {
		text: '',
		size: '18',
		color: combineRgb(255, 255, 255),
		bgcolor: combineRgb(0, 0, 0),
	}

	// Variable references need the connection's label, which the user may rename.
	const label = instance.label
	const statusButton = (name, text, feedbacks = []) => ({
		type: 'button',
		category: 'Status',
		name,
		style: { ...basicStyle, size: '14', text: text.replaceAll('LABEL', label) },
		steps: [{ down: [], up: [] }],
		feedbacks,
	})

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
		connection_status: statusButton('Connection status', 'VX90\\n$(LABEL:connection_status)', [
			{ feedbackId: 'connected', options: {} },
		]),
		status_zoom: statusButton('Zoom position', 'ZOOM\\n$(LABEL:zoom_pct)%', [
			{ feedbackId: 'ptz_moving', options: {} },
		]),
		status_focus: statusButton('Focus mode', 'FOCUS\\n$(LABEL:focus_mode)', [
			{ feedbackId: 'focus_mode', options: { value: 'Auto' }, style: { bgcolor: combineRgb(0, 120, 0) } },
		]),
		status_exposure: statusButton('Exposure', '$(LABEL:ae_mode)\\n$(LABEL:iris)\\nG $(LABEL:gain)'),
		status_wb: statusButton('White balance', 'WB\\n$(LABEL:wb_mode)\\n$(LABEL:colortemp)K'),
		status_moving: statusButton('PTZ moving', 'PTZ\\nMOVING', [{ feedbackId: 'ptz_moving', options: {} }]),
	}
}

module.exports = { getPresetDefinitions }
