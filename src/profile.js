import { VIDEO_COMPRESS_QUALITY } from './constants.js'

export function getVideoInfoFromFile(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const url = URL.createObjectURL(file)
    video.onloadedmetadata = () => {
      const duration = Number(video.duration) || 1
      const estimatedBitrate = Math.round((file.size * 8) / duration / 1000)
      URL.revokeObjectURL(url)
      resolve({
        width: video.videoWidth || 0,
        height: video.videoHeight || 720,
        duration,
        bitrate: estimatedBitrate || 2500
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取视频信息'))
    }
    video.src = url
  })
}

export function buildWebCompressProfile(videoInfo, fileSizeBytes, quality = VIDEO_COMPRESS_QUALITY.MEDIUM) {
  const height = videoInfo.height || 720
  const sizeMb = fileSizeBytes / 1024 / 1024

  if (quality === VIDEO_COMPRESS_QUALITY.LOW) {
    return { crf: 28, maxWidth: height > 720 ? 1280 : Math.min(1280, videoInfo.width || 1280), maxrateMbps: 2, preset: 'veryfast' }
  }
  if (quality === VIDEO_COMPRESS_QUALITY.HIGH) {
    return { crf: 22, maxWidth: height > 1080 ? 1920 : Math.max(720, videoInfo.width || 1920), maxrateMbps: 5, preset: 'veryfast' }
  }
  if (sizeMb >= 500) {
    return { crf: 24, maxWidth: 1920, maxrateMbps: 2.5, preset: 'ultrafast' }
  }
  if (sizeMb >= 200) {
    return { crf: 23, maxWidth: 1920, maxrateMbps: 3, preset: 'ultrafast' }
  }
  if (sizeMb >= 120) {
    return { crf: 23, maxWidth: 1920, maxrateMbps: 3.5, preset: 'ultrafast' }
  }
  return { crf: 22, maxWidth: 1920, maxrateMbps: 4.5, preset: 'veryfast' }
}

function getWebCompressFallbackProfile(quality = VIDEO_COMPRESS_QUALITY.MEDIUM) {
  if (quality === VIDEO_COMPRESS_QUALITY.LOW) {
    return { crf: 28, maxWidth: 1280, maxrateMbps: 2, preset: 'veryfast' }
  }
  if (quality === VIDEO_COMPRESS_QUALITY.HIGH) {
    return { crf: 22, maxWidth: 1920, maxrateMbps: 5, preset: 'veryfast' }
  }
  return { crf: 24, maxWidth: 1280, maxrateMbps: 3, preset: 'veryfast' }
}

export async function prepareWebCompressOptions(file, quality = VIDEO_COMPRESS_QUALITY.MEDIUM) {
  try {
    const videoInfo = await getVideoInfoFromFile(file)
    return buildWebCompressProfile(videoInfo, file.size, quality)
  } catch {
    return getWebCompressFallbackProfile(quality)
  }
}
