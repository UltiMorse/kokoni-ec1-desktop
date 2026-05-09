# kokoni-ec1-desktop

Desktop GUI for controlling a KOKONI EC1 printer through the `kokoni-ec1-server` Android-side agent.

This is a Wails-based Linux desktop application. It does not talk to the printer MCU directly. Instead, it talks to the HTTP agent exposed on the PC through `adb forward`.

```text
Desktop GUI
  |
  | http://127.0.0.1:18080
  v
adb forward tcp:18080 tcp:8080
  |
  v
KOKONI EC1 Android-side kokoni_web agent
  |
  | /dev/ttyS1 115200bps
  v
Printer MCU
```

The main goal is practical operation:

```text
Connect printer over USB
Launch desktop app
Upload .gcode
Start print
Disconnect PC if needed
Printer continues printing on its own
Reconnect later to monitor/control again
```

## Related project

This GUI expects the server-side project to be installed and working:

```text
kokoni-ec1-server
```

The server project provides:

```text
kokoni_web
  Android-side HTTP agent

kokoni_launcher
  Detached launcher that keeps kokoni_web alive independently of adb shell

scripts/run.sh
  Starts/reconnects the Android-side agent and sets adb forward
```

The desktop app assumes the local API endpoint is:

```text
http://127.0.0.1:18080
```

## Features

Current GUI features:

```text
Job
  Upload .gcode
  Start
  Pause
  Resume
  Cancel
  Progress display
  Action result display

Printer
  Connect Printer
  Light ON
  Light OFF

Filament
  Heat 200℃
  Cooldown
  Load 340 mm
  Unload 340 mm
  Fine +20 mm
  Fine -20 mm

Leveling / Access
  Home
  Center
  Left Front
  Right Front
  Left Back
  Right Back

Logs
  Recent agent log tail
  Auto-refresh

Advanced
  Raw Job JSON
  Raw Status JSON
  Agent URL
```

## Design notes

The GUI intentionally keeps the normal screen simple.

Raw diagnostic data is still available under Advanced, but routine operation focuses on:

```text
Upload
Start / Pause / Resume / Cancel
Progress
Light
Filament
Leveling / access positions
Logs
```

The GUI does not show filament stock or remaining filament because the EC1 has no remaining-filament measurement.

The GUI also avoids prominently showing persistent `M106` / `M140` warnings because this firmware can return `ok` even for unsupported commands, and Cura or the original workflow may still include those commands.

## Safety behavior

Manual command sending is not exposed as a normal workflow during active jobs.

During printing, light commands are sent through the server's `/api/light` endpoint. The server queues them and inserts them at safe line boundaries.

Filament controls are intended for heated-nozzle operation:

```text
Heat 200℃
  -> enables load/unload controls in the GUI

Cooldown
  -> disables load/unload controls
```

The current filament presets are based on measured EC1 behavior:

```text
Load:   340 mm
Unload: 340 mm
Fine:   +/-20 mm
```

Leveling/access buttons move the nozzle high enough to make build plate access easier. The current coordinate convention is:

```text
X10 Y10 = Left Front
X90 Y10 = Right Front
X10 Y90 = Left Back
X90 Y90 = Right Back
```

The access move raises Z before moving XY.

## Requirements

Development environment used:

```text
Ubuntu 24.04
Go 1.22.2
npm 9.2.0
Wails v2.12.0
```

Ubuntu 24.04 requires WebKitGTK 4.1 packages and Wails must be built with the `webkit2_41` tag.

Install dependencies:

```bash
sudo apt update
sudo apt install -y libgtk-3-dev libwebkit2gtk-4.1-dev
```

## Development

Run in live development mode:

```bash
wails dev -tags webkit2_41
```

The frontend is under:

```text
frontend/
```

The main Wails entry point is:

```text
main.go
```

## Build

Build the desktop application:

```bash
wails build -tags webkit2_41
```

Output binary:

```text
build/bin/kokoni-ec1-desktop
```

Run directly:

```bash
./build/bin/kokoni-ec1-desktop
```

## Starting the full system

The desktop app alone is not enough. The Android-side agent must be running and `adb forward` must be active.

Typical manual startup:

```bash
cd ~/kokoni-ec1-server
./scripts/run.sh

cd ~/kokoni-ec1-desktop
./build/bin/kokoni-ec1-desktop
```

`scripts/run.sh` is safe to run again after reconnecting USB. If the Android-side agent is already running, the launcher keeps it from starting twice and the script refreshes the adb forward.

## Desktop launcher

A convenient desktop entry can call a wrapper script.

Example wrapper:

```bash
mkdir -p ~/bin

cat > ~/bin/kokoni-ec1-start.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/kokoni-ec1-server"
./scripts/run.sh

cd "$HOME/kokoni-ec1-desktop"
exec ./build/bin/kokoni-ec1-desktop
EOF

chmod +x ~/bin/kokoni-ec1-start.sh
```

Example desktop entry:

```ini
[Desktop Entry]
Type=Application
Name=KOKONI EC1 Controller
Comment=Start KOKONI EC1 agent and desktop controller
Exec=/home/ny/bin/kokoni-ec1-start.sh
Icon=/home/ny/.local/share/icons/kokoni.png
Terminal=true
Categories=Utility;
StartupNotify=true
StartupWMClass=kokoni-ec1
```

Suggested location:

```text
~/.local/share/applications/kokoni-ec1.desktop
```

Refresh desktop database:

```bash
update-desktop-database ~/.local/share/applications 2>/dev/null || true
```

`Terminal=true` is useful while the setup is still being actively developed because adb and forwarding errors are visible. Once stable, it can be changed to `Terminal=false`.

## Linux app identity

The Wails app can set a Linux program name so the window groups under the correct launcher icon.

In `main.go`, the Linux options should look like:

```go
Linux: &linux.Options{
    ProgramName: "kokoni-ec1",
},
```

The desktop entry should match:

```ini
StartupWMClass=kokoni-ec1
```

On this Wails version, `WindowClassName` is not available in `linux.Options`, so `ProgramName` is used.

## API assumptions

The GUI expects these server endpoints:

```text
GET  /api/status
POST /api/init
GET  /api/job
POST /api/job/upload
POST /api/job/start
POST /api/job/pause
POST /api/job/resume
POST /api/job/cancel
POST /api/light?value=0..255
GET  /api/logs?lines=N
```

The upload form field name is:

```text
gcode
```

Only `.gcode` files should be selected and uploaded.

## Normal workflow

```text
1. Connect printer over USB
2. Launch KOKONI EC1 Controller
3. Click Connect Printer if needed
4. Select .gcode
5. Upload
6. Start
7. Monitor progress/logs
8. Optionally disconnect PC after print has started
9. Reconnect and launch again to monitor or control
```

## Recovery / reconnect workflow

If the GUI cannot connect:

```bash
cd ~/kokoni-ec1-server
./scripts/run.sh
```

Then reopen or refresh the desktop app.

Check server status directly:

```bash
curl http://127.0.0.1:18080/api/status
```

Check current job:

```bash
curl http://127.0.0.1:18080/api/job
```

Check recent logs:

```bash
curl "http://127.0.0.1:18080/api/logs?lines=120"
```

## Status

Current milestone:

```text
Desktop GUI: working
Server connection through adb forward: working
Upload/start/pause/resume/cancel: working
Pause Z-hop support through server: working
Filament controls: working
Leveling/access controls: working
Desktop launcher: working
Window/icon grouping: working
```

## Note

This project replaced the default Wails template with a practical controller for a modified KOKONI EC1 workflow.

The goal is not to make a generic 3D printer host. The goal is to make this specific EC1 behave like a usable PC-assisted standalone printer.
