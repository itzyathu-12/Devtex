# DEVTEX IDE

DEVTEX IDE is a standalone desktop application built with **Electron + electron-vite + Vite + TypeScript**. It is a separate product from DEVTEX Desktop, with its own app entry point and workspace.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- Windows, macOS, or Linux

## Run locally

From this directory:

```bash
npm install
npm run dev
```

Build the application:

```bash
npm run build
```

The build output is written by electron-vite to the `out/` directory. Packaging installers can be added with electron-builder once platform-specific release settings are configured.

## Current desktop capabilities

- Native Electron window with context isolation, sandboxing, and Node integration disabled in the renderer.
- Open a local project directory through the native folder picker.
- Recursively browse project files, with generated dependency and Git internals excluded from the explorer.
- Read and edit text files, then save changes directly to the selected project directory.
- Create files and folders, including nested paths.
- Filter the project explorer.
- Keep a project outcome in the local Intent Space using browser-profile storage.
- Keyboard shortcut: Ctrl/Cmd + S to save the active file.

## Architecture

- `src/main`: Electron main process and filesystem operations.
- `src/preload`: narrow, typed IPC bridge exposed through contextBridge.
- `src/renderer`: Vite-rendered desktop interface.
- `electron.vite.config.ts`: electron-vite configuration, matching the toolchain used by DEVTEX Desktop.

Filesystem access is performed in the main process. The renderer does not receive Node.js access; it calls the limited preload API. File paths are resolved and checked against the opened project root before read/write/create operations.

## Not implemented yet

This is the Electron/Vite foundation and first native workspace implementation, not a finished full-featured IDE. It does not yet include a language server, syntax-highlighted editor, integrated terminal, debugger, Git UI, test runner, AI coding/investigation engine, or DEVTEX Desktop/CLI runtime communication. Those should be added as separate tested capabilities rather than represented as already working.

## Product direction

DEVTEX IDE should become an intent-first development environment: the goal behind a change, the implementation, and evidence that the change works should live in one continuous workflow.
