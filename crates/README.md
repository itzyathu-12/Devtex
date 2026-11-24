# Rust workspace

This is the foundation of the DEVTEX Rust migration.

- `devtex-core`: UI-agnostic shared logic for all DEVTEX products.
- `devtex-cli`: native Rust CLI using the shared core.

From the repository root, with stable Rust installed:

```sh
cargo check --workspace
cargo test --workspace
cargo run -p devtex-cli -- --help
cargo run -p devtex-cli -- doctor .
```

The existing Electron desktop and IDE applications remain intact during this
stage. Tauri applications will be introduced separately and will reuse
`devtex-core`; no existing UI is replaced by this initial foundation.
