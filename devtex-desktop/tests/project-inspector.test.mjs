import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectProject, applyProjectFileEdit, scanProjectForBugs } from '../src/main/project-inspector.ts'
import { readFile } from 'node:fs/promises'

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

test('applyProjectFileEdit safely edits file and creates backup copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devtex-edit-proj-'))

  try {
    const file = join(dir, 'main.ts')
    await writeFile(file, 'const port = 3000;\nconsole.log(port);')

    const editRes = await applyProjectFileEdit({
      projectPath: dir,
      filePath: 'main.ts',
      searchSnippet: 'const port = 3000;',
      replaceSnippet: 'const port = 8080;'
    })

    assert.equal(editRes.success, true)
    const updated = await readFile(file, 'utf8')
    assert.equal(updated, 'const port = 8080;\nconsole.log(port);')

    // Check backup was created
    const backupContent = await readFile(join(dir, 'main.ts.devtex.bak'), 'utf8')
    assert.equal(backupContent, 'const port = 3000;\nconsole.log(port);')

    // Prohibit path traversal
    const badEdit = await applyProjectFileEdit({
      projectPath: dir,
      filePath: '../outside.txt',
      newContent: 'bad'
    })
    assert.equal(badEdit.success, false)
    assert.match(badEdit.error, /Security violation|prohibited/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scanProjectForBugs detects eval, secrets, and swallowed exceptions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devtex-bug-proj-'))

  try {
    await writeFile(join(dir, 'unsafe.js'), `
      const x = eval('2 + 2');
      const api_key = "AIzaSyD-1234567890abcdefghijklm";
      try {
        doSomething();
      } catch (e) {}
    `)

    const res = await scanProjectForBugs(dir)
    assert.equal(res.success, true)
    assert.ok(res.bugs.length >= 3)
    assert.ok(res.bugs.some((b) => b.title.includes('eval')))
    assert.ok(res.bugs.some((b) => b.title.includes('Secret')))
    assert.ok(res.bugs.some((b) => b.title.includes('Swallowed Exception')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
