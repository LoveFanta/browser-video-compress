const defaults = {
  /** FFmpeg wasm 静态资源根路径，需包含 mt/ 与 st/ 子目录 */
  ffmpegAssetBase: '/ffmpeg/',
  /** 开发环境推荐访问地址，用于错误提示文案 */
  recommendedDevUrl: null
}

let options = { ...defaults }

export function configureVideoCompress(patch = {}) {
  options = { ...options, ...patch }
}

export function getVideoCompressConfig() {
  return { ...options }
}

export function resolveFfmpegAssetUrl(relativePath) {
  const base = options.ffmpegAssetBase || '/ffmpeg/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const assetPath = `${normalizedBase}${relativePath}`.replace(/\/{2,}/g, '/')

  if (typeof globalThis.location !== 'undefined') {
    return new URL(assetPath, globalThis.location.origin).href
  }
  return assetPath
}
