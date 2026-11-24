# DEVTEX

**A developer workspace for building, inspecting, and improving software.**

DEVTEX v3.0 begins the migration to a shared Rust core and Tauri application runtimes. Existing HTML/CSS/TypeScript interfaces are retained. Electron applications remain available during migration and will only be retired after equivalent features are implemented and verified.

<p align="center">
  <a href="https://devtex.vercel.app">Website</a> · <a href="https://github.com/itzyathu-12/Devtex/actions">Builds</a> · <a href="https://github.com/itzyathu-12/Devtex/issues">Report a bug</a>
</p>

## v3.0 architecture

| Component | Responsibility |
| --- | --- |
| `crates/devtex-core/` | Shared Rust project and developer-tool logic |
| `crates/devtex-cli/` | Native Rust CLI |
| `devtex-desktop/src-tauri/` | Tauri Desktop runtime and command bridge |
| `Devtex-IDE/src-tauri/` | Tauri IDE runtime and command bridge |
| `devtex-desktop/` | Existing Desktop UI and Electron fallback |
| `Devtex-IDE/` | Existing IDE UI and Electron fallback |
| `Devtex-CLI/` | Legacy Node CLI retained for compatibility |

The renderer remains HTML/CSS/TypeScript; Tauri uses the operating system WebView and Rust for native operations. This avoids an unnecessary UI rewrite while reducing dependence on Electron/Node after feature parity is complete.

## Rust development

Install stable Rust and the Tauri 2 platform prerequisites, then run from the repository root:

```bash
cargo check --workspace
cargo test --workspace
cargo run -p devtex-cli -- --help
cargo run -p devtex-cli -- doctor .
cargo run -p devtex-cli -- inspect .
cargo run -p devtex-cli -- status .
```

## Run Tauri apps

From `devtex-desktop/`: `npm install` then `npm run tauri:dev`.

From `Devtex-IDE/`: `npm install` then `npm run tauri:dev`.

The existing Electron apps remain available with their original `npm run dev` commands.

## Existing Desktop setup

For the Electron fallback, copy `devtex-desktop/.env.example` to `.env` and set the public client values `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `GITHUB_OAUTH_CLIENT_ID`. Never package or commit service-role keys, OAuth client secrets, or private credentials.

## Migration status

The shared core provides workspace inspection, safe relative-path resolution, shallow project listing, and Git status. The native CLI exposes `doctor`, `inspect`, and `status`. Initial Tauri shells and command boundaries are present; the IDE bridge covers workspace and file operations.

AI provider management, encrypted credential storage, GitHub OAuth/repository management, full Git staging/branch/sync operations, and Desktop renderer bridge parity are not yet ported. Use Electron for those Desktop workflows until migration completion.

## Security and performance

Rust commands validate project paths and do not expose arbitrary shell execution to the renderer. Project listings are shallow and skip common generated folders. File writes have a 2 MB limit. Resource usage will be benchmarked on release builds; no fixed RAM or CPU percentage is promised without measurements.

## License

DEVTEX is distributed under the [MIT License](LICENSE).
