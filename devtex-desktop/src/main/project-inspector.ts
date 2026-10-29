import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'target',
  'bin',
  'obj',
  'coverage',
  '.cache',
  '.turbo',
  'vendor'
])

const binaryExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.pyc',
  '.wasm',
  '.bin',
  '.mp3',
  '.mp4',
  '.wav',
  '.mov',
  '.avi',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.lock'
])

const secretPattern = /(\b|_)(secret|credential|token|password|id_rsa|id_ed25519)(\b|_|\.)/i
const secretExtensions = new Set(['.pem', '.key', '.pfx', '.p12', '.cert'])

function isSecretOrExcluded(name: string): boolean {
  if (name === '.env' || name.startsWith('.env.')) return true
  if (name === 'package-lock.json' || name === 'yarn.lock' || name === 'pnpm-lock.yaml') return true
  if (secretPattern.test(name)) return true
  const lower = name.toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex !== -1) {
    const ext = lower.slice(dotIndex)
    if (secretExtensions.has(ext) || binaryExtensions.has(ext)) return true
  }
  return false
}

export async function chooseProjectFolder(
  window: BrowserWindow | null
): Promise<{ name: string; path: string } | null> {
  const { dialog } = await import('electron')
  const options: OpenDialogOptions = {
    title: 'Select Project Folder',
    properties: ['openDirectory']
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const folderPath = result.filePaths[0]
  const name = basename(folderPath) || folderPath
  return { name, path: folderPath }
}

async function collectFiles(
  dir: string,
  root: string,
  depth = 0,
  maxEntries = 300
): Promise<string[]> {
  if (depth > 4) return []
  const collected: string[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  for (const entry of entries) {
    if (collected.length >= maxEntries) break
    const fullPath = join(dir, entry)

    let entryStat
    try {
      entryStat = await stat(fullPath)
    } catch {
      continue
    }

    if (entryStat.isDirectory()) {
      if (!ignoredDirectories.has(entry) && !entry.startsWith('.')) {
        const sub = await collectFiles(fullPath, root, depth + 1, maxEntries - collected.length)
        collected.push(...sub)
      }
    } else if (entryStat.isFile()) {
      if (!isSecretOrExcluded(entry)) {
        collected.push(relative(root, fullPath).replace(/\\/g, '/'))
      }
    }
  }

  return collected
}
// this is of chat
export async function inspectProject(
  projectPath: string,
  query?: string,
  maxContextLength = 4_500
): Promise<string> {
  let dirStat
  try {
    dirStat = await stat(projectPath)
  } catch {
    throw new Error('Project folder not found on disk.')
  }

  if (!dirStat.isDirectory()) {
    throw new Error('Selected project path is not a directory.')
  }

  const allFiles = await collectFiles(projectPath, projectPath)
  const projectName = basename(projectPath) || projectPath

  const queryTerms = (query || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length > 2 && !['what', 'this', 'that', 'with', 'from', 'have', 'your', 'about', 'code'].includes(w))

  const keyCandidates: string[] = []
  const matches: string[] = []
  const others: string[] = []

  for (const relPath of allFiles) {
    const lower = relPath.toLowerCase()
    const isManifest =
      lower === 'package.json' ||
      lower === 'readme.md' ||
      lower === 'tsconfig.json' ||
      lower === 'cargo.toml' ||
      lower === 'pyproject.toml' ||
      lower === 'go.mod'
    const hasQueryMatch = queryTerms.some((term) => lower.includes(term))

    if (isManifest) {
      keyCandidates.push(relPath)
    } else if (hasQueryMatch) {
      matches.push(relPath)
    } else {
      others.push(relPath)
    }
  }

  const selectedRelPaths: string[] = []
  for (const p of [...matches, ...keyCandidates, ...others]) {
    if (!selectedRelPaths.includes(p)) {
      selectedRelPaths.push(p)
      if (selectedRelPaths.length >= 5) break
    }
  }

  const maxTreeCount = Math.min(30, allFiles.length)
  const treeDisplay = allFiles.slice(0, maxTreeCount).map((f) => `  - ${f}`).join('\n')
  const moreTree = allFiles.length > maxTreeCount ? `\n  ... and ${allFiles.length - maxTreeCount} more files` : ''

  const headerEst = 300 + treeDisplay.length
  const remainingBudget = Math.max(800, maxContextLength - headerEst)
  const perFileBudget = Math.max(350, Math.floor(remainingBudget / Math.max(1, selectedRelPaths.length)))

  const fileContents: Array<{ path: string; content: string }> = []
  for (const relPath of selectedRelPaths) {
    const fullPath = join(projectPath, relPath)
    try {
      const raw = await readFile(fullPath, 'utf8')
      const truncated = raw.length > perFileBudget
        ? raw.slice(0, perFileBudget) + '\n[... content truncated ...]'
        : raw
      fileContents.push({ path: relPath, content: truncated })
    } catch {
      continue
    }
  }

  const filesSection = fileContents
    .map((fc) => `--- File: ${fc.path} ---\n${fc.content}\n--- End of ${fc.path} ---`)
    .join('\n\n')

  const result = `[Project Inspection: ${projectName}]
Location: ${projectPath}
File Structure Overview:
${treeDisplay}${moreTree}

Relevant File Contents:
${filesSection}`

  if (result.length > maxContextLength) {
    return result.slice(0, maxContextLength - 40) + '\n[... remaining context truncated ...]'
  }
  return result
}
