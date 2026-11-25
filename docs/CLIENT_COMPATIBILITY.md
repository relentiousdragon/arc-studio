# Client compatibility

The root `package.json` sets `arcStudio.minimumClientVersion`. A workspace closes WebSocket connections from clients below that version before sending workspace data. Clients that do not send a version are also rejected.

Hosted login and first time setup require the configured minimum ARC Studio release, the supported client protocol, and compatibility with every required node registry feature. Registry document shape and node semantics are separate. Compatible clients can use different semantics revisions when the registry only requires features they advertise. By default, hosted login annd collaboration also require ARC Studio protocol metadata and aa browser origin matching the workspace. The desktop app uses its tauri origin. The owner can allow unknown clients in Editor Settings under Collaboration. Unknown clients still need a compatible  registry protocol and feature set + an authenticated account. Disabling the option disconnects unknown clients that are already connected.

When a plugin operation changes the active node registry, the server rechecks each connected client's advertised features. Compatible clients receive `NODE_REGISTRY_UPDATED` with the new revision and fetch the catalog. Incompatible clients receive a structured `PROBLEM` and are disconnected before they can edit with stale pin rules.

Browser origin checks prevent unrelated websites from using a visitor's authenticated session to connect. Client identity and version fields are only protocol checks.

Stable patch releases rank above Nightly builds for the same year, major, and minor.

When changing the minimum, update the Studio  version to an accepted version as well. Run `npm run sync:version` so the client, server, and desktop manifests use the root version.

HTTP errors use RFC 9457 problem details with a `code`, a user facing `detail`, and a request ID. an `error` field remains for older clients. WebSocket errors use a `PROBLEM` message with `protocolVersion`, `status`, `code`, `detail`, and a request ID. Clients branch on codes and don't parse the detail.
