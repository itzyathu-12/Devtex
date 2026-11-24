# DEVTEX v3.0 Architecture

DEVTEX is migrating to a Rust shared-core architecture with Tauri application shells. This is incremental: current Electron Desktop and IDE apps remain available until each Tauri feature has parity and has passed verification.

## Target structure

- `crates/devtex-core`: UI-independent project inspection, safe path resolution, shallow directory listing, and Git operations.
- `crates/devtex-cli`: native Rust CLI backed by the shared core.
- `devtex-desktop/src-tauri`: Tauri 2 Desktop runtime and Rust command boundary.
- `Devtex-IDE/src-tauri`: Tauri 2 IDE runtime and Rust command boundary.
- Existing Electron source folders: compatibility implementations during migration; do not remove until parity is verified.

The renderer remains HTML/CSS/TypeScript. Tauri replaces Electron's bundled Chromium/Node runtime with the system WebView and a Rust backend. The UI is retained rather than redesigned. Native capabilities are exposed through explicit Tauri commands.

## Migration status

| Area | Status |
| --- | --- |
| Shared Rust workspace | In place |
| Core project inspection and safe paths | In place |
| Native Rust CLI: doctor, inspect, status | In place |
| Tauri Desktop shell | Initial runtime and core command bridge; renderer bridge parity pending |
| Tauri IDE shell | Initial runtime and project/file command bridge |
| Existing Electron apps | Retained as fallback |
| AI providers, GitHub OAuth, encrypted credentials, full Git workflow | Still require feature-by-feature porting |
| Electron retirement | Only after parity, security review, and Windows CI pass |

Directory listing is shallow and excludes common generated folders. File operations validate paths against the selected project root. File writes have a 2 MB command limit. Resource use must be measured on release builds; Rust does not guarantee a fixed RAM percentage.
