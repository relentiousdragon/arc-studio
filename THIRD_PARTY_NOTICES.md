# Third Party Notices

ARC Studio, Chezcord, the server, the client, and the desktop shell are licensed
under Apache License 2.0 (See `LICENSE`). Direct third party dependencies and
build tools are listed below with their locked versions and declared licenses.
Each package retains its own license.

## JavaScript packages

Versions are resolved from the root `package-lock.json`. Build tools are listed
for attribution and are not included in the runtime application.

| Package | Version | License |
|---|---|---|
| `@simplewebauthn/browser` | 14.0.0 | MIT |
| `@simplewebauthn/server` | 14.0.3 | MIT |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/cli` | 2.12.2 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-deep-link` | 2.6.3 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-dialog` | 2.8.4 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-notification` | 2.8.0 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-updater` | 2.14.0 | MIT OR Apache-2.0 |
| `@vitejs/plugin-react` | 4.7.0 | MIT |
| `concurrently` | 9.2.5 | MIT |
| `cors` | 2.8.6 | MIT |
| `dayjs` | 1.11.23 | MIT |
| `dotenv` | 16.6.1 | BSD-2-Clause |
| `emoji-picker-react` | 4.22.3 | MIT |
| `expr-eval` | 2.0.2 | MIT |
| `express` | 4.22.3 | MIT |
| `falling-leaves` | 0.1.0 | MIT |
| `lucide-react` | 0.475.0 | ISC |
| `mongodb` | 6.21.0 | Apache-2.0 |
| `react` | 18.3.1 | MIT |
| `react-dom` | 18.3.1 | MIT |
| `vite` | 6.4.4 | MIT |
| `ws` | 8.22.0 | MIT |

## Rust packages

These direct desktop dependencies are resolved from
`packages/studio-desktop/src-tauri/Cargo.lock` and included in the desktop
build. Licenses are taken from each crate's package metadata.

| Crate | Version | License |
|---|---|---|
| `bytes` | 1.12.1 | MIT |
| `discord-rich-presence` | 1.1.0 | MIT |
| `futures-util` | 0.3.34 | MIT OR Apache-2.0 |
| `keyring` | 3.6.3 | MIT OR Apache-2.0 |
| `reqwest` | 0.13.5 | MIT OR Apache-2.0 |
| `rustls` | 0.23.46 | Apache-2.0 OR ISC OR MIT |
| `serde` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 |
| `tauri` | 2.12.3 | Apache-2.0 OR MIT |
| `tauri-build` | 2.7.2 | Apache-2.0 OR MIT |
| `tauri-plugin-deep-link` | 2.6.3 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.8.4 | Apache-2.0 OR MIT |
| `tauri-plugin-notification` | 2.8.0 | Apache-2.0 OR MIT |
| `tauri-plugin-single-instance` | 2.5.5 | Apache-2.0 OR MIT |
| `tauri-plugin-updater` | 2.14.0 | Apache-2.0 OR MIT |
| `tokio` | 1.53.3 | MIT |
| `url` | 2.5.8 | MIT OR Apache-2.0 |
| `uuid` | 1.28.0 | Apache-2.0 OR MIT |

## Discord API usage

ARC Studio uses public Discord API and Gateway endpoints through the bundled
Chezcord library. It is not affiliated with, endorsed by, sponsored by, or
maintained by Discord Inc. or its partners. Discord is a trademark of Discord
Inc.
