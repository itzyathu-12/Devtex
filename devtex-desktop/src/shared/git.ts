export interface GitFileChange {
  path: string
  originalPath?: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  status: string
}
export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
}
export interface GitRepositoryState {
  root: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
  changes: GitFileChange[]
  branches: string[]
  commits: GitCommit[]
  remotes: Array<{ name: string; url: string }>
}
export interface GitDiffResult {
  path: string
  staged: boolean
  diff: string
}
