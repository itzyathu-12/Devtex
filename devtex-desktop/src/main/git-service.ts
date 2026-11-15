import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import type { GitCommit, GitFileChange, GitRepositoryState, GitDiffResult } from '../shared/git'

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 4 * 1024 * 1024

let cachedGitExecutable: string | null = null

function findGitExecutable(): string {
  if (cachedGitExecutable && existsSync(cachedGitExecutable)) return cachedGitExecutable

  const candidates: string[] = []
  const addGitLayouts = (base: string | undefined): void => {
    if (!base) return
    const root = resolve(base.replace(/^"|"$/g, ''))
    candidates.push(
      join(root, 'cmd', 'git.exe'),
      join(root, 'bin', 'git.exe'),
      join(root, 'mingw64', 'bin', 'git.exe'),
      join(root, 'usr', 'bin', 'git.exe'),
      join(root, 'git.exe')
    )
  }

  if (process.env.GIT_EXECUTABLE) candidates.push(resolve(process.env.GIT_EXECUTABLE))
  for (const entry of (process.env.PATH || '').split(delimiter)) {
    const clean = entry.trim().replace(/^"|"$/g, '')
    if (clean) candidates.push(join(clean, 'git.exe'))
  }

  addGitLayouts(process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Git') : undefined)
  addGitLayouts(process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)']!, 'Git') : undefined)
  addGitLayouts(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Git') : undefined)

  // Portable Git commonly sits in a parent folder of the checked-out project.
  let ancestor = process.cwd()
  for (let depth = 0; depth < 8; depth += 1) {
    addGitLayouts(ancestor)
    const parent = dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('Git for Windows was not found. Install Git for Windows, add its cmd folder to PATH, or set GIT_EXECUTABLE to the full path of git.exe. Portable Git is supported when its folder is an ancestor of the DEVTEX app.')
  }
  cachedGitExecutable = found
  return found
}

async function git(cwd: string, args: string[], githubToken?: string | null): Promise<string> {
  const executable = findGitExecutable()
  try {
    const { stdout } = await execFileAsync(executable, ['-C', cwd, ...args], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      ...(githubToken ? { env: {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${githubToken}`).toString('base64')}`
      } } : {})
    })
    return stdout
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Git command failed: ${detail}`)
  }
}

async function repositoryRoot(path: string): Promise<string> {
  if (typeof path !== 'string' || !path.trim() || path.length > 4096) {
    throw new Error('Choose a valid local project folder.')
  }
  const resolved = await realpath(path)
  const root = (await git(resolved, ['rev-parse', '--show-toplevel'])).trim()
  if (!root) throw new Error('This folder is not inside a Git repository.')
  return realpath(root)
}

function parseChanges(output: string): GitFileChange[] {
  return output.split('\n').filter(Boolean).map((line) => {
    const indexStatus = line[0] || ' '
    const worktreeStatus = line[1] || ' '
    let filePath = line.slice(3)
    let originalPath: string | undefined
    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ')
      originalPath = parts[0]
      filePath = parts.slice(1).join(' -> ')
    }
    return {
      path: filePath,
      ...(originalPath ? { originalPath } : {}),
      indexStatus,
      worktreeStatus,
      staged: indexStatus !== ' ' && indexStatus !== '?',
      status: indexStatus === '?' ? 'Untracked' : `${indexStatus === ' ' ? '' : indexStatus}${worktreeStatus === ' ' ? '' : worktreeStatus}`
    }
  })
}

export async function getGitStatus(path: string): Promise<GitRepositoryState> {
  const root = await repositoryRoot(path)
  const [status, branchOutput, localBranchOutput, remoteBranchOutput, upstreamOutput, logOutput, remoteOutput] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '--branch']),
    git(root, ['branch', '--show-current']),
    git(root, ['branch', '--format=%(refname:short)']),
    git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']),
    git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => ''),
    git(root, ['log', '-8', '--date=iso-strict', '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%aI']).catch(() => ''),
    git(root, ['remote', '-v'])
  ])
  const header = status.split('\n')[0] || ''
  const aheadBehind = /\[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\]/.exec(header)
  const branch = branchOutput.trim()
  const remotes = new Map<string, string>()
  for (const line of remoteOutput.split('\n').filter(Boolean)) {
    const match = /^(.+?)\s+(.+?)\s+\((fetch|push)\)$/.exec(line)
    if (match && match[3] === 'fetch') remotes.set(match[1], match[2])
  }
  const configuredUpstream = upstreamOutput.trim()
  const matchingRemoteRefs = branch
    ? remoteBranchOutput.split('\n').filter((name) => name.endsWith('/' + branch) && !name.endsWith('/HEAD'))
    : []
  const inferredUpstream = !configuredUpstream && matchingRemoteRefs.length === 1
    ? matchingRemoteRefs[0]
    : ''
  const upstream = configuredUpstream || inferredUpstream
  const divergence = upstream
    ? await git(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]).catch(() => '')
    : ''
  const divergenceParts = divergence.trim() ? divergence.trim().split(/\s+/).map(Number) : []
  const aheadCount = divergenceParts[0]
  const behindCount = divergenceParts[1]
  const commits: GitCommit[] = logOutput.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, subject, author, date] = line.split('\x1f')
    return { hash, shortHash, subject, author, date }
  })
  return {
    root,
    branch: branch || 'HEAD (detached)',
    upstream: upstream || /\.\.\.([^ ]+)/.exec(header)?.[1] || null,
    ahead: Number.isFinite(aheadCount) ? aheadCount : Number(aheadBehind?.[1] ?? 0),
    behind: Number.isFinite(behindCount) ? behindCount : Number(aheadBehind?.[2] ?? 0),
    detached: !branch,
    changes: parseChanges(status.split('\n').slice(1).join('\n')),
    branches: [...new Set([
      ...localBranchOutput.split('\n').filter(Boolean),
      ...remoteBranchOutput.split('\n').filter(Boolean)
        .filter((name) => !name.endsWith('/HEAD'))
        .map((name) => name.replace(/^[^/]+\//, ''))
    ])],
    commits,
    remotes: [...remotes].map(([name, url]) => ({ name, url }))
  }
}

export async function getGitDiff(path: string, filePath: string, staged = false): Promise<GitDiffResult> {
  const root = await repositoryRoot(path)
  if (typeof filePath !== 'string' || !filePath || filePath.startsWith('/') || filePath.includes('\\')) {
    throw new Error('Invalid repository file path.')
  }
  const args = staged ? ['diff', '--cached', '--no-ext-diff', '--', filePath] : ['diff', '--no-ext-diff', '--', filePath]
  return { path: filePath, staged, diff: await git(root, args) }
}

function validatePaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 200 ||
      paths.some((item) => typeof item !== 'string' || !item || item.startsWith('/') || item.includes('\\'))) {
    throw new Error('Choose one or more valid repository files.')
  }
  return paths
}

export async function stageFiles(path: string, paths: string[]): Promise<void> {
  const root = await repositoryRoot(path)
  await git(root, ['add', '--', ...validatePaths(paths)])
}
export async function unstageFiles(path: string, paths: string[]): Promise<void> {
  const root = await repositoryRoot(path)
  await git(root, ['restore', '--staged', '--', ...validatePaths(paths)])
}
export async function commitChanges(path: string, message: string): Promise<void> {
  const root = await repositoryRoot(path)
  if (typeof message !== 'string' || !message.trim() || message.length > 500) {
    throw new Error('Enter a commit message between 1 and 500 characters.')
  }
  await git(root, ['commit', '-m', message.trim()])
}
export async function switchBranch(path: string, branch: string, create = false): Promise<void> {
  const root = await repositoryRoot(path)
  if (typeof branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(branch) || branch.includes('..') || branch.endsWith('/')) {
    throw new Error('Enter a valid branch name.')
  }
  await git(root, create ? ['switch', '-c', branch] : ['switch', branch])
}
export async function syncRepository(path: string, action: 'fetch' | 'pull' | 'push', githubToken?: string | null): Promise<void> {
  const root = await repositoryRoot(path)
  if (action === 'fetch') {
    await git(root, ['fetch', '--all', '--prune'], githubToken)
    return
  }

  const upstream = (await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim()
  const branch = (await git(root, ['branch', '--show-current'])).trim()
  if (!branch) throw new Error('Switch to a branch before syncing this repository.')

  const remoteNames = (await git(root, ['remote']).catch(() => '')).split('\n').filter(Boolean)
  const remote = remoteNames.includes('origin') ? 'origin' : remoteNames[0]
  if (!remote) throw new Error('No remote is configured. Add a GitHub remote before syncing.')

  if (action === 'pull') {
    if (upstream) await git(root, ['pull', '--ff-only'], githubToken)
    else {
      const candidate = `refs/remotes/${remote}/${branch}`
      const exists = await git(root, ['show-ref', '--verify', '--quiet', candidate]).then(() => true).catch(() => false)
      if (!exists) throw new Error(`No upstream exists for ${branch}. Fetch first or publish this branch.`)
      await git(root, ['pull', '--ff-only', remote, branch], githubToken)
      await git(root, ['branch', '--set-upstream-to', `${remote}/${branch}`, branch])
    }
    return
  }

  if (upstream) await git(root, ['push'], githubToken)
  else await git(root, ['push', '--set-upstream', remote, 'HEAD'], githubToken)
}

export async function cloneGitRepository(url: string, parentPath: string, githubToken?: string | null): Promise<string> {
  if (typeof url !== 'string' || typeof parentPath !== 'string' || !parentPath.trim()) {
    throw new Error('Choose a GitHub repository and a destination folder.')
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('Enter a valid GitHub repository URL.') }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(parsed.pathname)) {
    throw new Error('Only HTTPS GitHub repository URLs can be cloned from this view.')
  }
  const repositoryName = basename(parsed.pathname.replace(/\.git\/?$/, '').replace(/\/$/, ''))
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repositoryName)) throw new Error('GitHub returned an invalid repository name.')
  const parent = await realpath(parentPath)
  const destination = join(parent, repositoryName)
  if (existsSync(destination)) throw new Error(`A folder named "${repositoryName}" already exists in the selected destination.`)
  await git(parent, ['clone', '--', url, destination], githubToken)
  return destination
}

export async function setGitRemote(path: string, name: string, url: string): Promise<void> {
  const root = await repositoryRoot(path)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,50}$/.test(name)) throw new Error('Enter a valid remote name.')
  if (typeof url !== 'string' || url.length > 2048) throw new Error('Enter a valid remote URL.')
  let parsed: URL | null = null
  try { parsed = new URL(url) } catch { /* SSH URL is validated below */ }
  const validHttps = parsed?.protocol === 'https:' && parsed.hostname === 'github.com' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(parsed.pathname)
  const validSsh = /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(url)
  if (!validHttps && !validSsh) throw new Error('Only GitHub HTTPS or SSH repository URLs are supported.')
  const existing = (await git(root, ['remote'])).split('\n').filter(Boolean)
  if (existing.includes(name)) await git(root, ['remote', 'set-url', name, url])
  else await git(root, ['remote', 'add', name, url])
}

export async function initializeRepository(path: string, branch = 'main'): Promise<void> {
  if (typeof path !== 'string' || !path.trim() || path.length > 4096) throw new Error('Choose a valid project folder.')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(branch)) throw new Error('Enter a valid initial branch name.')
  const root = await realpath(path)
  const existing = await git(root, ['rev-parse', '--show-toplevel']).then(() => true).catch(() => false)
  if (existing) return
  await git(root, ['init', '--initial-branch', branch])
}
