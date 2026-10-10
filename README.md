# companion-module-vhd-vx90

Bitfocus Companion module for the VHD VX-90 PTZ camera, controlled over
VISCA-over-IP (TCP, default port 5678).

Built from VHD's official VISCA command table
(`VX90_VISCAEN20250729_1.xlsx`, 29/07/2025) — covering the
full standard PTZ/exposure/color/image command set plus VHD's own
extended commands not present in Sony's public VISCA spec (ND filter,
tally control, EIS, image style, focus lock, gain limit, tracking,
motion sync, audio input selection).

## Firmware selection (new in 1.1.0)

The module config has a **Camera firmware** dropdown:

- **V8.1.92 and older** — the classic command set only.
- **V8.1.97 and newer** — the classic set *plus* the commands that only
  exist in firmware V8.1.97, shown with a `[V8.1.97+]` prefix:
  - Zoom: tele/wide at a fine speed (below the classic slowest step)
  - Colour temperature: direct in Kelvin (2500–8000 K)
  - Fan: set speed / auto
  - Colour matrix: hue per axis (6-axis)
  - Preset: store image parameters with presets
  - Pan/Tilt: speed step (standard/extended) and ramp curve

The classic set works on both firmwares, so selecting V8.1.97 only *adds*
actions. These V8.1.97 byte layouts were confirmed by comparing the
V8.1.97 and V8.1.92 firmware; a few parameters (colour-matrix axis order,
ramp-curve range) are marked for verification against VHD's updated VISCA
documentation.

## Compatibility

Uses Companion module API version 1.14.1. Confirmed compatible with
Companion 5.0.4/5.1 (and any Companion version that accepts module API
1.0.0–1.14.x) without requiring the newer v2 API.

## Installation

See [INSTALL-TEST-GUIDE.md](./INSTALL-TEST-GUIDE.md) for the full
install and first-test walkthrough. Short version: build/download the
`.tgz` package and use **Modules → Import module package** in the
Companion admin UI.

## Development

```
npm install
npm run build   # via @companion-module/tools, produces the .tgz package
```

Run `npx @companion-module/tools companion-module-check` to validate
the manifest and module structure before submitting a new version.

## License

MIT
