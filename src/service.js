import {
  VIDEO_COMPRESS_LIMIT_BYTES,
  VIDEO_COMPRESS_QUALITY,
  COMPRESS_ENGINE,
  formatVideoSize
} from './constants.js'
import { logCompressRuntimeDiagnostics } from './runtime.js'
import { compressVideoFileWithWebCodecs, isWebCodecsAvailable } from './engines/webcodecs.js'
import {
  compressVideoFile as compressWithFfmpeg,
  loadFFmpegCore,
  terminateFFmpeg,
  getLoadedFFmpegMode,
  isMultiThreadCompressSupported
} from './engines/ffmpeg.js'

let lastUsedEngine = null
let webCodecsSupported = null

export function getLastUsedCompressEngine() {
  return lastUsedEngine
}

export async function checkWebCodecsSupported() {
  if (webCodecsSupported === null) {
    webCodecsSupported = await isWebCodecsAvailable()
  }
  return webCodecsSupported
}

export async function getCompressEngineLabel() {
  if (await checkWebCodecsSupported()) {
    return '硬件加速（WebCodecs）'
  }
  if (isMultiThreadCompressSupported()) {
    return '多线程加速（FFmpeg）'
  }
  return '单线程模式（FFmpeg）'
}

export async function preloadCompressEngine() {
  const runtime = logCompressRuntimeDiagnostics()

  if (await checkWebCodecsSupported()) {
    return COMPRESS_ENGINE.WEBCODECS
  }
  await loadFFmpegCore()
  const mode = getLoadedFFmpegMode() === 'mt' ? COMPRESS_ENGINE.FFMPEG_MT : COMPRESS_ENGINE.FFMPEG_ST
  if (mode === COMPRESS_ENGINE.FFMPEG_ST && runtime.issue === 'insecure-context' && !runtime.isLocalhost) {
    console.warn(`[browser-video-compress] 当前为单线程 FFmpeg。快速压缩请使用 HTTPS 或 ${runtime.recommendedDevUrl}`)
  }
  return mode
}

export async function compressVideoFile(file, options = {}) {
  if (await checkWebCodecsSupported()) {
    try {
      const output = await compressVideoFileWithWebCodecs(file, options)
      lastUsedEngine = COMPRESS_ENGINE.WEBCODECS
      return output
    } catch (err) {
      console.warn('[browser-video-compress] WebCodecs 失败，回退 FFmpeg', err)
    }
  }

  const output = await compressWithFfmpeg(file, options)
  lastUsedEngine = getLoadedFFmpegMode() === 'mt'
    ? COMPRESS_ENGINE.FFMPEG_MT
    : COMPRESS_ENGINE.FFMPEG_ST
  return output
}

export async function compressVideoUntilUnderLimit(file, options = {}) {
  const maxBytes = options.maxBytes ?? VIDEO_COMPRESS_LIMIT_BYTES
  const maxAttempts = options.maxAttempts ?? 2

  if (file.size < maxBytes) {
    return file
  }

  const qualities = [VIDEO_COMPRESS_QUALITY.MEDIUM, VIDEO_COMPRESS_QUALITY.LOW]
  let currentFile = file
  let lastFile = file

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const quality = qualities[Math.min(attempt, qualities.length - 1)]
    const compressed = await compressVideoFile(currentFile, {
      quality,
      onProgress: options.onProgress
    })
    lastFile = compressed
    options.onAttemptComplete?.({
      attempt: attempt + 1,
      quality,
      size: compressed.size,
      engine: getLastUsedCompressEngine()
    })

    if (compressed.size < maxBytes) {
      return compressed
    }
    if (compressed.size >= currentFile.size * 0.98) {
      break
    }
    currentFile = compressed
  }

  if (lastFile.size >= maxBytes) {
    throw new Error(`压缩后仍为 ${formatVideoSize(lastFile.size)}，请继续压缩或重新选择视频`)
  }
  return lastFile
}

export {
  loadFFmpegCore,
  terminateFFmpeg,
  getLoadedFFmpegMode,
  isMultiThreadCompressSupported,
  isWebCodecsAvailable
}
