# DEVTEX IDE

A standalone desktop development workspace built with Electron, Vite and TypeScript. DEVTEX aims for a calm, minimal editor experience with a distinctive investigation-first workflow.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm.

```bash
npm install
npm run dev
```

Build with `npm run build`. The electron-vite output is written to `out/`.

## Current workspace · v2.1.3

- Native folder picker and project-root-confined filesystem operations.
- Lazy project explorer: only the root directory loads initially; nested folders load when expanded.
- Open and switch between multiple file tabs, close tabs, and track unsaved changes.
- Read, edit, create and save local text files and folders.\n- Built-in lightweight syntax colouring for common languages, with language detection.\n- Editor indentation helpers for Tab and Enter.\n- JSON formatting through the editor Format action.
- Command palette: Ctrl/Cmd + Shift + P.
- Save: Ctrl/Cmd + S. Open workspace: Ctrl/Cmd + O. Close tab: Ctrl/Cmd + W.
- Local project notes and persistent workspace preferences.
- Appearance options, interface density, editor font size, line numbers, and visibility toggles for Explorer, Notes and Output.
- Output panel for workspace activity messages.

## Architecture

- `src/main`: Electron window and filesystem IPC handlers.
- `src/preload`: narrow typed API exposed through contextBridge.
- `src/renderer`: Vite UI and workspace interactions.

Renderer Node.js access is disabled. Filesystem paths are resolved in the main process and confined to the selected project root.

## Current limitations

This is an evolving editor foundation, not yet a complete language IDE. The current text editor does not yet provide syntax highlighting, language-server intelligence, integrated shell execution, debugging, Git controls, test execution, or AI investigation. The Output panel currently displays workspace messages; it is not a system terminal. These capabilities should be added as real, tested features rather than presented as implemented.

## Product direction

DEVTEX should connect intent, code changes, investigation and verification in one focused developer workflow—without becoming a reskinned copy of another editor.
