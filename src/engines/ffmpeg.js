import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { VIDEO_COMPRESS_QUALITY } from '../constants.js'
import { prepareWebCompressOptions } from '../profile.js'
import { resolveFfmpegAssetUrl } from '../config.js'

const FFMPEG_MODE = {
  MT: 'mt',
  ST: 'st'
}

let ffmpegInstance = null
let loadPromise = null
let loadedMode = null

/** 是否具备多线程压缩环境（需页面 COOP/COEP） */
export function isMultiThreadCompressSupported() {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true
}

export function getLoadedFFmpegMode() {
  return loadedMode
}

function getEncoderThreadCount() {
  const cores = navigator.hardwareConcurrency || 4
  if (loadedMode === FFMPEG_MODE.MT) {
    return Math.min(8, Math.max(4, cores))
  }
  return Math.min(4, Math.max(2, Math.floor(cores / 2)))
}

function getInputExtension(file) {
  const name = file?.name || ''
  const match = name.match(/\.(\w+)$/)
  return match ? match[1].toLowerCase() : 'mp4'
}

function buildWebFfmpegArgs(inputName, outputName, profile) {
  const threads = getEncoderThreadCount()
  const { crf, maxWidth, maxrateMbps, preset = 'ultrafast', audioMode } = profile
  const maxrate = Math.round(maxrateMbps * 1000)
  const args = [
    '-threads', String(threads),
    '-i', inputName,
    '-vf', `scale='min(${maxWidth},iw)':-2:flags=bilinear`,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-maxrate', `${maxrate}k`,
    '-bufsize', `${maxrate * 2}k`,
    '-preset', preset,
    '-movflags', '+faststart'
  ]

  if (audioMode === 'aac') {
    args.push('-c:a', 'aac', '-b:a', '128k')
  } else {
    args.push('-c:a', 'copy')
  }

  args.push('-y', outputName)
  return args
}

function attachProgress(ffmpeg, onProgress) {
  if (typeof onProgress !== 'function') return () => {}
  const handler = ({ progress }) => {
    const value = Math.min(100, Math.max(0, Math.round((progress || 0) * 100)))
    onProgress(value)
  }
  ffmpeg.on('progress', handler)
  return () => ffmpeg.off('progress', handler)
}

async function loadCoreAssets(subdir, withWorker = false) {
  const prefix = `${subdir}`
  const coreURL = await toBlobURL(
    resolveFfmpegAssetUrl(`${prefix}/ffmpeg-core.js`),
    'text/javascript'
  )
  const wasmURL = await toBlobURL(
    resolveFfmpegAssetUrl(`${prefix}/ffmpeg-core.wasm`),
    'application/wasm'
  )
  if (!withWorker) {
    return { coreURL, wasmURL }
  }
  const workerURL = await toBlobURL(
    resolveFfmpegAssetUrl(`${prefix}/ffmpeg-core.worker.js`),
    'text/javascript'
  )
  return { coreURL, wasmURL, workerURL }
}

async function loadMultiThreadCore(ffmpeg) {
  const assets = await loadCoreAssets('mt', true)
  await ffmpeg.load(assets)
  loadedMode = FFMPEG_MODE.MT
}

async function loadSingleThreadCore(ffmpeg) {
  const assets = await loadCoreAssets('st', false)
  await ffmpeg.load(assets)
  loadedMode = FFMPEG_MODE.ST
}

/**
 * 懒加载 FFmpeg wasm（单例）
 */
export async function loadFFmpegCore(onLoadState) {
  if (ffmpegInstance?.loaded) {
    onLoadState?.(true)
    return ffmpegInstance
  }
  if (loadPromise) {
    return loadPromise
  }

  onLoadState?.(false)
  const ffmpeg = new FFmpeg()
  loadPromise = (async () => {
    if (isMultiThreadCompressSupported()) {
      try {
        await loadMultiThreadCore(ffmpeg)
      } catch (err) {
        console.warn('[browser-video-compress] 多线程加载失败，回退单线程', err)
        await loadSingleThreadCore(ffmpeg)
      }
    } else {
      console.warn(
        '[browser-video-compress] 当前页面未开启 crossOriginIsolated，使用单线程压缩。' +
        '生产环境需在网关配置 COOP/COEP 以启用多线程加速。'
      )
      await loadSingleThreadCore(ffmpeg)
    }
    ffmpegInstance = ffmpeg
    onLoadState?.(true)
    return ffmpeg
  })().catch((err) => {
    loadPromise = null
    ffmpegInstance = null
    loadedMode = null
    onLoadState?.(false)
    throw err
  })

  return loadPromise
}

export function getFFmpegInstance() {
  return ffmpegInstance
}

async function runCompress(ffmpeg, file, profile, options) {
  const inputExt = getInputExtension(file)
  const inputName = `input.${inputExt}`
  const outputName = 'output.mp4'

  const detachProgress = attachProgress(ffmpeg, options.onProgress)
  const logHandler = ({ message }) => options.onLog?.(message)
  if (typeof options.onLog === 'function') {
    ffmpeg.on('log', logHandler)
  }

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    try {
      await ffmpeg.exec(buildWebFfmpegArgs(inputName, outputName, profile))
    } catch (err) {
      if (profile.audioMode !== 'aac') {
        await ffmpeg.exec(buildWebFfmpegArgs(inputName, outputName, { ...profile, audioMode: 'aac' }))
      } else {
        throw err
      }
    }

    const data = await ffmpeg.readFile(outputName)
    const blob = new Blob([data.buffer], { type: 'video/mp4' })
    const baseName = (file.name || 'video').replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}_compressed.mp4`, { type: 'video/mp4' })
  } finally {
    detachProgress()
    if (typeof options.onLog === 'function') {
      ffmpeg.off('log', logHandler)
    }
    try { await ffmpeg.deleteFile(inputName) } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName) } catch { /* ignore */ }
    options.onProgress?.(0)
  }
}

/**
 * 使用 FFmpeg.wasm 压缩视频（Web CRF 策略）
 */
export async function compressVideoFile(file, options = {}) {
  if (!file) {
    throw new Error('请选择视频文件')
  }
  if (!(file.type === 'video/mp4' || getInputExtension(file) === 'mp4')) {
    throw new Error('仅支持 MP4 格式视频')
  }

  const ffmpeg = await loadFFmpegCore()
  const profile = options.params || await prepareWebCompressOptions(
    file,
    options.quality || VIDEO_COMPRESS_QUALITY.MEDIUM
  )

  return runCompress(ffmpeg, file, profile, options)
}

export async function terminateFFmpeg() {
  if (ffmpegInstance) {
    try {
      await ffmpegInstance.terminate()
    } catch {
      /* ignore */
    }
  }
  ffmpegInstance = null
  loadPromise = null
  loadedMode = null
}
