export interface GitHubRepository {
  id: number
  fullName: string
  description: string | null
  visibility: 'public' | 'private'
  defaultBranch: string
  url: string
  language: string | null
  updatedAt: string | null
}

export interface GitHubConnectionStatus {
  connected: boolean
  connecting: boolean
  username?: string
  message?: string
}

export interface GitHubRepositoryResult extends GitHubConnectionStatus {
  repositories: GitHubRepository[]
}

export interface GitHubProfile {
  username: string
  displayName: string | null
  avatarUrl: string
  profileUrl: string
  bio: string | null
  publicRepos: number
  followers: number
}
