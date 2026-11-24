# Changelog

## [3.0.0] - Rust migration foundation

- Introduced a Cargo workspace shared by DEVTEX CLI, Desktop, and IDE.
- Expanded `devtex-core` with safe project path resolution, shallow directory listing, workspace inspection, and Git status.
- Expanded the native Rust CLI with `doctor`, `inspect`, and `status`.
- Added Tauri 2 application shells and Rust command boundaries for Desktop and IDE.
- Added independent Vite renderer builds to retain the existing interfaces.
- Kept Electron applications as compatibility fallbacks during feature parity work.
- Documented migration boundaries and remaining feature ports.

## [Unreleased]

- Port AI provider configuration, encrypted credential storage, GitHub OAuth, and complete Git workflows to Rust/Tauri.
- Finish Desktop renderer bridge parity and add end-to-end tests before enabling Tauri as the default runtime.
