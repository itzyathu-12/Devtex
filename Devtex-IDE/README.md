# DEVTEX IDE

DEVTEX IDE is an intent-first local development workspace. It keeps the project goal visible beside the files and provides a small set of real, local development actions.

## Start

Open `index.html` in a recent Chromium-based browser. No package installation or external runtime download is required.

For local folder access, use a browser that supports the File System Access API (such as current Chrome or Edge) and open the page from a secure context. The built-in browser workspace works without folder access.

## Working features

- Open a local project directory and read its files recursively.
- Browse and switch between files; create files and folders.
- Edit source files and save changes back to selected local file handles.
- Keep a browser-local workspace when no project folder is connected.
- Export the current workspace into a selected directory (or JSON where folder export is unavailable).
- Execute JavaScript files in a short-lived Web Worker with captured console output and a time limit.
- Run simple test files named `*.test.js`, `*.spec.js`, or `tests.js` using the included `test(name, fn)` and `assert(condition, message)` helpers.
- Run lightweight heuristic inspections for common source-code issues.
- Pin a workspace intent locally and keep it visible while editing.
- Keyboard shortcuts: Ctrl/Cmd+S to save and Ctrl/Cmd+Enter to run JavaScript.

## Runtime and limitations

This is a browser-based development workspace, not yet a native Electron IDE. JavaScript execution happens in a Web Worker with a timeout; it is not a hardened security boundary for running untrusted code. Only JavaScript files are executed. TypeScript, Python, native debugging, language servers, Git operations, AI-provider integration, and DEVTEX Desktop/CLI runtime communication are not implemented in this release. Static inspection is heuristic and is not a compiler or full linter.

When a local folder is connected, file writes use the browser's file-system permission model. Browser-local workspace data and the pinned intent are stored in localStorage on that browser profile.

## Product principle

DEVTEX keeps intent next to implementation. The goal is to make the reason for a change, the code that expresses it, and the evidence that it works part of one continuous workflow.
