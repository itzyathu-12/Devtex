import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  GeminiCredentialError,
  GeminiCredentialStore
} from '../src/main/gemini-credential-store.ts'

/* JavaScript test fixtures intentionally rely on runtime assertions for types. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

const validKey = 'AIzaSyDectestCredentialValue0123456789'

async function setup(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'devtex-gemini-credential-'))
  const credentialPath = join(directory, 'gemini-key.enc')
  const calls = { encrypt: 0, decrypt: 0, syncAvailable: 0, asyncAvailable: 0 }
  const storage = {
    isEncryptionAvailable() {
      calls.syncAvailable += 1
      return options.syncAvailable ?? true
    },
    async isAsyncEncryptionAvailable() {
      calls.asyncAvailable += 1
      return options.asyncAvailable ?? true
    },
    async encryptStringAsync(value) {
      calls.encrypt += 1
      if (options.encryptError) throw new Error('sensitive encryption detail')
      return Buffer.from(`encrypted:${value}`, 'utf8')
    },
    async decryptStringAsync(bytes) {
      calls.decrypt += 1
      if (options.decryptError) throw new Error('sensitive decryption detail')
      const encoded = bytes.toString('utf8')
      if (!encoded.startsWith('encrypted:')) throw new Error('malformed bytes')
      return { result: encoded.slice('encrypted:'.length), shouldReEncrypt: false }
    },
    getSelectedStorageBackend() {
      return 'test-keyring'
    }
  }
  const files = {
    readFile,
    writeFile,
    rename: async (from, to) => {
      if (options.failInstall && from.endsWith('.tmp')) throw new Error('simulated rename failure')
      const { rename } = await import('node:fs/promises')
      return rename(from, to)
    },
    unlink: (path) => import('node:fs/promises').then(({ unlink }) => unlink(path))
  }
  const store = new GeminiCredentialStore(credentialPath, storage, files, 'win32')
  return { directory, credentialPath, calls, storage, files, options, store }
}

test('encrypts bytes and decrypts the async safeStorage result string', async (context) => {
  const fixture = await setup()
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))

  await fixture.store.saveKey(validKey)
  assert.equal(await fixture.store.state(), 'stored')
  assert.equal(await fixture.store.readKey(), validKey)
  assert.equal((await readFile(fixture.credentialPath)).toString('utf8'), `encrypted:${validKey}`)
  assert.equal(fixture.calls.syncAvailable, 2)
  assert.equal(fixture.calls.asyncAvailable, 2)
})

test('refuses encryption when safeStorage reports encryption unavailable', async (context) => {
  const fixture = await setup({ syncAvailable: false })
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))

  await assert.rejects(fixture.store.saveKey(validKey), (error) => {
    assert.ok(error instanceof GeminiCredentialError)
    assert.equal(error.code, 'unavailable')
    assert.match(error.message, /Secure credential storage is unavailable/)
    assert.doesNotMatch(error.message, /sensitive/)
    return true
  })
  assert.equal(fixture.calls.encrypt, 0)
})

test('refuses decryption when safeStorage reports encryption unavailable', async (context) => {
  const fixture = await setup()
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))
  await writeFile(fixture.credentialPath, Buffer.from('encrypted:existing-key'))
  fixture.storage.isEncryptionAvailable = () => false

  await assert.rejects(fixture.store.readKey(), /Secure credential storage is unavailable/)
  assert.equal(fixture.calls.decrypt, 0)
  assert.equal(await fixture.store.state(), 'stored')
})

test('refuses encryption when async safeStorage encryption is unavailable', async (context) => {
  const fixture = await setup({ asyncAvailable: false })
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))

  await assert.rejects(fixture.store.saveKey(validKey), /Secure credential storage is unavailable/)
  assert.equal(fixture.calls.encrypt, 0)
})

test('marks malformed stored bytes unreadable without deleting them or retrying', async (context) => {
  const fixture = await setup()
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))
  const malformed = Buffer.from('not-an-encrypted-credential')
  await writeFile(fixture.credentialPath, malformed)

  await assert.rejects(fixture.store.readKey(), (error) => {
    assert.match(error.message, /saved Gemini API key is unreadable/i)
    assert.doesNotMatch(error.message, /sensitive decryption detail|previous-key/)
    return true
  })
  assert.equal(await fixture.store.state(), 'unreadable')
  assert.equal(
    (await readFile(fixture.credentialPath)).toString('utf8'),
    malformed.toString('utf8')
  )
  assert.equal(fixture.calls.decrypt, 1)
  await assert.rejects(fixture.store.readKey(), /saved Gemini API key is unreadable/i)
  assert.equal(fixture.calls.decrypt, 1)
})

test('caches decrypt failures, preserves ciphertext, and refuses replacement until removal', async (context) => {
  const fixture = await setup({ decryptError: true })
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))
  const encrypted = Buffer.from('encrypted:previous-key')
  await writeFile(fixture.credentialPath, encrypted)

  await assert.rejects(fixture.store.readKey(), /saved Gemini API key is unreadable/i)
  await assert.rejects(fixture.store.saveKey(validKey), /saved Gemini API key is unreadable/i)
  assert.equal(fixture.calls.decrypt, 1)
  assert.equal(fixture.calls.encrypt, 0)
  assert.deepEqual(await readFile(fixture.credentialPath), encrypted)
})

test('failed replacement leaves the previously valid encrypted credential intact', async (context) => {
  const fixture = await setup()
  context.after(() => rm(fixture.directory, { recursive: true, force: true }))
  await fixture.store.saveKey(validKey)
  const previous = await readFile(fixture.credentialPath)
  fixture.options.failInstall = true
  await assert.rejects(
    fixture.store.saveKey('AIzaSyDreplacementCredentialValue0123456789'),
    /Could not securely save/
  )
  assert.deepEqual(await readFile(fixture.credentialPath), previous)
  assert.equal(await fixture.store.readKey(), validKey)
})
