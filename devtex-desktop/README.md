# DEVTEX

### One ecosystem. Three products. Built for developers.

**DEVTEX** is a developer-focused ecosystem intended to bring desktop tools, AI-powered command-line workflows, and a lightweight development environment together.

> 🚧 **Status: Under development.** The desktop application is the current project. The CLI and IDE are planned parts of the ecosystem, not finished products.

## 🧩 The DEVTEX Ecosystem

### 1. DEVTEX Desktop — In Development

A desktop application built with **Electron, TypeScript, and Vite**, with Supabase authentication and GitHub repository integration.

Current functionality includes:
- Google and GitHub sign-in through Supabase.
- Separate GitHub authorization for accessing repositories.
- Fetching, searching, refreshing, and opening GitHub repositories.
- Secure handling of GitHub credentials in the Electron main process.

**Technology:** Electron · TypeScript · Vite · Supabase · GitHub API

[Explore the desktop application](./devtex-desktop/)

### 2. DEVTEX CLI — Planned

A standalone command-line tool intended to bring AI-assisted development workflows into the terminal.

Planned features:
- AI-powered code analysis and review using Gemini.
- Readable terminal output and useful error messages.
- Environment-based API-key configuration.
- Distribution through npm/npx, PyPI/pip, and Windows Package Manager, with appropriate packaging for each ecosystem.

**Technology direction:** TypeScript/Node.js, with a separate Python distribution where appropriate.

### 3. DEVTEX IDE — Planned

A future lightweight development environment designed with lower-spec computers in mind.

Long-term goals include:
- A responsive coding experience with a focus on resource efficiency.
- Native DEVTEX extensions and an extension API.
- An extension marketplace.
- Research into compatibility with VS Code extensions.

These are long-term goals, not current compatibility or performance guarantees.

---

## 🗂️ Repository Structure

The repository is intended to grow toward the following structure:

```text
devtex/
├── devtex-desktop/    # Existing desktop application
├── Devtex-CLI/        # Planned standalone CLI
├── Devtex-IDE/        # Planned lightweight IDE
├── packages/          # Shared packages, if needed
├── README.md
└── LICENSE
```

The CLI, IDE, and shared packages will be added as development progresses. The desktop application remains a separate project within the repository.

---

# 🖥️ DEVTEX Desktop — Setup Guide

The following instructions apply specifically to the `devtex-desktop/` directory.

## Recommended IDE Setup

- [Visual Studio Code](https://code.visualstudio.com/)
- [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Prerequisites

Install a compatible version of Node.js and npm before continuing.

### 1. Install dependencies

Open a terminal inside `devtex-desktop/` and run:

```bash
npm install
```

### 2. Configure Supabase authentication

Create a `.env` file inside `devtex-desktop/` with your Supabase project credentials:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

In your Supabase project, enable Google and/or GitHub under **Authentication → Providers**.

Add the following URI to the allowed redirect URLs:

```text
devtex://auth/callback
```

Register the matching OAuth callback with the relevant identity provider according to your Supabase configuration.

**Security:** Keep OAuth client secrets on the server or in Supabase where required. Do not put provider client secrets in the desktop application's `.env` file.

### 3. Configure GitHub repository access

Repository access uses a separate GitHub OAuth App authorization flow.

Add the GitHub OAuth App's public Client ID to `.env`:

```dotenv
GITHUB_OAUTH_CLIENT_ID=your-github-oauth-client-id
```

In GitHub, navigate to **Settings → Developer settings → OAuth Apps**, select your application, and enable **Device Flow** if you are using the current implementation.

The current implementation requests these scopes:

```text
repo read:user
```

This allows the app to request access to public and private repositories available to the authorized account, subject to the account's permissions and any organization approval requirements.

This authorization is independent of Supabase GitHub sign-in. Supabase sign-in using `read:user user:email` does not itself grant the desktop application GitHub repository API access.

### GitHub credential handling

The application is designed to:
- Store GitHub OAuth tokens using Electron `safeStorage` in the main process.
- Keep tokens out of the renderer and preload scripts.
- Avoid embedding a GitHub client secret in the application.
- Remove the locally stored credential when the user disconnects.

On Linux, a secure system keyring is required for `safeStorage` to provide the intended protection.

### ⚠️ Security review before public distribution

The current Device Flow implementation needs a security review before broad public distribution.

Device Flow can be vulnerable to social-engineering attacks involving user codes, and the classic GitHub OAuth `repo` scope grants broad repository access. Evaluate a more restricted GitHub App configuration with read-only metadata permissions, or another suitable authorization architecture, before releasing publicly.

Do not assume that a public desktop application can safely protect a client secret by embedding it in the package.

Disconnecting the account removes the locally stored credential. To revoke the GitHub OAuth App's authorization itself, visit **GitHub Settings → Applications → Authorized OAuth Apps** and revoke it there.

### 4. Run in development mode

From the `devtex-desktop/` directory:

```bash
npm run dev
```

### 5. Build the application

Build for your target platform:

**Windows**
```bash
npm run build:win
```

**macOS**
```bash
npm run build:mac
```

**Linux**
```bash
npm run build:linux
```

OAuth callback protocol changes may require rebuilding and reinstalling the packaged application before testing. Development mode also registers the protocol for the current machine.

---

## 🛠️ Development Principles

DEVTEX aims to prioritize:

- **Lightweight design:** Consider resource usage and responsiveness.
- **Security:** Protect credentials and minimize unnecessary permissions.
- **Modularity:** Keep the desktop app, CLI, and IDE independently maintainable.
- **Practical AI:** Integrate AI features where they provide real development value.
- **Learning in public:** Build incrementally, understand the technology, and improve through testing.

## 🗺️ Roadmap

- [x] Establish the DEVTEX repository.
- [x] Build the initial desktop application.
- [x] Implement GitHub repository integration.
- [ ] Continue testing and improving desktop authentication and security.
- [ ] Develop the standalone DEVTEX CLI.
- [ ] Add AI-assisted code analysis and review.
- [ ] Begin development of the lightweight DEVTEX IDE.
- [ ] Design the native extension API and extension lifecycle.
- [ ] Explore extension marketplace and VS Code compatibility options.
- [ ] Benchmark and optimize performance.

## 🤝 Contributing

DEVTEX is under active development. Suggestions, bug reports, and constructive feedback are welcome.

Before contributing, check the current project structure and existing issues so proposed changes fit the relevant application.

## 📄 License

See the [`LICENSE`](./LICENSE) file for the applicable license terms.

---

**DEVTEX — Build smarter. Code freely.**