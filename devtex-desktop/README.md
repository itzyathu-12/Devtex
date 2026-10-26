# devtex-desktop

A minimal Electron application with TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Authentication

Create a `.env` file in this directory with your Supabase project credentials:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

In Supabase, enable Google and/or GitHub under Authentication providers and add
`devtex://auth/callback` to the allowed redirect URLs. Register the matching
OAuth callback shown by Supabase with each identity provider. The OAuth client
secret belongs in Supabase, not in this app's `.env` file.

### GitHub repositories

Repository access uses a separate GitHub OAuth App authorization. Set the
GitHub OAuth App's public Client ID in `.env`:

```dotenv
GITHUB_OAUTH_CLIENT_ID=your-github-oauth-client-id
```

In your GitHub OAuth App settings (**Settings → Developer settings → OAuth Apps**),
enable **Device Flow**. Because classic GitHub OAuth Apps do not offer a
read-only scope for private repository metadata, the app requests the
`repo read:user` scope so it can list both public and private repositories the
authorized user can access (including collaborator and organization
repositories where OAuth App access is approved). A Supabase GitHub sign-in
(`read:user user:email`) remains independent and does not grant repository API
access.

The app keeps OAuth tokens in Electron `safeStorage` inside the main process
only (`0o600` file permissions) and never exposes tokens to the renderer or
preload scripts. No GitHub client secret is embedded or packaged. On Linux, a
secure system keyring is required.

> **Security note for public distribution:** Do not enable Device Flow for
> public distribution without reviewing GitHub's security guidance first
> (Device Flow lacks redirect binding and is more susceptible to social-engineering
> / phishing of user codes, and classic OAuth `repo` scope grants broad
> read/write access). Before public distribution, evaluate **Authorization Code
> flow with PKCE** (mediated by a backend token-exchange endpoint or by
> migrating to a fine-grained GitHub App with `Metadata: Read-only` permission)
> so public clients never embed a client secret and minimize token scope.

Disconnect removes the encrypted credential from this device. To revoke the
GitHub OAuth App's authorization itself, do that in GitHub **Settings →
Applications → Authorized OAuth Apps**; the app intentionally does not embed
the client secret required by GitHub's token-revocation endpoint.

OAuth callbacks are registered by the packaged desktop application. After
changing this protocol configuration, rebuild and reinstall the app before
testing sign-in. Development mode also registers the protocol for the current
machine.

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
