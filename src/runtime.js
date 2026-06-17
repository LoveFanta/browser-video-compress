import { getVideoCompressConfig } from './config.js'

/**
 * 运行环境检测：WebCodecs 需 HTTPS；FFmpeg 多线程需 COOP/COEP
 */
export function getCompressRuntimeDiagnostics() {
  const hostname = globalThis.location?.hostname || ''
  const href = globalThis.location?.href || ''
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  const isSecureContext = globalThis.isSecureContext === true
  const crossOriginIsolated = globalThis.crossOriginIsolated === true
  const hasWebCodecsApi = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'

  let issue = null
  let suggestion = null

  if (!isSecureContext) {
    issue = 'insecure-context'
    suggestion = isLocalhost
      ? '当前页面不在安全上下文中，请使用 Chrome 并硬刷新后重试'
      : `当前通过「${hostname}」访问，浏览器不会启用 WebCodecs。请改用 https 或 localhost 访问`
  } else if (!hasWebCodecsApi) {
    issue = 'no-webcodecs-api'
    suggestion = '请使用 Chrome 94+ 或 Edge 94+'
  } else if (!crossOriginIsolated) {
    issue = 'not-cross-origin-isolated'
    suggestion = 'FFmpeg 多线程未启用，需在网关配置 COOP/COEP（WebCodecs 仍可用）'
  }

  const { recommendedDevUrl } = getVideoCompressConfig()

  return {
    hostname,
    href,
    isLocalhost,
    isSecureContext,
    crossOriginIsolated,
    hasWebCodecsApi,
    issue,
    suggestion,
    recommendedDevUrl: recommendedDevUrl || (isLocalhost ? href : 'http://localhost')
  }
}

export function logCompressRuntimeDiagnostics() {
  const d = getCompressRuntimeDiagnostics()
  if (d.suggestion && d.issue !== 'not-cross-origin-isolated') {
    console.warn('[browser-video-compress]', d.suggestion)
  }
  return d
}

export function getCompressRuntimeHint() {
  const d = getCompressRuntimeDiagnostics()
  if (!d.isSecureContext && !d.isLocalhost) {
    return {
      level: 'error',
      text: `压缩加速不可用：请使用 HTTPS 或 ${d.recommendedDevUrl} 访问（勿用局域网 IP）`
    }
  }
  if (!d.isSecureContext) {
    return { level: 'error', text: d.suggestion }
  }
  if (!d.hasWebCodecsApi) {
    return { level: 'warning', text: d.suggestion }
  }
  return null
}
