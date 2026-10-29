![ARC Studio](docs/images/arc-studio-banner.svg)

<!-- ARC_BADGES:START -->
[![ARC Studio version](docs/badges/arc-studio-version.svg)](package.json)
[![Chezcord version](docs/badges/chezcord-version.svg)](packages/chezcord/package.json)
[![Tauri version](docs/badges/tauri-version.svg)](packages/studio-desktop/src-tauri/Cargo.toml)
[![Vite version](docs/badges/vite-version.svg)](packages/studio-client/package.json)
[![Node.js version](docs/badges/node-version.svg)](https://nodejs.org/)
[![License](docs/badges/license.svg)](LICENSE)
[![CI status](https://github.com/relentiousdragon/arc-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/relentiousdragon/arc-studio/actions/workflows/ci.yml)
[![Desktop builds](https://github.com/relentiousdragon/arc-studio/actions/workflows/desktop-builds.yml/badge.svg?event=push)](https://github.com/relentiousdragon/arc-studio/actions/workflows/desktop-builds.yml)
[![Commits](docs/badges/commits.svg)](https://github.com/relentiousdragon/arc-studio/commits)
[![GitHub stars](docs/badges/stars.svg)](https://github.com/relentiousdragon/arc-studio)
[![GitHub forks](docs/badges/forks.svg)](https://github.com/relentiousdragon/arc-studio/network/members)
<!-- ARC_BADGES:END -->

ARC Studio is a Visual Node Based Discord bot Creator, built with Node, Tauri Rust, React, Vite and the chezcord lib for Discord API.
Create your Discord bot then export code to run it anywhere on the node.js runtime!

## What you can do

- Build bot workflows in the graph editor
- Connect a Discord app and test your bot live, or use the offline simulator when you are offline
- Make slash commands, messages, embeds, buttons, menus, and modals
- Collaborate on projects and edit graphs live with your team
- Export project as a standalone bot that can run anywhere with node.js runtime

ARC Studio is in development. Submit an issue for bugs or pull request to contribute.

![A Discord command graph in ARC Studio](docs/screenshots/graph-editor.png)

![An embed being edited with a live Discord preview](docs/screenshots/embed-studio.png)

![Real time collaboration](docs/screenshots/collab.png)

## Platforms

Run it yourself in a browser, or install the desktop app:

| System | Desktop builds |
| --- | --- |
| macOS 14 or newer | Universal app for Intel and Apple silicon |
| Windows 10 version 1803 or newer | x64 installer |
| Windows 11 | x64 and ARM64 installers |
| Linux (Universal) | x64 and ARM64 AppImages |
| Debian, Ubuntu and other compatible distributions | x64 and ARM64 .deb |

See [desktop downloads and system requirements](docs/DESKTOP_DISTRIBUTION.md).

## Run it locally

Requires Node.js 22 or newer

```sh
npm ci
cp .env.example .env
npm run dev:server
```

In another terminal, run the web client:

```sh
npm run dev:client
```

Open the address Vite prints in the terminal. Change `ARC_SETUP_KEY` in `.env` before you start. The first person to sign in creates the workspace admin account.

## Host it for your team

Install dependencies, then start the server:

```sh
npm ci
npm start
```

On first startup, the server builds the web client if it has not been built yet.

### Server only for desktop connections

Run this when people should connect through the ARC Studio desktop app and you do not want to host the browser editor:

```sh
npm ci
cp .env.example .env
npm run start:server
```

Set a private `ARC_SETUP_KEY` in `.env` before exposing the server. This starts only the API and WebSocket server, it does not build or serve the web client. Desktop clients can connect to it, while browser users cannot open the editor from this server.

Set `ARC_ACTIVITY_WEBHOOK_URL` to send workspace activity to a Discord webhook. Delivery starts enabled when the variable is set. The primary workspace owner can disable notifications or save an encrypted replacement in Editor Settings. The URL is never returned to the client. This setting is available for hosted workspaces and desktop clients connected to a hosted workspace, not the desktop Local Workspace.

Put the server behind HTTPS. If you use a reverse proxy, make sure it passes WebSocket connections too. Keep `packages/studio-server/data` so projects and accounts survive restarts. The admin can add subusers and choose their roles. Everyone signs in to the same workspace, opens a project, and sees each other's graph edits live. Save the graph to keep those changes.

The server only accepts connections from the same machine by default. Keep that setting when your HTTPS proxy runs on the same host. Change `HOST` only if the server needs to accept connections directly. And change the sample setup key before your team uses it.

## Build the desktop app

To make a desktop build, run this on the platform you want to package:

```sh
npm ci
npm run build:desktop
```

To work on the desktop app, run `npm run dev:desktop`. See [how the desktop app works](docs/desktop-architecture.md) and [how desktop builds and updates work](docs/DESKTOP_DISTRIBUTION.md).

## For developers

- [Plugin development](docs/PLUGIN_DEVELOPMENT.md)
- [Plugin registry and publishing](docs/PLUGIN_REGISTRY.md)
- [WebAssembly adapter runtime](docs/PLUGIN_ADAPTER_RUNTIME.md)

## License

ARC Studio and Chezcord are licensed under the [Apache License 2.0](LICENSE). Third party packages keep their own licenses.


[Termux Labs Discord Server](https://discord.gg/Cet9px5ZnZ) (Application only)
30 October 2026
