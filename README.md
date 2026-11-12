<div align="center">

# dsh-video-editing

**A video editing entry in the DSH right sidebar: detect FFmpeg, install it with a live download progress bar, and show the installed version.**

[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.1%2B-4d6bfe)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![Better Sidebar](https://img.shields.io/badge/dsh--better--sidebar-compatible-4d6bfe)](https://github.com/omdsh-dev/DSH-better-sidebar)
[![Version](https://img.shields.io/badge/version-0.1.0-informational)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4)](#platform-notes)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

English · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md)

</div>

## What it does

This plugin adds a **Video editing** page to the DSH right sidebar. Opening it checks the machine for FFmpeg; when FFmpeg is missing it offers a one-click install that downloads the static build with a **real byte progress bar**, verifies and extracts it, and finally shows a bare page with the installed **FFmpeg version**.

There is no editing UI yet — this plugin owns the entry point, the toolchain check and the install flow, so the editing surface can be built on top of a ready FFmpeg.

## Features

- **Works with both right sidebars** — the official DSH column (`ctx.sidebarRightTabs`) and [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (`ctx.betterSidebar`). When both are installed, dsh-better-sidebar is the single home, so no duplicate entry appears.
- **Automatic detection** — probes `ffmpeg -version` across the plugin's own install, its data directory, common install locations, and `PATH`.
- **Guided install** — streams the archive, shows received / total / percent, then verifies, extracts and launches the new binary.
- **Finished page** — shows only the FFmpeg version and binary path.

## Compatibility

| Right sidebar environment | Registration |
| --- | --- |
| Official column only | `ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab` slot |
| dsh-better-sidebar only | `ctx.betterSidebar.registerTab` |
| Both installed | dsh-better-sidebar only (it bridges the entry into the official column) |
| Neither | the plugin stays silent and never throws |

## Data and paths

The downloaded binary lives in this plugin's own data directory. The plugin never writes into the profile directory and never edits `cordis.patch.yml`:

```
$DSH_HOME/plugin-data/video-editing/
├── bin/ffmpeg.exe
└── downloads/*.zip   (removed after a successful install)
```

## Host service and routes

Service `ctx.videoEditing`:

| Method | Purpose |
| --- | --- |
| `detect(signal?)` | Probe FFmpeg; returns `{ installed, version, command, sources }` |
| `version(signal?)` | The version string only |
| `start(sourceId?)` | Begin an install and return `{ jobId }` immediately |
| `progress(jobId)` | Live progress of one install |
| `cancel(jobId)` | Stop one install |

The page reads this through the plugin's own unauthenticated routes, so a running download is observable from any transport:

```
GET  /video-editing/runtime/info
GET  /video-editing/runtime/detect
GET  /video-editing/runtime/progress?jobId=…
POST /video-editing/runtime/start
POST /video-editing/runtime/cancel
```

## Platform notes

Only Windows has a configured automatic download source (gyan.dev `release-essentials` static build). On other platforms the page asks you to install FFmpeg manually and then press **Check again**.

## Install

```sh
dsh plugin --profile <profile> add dsh-video-editing
```

Or install this directory as a local package through the plugin manager.

## License

MIT
