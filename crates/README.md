# Rust workspace

DEVTEX v3.0 uses a shared Rust workspace: `devtex-core` for safe project inspection, path resolution, shallow listing and Git status; `devtex-cli` for the native CLI; and Tauri 2 shells for Desktop and IDE.

From the repository root run `cargo check --workspace`, `cargo test --workspace`, `cargo run -p devtex-cli -- doctor .`, `cargo run -p devtex-cli -- inspect .`, or `cargo run -p devtex-cli -- status .`.

Electron applications remain available while AI, GitHub and full Git feature parity is migrated.
