# VHD VX-90 PTZ Camera

Controls the VHD VX-90 PTZ camera over **VISCA-over-IP (TCP)**.

## Connection

- **IP address**: the camera's LAN IP.
- **Port**: 5678 by default (this is the VX-90's own "PTZ port" setting,
  found in the camera's network configuration — confirmed from the
  camera's firmware, not guessed).
- **VISCA address**: 1 by default (matches the camera's factory default).

## Where these commands come from

This module is built directly from VHD's official VX-90 VISCA command
reference (`VX90_VISCA_EN_20250729`). Most commands are identical to
Sony's public VISCA specification (which is why the generic Bitfocus
"Sony VISCA" module already works for basic pan/tilt/zoom/focus/iris/gain
and presets on this camera).

A number of actions are marked **[VHD-ext]** in their name — these use
command bytes that are specific to VHD and are *not* part of Sony's
public VISCA spec (mostly under command category `0x0A`/`0x0B`, one
under the unusual `0x2A`). These will not work through a generic Sony
VISCA module; this module implements them directly.

## Known limitations / things to verify on real hardware

- The byte layouts here come from VHD's documentation table and
  cross-checking against the camera's firmware — they have **not all
  been individually tested against a live VX-90** for every single
  action. Basic PT/zoom/focus/iris/gain/presets are known-good (already
  confirmed working through the generic Sony module). The `[VHD-ext]`
  actions (ND filter, tally, tracking, motion sync, EIS, image style,
  audio input, IR address, restart, factory reset) should be spot-checked
  the first time you use them.
- Inquiry/query commands (reading back the camera's current state) are
  **not implemented yet** — VHD's own documentation only lists a partial
  set of query commands, and this first version focuses on control
  actions. A `connected` feedback (green when the TCP connection is up)
  is included, but there's no per-parameter feedback yet.
- The `Restart Camera` and `Factory Reset IP + Password` actions do
  exactly what they say — use with care, ideally behind a confirmation
  step in your button setup.

A PDF version of this file (and of the install/test guide) is included
alongside this module for easier reading outside Companion.

## Support

Internal module built for AP Audiovisuele Producties. For questions
about the underlying VISCA command set, see the VHD documentation or
the technical contact at VHD.
