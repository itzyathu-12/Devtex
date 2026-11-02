# DEVTEX IDE

**DEVTEX IDE 0.1 — First workspace prototype**

DEVTEX IDE is an experimental development workspace exploring an intent-first, living-workspace approach to building software. It is not intended to be a VS Code clone.

## Run it

Open `index.html` in a modern browser. No build step or dependencies are required.

## Included in 0.1

- Dark workspace UI with file navigation and a code editor.
- Four starter workspace files (`app.ts`, `intent.md`, `notes.md`, `tests.ts`).
- Local browser persistence for editor content and pinned intent.
- Intent Space for recording the outcome you're working toward.
- Lightweight experiment log and preview output.
- Responsive layout for narrower screens.

## Honest limitations

This is a UI/product prototype, not a production IDE yet:
- The Run action is a preview and does **not** execute arbitrary code.
- AI is not connected.
- No filesystem, Git, language-server, debugger, or shared DEVTEX runtime integration yet.
- Local persistence uses browser localStorage; it is not a project-file save system.

## Direction

The workspace keeps **intent** visible alongside code and creates room for experiments. Future releases can connect real execution, AI assistance, project files, and the DEVTEX runtime without pretending those systems are already available.
