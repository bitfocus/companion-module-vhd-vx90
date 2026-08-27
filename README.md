# companion-module-vhd-vx90

Bitfocus Companion module for the VHD VX-90 PTZ camera, controlled over
VISCA-over-IP (TCP, default port 5678).

Built from VHD's official VISCA command table
(`VX90_VISCAEN20250729_1.xlsx`, 29/07/2025) — 137 actions covering the
full standard PTZ/exposure/color/image command set plus VHD's own
extended commands not present in Sony's public VISCA spec (ND filter,
tally control, EIS, image style, focus lock, gain limit, tracking,
motion sync, audio input selection).

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
