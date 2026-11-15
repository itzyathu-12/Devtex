# Usage Guide

## CLI Commands

```bash
# Initialize a new Devtex project in the current directory
devtex init
```

The `init` command creates the necessary configuration files and scaffolds a basic project structure.

## Desktop Application

Run the desktop app with:

```bash
npx devtex-desktop
```

The application opens a window that allows you to interact with AI providers, view project information, and perform common tasks.

## AI Provider Configuration

Both the CLI and the desktop app read AI provider settings from a `devtex.config.json` file located at the project root. Example configuration:

```json
{
  "provider": "gemini",
  "apiKey": "YOUR_API_KEY"
}
```

Replace `gemini` with `groq` or `openai` as needed.

For more advanced usage, refer to the source code in the `src/main/providers/*` directories.