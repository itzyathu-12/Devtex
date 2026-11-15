# Contributing to Devtex

## Development Setup

1. Clone the repository.
2. Install dependencies for both packages:
   ```bash
   cd Devtex-CLI && npm install
   cd ../Devtex-Desktop && npm install
   ```
3. Run the CLI in development mode:
   ```bash
   cd Devtex-CLI && npm run dev
   ```
4. Run the desktop app in development mode:
   ```bash
   cd Devtex-Desktop && npm run dev
   ```

## Testing

Both packages use the built‑in Node.js test runner. Run tests with:

```bash
# CLI tests
cd Devtex-CLI && npm test

# Desktop tests
cd Devtex-Desktop && npm test
```

## Code Style

- TypeScript with strict mode.
- ESLint and Prettier are configured. Run `npm run lint` to check.

## Pull Request Guidelines

- Follow the existing code style.
- Include tests for new features.
- Update documentation if necessary.
- Keep commit messages concise and reference the issue number.

## Issue Reporting

Please open issues for bugs or feature requests. Include a minimal reproducible example if possible.