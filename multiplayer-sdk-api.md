# Documentation moved

The multiplayer SDK documentation now lives in the [`docs/`](./docs) folder,
split into two focused guides:

- **[`docs/plugin-developers.md`](./docs/plugin-developers.md)** — end-to-end
  guide for plugin authors: managers, lifecycle, teams, late join, reconnect,
  standalone mode, a full quiz walkthrough.
- **[`docs/host-protocol.md`](./docs/host-protocol.md)** — wire-level
  reference for host integrators: Penpal transport, `HostApi` / `PluginApi`
  contracts, payload shapes, sequence diagrams, invariants.

The root [`README.md`](./README.md) has a high-level overview and links to
both documents, plus a working example plugin under [`example/`](./example).
