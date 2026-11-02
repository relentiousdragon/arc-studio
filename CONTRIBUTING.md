# Contributing to ARC Studio

Thanks for helping build ARC Studio, This page holds the rules contributors must follow when working inside this repository.

Join the [ARC Studio Community Discord Server](https://discord.gg/FMv3T6XSyq) to learn more about the current state of the project.

## set up

requires Node.js 22 or newer.

```sh
git clone https://github.com/relentiousdragon/arc-studio.git
cd arc-studio
npm ci
cp .env.example .env
npm run dev
```

`npm run dev` starts the server with the built client when one exists. For live editor work use `npm run dev:client` alongside it, or a client production check with `npm run build:client` before a merge. Desktop work runs on `npm run dev:desktop`.

## Where things are

| Area | Path | Notes |
| --- | --- | --- |
| Discord protocol layer | `packages/chezcord` | native fetch and WebSocket only |
| Server, engine, nodes | `packages/studio-server` | Owns the node registry, GraphRunner, auth, and stores |
| Visual editor | `packages/studio-client` | React plus Vite, canvas, palette, docks, modals |
| Desktop shell | `packages/studio-desktop` | Tauri 2, owns server lifecycle and deep links |

New Discord actions go in `packages/chezcord` first, then get a server schema under the matching category in `packages/studio-server/src/engine/nodes/` and a visual definition in `packages/studio-client/src/components/nodes/nodeDefinitions.js`. The server is the single owner of node schemas, do not rebuild the catalog in the client and don't add a separate workspace package for it

## Code style

- Keep functions small and name things after behavior. A node named `Check Value` should read clearly in both the runtime and the schema.
- Prefer explicit imports and keep registry order stable in `nodes/index.js`.
- Never send or execute server supplied JavaScript in the client. Schemas stay data only, validation lives in `NodeRegistryContract.js`.
- Keep secrets out of logs and WebSocket broadcasts. Use `CryptoEngine.mask` for tokens and never copy Studio environment values or bot tokens into exports.

## Checks to run

| Command | When |
| --- | --- |
| `npm run test:chezcord` | Any change touching Discord library logic |
| `npm run test:server` | Server, engine, node runtime, or security changes |
| `npm run build:client` | Client contract changes, node definitions, settings work |

New behavior deserves a focused test file under the matching package. Keep tests deterministic, no sleeping on real timers when a service accepts a clock, and no network calls in unit tests.

## Pull requests

- Keep ome idea per pull request. A big refactor and a bugfix together get asked to split
- Title it in plain words, for example "Fix desktop passkey blocks server only workspaces".
- Fill the description with what changed from the user point of view and how you tested it.
- If a release note mentions a new node, make sure the node declares a `createdAt` timestamp and survives a save and reload round trip.

## AI assisted contributions

AI assisted code is welcome here, but:

- You must review every line yourself before it goes into a pull request. An AI agent is a fast pair programmer, not a substitute for judgment. Assume hallucinated APIs until the compiler and tests say otherwise.
- You must run the tests that cover the change and say what passed. Fix flaky or failing pieces yourself, do not hand the mess to reviewers
- User facing wording must go through a human, write it yourself.
- When a change is risky, auth, crypto, passkeys, gateway reconnection, rate limits, ask for human review before opening the pull request.

## Security and credential handling

Found something sensitive? Post a plain GitHub issue without exploit details and keep the report contained. Never test attacks against infrastructure you do not own and never use real Discord tokens in tests, fixtures, or examples.

## License

By contributing you agree that your work is released under the Apache License 2.0 for ARC Studio, Chezcord, and the desktop shell. Plugins under the `relentiousdragon/arc-plugins` repository are MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the licenses of bundled third party packages. ARC Studio stays an independent project unaffiliated with Discord Inc.
