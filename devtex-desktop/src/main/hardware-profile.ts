import os from 'node:os'
import { app } from 'electron'
import type { HardwareProfile } from '../shared/settings'

/** Lightweight local hardware snapshot; this is not a performance benchmark. */
export function getHardwareProfile(): HardwareProfile {
  const cpu = os.cpus()
  const totalMemoryBytes = os.totalmem()
  const freeMemoryBytes = os.freemem()
  const memory = process.memoryUsage()

  return {
    collectedAt: new Date().toISOString(),
    operatingSystem: { platform: process.platform, release: os.release(), architecture: process.arch },
    cpu: { model: cpu[0]?.model ?? 'Unknown CPU', logicalCores: cpu.length },
    memory: {
      totalBytes: totalMemoryBytes,
      freeBytes: freeMemoryBytes,
      usedBytes: Math.max(0, totalMemoryBytes - freeMemoryBytes)
    },
    appProcess: {
      residentSetBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      uptimeSeconds: process.uptime()
    },
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      appVersion: app.getVersion()
    }
  }
}

/** Adjusts background workload only; it never disables product features. */
export function getAdaptiveResourcePolicy(profile: HardwareProfile) {
  const totalGiB = profile.memory.totalBytes / 1024 ** 3
  const freeRatio = profile.memory.freeBytes / Math.max(1, profile.memory.totalBytes)

  if (totalGiB < 4 || freeRatio < 0.12) {
    return {
      tier: 'conserve' as const,
      backgroundConcurrency: 1,
      indexingBatchSize: 20,
      pauseNonessentialBackgroundWork: true,
      featureAvailability: 'full' as const
    }
  }

  if (totalGiB < 8 || freeRatio < 0.22 || profile.cpu.logicalCores < 4) {
    return {
      tier: 'balanced' as const,
      backgroundConcurrency: 2,
      indexingBatchSize: 60,
      pauseNonessentialBackgroundWork: false,
      featureAvailability: 'full' as const
    }
  }

  return {
    tier: 'performance' as const,
    backgroundConcurrency: Math.max(2, Math.min(6, profile.cpu.logicalCores - 1)),
    indexingBatchSize: 150,
    pauseNonessentialBackgroundWork: false,
    featureAvailability: 'full' as const
  }
}
