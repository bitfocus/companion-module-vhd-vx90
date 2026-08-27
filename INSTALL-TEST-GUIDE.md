# VHD VX-90 Companion module — install & test guide (Companion 5.0.4)

Compatibility confirmed: this module uses the Companion module API
version 1.14.1, which is explicitly supported by Companion 5.0.4/5.1.
No newer "v2 API" migration is required.

## 1. Prerequisites

- Companion 5.0.4 (or any 5.x) already installed and running.
- That's it — no Node.js, no `npm install`, nothing else to prepare.
  The `.tgz` package you received is fully self-contained.

## 2. Install the module

1. Open the Companion web admin UI (usually `http://127.0.0.1:8000`).
2. Go to **Modules** (in the left-hand menu).
3. Click **Import module package** (top right of the Modules page).
4. Select the file `vhd-vx90-1.0.0.tgz` that came with this guide.
5. Companion installs it immediately — no restart needed.

That's the entire installation. This replaces the older "developer
folder" method (unzip + `npm install` + enable Developer Modules in
the Launcher) — the `.tgz` import is simpler and is the standard way
Companion module authors distribute a finished module to end users.

*(If you ever want to run the module from source instead — e.g. to
tweak something yourself — the developer-folder method still works;
see section 7 below.)*

## 3. Add the camera as a connection

1. Go to **Connections** → **Add connection** → search for
   "VHD VX-90" (or "vx90").
2. Fill in:
   - **Camera IP address**: the VX-90's LAN IP
   - **VISCA TCP port**: 5678 (default, should already be filled in)
   - **VISCA camera address**: 1 (default)
3. Save. The connection status should turn green ("Connected") within a
   few seconds if the camera is reachable on that IP/port.

## 4. First test

A few safe, easy actions to try first:

- **Pan/Tilt: Up / Down / Left / Right** — camera should move while the
  button is held, stop on release.
- **Zoom: Tele (standard speed)** / **Zoom: Wide (standard speed)**.
- **Preset: Recall (0-254)** — set to a preset number you know is saved
  on the camera.

If those work, the connection and basic protocol are solid. Then try a
couple of the `[VHD-ext]` actions (ND Filter Mode, Tally, EIS) one at a
time and confirm on camera/OSD that they actually take effect — these
are the ones that haven't been individually verified against a live
unit yet.

## 5. Troubleshooting

- **Module doesn't appear after import**: check Companion's log (web
  admin UI → Log tab) for an error right after the import — a
  malformed `.tgz` or manifest problem would show up there.
- **Connection stays red / "Connection failure"**: double-check the IP
  and that port 5678 is actually the VX-90's configured PTZ port (it's
  shown in the camera's own network settings menu). VISCA-over-TCP on
  this camera is typically single-client, so make sure nothing else
  (another controller app) is already connected.
- **Nothing happens but connection is green**: check the Companion log
  for `TX:` lines showing the hex bytes being sent — that confirms the
  module is sending something. If the bytes go out but nothing happens
  on camera, that specific command's byte layout may need correcting —
  send me the exact action and what you expected vs. what happened.

## 6. Updating the module later

If I send you an updated `.tgz`, just repeat step 2 (**Import module
package**) with the new file — Companion replaces the old version.
Existing connections and button assignments are kept.

## 7. Alternative: running from source (optional, only if needed)

Not needed for normal use — only relevant if you ever want to edit the
module's code yourself:

1. Unzip the source folder somewhere, e.g.
   `~/Documents/companion-dev-modules/vhd-vx90`.
2. Open a terminal inside that folder and run `npm install`.
3. In the Companion **Launcher** (not the web UI): cog icon →
   **Advanced Settings** → **Developer** section → **Select** the
   *parent* folder (the one containing `vhd-vx90`) → enable
   **Enable Developer Modules**.
4. The module then shows up in **Add connection** with a "dev" badge,
   loaded live from that folder. Companion reloads it automatically
   when you edit a file.
