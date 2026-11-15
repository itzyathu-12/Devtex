import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
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

async function git(cwd: string, args: string[]): Promise<string> {
  const executable = findGitExecutable()
  try {
    const { stdout } = await execFileAsync(executable, ['-C', cwd, ...args], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8'
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
  const upstream = upstreamOutput.trim()
  const divergence = upstream
    ? await git(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]).catch(() => '')
    : ''
  const [aheadCount, behindCount] = divergence.trim().split(/\s+/).map((value) => Number(value))
  const commits: GitCommit[] = logOutput.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, subject, author, date] = line.split('\x1f')
    return { hash, shortHash, subject, author, date }
  })
  const remotes = new Map<string, string>()
  for (const line of remoteOutput.split('\n').filter(Boolean)) {
    const match = /^(.+?)\s+(.+?)\s+\((fetch|push)\)$/.exec(line)
    if (match && match[3] === 'fetch') remotes.set(match[1], match[2])
  }
  const branch = branchOutput.trim()
  return {
    root,
    branch: branch || 'HEAD (detached)',
    upstream: upstream || /\.\.\.([^ ]+)/.exec(header)?.[1] ?? null,
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
export async function syncRepository(path: string, action: 'fetch' | 'pull' | 'push'): Promise<void> {
  const root = await repositoryRoot(path)
  if (action === 'fetch') await git(root, ['fetch', '--all', '--prune'])
  else if (action === 'pull') await git(root, ['pull', '--ff-only'])
  else await git(root, ['push', '-u', 'origin', 'HEAD'])
}
