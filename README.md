# Rocket League Ball Speed Overlay

A local dashboard and OBS browser-source overlay for showing live Rocket League ball speed from the Rocket League Stats API.

This project runs entirely on your machine. Rocket League emits gameplay data on a local TCP socket, and this app bridges that stream to a browser-friendly websocket.

![Rocket League ball speed overlay demo](ballspeed.gif)

## Features

- Live Rocket League ball speed
- Dashboard view for testing and debugging
- OBS/Streamlabs overlay view with transparent page background
- Auto-connect overlay mode
- KPH, MPH, and raw API display modes
- Optional peak speed display
- No npm dependencies

## Requirements

- Rocket League with the Stats API enabled
- Node.js 18 or newer. Node is the small runtime that runs the local bridge for OBS and your browser.
- OBS, Streamlabs, or any browser if you want to use the overlay

## Rocket League Setup

Before launching Rocket League, edit:

```text
<Rocket League Install Dir>\TAGame\Config\DefaultStatsAPI.ini
```

Set a non-zero packet rate:

```ini
PacketSendRate=30
Port=49123
```

`PacketSendRate` controls how many `UpdateState` packets are sent per second. The official docs say it is capped at `120`; `30` is a good starting point.

Restart Rocket League after changing this file. The game only reads the Stats API config at startup.

## Quick Start

These steps assume Windows and no prior Node.js experience.

### 1. Install Node.js

Download and install the **LTS** version of Node.js:

```text
https://nodejs.org/
```

During install, the default options are fine.

To check that it worked, open **PowerShell** and run:

```powershell
node --version
npm --version
```

If both commands print version numbers, you are good.

### 2. Download This Project

On GitHub, click:

```text
Code -> Download ZIP
```

Unzip the folder somewhere easy to find, for example:

```text
Documents\rocket-league-ball-speed-overlay
```

### 3. Open PowerShell In The Project Folder

In File Explorer, open the unzipped project folder. Then either:

- Right-click inside the folder and choose **Open in Terminal**, or
- Click the address bar, type `powershell`, and press Enter.

You should now have PowerShell open inside the project folder.

### 4. Start The App

Run:

```powershell
npm start
```

Leave that PowerShell window open. It is the local bridge that connects Rocket League to your browser/OBS.

You should see something like:

```text
Ball speed app: http://127.0.0.1:5173
Rocket League Stats API TCP: 127.0.0.1:49123
```

### 5. Open The Dashboard

```text
http://127.0.0.1:5173
```

Join or spectate a match, then press **Connect**.

### 6. Use In OBS

In OBS or Streamlabs, add a **Browser Source** and use:

```text
http://127.0.0.1:5173/overlay.html
```

Recommended Browser Source size:

```text
Width: 800
Height: 360
```

The overlay auto-connects and has a transparent page background.

## Overlay URL Options

Use URL parameters to customize the overlay:

```text
http://127.0.0.1:5173/overlay.html?unit=mph
http://127.0.0.1:5173/overlay.html?peak=1
http://127.0.0.1:5173/overlay.html?theme=minimal
http://127.0.0.1:5173/overlay.html?label=Shot%20Speed
```

Options can be combined:

```text
http://127.0.0.1:5173/overlay.html?unit=mph&peak=1&theme=minimal
```

Supported options:

| Option | Values | Description |
| --- | --- | --- |
| `unit` | `kph`, `mph`, `api` | Display unit. Defaults to `kph`. |
| `peak` | `1`, `true`, `yes` | Shows peak speed under the current speed. |
| `theme` | `panel`, `minimal` | Overlay style. Defaults to `panel`. |
| `label` | Any URL-encoded text | Replaces the `Ball Speed` label. |
| `socket` | Websocket URL | Advanced override for the browser websocket URL. |

## Configuration

The app uses these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5173` | Local HTTP port for the dashboard and overlay. |
| `RL_STATS_PORT` | `49123` | Rocket League Stats API port from `DefaultStatsAPI.ini`. |

PowerShell example:

```powershell
$env:PORT=5174
$env:RL_STATS_PORT=49124
npm start
```

Bash example:

```bash
PORT=5174 RL_STATS_PORT=49124 npm start
```

## Why A Local Bridge?

Rocket League's released Stats API listens on a local TCP socket. Browsers and OBS Browser Sources cannot connect directly to raw TCP sockets, so `server.js` reads the Rocket League TCP stream and forwards normalized JSON to the browser over:

```text
ws://127.0.0.1:5173/rl
```

## Units

The official docs currently describe ball speed as Unreal Units per second, but live packets from the released API match Rocket League's usual shot-speed scale. This app treats the incoming `Ball.Speed` value as KPH.

- `kph`: incoming API value
- `mph`: `kph * 0.621371`
- `api`: exact incoming API value

## Troubleshooting

If the dashboard or overlay does not update:

- Make sure Rocket League was restarted after editing `DefaultStatsAPI.ini`.
- Make sure `PacketSendRate` is greater than `0`.
- Make sure `Port` in `DefaultStatsAPI.ini` matches `RL_STATS_PORT`.
- Make sure you are in, spectating, or replaying a match with ball data.
- Open `http://127.0.0.1:5173` and check whether the dashboard status says `Live`.

To check whether Rocket League is listening on the default port in PowerShell:

```powershell
Test-NetConnection 127.0.0.1 -Port 49123
```

If PowerShell says `npm` is not recognized:

- Node.js is not installed, or PowerShell was already open before Node was installed.
- Install Node.js from `https://nodejs.org/`.
- Close PowerShell completely, open it again, and retry:

```powershell
npm --version
```

If `npm start` says it cannot find `package.json`:

- PowerShell is in the wrong folder.
- Open the project folder first, then right-click and choose **Open in Terminal**.
- The folder should contain `package.json`, `server.js`, and `README.md`.

If the app opens but shows no live data:

- Restart Rocket League after editing `DefaultStatsAPI.ini`.
- Make sure only one Rocket League instance is running with the Stats API enabled.
- Make sure your PowerShell window running `npm start` stays open.

## Development

Run syntax checks:

```bash
npm run check
```

Start the local bridge and server:

```bash
npm start
```

Project files:

- `server.js`: local TCP-to-websocket bridge and static file server
- `index.html`, `app.js`, `styles.css`: dashboard
- `overlay.html`, `overlay.js`, `overlay.css`: OBS overlay

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Psyonix, Epic Games, or Rocket League. Rocket League is a trademark of its respective owners.
