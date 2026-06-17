export function formatCompressEta(seconds) {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return ''
  const s = Math.ceil(seconds)
  if (s < 60) return `约 ${s} 秒`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (rs === 0) return `约 ${m} 分钟`
  return `约 ${m} 分 ${rs} 秒`
}

const SMOOTH_OLD_WEIGHT = 0.92
const MIN_PROGRESS_FOR_ETA = 8
const MIN_ELAPSED_SEC = 4
const DISPLAY_INTERVAL_MS = 3000
const MIN_DISPLAY_DELTA_SEC = 12

export function createCompressEtaTracker() {
  let startAt = 0
  let smoothedRemaining = 0
  let lastShownSeconds = 0
  let lastShowAt = 0
  let lastShownText = ''

  return {
    start() {
      startAt = performance.now()
      smoothedRemaining = 0
      lastShownSeconds = 0
      lastShowAt = 0
      lastShownText = ''
    },
    update(progress) {
      if (!startAt) return ''

      const elapsed = (performance.now() - startAt) / 1000
      if (progress < MIN_PROGRESS_FOR_ETA || elapsed < MIN_ELAPSED_SEC) {
        return lastShownText || '正在估算…'
      }

      const raw = elapsed * (100 - progress) / progress
      smoothedRemaining = smoothedRemaining
        ? smoothedRemaining * SMOOTH_OLD_WEIGHT + raw * (1 - SMOOTH_OLD_WEIGHT)
        : raw

      const now = performance.now()
      const delta = Math.abs(smoothedRemaining - lastShownSeconds)
      const shouldRefresh =
        !lastShownText ||
        now - lastShowAt >= DISPLAY_INTERVAL_MS ||
        delta >= MIN_DISPLAY_DELTA_SEC

      if (shouldRefresh) {
        lastShownSeconds = smoothedRemaining
        lastShowAt = now
        lastShownText = formatCompressEta(smoothedRemaining)
      }

      return lastShownText
    },
    reset() {
      startAt = 0
      smoothedRemaining = 0
      lastShownSeconds = 0
      lastShowAt = 0
      lastShownText = ''
    }
  }
}
