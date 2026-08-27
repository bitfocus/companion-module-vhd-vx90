const { nibbleBytes, signedNibbleBytes16, buildCommand } = require('./visca')

/**
 * Full action set for the VHD VX-90, built from VHD's official
 * "VX90_VISCA_EN_20250729" command table plus the vendor-extended
 * (category 0x0A / 0x0B) commands confirmed against Sony's own VISCA
 * reference (see the accompanying README for the byte-by-byte comparison).
 */
function getActionDefinitions(instance) {
	const send = (bytes) => instance.sendBuffer(buildCommand(instance.viscaAddress, bytes))

	/** Simple fixed-byte action (no user input). */
	const simple = (name, bytes) => ({
		name,
		options: [],
		callback: () => send(bytes),
	})

	/** Action with a dropdown that maps a choice's `id` straight onto one nibble/byte slot. */
	const choiceAction = (name, prefixBytes, choices, defaultId, suffixBytes = []) => ({
		name,
		options: [{ id: 'value', type: 'dropdown', label: name, default: defaultId, choices }],
		callback: (event) => {
			send([...prefixBytes, parseInt(event.options.value, 16), ...suffixBytes])
		},
	})

	/** Action with a numeric input encoded as `nibbleCount` nibble-bytes (0x0N each). */
	const numberAction = (name, prefixBytes, min, max, def, nibbleCount) => ({
		name,
		options: [{ id: 'value', type: 'number', label: name, min, max, default: def, range: false }],
		callback: (event) => {
			send([...prefixBytes, ...nibbleBytes(Number(event.options.value), nibbleCount)])
		},
	})

	/** Action with a numeric input encoded as one plain byte (0x00-0xFF). */
	const byteAction = (name, prefixBytes, min, max, def) => ({
		name,
		options: [{ id: 'value', type: 'number', label: name, min, max, default: def, range: false }],
		callback: (event) => {
			send([...prefixBytes, Number(event.options.value) & 0xff])
		},
	})

	const onOff = (name, prefixBytes, onByte = 0x02, offByte = 0x03) => ({
		name,
		options: [
			{
				id: 'value',
				type: 'dropdown',
				label: name,
				default: 'on',
				choices: [
					{ id: 'on', label: 'On' },
					{ id: 'off', label: 'Off' },
				],
			},
		],
		callback: (event) => send([...prefixBytes, event.options.value === 'on' ? onByte : offByte]),
	})

	const speedChoices = (max, label = 'Speed') =>
		Array.from({ length: max + 1 }, (_, i) => ({ id: i.toString(16), label: `${label} ${i}` }))

	const actions = {}

	// ---------- EXPOSURE ----------
	actions.exposure_mode = choiceAction('Exposure: Mode', [0x01, 0x04, 0x39], [
		{ id: '0', label: 'Auto' },
		{ id: '3', label: 'Manual' },
		{ id: 'a', label: 'Shutter priority (SAE)' },
		{ id: 'b', label: 'Iris priority (AAE)' },
		{ id: 'd', label: 'Bright' },
	], '0')
	actions.exposure_comp_mode = onOff('Exposure: Compensation On/Off', [0x01, 0x04, 0x3e])
	actions.exposure_comp_direct = {
		// Table: "0(-7) to 7(0) to E(7)" -> transmitted nibble = value + 7
		name: 'Exposure: Compensation (-7..7)',
		options: [{ id: 'value', type: 'number', label: 'Compensation', min: -7, max: 7, default: 0 }],
		callback: (event) => send([0x01, 0x04, 0x4e, 0x00, 0x00, 0x00, ...nibbleBytes(Number(event.options.value) + 7, 1)]),
	}
	actions.exposure_comp_reset = simple('Exposure: Compensation Reset', [0x01, 0x04, 0x0e, 0x00])
	actions.exposure_comp_up = simple('Exposure: Compensation Up', [0x01, 0x04, 0x0e, 0x02])
	actions.exposure_comp_down = simple('Exposure: Compensation Down', [0x01, 0x04, 0x0e, 0x03])
	actions.gain_limit_direct = numberAction('Gain Limit (0-10)', [0x01, 0x04, 0x2c], 0, 10, 10, 1)
	actions.gain_limit_reset = simple('Gain Limit Reset [VHD-ext]', [0x0a, 0x11, 0x24, 0x00])
	actions.gain_limit_up = simple('Gain Limit Up [VHD-ext]', [0x0a, 0x11, 0x24, 0x02])
	actions.gain_limit_down = simple('Gain Limit Down [VHD-ext]', [0x0a, 0x11, 0x24, 0x03])
	actions.metering_mode = choiceAction('Metering Mode', [0x01, 0x04, 0x3a], [
		{ id: '0', label: 'Average' },
		{ id: '1', label: 'Center' },
		{ id: '2', label: 'Smart' },
		{ id: '3', label: 'Top' },
	], '0')
	actions.backlight = onOff('Backlight Compensation', [0x01, 0x04, 0x33])
	actions.drc_direct = numberAction('DRC (0-8)', [0x01, 0x04, 0x25, 0x00, 0x00, 0x00], 0, 8, 0, 1)
	actions.drc_reset = simple('DRC Reset', [0x01, 0x04, 0x25, 0x00])
	actions.drc_up = simple('DRC Up', [0x01, 0x04, 0x25, 0x02])
	actions.drc_down = simple('DRC Down', [0x01, 0x04, 0x25, 0x03])
	actions.anti_flicker = choiceAction('Anti-Flicker', [0x01, 0x04, 0x23], [
		{ id: '0', label: 'Off' },
		{ id: '1', label: '50Hz' },
		{ id: '2', label: '60Hz' },
	], '1')
	actions.shutter_direct = numberAction('Shutter Position (0-17, table\'s 0x00-0x11)', [0x01, 0x04, 0x4a, 0x00, 0x00], 0, 0x11, 0, 2)
	actions.shutter_reset = simple('Shutter Reset', [0x01, 0x04, 0x0a, 0x00])
	actions.shutter_up = simple('Shutter Up', [0x01, 0x04, 0x0a, 0x02])
	actions.shutter_down = simple('Shutter Down', [0x01, 0x04, 0x0a, 0x03])
	actions.iris_direct = choiceAction('Iris: Set F-stop', [0x01, 0x04, 0x4b, 0x00, 0x00, 0x00], [
		{ id: '0', label: 'Close' },
		{ id: '1', label: 'F11.0' },
		{ id: '2', label: 'F9.6' },
		{ id: '3', label: 'F8.0' },
		{ id: '4', label: 'F7.3' },
		{ id: '5', label: 'F6.8' },
		{ id: '6', label: 'F6.2' },
		{ id: '7', label: 'F5.6' },
		{ id: '8', label: 'F5.2' },
		{ id: '9', label: 'F4.8' },
		{ id: 'a', label: 'F4.4' },
		{ id: 'b', label: 'F4.0' },
		{ id: 'c', label: 'F3.7' },
		{ id: 'd', label: 'F3.4' },
		{ id: 'e', label: 'F3.1' },
		{ id: 'f', label: 'F2.8' },
	], '7')
	actions.iris_reset = simple('Iris Reset', [0x01, 0x04, 0x0b, 0x00])
	actions.iris_up = simple('Iris Up (open)', [0x01, 0x04, 0x0b, 0x02])
	actions.iris_down = simple('Iris Down (close)', [0x01, 0x04, 0x0b, 0x03])
	actions.gain_direct = numberAction('Gain (0-10)', [0x01, 0x04, 0x0c, 0x00, 0x00, 0x00], 0, 10, 0, 1)
	actions.gain_reset = simple('Gain Reset', [0x01, 0x04, 0x0c, 0x00])
	actions.gain_up = simple('Gain Up', [0x01, 0x04, 0x0c, 0x02])
	actions.gain_down = simple('Gain Down', [0x01, 0x04, 0x0c, 0x03])
	actions.bright_direct = numberAction('Bright (0-14)', [0x01, 0x04, 0x0d, 0x00, 0x00, 0x00], 0, 14, 0, 1)
	actions.bright_reset = simple('Bright Reset', [0x01, 0x04, 0x0d, 0x00])
	actions.bright_up = simple('Bright Up', [0x01, 0x04, 0x0d, 0x02])
	actions.bright_down = simple('Bright Down', [0x01, 0x04, 0x0d, 0x03])
	actions.nd_mode = choiceAction('ND Filter Mode [VHD-ext, differs from Sony]', [0x0a, 0x01, 0x07], [
		{ id: '0', label: 'Off' },
		{ id: '1', label: '1/4' },
		{ id: '2', label: '1/16' },
		{ id: '3', label: '1/64' },
	], '0')
	actions.night_mode = onOff('Night Mode [VHD-ext]', [0x0a, 0x01, 0x08], 0x01, 0x00)

	// ---------- COLOR ----------
	actions.wb_mode = choiceAction('White Balance Mode', [0x01, 0x04, 0x35], [
		{ id: '00', label: 'Auto' },
		{ id: '01', label: 'Indoor' },
		{ id: '02', label: 'Outdoor' },
		{ id: '03', label: 'One Push' },
		{ id: '05', label: 'Manual' },
		{ id: '20', label: 'VAR (color temperature)' },
	], '00')
	// Table: "00(-10) to 0A(0) to 14(10)" -> transmitted byte-pair = value + 10
	const tuningAction = (name, opcode) => ({
		name,
		options: [{ id: 'value', type: 'number', label: name, min: -10, max: 10, default: 0 }],
		callback: (event) =>
			send([0x01, 0x04, opcode, 0x00, 0x00, ...nibbleBytes(Number(event.options.value) + 10, 2)]),
	})
	actions.rg_tuning = tuningAction('RG Tuning (-10..10)', 0x12)
	actions.bg_tuning = tuningAction('BG Tuning (-10..10)', 0x13)
	actions.saturation = numberAction('Saturation (0-14)', [0x01, 0x04, 0x49, 0x00, 0x00, 0x00], 0, 14, 7, 1)
	actions.hue = numberAction('Hue (0-14)', [0x01, 0x04, 0x4f, 0x00, 0x00, 0x00], 0, 14, 7, 1)
	actions.onepush_wb_trigger = simple('One-push White Balance Trigger', [0x01, 0x04, 0x10, 0x05])
	actions.r_gain_direct = numberAction('R Gain (0-255)', [0x01, 0x04, 0x43, 0x00, 0x00], 0, 255, 128, 2)
	actions.r_gain_reset = simple('R Gain Reset', [0x01, 0x04, 0x03, 0x00])
	actions.r_gain_up = simple('R Gain Up', [0x01, 0x04, 0x03, 0x02])
	actions.r_gain_down = simple('R Gain Down', [0x01, 0x04, 0x03, 0x03])
	actions.b_gain_direct = numberAction('B Gain (0-255)', [0x01, 0x04, 0x44, 0x00, 0x00], 0, 255, 128, 2)
	actions.b_gain_reset = simple('B Gain Reset', [0x01, 0x04, 0x04, 0x00])
	actions.b_gain_up = simple('B Gain Up', [0x01, 0x04, 0x04, 0x02])
	actions.b_gain_down = simple('B Gain Down', [0x01, 0x04, 0x04, 0x03])
	actions.colortemp_direct = {
		name: 'Color Temperature (2500K-8000K)',
		options: [{ id: 'value', type: 'number', label: 'Kelvin', min: 2500, max: 8000, default: 5000, step: 100 }],
		callback: (event) => {
			const idx = Math.round((Number(event.options.value) - 2500) / 100) // 0x00-0x37
			send([0x01, 0x04, 0x20, ...nibbleBytes(idx, 2)])
		},
	}
	actions.colortemp_reset = simple('Color Temperature Reset', [0x01, 0x04, 0x20, 0x00])
	actions.colortemp_up = simple('Color Temperature Up', [0x01, 0x04, 0x20, 0x02])
	actions.colortemp_down = simple('Color Temperature Down', [0x01, 0x04, 0x20, 0x03])

	// ---------- IMAGE ----------
	actions.luminance = numberAction('Luminance (0-14)', [0x01, 0x04, 0xa1, 0x00, 0x00, 0x00], 0, 14, 7, 1)
	actions.contrast = numberAction('Contrast (0-14)', [0x01, 0x04, 0xa2, 0x00, 0x00, 0x00], 0, 14, 7, 1)
	actions.sharpness_direct = numberAction('Sharpness (0-11)', [0x01, 0x04, 0x42, 0x00, 0x00, 0x00], 0, 11, 5, 1)
	actions.sharpness_reset = simple('Sharpness Reset', [0x01, 0x04, 0x02, 0x00])
	actions.sharpness_up = simple('Sharpness Up', [0x01, 0x04, 0x02, 0x02])
	actions.sharpness_down = simple('Sharpness Down', [0x01, 0x04, 0x02, 0x03])
	actions.bw_mode = onOff('Black & White Mode', [0x01, 0x04, 0x63], 0x04, 0x00)
	actions.flip = choiceAction('Flip', [0x01, 0x04, 0xa4], [
		{ id: '0', label: 'Off' },
		{ id: '1', label: 'Flip-H' },
		{ id: '2', label: 'Flip-V' },
		{ id: '3', label: 'Flip-HV' },
	], '0')
	actions.flip_h = onOff('Horizontal Flip (LR Reverse)', [0x01, 0x04, 0x61])
	actions.flip_v = onOff('Vertical Flip', [0x01, 0x04, 0x66])
	actions.gamma = choiceAction('Gamma', [0x01, 0x04, 0x5b], [
		{ id: '0', label: 'Default' },
		{ id: '1', label: '0.45' },
		{ id: '2', label: '0.5' },
		{ id: '3', label: '0.56' },
		{ id: '4', label: 'EXT' },
		{ id: '5', label: 'PC' },
	], '0')
	actions.image_style = choiceAction('Image Style [VHD-ext, differs from Sony]', [0x0a, 0x01, 0x1c], [
		{ id: '00', label: 'Default' },
		{ id: '01', label: 'Norm' },
		{ id: '04', label: 'Bright' },
		{ id: '05', label: 'Soft' },
		{ id: '09', label: 'PC' },
		{ id: '10', label: 'Blacklight' },
	], '00')

	// ---------- NOISE REDUCTION ----------
	actions.nr3d_level = {
		name: 'NR3D Level (0=Close, 1-9)',
		options: [{ id: 'value', type: 'number', label: 'Level', min: 0, max: 9, default: 0 }],
		callback: (event) => send([0x01, 0x04, 0x54, Number(event.options.value) & 0x0f]),
	}

	// ---------- OSD ----------
	actions.osd_on = simple('OSD Menu On', [0x01, 0x04, 0x3f, 0x02, 0x5f])
	actions.osd_enter = simple('OSD Enter', [0x01, 0x06, 0x06, 0x05])
	actions.osd_back = simple('OSD Back', [0x01, 0x06, 0x06, 0x04])
	actions.osd_toggle = simple('OSD Toggle On/Off', [0x01, 0x06, 0x06, 0x10])
	actions.osd_exit_two = simple('OSD Exit (alt)', [0x01, 0x06, 0x06, 0x06])

	// ---------- PAN/TILT ----------
	const panSpeedOpt = { id: 'panSpeed', type: 'number', label: 'Pan speed (0-24)', min: 0, max: 24, default: 12 }
	const tiltSpeedOpt = { id: 'tiltSpeed', type: 'number', label: 'Tilt speed (0-20)', min: 0, max: 20, default: 10 }

	const ptMove = (name, dirBytes) => ({
		name,
		options: [panSpeedOpt, tiltSpeedOpt],
		callback: (event) =>
			send([
				0x01,
				0x06,
				0x01,
				Number(event.options.panSpeed) & 0xff,
				Number(event.options.tiltSpeed) & 0xff,
				...dirBytes,
			]),
	})
	actions.pt_up = ptMove('Pan/Tilt: Up', [0x03, 0x01])
	actions.pt_down = ptMove('Pan/Tilt: Down', [0x03, 0x02])
	actions.pt_left = ptMove('Pan/Tilt: Left', [0x01, 0x03])
	actions.pt_right = ptMove('Pan/Tilt: Right', [0x02, 0x03])
	actions.pt_upleft = ptMove('Pan/Tilt: Up-Left', [0x01, 0x01])
	actions.pt_upright = ptMove('Pan/Tilt: Up-Right', [0x02, 0x01])
	actions.pt_downleft = ptMove('Pan/Tilt: Down-Left', [0x01, 0x02])
	actions.pt_downright = ptMove('Pan/Tilt: Down-Right', [0x02, 0x02])
	actions.pt_stop = ptMove('Pan/Tilt: Stop', [0x03, 0x03])
	actions.pt_absolute = {
		name: 'Pan/Tilt: Absolute Position',
		options: [
			panSpeedOpt,
			tiltSpeedOpt,
			{ id: 'pan', type: 'number', label: 'Pan position (signed)', min: -32768, max: 32767, default: 0 },
			{ id: 'tilt', type: 'number', label: 'Tilt position (signed)', min: -32768, max: 32767, default: 0 },
		],
		callback: (event) =>
			send([
				0x01,
				0x06,
				0x02,
				Number(event.options.panSpeed) & 0xff,
				Number(event.options.tiltSpeed) & 0xff,
				...signedNibbleBytes16(Number(event.options.pan)),
				...signedNibbleBytes16(Number(event.options.tilt)),
			]),
	}
	actions.pt_home = simple('Pan/Tilt: Home', [0x01, 0x06, 0x04])
	actions.pt_reset = simple('Pan/Tilt: Reset', [0x01, 0x06, 0x05])
	actions.pt_lr_reverse = onOff('Pan/Tilt: LR Reverse', [0x01, 0x04, 0x61])

	// ---------- ZOOM ----------
	actions.zoom_stop = simple('Zoom: Stop', [0x01, 0x04, 0x07, 0x00])
	actions.zoom_tele_std = simple('Zoom: Tele (standard speed)', [0x01, 0x04, 0x07, 0x02])
	actions.zoom_wide_std = simple('Zoom: Wide (standard speed)', [0x01, 0x04, 0x07, 0x03])
	actions.zoom_tele_var = {
		name: 'Zoom: Tele (variable speed 0-7)',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 7, default: 4 }],
		callback: (event) => send([0x01, 0x04, 0x07, 0x20 | (Number(event.options.value) & 0x0f)]),
	}
	actions.zoom_wide_var = {
		name: 'Zoom: Wide (variable speed 0-7)',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 7, default: 4 }],
		callback: (event) => send([0x01, 0x04, 0x07, 0x30 | (Number(event.options.value) & 0x0f)]),
	}
	actions.zoom_to = {
		name: 'Zoom: Direct Position (0-16384)',
		options: [{ id: 'value', type: 'number', label: 'Zoom position', min: 0, max: 0x4000, default: 0 }],
		callback: (event) => send([0x01, 0x04, 0x47, ...nibbleBytes(Number(event.options.value), 4)]),
	}
	actions.zoom_focus_to = {
		name: 'Zoom+Focus: Direct Position',
		options: [
			{ id: 'zoom', type: 'number', label: 'Zoom position', min: 0, max: 0x4000, default: 0 },
			{ id: 'focus', type: 'number', label: 'Focus position', min: 0, max: 0x4000, default: 0 },
		],
		callback: (event) =>
			send([
				0x01,
				0x04,
				0x47,
				...nibbleBytes(Number(event.options.zoom), 4),
				...nibbleBytes(Number(event.options.focus), 4),
			]),
	}
	actions.visca_clear = simple('Stop Current Action (IF_Clear)', [0x01, 0x00, 0x01])
	actions.image_freeze = onOff('Image Freeze', [0x01, 0x04, 0x62])

	// ---------- FOCUS ----------
	actions.focus_stop = simple('Focus: Stop', [0x01, 0x04, 0x08, 0x00])
	actions.focus_far_std = simple('Focus: Far (standard speed)', [0x01, 0x04, 0x08, 0x02])
	actions.focus_near_std = simple('Focus: Near (standard speed)', [0x01, 0x04, 0x08, 0x03])
	actions.focus_far_var = {
		name: 'Focus: Far (variable speed 0-7)',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 7, default: 4 }],
		callback: (event) => send([0x01, 0x04, 0x08, 0x20 | (Number(event.options.value) & 0x0f)]),
	}
	actions.focus_near_var = {
		name: 'Focus: Near (variable speed 0-7)',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 7, default: 4 }],
		callback: (event) => send([0x01, 0x04, 0x08, 0x30 | (Number(event.options.value) & 0x0f)]),
	}
	actions.focus_to = {
		name: 'Focus: Direct Position',
		options: [{ id: 'value', type: 'number', label: 'Focus position', min: 0, max: 0xffff, default: 0 }],
		callback: (event) => send([0x01, 0x04, 0x48, ...nibbleBytes(Number(event.options.value), 4)]),
	}
	actions.focus_mode_auto = simple('Focus: Auto', [0x01, 0x04, 0x38, 0x02])
	actions.focus_mode_manual = simple('Focus: Manual', [0x01, 0x04, 0x38, 0x03])
	actions.focus_onepush = simple('Focus: One-push Trigger', [0x01, 0x04, 0x38, 0x04])
	actions.focus_mode_toggle = simple('Focus: Auto/Manual Toggle', [0x01, 0x04, 0x38, 0x10])
	actions.af_zone = choiceAction('Focus: AF Zone', [0x01, 0x04, 0xaa], [
		{ id: '0', label: 'Top' },
		{ id: '1', label: 'Center' },
		{ id: '2', label: 'Bottom' },
		{ id: '3', label: 'Front' },
	], '1')
	actions.af_sense = choiceAction('Focus: AF Sensitivity', [0x01, 0x04, 0x58], [
		{ id: '1', label: 'High' },
		{ id: '2', label: 'Normal' },
		{ id: '3', label: 'Low' },
	], '2')
	actions.focus_lock = simple('Focus: Lock [VHD-ext]', [0x0a, 0x04, 0x68, 0x02])
	actions.focus_unlock = simple('Focus: Unlock [VHD-ext]', [0x0a, 0x04, 0x68, 0x03])

	// ---------- EIS ----------
	actions.eis = onOff('EIS (Image Stabilizer, restart required) [VHD-ext]', [0x0a, 0x01, 0x0d], 0x01, 0x00)

	// ---------- TALLY ----------
	actions.tally_mode = onOff('Tally: Enable Mode [VHD-ext]', [0x0a, 0x11, 0x47])
	actions.tally_set = {
		name: 'Tally: Set LED mode + colour [VHD-ext]',
		options: [
			{
				id: 'mode',
				type: 'dropdown',
				label: 'LED mode',
				default: '2',
				choices: [
					{ id: '1', label: '1-second blink' },
					{ id: '2', label: 'Steady on' },
					{ id: '3', label: 'Off (return to normal)' },
				],
			},
			{
				id: 'color',
				type: 'dropdown',
				label: 'Colour',
				default: '1',
				choices: [
					{ id: '0', label: 'Green' },
					{ id: '1', label: 'Red' },
				],
			},
		],
		callback: (event) =>
			send([0x0a, 0x02, 0x02, parseInt(event.options.mode, 16), parseInt(event.options.color, 16)]),
	}
	actions.tally_simple = {
		name: 'Tally: Simple colour (shares Sony opcode)',
		options: [
			{
				id: 'value',
				type: 'dropdown',
				label: 'State',
				default: '2',
				choices: [
					{ id: '1', label: 'Green LED on' },
					{ id: '2', label: 'Red LED on' },
					{ id: '3', label: 'Off (return to normal)' },
				],
			},
		],
		callback: (event) => send([0x01, 0x7e, 0x01, 0x0a, 0x00, parseInt(event.options.value, 16)]),
	}
	actions.tally_brightness = choiceAction('Tally: Brightness [VHD-ext]', [0x0a, 0x02, 0x03], [
		{ id: '0', label: 'Low' },
		{ id: '1', label: 'Medium' },
		{ id: '2', label: 'High' },
		{ id: '4', label: 'Off' },
	], '1')

	// ---------- PRESET ----------
	actions.preset_set = byteAction('Preset: Set (0-254)', [0x01, 0x04, 0x3f, 0x01], 0, 254, 0)
	actions.preset_recall = byteAction('Preset: Recall (0-254)', [0x01, 0x04, 0x3f, 0x02], 0, 254, 0)
	actions.preset_clear = byteAction('Preset: Clear (0-254)', [0x01, 0x04, 0x3f, 0x00], 0, 254, 0)
	actions.preset_clear_all = simple('Preset: Clear All [VHD-ext]', [0x0a, 0x11, 0x26, 0x00])
	actions.preset_speed = byteAction('Preset: Recall Speed (0-24)', [0x01, 0x06, 0x01], 0, 24, 12)
	actions.preset_speed_up = simple('Preset: Recall Speed Up [VHD-ext]', [0x0a, 0x11, 0x35, 0x02])
	actions.preset_speed_down = simple('Preset: Recall Speed Down [VHD-ext]', [0x0a, 0x11, 0x35, 0x03])
	actions.preset_ptz_speed = {
		name: 'Preset: PTZ Speed on Recall [VHD-ext]',
		options: [
			{ id: 'zoomSpeed', type: 'number', label: 'Zoom speed (0-7)', min: 0, max: 7, default: 4 },
			{ id: 'panSpeed', type: 'number', label: 'Pan speed', min: 0, max: 24, default: 12 },
			{ id: 'tiltSpeed', type: 'number', label: 'Tilt speed', min: 0, max: 20, default: 10 },
			{ id: 'preset', type: 'number', label: 'Preset number (0-254)', min: 0, max: 254, default: 0 },
		],
		callback: (event) =>
			send([
				0x0a,
				0x04,
				0x3f,
				0x02,
				Number(event.options.zoomSpeed) & 0xff,
				Number(event.options.panSpeed) & 0xff,
				Number(event.options.tiltSpeed) & 0xff,
				Number(event.options.preset) & 0xff,
			]),
	}

	// ---------- AUDIO ----------
	actions.audio_input = choiceAction('Audio Input (restart required) [VHD-ext, unusual category 0x2A]', [0x2a, 0x01, 0x1b], [
		{ id: '2', label: 'Line In' },
		{ id: '3', label: 'Mic' },
		{ id: '4', label: 'XLR' },
	], '2')

	// ---------- TRACKING ----------
	actions.track_enable = onOff('Tracking: Enable [VHD-ext, no Sony equivalent]', [0x0a, 0x11, 0x54])
	actions.track_mode = choiceAction('Tracking: Mode [VHD-ext, no Sony equivalent]', [0x0a, 0x01, 0x04, 0x1c], [
		{ id: '3', label: 'Presenter' },
		{ id: '4', label: 'Zone' },
		{ id: '5', label: 'Frame' },
	], '3')
	actions.track_humanoid_frame = choiceAction('Tracking: Humanoid Frame [VHD-ext]', [0x0a, 0x11, 0x56], [
		{ id: '3', label: 'Off' },
		{ id: '4', label: 'Default' },
	], '3')
	actions.track_target_select = choiceAction('Tracking: Target Selection [VHD-ext]', [0x0a, 0x11, 0xa3], [
		{ id: '2', label: 'Left' },
		{ id: '3', label: 'Right' },
		{ id: '4', label: 'OK' },
	], '4')
	actions.track_figure_size = choiceAction('Tracking: Figure Size [VHD-ext]', [0x0a, 0x0f, 0x01, 0x00], [
		{ id: '0', label: 'Full' },
		{ id: '1', label: 'Half Body' },
		{ id: '2', label: 'Close Up' },
		{ id: '3', label: 'Custom' },
	], '0')
	actions.track_zoom_tele_std = simple('Tracking Zoom: Tele (standard) [VHD-ext]', [0x0a, 0x04, 0x07, 0x02, 0x01])
	actions.track_zoom_wide_std = simple('Tracking Zoom: Wide (standard) [VHD-ext]', [0x0a, 0x04, 0x07, 0x03, 0x01])
	actions.track_zoom_tele_var = {
		name: 'Tracking Zoom: Tele (variable speed 0-6) [VHD-ext]',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 6, default: 3 }],
		callback: (event) => send([0x0a, 0x04, 0x07, 0x20 | (Number(event.options.value) & 0x0f), 0x01]),
	}
	actions.track_zoom_wide_var = {
		name: 'Tracking Zoom: Wide (variable speed 0-6) [VHD-ext]',
		options: [{ id: 'value', type: 'number', label: 'Speed', min: 0, max: 6, default: 3 }],
		callback: (event) => send([0x0a, 0x04, 0x07, 0x30 | (Number(event.options.value) & 0x0f), 0x01]),
	}
	actions.zoom_to_speed_preset = {
		name: 'Variable-speed Zoom Preset [VHD-ext]',
		options: [
			{ id: 'speed', type: 'number', label: 'Zoom speed (0-7)', min: 0, max: 7, default: 4 },
			{ id: 'position', type: 'number', label: 'Zoom position', min: 0, max: 0xffff, default: 0 },
		],
		callback: (event) =>
			send([
				0x0a,
				0x04,
				0x47,
				Number(event.options.speed) & 0xff,
				...nibbleBytes(Number(event.options.position), 4),
			]),
	}

	// ---------- MOTION SYNC ----------
	actions.motion_sync = onOff('Motion Sync [VHD-ext, no Sony equivalent]', [0x0a, 0x11, 0x13], 0x01, 0x00)

	// ---------- SYSTEM ----------
	actions.power = onOff('Power', [0x01, 0x04, 0x00])
	actions.restart = simple('Restart Camera [VHD-ext]', [0x0b, 0x01, 0xaa])
	actions.ir_address = choiceAction('IR Remote Address [VHD-ext]', [0x0a, 0x11, 0xa7], [
		{ id: '1', label: 'Address 1' },
		{ id: '2', label: 'Address 2' },
		{ id: '3', label: 'Address 3' },
		{ id: '4', label: 'Address 4' },
	], '1')
	actions.setting_reset = simple('Restore Menu Defaults', [0x01, 0x04, 0xa0, 0x10])
	actions.net_reset = simple('Factory Reset IP + Password [VHD-ext]', [0x0a, 0x01, 0xaa])

	return actions
}

module.exports = { getActionDefinitions }
