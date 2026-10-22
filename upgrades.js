module.exports = {
	UpgradeScripts: [
		// v1.2.1: "Pan/Tilt: LR Reverse" (pt_lr_reverse) sent exactly the same bytes as
		// "Horizontal Flip (LR Reverse)" (flip_h), so the duplicate was removed.
		function mergeLrReverseIntoFlipH(_context, props) {
			const updatedActions = []
			for (const action of props.actions) {
				if (action.actionId === 'pt_lr_reverse') {
					action.actionId = 'flip_h'
					updatedActions.push(action)
				}
			}
			return { updatedConfig: null, updatedActions, updatedFeedbacks: [] }
		},
	],
}
