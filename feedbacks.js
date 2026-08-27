const { combineRgb } = require('@companion-module/base')

function getFeedbackDefinitions(instance) {
	return {
		connected: {
			type: 'boolean',
			name: 'Camera connected',
			defaultStyle: {
				bgcolor: combineRgb(0, 200, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [],
			callback: () => instance.connected === true,
		},
	}
}

module.exports = { getFeedbackDefinitions }
