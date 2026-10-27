# DEVTEX

**Your dev setup, your rules.**

DEVTEX is a developer-tools ecosystem I'm building to make development easier, faster, and less messy. The idea is to bring useful tools, AI features, and desktop functionality together instead of switching between a bunch of different apps.

I'm building DEVTEX to be practical, customizable, and actually useful for developers.

## What is DEVTEX?

DEVTEX is built around making a developer's workflow smoother. Whether you're working on a project, using AI to help with development, or managing your coding workflow, the goal is to keep things simple and accessible.

The project includes a CLI and a desktop application, with more features planned as development continues.

## Features

- **DEVTEX CLI** — A command-line interface for developer workflows.
- **AI integration** — Support for connecting AI providers and using their models through your own API keys.
- **Multiple AI providers** — Planned/configurable support for providers such as Groq, Google Gemini, and OpenAI, depending on the current implementation.
- **DEVTEX Desktop** — A desktop app built with Electron.
- **GitHub integration** — Connect developer workflows with GitHub.
- **Supabase integration** — Authentication and related backend functionality.
- **Developer-focused workflow** — Aiming to keep useful tools in one ecosystem.

## DEVTEX Desktop

DEVTEX Desktop is the desktop side of the project. It's built using **Electron**, which lets developers create desktop applications using web technologies.

The idea is to make DEVTEX accessible beyond the terminal, with a dedicated desktop experience for its tools and integrations.

### Electron

DEVTEX uses the Electron package to build and run its desktop application. Electron makes it possible to use web technologies while accessing desktop application capabilities.

The desktop setup may include things like:

- A dedicated desktop interface
- Integration with DEVTEX features
- Access to supported developer tools
- A foundation for future desktop functionality

The exact features available depend on the current implementation.

## AI Provider Integration

DEVTEX is intended to support multiple AI providers, so users can choose the provider that works best for them.

Potential providers include:

- **Groq**
- **Google Gemini**
- **OpenAI**

The goal is to let users configure their own API keys instead of being locked into a single provider.

Provider support depends on the code currently implemented, and each provider requires a valid API key and compatible configuration.

**Security note:** Keep API keys private. Store them in environment variables or an appropriate secure configuration mechanism, and never commit real keys to GitHub.

## Tech Stack

The project uses technologies such as:

- JavaScript
- Node.js
- Electron for desktop application development
- Supabase for supported backend functionality
- GitHub for repository and development workflows
- AI provider APIs, depending on configuration

The stack may evolve as DEVTEX develops.

## Getting Started

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_PROJECT_FOLDER
```

Replace the placeholders with your actual repository URL and folder name.

### 2. Install dependencies

```bash
npm install
```

This installs the packages defined by the project.

### 3. Configure environment variables

Create a `.env` file if the project uses one, then add the required configuration.

For example:

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
```

Only configure the providers your current code supports. Never upload your real `.env` file to a public repository.

### 4. Run the project

Use the scripts defined in the project's `package.json`.

For example, a project might use:

```bash
npm run dev
```

or a separate script for launching the Electron desktop application. Check the actual scripts in your repository before running them.

## DEVTEX CLI

The CLI is intended to make developer workflows easier from the terminal. Its available commands depend on the current implementation.

As development continues, the goal is to add more useful commands and integrations without making the experience unnecessarily complicated.

## Development

If you want to work on DEVTEX:

1. Clone the repository.
2. Install the dependencies.
3. Configure any required environment variables.
4. Check the available scripts in `package.json`.
5. Run the relevant CLI or desktop development command.
6. Test your changes before pushing them.

## Roadmap

Things I'm looking to improve as DEVTEX grows:

- Expand CLI functionality
- Improve DEVTEX Desktop
- Add and improve AI provider integrations
- Make provider configuration easier
- Improve GitHub and Supabase integration
- Improve reliability and developer experience
- Add more tools based on actual development needs

This roadmap can change as the project develops.

## Contributing

Contributions, suggestions, and ideas are welcome.

If you want to contribute:

1. Fork the repository.
2. Create a branch for your changes.
3. Make your changes.
4. Test them.
5. Open a pull request explaining what you changed.

Keep contributions focused and document any new setup requirements.

## Project Status

DEVTEX is an ongoing project. Features and integrations may change as development continues, so check the current code and documentation for what is actually available.

## Final Note

DEVTEX is my attempt to build a developer-tools ecosystem that brings the CLI, desktop experience, and AI integrations together in one place.

Still building, still improving, and there's more to come.

**Built with curiosity and a lot of coding.**