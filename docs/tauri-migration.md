# Tauri migration

Prerequisites: stable Rust, Cargo, Tauri 2 platform prerequisites (WebView2 and Microsoft C++ Build Tools on Windows), Node.js 22+, and npm.

Desktop: from `devtex-desktop/`, run `npm install` then `npm run tauri:dev`. The independent Vite build compiles the existing renderer from `src/renderer`; the Electron main/preload process is not used by Tauri. Desktop renderer bridge parity is still in progress.

IDE: from `Devtex-IDE/`, run `npm install` then `npm run tauri:dev`. The existing IDE renderer is retained, with a Tauri invoke adapter for project selection, tree listing and file operations. Electron remains the fallback.

From the repository root, verify with `cargo fmt --all -- --check`, `cargo check --workspace`, and `cargo test --workspace`. Do not remove Electron sources or the legacy CLI until all required workflows pass automated tests and Windows release builds.
