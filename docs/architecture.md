# Architecture Overview

The Devtex project is split into two main components:

1. **Devtex‑CLI** – A command‑line interface written in TypeScript that uses the `commander` library for command parsing. It exposes commands such as `init` to scaffold a new Devtex project.
2. **Devtex‑Desktop** – An Electron application built with Vite. It bundles the main process code (`src/main/*`) and the renderer process (`src/renderer/*`). The desktop app communicates with the main process via IPC and provides a GUI for interacting with AI providers.

Both components share a common set of AI provider abstractions located in `src/main/providers/*`. The providers implement a simple interface that allows the CLI and the desktop app to request completions or embeddings from Gemini, Groq, or any OpenAI‑compatible endpoint.

The repository follows a monorepo layout with separate `Devtex-CLI/` and `Devtex-Desktop/` directories, each containing its own `package.json`, `tsconfig.json`, and build scripts.