# DEVTEX

**A developer workspace for building, inspecting, and improving software.**

DEVTEX is evolving into a Rust-powered developer workspace. The repository currently contains the existing Electron desktop and IDE applications alongside a new Rust workspace. The migration is incremental: shared project logic moves into Rust first, while the existing interfaces remain in place until their Tauri replacements are ready.

<p align="center">
  <a href="https://devtex.vercel.app">Website</a> ·
  <a href="https://github.com/itzyathu-12/Devtex/actions">Builds</a> ·
  <a href="https://github.com/itzyathu-12/Devtex/issues">Report a bug</a>
</p>

---

## Architecture migration (v3.0)

The Rust workspace is the foundation for a shared implementation across DEVTEX products:

| Crate | Responsibility |
| --- | --- |
| `crates/devtex-core/` | UI-agnostic shared project and developer-tool logic. |
| `crates/devtex-cli/` | Native Rust command-line application. |

The desktop and IDE currently remain on Electron so existing workflows and UI are preserved. Their planned migration target is Tauri, reusing `devtex-core` rather than duplicating backend logic. Electron will only be retired after equivalent Tauri functionality has been implemented and verified.

Build the Rust workspace from the repository root:

```bash
cargo check --workspace
cargo test --workspace
cargo run -p devtex-cli -- --help
cargo run -p devtex-cli -- doctor .
```

## What's inside

| Package | Description | Location |
| --- | --- | --- |
| **DEVTEX CLI (legacy)** | Existing Node.js CLI retained during migration. | `Devtex-CLI/` |\n| **DEVTEX CLI (Rust)** | New native CLI backed by the shared Rust core. | `crates/devtex-cli/` |
| **DEVTEX Desktop** | An Electron application for project workflows, Git/GitHub integration, AI assistance, and code inspection. | `devtex-desktop/` |

### Desktop capabilities

- **Project workspace** — organize and open local development projects.
- **Source Control** — review Git changes, branches, commits, and synchronize with remotes.
- **GitHub integration** — connect an account, browse repositories, create repositories, and clone projects.
- **AI assistance** — configure supported AI providers and use project-aware assistance.
- **Testing and reports** — inspect projects with the available analysis tools and review generated findings.
- **Repository organization** — review repository structure and explore organization suggestions.

> DEVTEX is actively developed. Features and workflows may change between releases.

## Getting started

### Requirements

- Windows, macOS, or Linux for desktop development (Windows installer builds target x64).
- Node.js 22 or newer recommended.
- npm.
- Git for source-control features.

### 1. Clone the repository

```bash
git clone https://github.com/itzyathu-12/Devtex.git
cd Devtex
```

### 2. Run DEVTEX Desktop

```bash
cd devtex-desktop
npm ci
```

Create a local `.env` file in `devtex-desktop/` using the example:

```bash
# macOS / Linux
cp .env.example .env

# Windows Command Prompt
copy .env.example .env
```

Set the following **public client configuration** values in that file:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable client key. |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID. |

Then start the desktop app:

```bash
npm run dev
```

Keep your local `.env` file private. Never put a Supabase service-role key, GitHub OAuth client secret, or other private credential in a `VITE_` variable or in a distributed client application. The example file contains placeholders only.

### 3. Build the Windows installer

From `devtex-desktop/`:

```bash
npm ci
npm run build:win
```

The Windows NSIS installer is generated in:

```
devtex-desktop/dist/
```

The automated Windows workflow also builds the installer and uploads it as a GitHub Actions artifact. See [GitHub Actions](https://github.com/itzyathu-12/Devtex/actions).

### 4. Run DEVTEX CLI

```bash
cd Devtex-CLI
npm install
npm run build
```

To make the `devtex` command available globally on your development machine:

```bash
npm link
```

Then:

```bash
devtex --help
devtex init
```

## Development checks

For the desktop application, run these commands from `devtex-desktop/`:

```bash
npm run typecheck
npm test
npm run build
```

For the CLI, run from `Devtex-CLI/`:

```bash
npm run build
npm test
```

## Repository layout

```
Devtex/
├── Cargo.toml               # Rust workspace\n├── crates/                  # Shared Rust core and native CLI\n├── Devtex-CLI/              # Legacy Node.js CLI (migration compatibility)
├── devtex-desktop/          # Electron desktop application
│   ├── src/
│   ├── tests/
│   ├── .env.example         # Safe configuration template
│   └── package.json
├── docs/                    # Project documentation
├── .github/workflows/       # CI and Windows installer workflow
├── LICENSE
└── README.md
```

## Contributing

Contributions, bug reports, and thoughtful feature suggestions are welcome.

1. Check the existing issues before opening a new one.
2. For bugs, include your operating system, steps to reproduce, and relevant error output. Remove tokens and other secrets from logs.
3. Keep changes focused and include tests or documentation updates where appropriate.
4. Open a pull request describing the change and how you verified it.

See [the contributing guide](docs/contributing.md) for development notes.

## License

DEVTEX is distributed under the [MIT License](LICENSE).
