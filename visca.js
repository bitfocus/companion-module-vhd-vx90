// visca.js — low-level VISCA byte-building helpers for the VHD VX-90 module.
// All the actual command byte layouts come from VHD's official
// "VX90_VISCA_EN_20250729" command table.

/**
 * Split an unsigned integer into `count` hex-digit bytes (each 0x00-0x0F,
 * optionally OR'd with a fixed high nibble). This is the "0p 0q 0r 0s"-style
 * encoding used throughout the VX-90 table for multi-digit values (zoom
 * position, focus position, pan/tilt position, etc).
 */
function nibbleBytes(value, count, highNibble = 0) {
	const v = Math.max(0, Math.round(value)) >>> 0
	const hex = v.toString(16).padStart(count, '0').slice(-count)
	return [...hex].map((ch) => (highNibble << 4) | parseInt(ch, 16))
}

/**
 * Same as nibbleBytes but for a signed 16-bit value encoded as its two's
 * complement hex representation split into 4 nibble-bytes (used for
 * pan/tilt absolute position, which can be negative).
 */
function signedNibbleBytes16(value) {
	let v = Math.round(value)
	if (v < 0) v = 0x10000 + v
	v = v & 0xffff
	return nibbleBytes(v, 4)
}

/** Clamp a value into [min,max] and round it. */
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Builds the full VISCA byte sequence for a command:
 *   [0x80 | address, ...bytes, 0xFF]
 * `bytes` may contain numbers (0-255) or nested arrays (flattened).
 */
function buildCommand(address, bytes) {
	const flat = bytes.flat(Infinity)
	const header = 0x80 | (clamp(address, 0, 7) & 0x0f)
	return Buffer.from([header, ...flat, 0xff])
}

module.exports = {
	nibbleBytes,
	signedNibbleBytes16,
	clamp,
	buildCommand,
}
