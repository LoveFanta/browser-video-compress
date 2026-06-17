/**
 * 浏览器端视频压缩
 *
 * @example
 * import { compressVideoFile, configureVideoCompress } from 'browser-video-compress'
 */

export {
  configureVideoCompress,
  getVideoCompressConfig,
  resolveFfmpegAssetUrl
} from './config.js'

export {
  VIDEO_COMPRESS_LIMIT_BYTES,
  WEB_COMPRESS_TARGET_BYTES,
  VIDEO_COMPRESS_QUALITY,
  COMPRESS_ENGINE,
  formatVideoSize,
  isLargeVideo
} from './constants.js'

export { prepareWebCompressOptions, getVideoInfoFromFile, buildWebCompressProfile } from './profile.js'

export {
  getCompressRuntimeHint,
  getCompressRuntimeDiagnostics,
  logCompressRuntimeDiagnostics
} from './runtime.js'

export { createCompressEtaTracker, formatCompressEta } from './eta.js'

export {
  compressVideoFile,
  compressVideoUntilUnderLimit,
  preloadCompressEngine,
  getCompressEngineLabel,
  getLastUsedCompressEngine,
  checkWebCodecsSupported,
  loadFFmpegCore,
  terminateFFmpeg,
  getLoadedFFmpegMode,
  isMultiThreadCompressSupported,
  isWebCodecsAvailable
} from './service.js'
