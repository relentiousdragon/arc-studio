# Third Party Notices

ARC Studio (and its Chezcord library, server, client, and desktop shell) is
licensed under the Apache License 2.0 (see `LICENSE`). The project bundles and
depends on the following third party packages, each of which keeps its own
license. This file lists those packages for attribution purposes.

## JavaScript / TypeScript packages

These are resolved from the root `package-lock.json` and shipped in the web
client, server, and desktop shell builds.

| Package | Version | License |
|---|---|---|
| `@simplewebauthn/browser` | 14.0.0 | MIT |
| `@simplewebauthn/server` | 14.0.3 | MIT |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-deep-link` | 2.6.3 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-updater` | 2.14.0 | MIT OR Apache-2.0 |
| `@vitejs/plugin-react` | 4.7.0 | MIT |
| `concurrently` | 9.2.5 | MIT |
| `cors` | 2.8.6 | MIT |
| `dotenv` | 16.6.1 | BSD-2-Clause |
| `emoji-picker-react` | 4.22.3 | MIT |
| `express` | 4.22.3 | MIT |
| `lucide-react` | 0.475.0 | ISC |
| `mongodb` | 6.21.0 | Apache-2.0 |
| `react` | 18.3.1 | MIT |
| `react-dom` | 18.3.1 | MIT |
| `vite` | 6.4.4 | MIT |
| `ws` | 8.22.0 | MIT |
| `dayjs` | 1.11.23 | MIT |
| `expr-eval` | 2.0.2 | MIT |

## Rust packages

These are resolved from `packages/studio-desktop/src-tauri/Cargo.lock` and
compiled into the Tauri desktop shell.

| Crate | License |
|---|---|
| `tauri` | MIT OR Apache-2.0 |
| `tauri-build` | MIT OR Apache-2.0 |
| `tauri-plugin-deep-link` | MIT OR Apache-2.0 |
| `tauri-plugin-single-instance` | MIT OR Apache-2.0 |
| `tauri-plugin-updater` | MIT OR Apache-2.0 |
| `serde` | MIT OR Apache-2.0 |
| `serde_json` | MIT OR Apache-2.0 |
| `url` | MIT |
| `uuid` | MIT |
| `keyring` | MIT |
| `discord-rich-presence` | MIT |

## Discord API usage

ARC Studio uses the public Discord API and Gateway endpoints through the
bundled Chezcord library. It is not affiliated with, endorsed by, sponsored
by, or maintained by Discord Inc. or any of its partners. Discord is a
trademark of Discord Inc.
