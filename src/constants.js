/** 超过该大小建议压缩（默认 120MB） */
export const VIDEO_COMPRESS_LIMIT_BYTES = 120 * 1024 * 1024

/** Web 端首选输出体积 */
export const WEB_COMPRESS_TARGET_BYTES = 45 * 1024 * 1024

export const VIDEO_COMPRESS_QUALITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
}

export const COMPRESS_ENGINE = {
  WEBCODECS: 'webcodecs',
  FFMPEG_MT: 'ffmpeg-mt',
  FFMPEG_ST: 'ffmpeg-st'
}

export function formatVideoSize(bytes) {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) {
    return (bytes / 1024 / 1024).toFixed(2) + 'MB'
  }
  return (bytes / 1024).toFixed(2) + 'KB'
}

export function isLargeVideo(fileSizeBytes) {
  return (fileSizeBytes || 0) >= VIDEO_COMPRESS_LIMIT_BYTES
}
