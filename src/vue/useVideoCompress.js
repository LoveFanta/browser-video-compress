import { computed, onBeforeUnmount, ref } from 'vue'
import {
  VIDEO_COMPRESS_LIMIT_BYTES,
  VIDEO_COMPRESS_QUALITY,
  formatVideoSize,
  isLargeVideo
} from '../constants.js'
import {
  compressVideoFile,
  compressVideoUntilUnderLimit,
  preloadCompressEngine,
  terminateFFmpeg,
  getLastUsedCompressEngine,
  getCompressEngineLabel
} from '../service.js'
import { prepareWebCompressOptions } from '../profile.js'
import { createCompressEtaTracker } from '../eta.js'

export function useVideoCompress(options = {}) {
  const maxBytes = options.maxBytes ?? VIDEO_COMPRESS_LIMIT_BYTES
  const autoTerminateOnUnmount = options.autoTerminateOnUnmount ?? false

  const isLoading = ref(false)
  const isCompressing = ref(false)
  const progress = ref(0)
  const compressEtaText = ref('')
  const error = ref(null)
  const etaTracker = createCompressEtaTracker()

  const sourceFile = ref(null)
  const resultFile = ref(null)
  const originalSizeBytes = ref(0)
  const compressedSizeBytes = ref(0)
  const videoCompressed = ref(false)
  const compressCount = ref(0)

  const isReady = computed(() => !isLoading.value)
  const needCompress = computed(() => isLargeVideo(originalSizeBytes.value))
  const originalSizeText = computed(() => formatVideoSize(originalSizeBytes.value))
  const compressedSizeText = computed(() => formatVideoSize(compressedSizeBytes.value))
  const currentSizeBytes = computed(() => compressedSizeBytes.value || originalSizeBytes.value)
  const stillTooLarge = computed(() => isLargeVideo(currentSizeBytes.value))

  const reset = () => {
    isCompressing.value = false
    progress.value = 0
    compressEtaText.value = ''
    etaTracker.reset()
    error.value = null
    sourceFile.value = null
    resultFile.value = null
    originalSizeBytes.value = 0
    compressedSizeBytes.value = 0
    videoCompressed.value = false
    compressCount.value = 0
  }

  const setSourceFile = async (file) => {
    error.value = null
    resultFile.value = null
    compressedSizeBytes.value = 0
    videoCompressed.value = false
    compressCount.value = 0

    if (!file) {
      sourceFile.value = null
      originalSizeBytes.value = 0
      return null
    }

    sourceFile.value = file
    originalSizeBytes.value = file.size

    if (needCompress.value || options.preloadEngine || options.preloadFFmpeg) {
      await ensureEngineReady()
    }
    return file
  }

  const ensureEngineReady = async () => {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      await preloadCompressEngine()
    } catch (err) {
      error.value = err?.message || '压缩组件加载失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const compress = async (quality = VIDEO_COMPRESS_QUALITY.MEDIUM) => {
    const inputFile = resultFile.value || sourceFile.value
    if (!inputFile) {
      const msg = '请先选择视频'
      error.value = msg
      throw new Error(msg)
    }

    await ensureEngineReady()
    isCompressing.value = true
    progress.value = 0
    compressEtaText.value = ''
    etaTracker.start()
    error.value = null

    try {
      const output = await compressVideoFile(inputFile, {
        quality,
        onProgress: (value) => {
          progress.value = value
          compressEtaText.value = etaTracker.update(value) || '正在估算…'
        }
      })
      resultFile.value = output
      compressedSizeBytes.value = output.size
      videoCompressed.value = true
      compressCount.value += 1
      return output
    } catch (err) {
      error.value = err?.message || '压缩失败'
      throw err
    } finally {
      isCompressing.value = false
      progress.value = 0
      compressEtaText.value = ''
      etaTracker.reset()
    }
  }

  const compressUntilReady = async () => {
    const inputFile = sourceFile.value
    if (!inputFile) {
      const msg = '请先选择视频'
      error.value = msg
      throw new Error(msg)
    }
    if (!needCompress.value && !resultFile.value) {
      return inputFile
    }

    await ensureEngineReady()
    isCompressing.value = true
    progress.value = 0
    compressEtaText.value = ''
    etaTracker.start()
    error.value = null

    try {
      const startFile = resultFile.value || inputFile
      const output = await compressVideoUntilUnderLimit(startFile, {
        maxBytes,
        onProgress: (value) => {
          progress.value = value
          compressEtaText.value = etaTracker.update(value) || '正在估算…'
        },
        onAttemptComplete: () => {
          compressCount.value += 1
        }
      })
      resultFile.value = output
      compressedSizeBytes.value = output.size
      videoCompressed.value = true
      return output
    } catch (err) {
      error.value = err?.message || '压缩失败'
      throw err
    } finally {
      isCompressing.value = false
      progress.value = 0
      compressEtaText.value = ''
      etaTracker.reset()
    }
  }

  const getPreparedParams = async (quality = VIDEO_COMPRESS_QUALITY.MEDIUM) => {
    const file = resultFile.value || sourceFile.value
    if (!file) return null
    return prepareWebCompressOptions(file, quality)
  }

  onBeforeUnmount(() => {
    if (autoTerminateOnUnmount) {
      terminateFFmpeg()
    }
  })

  return {
    maxBytes,
    isLoading,
    isCompressing,
    isReady,
    progress,
    compressEtaText,
    error,
    sourceFile,
    resultFile,
    originalSizeBytes,
    compressedSizeBytes,
    originalSizeText,
    compressedSizeText,
    currentSizeBytes,
    needCompress,
    stillTooLarge,
    videoCompressed,
    compressCount,
    reset,
    setSourceFile,
    ensureEngineReady,
    compress,
    compressUntilReady,
    getPreparedParams,
    formatVideoSize,
    isLargeVideo,
    getLastUsedCompressEngine,
    getCompressEngineLabel,
    terminateFFmpeg
  }
}

export default useVideoCompress
