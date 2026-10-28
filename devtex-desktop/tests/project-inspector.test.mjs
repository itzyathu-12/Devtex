import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectProject } from '../src/main/project-inspector.ts'

test('inspectProject reads structure and relevant files while excluding secrets, .env, and node_modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devtex-test-proj-'))

  try {
    // Normal files
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'my-test-app', version: '1.0.0' }))
    await writeFile(join(dir, 'README.md'), '# My Test App\nWelcome to testing.')
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src', 'index.ts'), 'export const hello = "world"')
    await writeFile(join(dir, 'src', 'auth.ts'), 'export function login() { return true }')

    // Excluded files / folders
    await writeFile(join(dir, '.env'), 'SECRET_KEY=12345')
    await writeFile(join(dir, '.env.local'), 'SECRET_API=supersecret')
    await writeFile(join(dir, 'id_rsa'), 'PRIVATE KEY')
    await writeFile(join(dir, 'server.key'), 'PRIVATE KEY DATA')
    await writeFile(join(dir, 'app.exe'), 'BINARY BYTES')
    await writeFile(join(dir, 'logo.png'), 'IMAGE BYTES')

    await mkdir(join(dir, 'node_modules'))
    await writeFile(join(dir, 'node_modules', 'dep.js'), 'console.log("dep")')

    await mkdir(join(dir, '.git'))
    await writeFile(join(dir, '.git', 'config'), 'git config')

    await mkdir(join(dir, 'dist'))
    await writeFile(join(dir, 'dist', 'bundle.js'), 'compiled bundle')

    // Inspect
    const result = await inspectProject(dir, 'where is login authentication')

    // Assertions
    assert.match(result, /package\.json/)
    assert.match(result, /README\.md/)
    assert.match(result, /src\/auth\.ts/)
    assert.match(result, /export function login/)

    // Must NOT contain excluded items
    assert.doesNotMatch(result, /SECRET_KEY/)
    assert.doesNotMatch(result, /supersecret/)
    assert.doesNotMatch(result, /\.env/)
    assert.doesNotMatch(result, /id_rsa/)
    assert.doesNotMatch(result, /server\.key/)
    assert.doesNotMatch(result, /app\.exe/)
    assert.doesNotMatch(result, /logo\.png/)
    assert.doesNotMatch(result, /node_modules/)
    assert.doesNotMatch(result, /\.git/)
    assert.doesNotMatch(result, /dist\/bundle\.js/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
