import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { VIDEO_COMPRESS_QUALITY } from '../constants.js'
import { prepareWebCompressOptions } from '../profile.js'
import { getVideoCompressConfig } from '../config.js'

const DECODE_QUEUE_MAX = 16
const ENCODE_QUEUE_MAX = 8
const SAMPLE_BATCH = 300
const FILE_CHUNK_BYTES = 32 * 1024 * 1024

function getAvcCodec(width, height) {
  const pixels = width * height
  if (pixels <= 921_600) return 'avc1.64001F'
  if (pixels <= 2_073_600) return 'avc1.640029'
  if (pixels <= 8_294_400) return 'avc1.640033'
  return 'avc1.640034'
}

function getTargetDimensions(width, height, maxWidth) {
  if (!width || !height) {
    return { width: maxWidth, height: Math.round(maxWidth * 9 / 16 / 2) * 2 }
  }
  if (width <= maxWidth) {
    return {
      width: width % 2 === 0 ? width : width - 1,
      height: height % 2 === 0 ? height : height - 1
    }
  }
  const targetWidth = maxWidth % 2 === 0 ? maxWidth : maxWidth - 1
  const targetHeight = Math.max(2, Math.round((height * targetWidth) / width / 2) * 2)
  return { width: targetWidth, height: targetHeight }
}

function makeAudioSpecificConfig(sampleRate, numChannels) {
  const sampleRateTable = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
  let idx = sampleRateTable.indexOf(sampleRate)
  if (idx === -1) {
    idx = sampleRateTable.reduce((best, rate, i) =>
      Math.abs(rate - sampleRate) < Math.abs(sampleRateTable[best] - sampleRate) ? i : best, 0)
  }
  const byte1 = (2 << 3) | (idx >> 1)
  const byte2 = ((idx & 1) << 7) | (numChannels << 3)
  return new Uint8Array([byte1, byte2])
}

function waitUntil(getSize, maxSize) {
  return new Promise((resolve) => {
    const tick = () => {
      if (getSize() < maxSize) resolve()
      else setTimeout(tick, 1)
    }
    tick()
  })
}

async function resizeFrame(frame, targetWidth, targetHeight) {
  if (frame.displayWidth === targetWidth && frame.displayHeight === targetHeight) {
    return frame
  }

  try {
    const scaled = new VideoFrame(frame, {
      displayWidth: targetWidth,
      displayHeight: targetHeight,
      timestamp: frame.timestamp,
      duration: frame.duration ?? undefined
    })
    frame.close()
    return scaled
  } catch {
    /* 部分浏览器不支持 VideoFrame 直接缩放 */
  }

  try {
    const bitmap = await createImageBitmap(frame, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'medium'
    })
    frame.close()
    const scaled = new VideoFrame(bitmap, {
      timestamp: frame.timestamp,
      duration: frame.duration ?? undefined
    })
    bitmap.close()
    return scaled
  } catch {
    frame.close()
    throw new Error('视频帧缩放失败')
  }
}

function calcBitrate(videoTrack, profile) {
  const resolutionRef = Math.round(profile.maxrateMbps * 1_000_000)
  const originalBps = videoTrack.bitrate || resolutionRef
  const crfFactor = 0.85 * Math.pow(2, (18 - profile.crf) / 8)
  return Math.max(
    Math.round(Math.min(originalBps, resolutionRef) * crfFactor),
    100_000
  )
}

async function feedMp4box(file, mp4boxIn, onLoadProgress) {
  const total = file.size || 1
  let offset = 0

  if (total <= FILE_CHUNK_BYTES) {
    const arrayBuffer = await file.arrayBuffer()
    onLoadProgress?.(5)
    const mp4buf = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0)
    mp4boxIn.appendBuffer(mp4buf)
    mp4boxIn.flush()
    return
  }

  for (let start = 0; start < total; start += FILE_CHUNK_BYTES) {
    const slice = file.slice(start, Math.min(start + FILE_CHUNK_BYTES, total))
    const chunk = await slice.arrayBuffer()
    const mp4buf = MP4BoxBuffer.fromArrayBuffer(chunk, offset)
    offset += chunk.byteLength
    mp4boxIn.appendBuffer(mp4buf)
    onLoadProgress?.(Math.min(5, Math.round((offset / total) * 5)))
  }
  mp4boxIn.flush()
}

export async function isWebCodecsAvailable() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    if (globalThis.isSecureContext !== true) {
      const host = globalThis.location?.hostname || ''
      const isLocal = host === 'localhost' || host === '127.0.0.1'
      const { recommendedDevUrl } = getVideoCompressConfig()
      if (!isLocal) {
        console.info(
          `[browser-video-compress] 非安全上下文（${host}），VideoEncoder 不可用。` +
          (recommendedDevUrl ? `请使用 ${recommendedDevUrl}` : '请使用 HTTPS 或 localhost')
        )
      } else {
        console.info('[browser-video-compress] 安全上下文下仍无 VideoEncoder，请使用 Chrome/Edge')
      }
    } else {
      console.info('[browser-video-compress] 当前浏览器不支持 VideoEncoder/VideoDecoder API')
    }
    return false
  }

  const encoderCandidates = [
    {
      codec: 'avc1.640029',
      width: 1920,
      height: 1080,
      bitrate: 3_000_000,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'realtime'
    },
    {
      codec: 'avc1.640029',
      width: 1920,
      height: 1080,
      bitrate: 3_000_000,
      latencyMode: 'realtime'
    },
    {
      codec: 'avc1.42E01E',
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      latencyMode: 'realtime'
    }
  ]

  try {
    for (const config of encoderCandidates) {
      const result = await VideoEncoder.isConfigSupported(config)
      if (result.supported) {
        return true
      }
    }
    console.warn('[browser-video-compress] 未找到可用的 H.264 编码配置')
    return false
  } catch (err) {
    console.warn('[browser-video-compress] 能力检测失败', err)
    return false
  }
}

/**
 * WebCodecs 硬件加速压缩（GPU 解码/编码 + 异步流水线）
 */
export async function compressVideoFileWithWebCodecs(file, options = {}) {
  if (!file) throw new Error('请选择视频文件')
  if (!(file.type === 'video/mp4' || /\.mp4$/i.test(file.name || ''))) {
    throw new Error('WebCodecs 压缩仅支持 MP4 格式')
  }

  const profile = options.params || await prepareWebCompressOptions(
    file,
    options.quality || VIDEO_COMPRESS_QUALITY.MEDIUM
  )
  const onProgress = options.onProgress

  return new Promise((resolve, reject) => {
    const mp4boxIn = createFile()
    let aborted = false

    let videoTrackId = -1
    let audioTrackId = -1
    let totalSamples = 0
    let samplesSubmitted = 0
    let framesEncoded = 0
    let videoAllSubmitted = false
    let audioAllDone = true
    let audioTotalSamples = 0
    let audioSamplesAdded = 0
    let finalizing = false

    let decoder
    let encoder
    let muxer
    let encoderFrameCount = 0
    let encoderDtsBase = -1
    let targetWidth = 0
    let targetHeight = 0
    let avgFrameDurationUs = 33_333
    let framePipeline = Promise.resolve()
    let sampleFeedPromise = Promise.resolve()
    let tryFinalize = () => {}

    const fail = (err) => {
      if (aborted) return
      aborted = true
      try { decoder?.close() } catch { /* ignore */ }
      try { encoder?.close() } catch { /* ignore */ }
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    const updateProgress = (encodedCount) => {
      if (totalSamples > 0) {
        onProgress?.(Math.min(99, 5 + Math.round((encodedCount / totalSamples) * 94)))
      }
    }

    const enqueueFrame = (frame, isKeyFrame) => {
      framePipeline = framePipeline.then(async () => {
        if (aborted || encoder?.state === 'closed') {
          frame.close()
          return
        }
        await waitUntil(() => encoder.encodeQueueSize, ENCODE_QUEUE_MAX)
        const scaled = await resizeFrame(frame, targetWidth, targetHeight)
        encoder.encode(scaled, { keyFrame: isKeyFrame })
        scaled.close()
      }).catch(fail)
    }

    const feedVideoSamples = async (samples) => {
      for (const sample of samples) {
        if (aborted || !sample.data) continue
        await waitUntil(() => decoder.decodeQueueSize, DECODE_QUEUE_MAX)
        decoder.decode(new EncodedVideoChunk({
          type: sample.is_sync ? 'key' : 'delta',
          timestamp: (sample.cts / sample.timescale) * 1_000_000,
          duration: (sample.duration / sample.timescale) * 1_000_000,
          data: sample.data
        }))
        samplesSubmitted += 1
      }
      if (!videoAllSubmitted && samplesSubmitted >= totalSamples) {
        videoAllSubmitted = true
        tryFinalize()
      }
    }

    mp4boxIn.onReady = (info) => {
      const videoTrack = info.videoTracks?.[0]
      if (!videoTrack?.video) {
        fail(new Error('无法读取视频轨道'))
        return
      }

      videoTrackId = videoTrack.id
      const { width: originalWidth, height: originalHeight } = videoTrack.video
      totalSamples = videoTrack.nb_samples
      const frameRate = videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale)
      avgFrameDurationUs = Math.round(1_000_000 / frameRate)

      const target = getTargetDimensions(originalWidth, originalHeight, profile.maxWidth)
      targetWidth = target.width
      targetHeight = target.height
      const bitrate = calcBitrate(videoTrack, profile)
      const codec = getAvcCodec(targetWidth, targetHeight)

      const audioTrack = info.audioTracks?.[0]
      const includeAudio = Boolean(audioTrack?.audio)

      if (includeAudio && audioTrack) {
        audioTrackId = audioTrack.id
        audioTotalSamples = audioTrack.nb_samples
        audioAllDone = false
      }

      const muxerOptions = {
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: targetWidth, height: targetHeight },
        fastStart: 'fragmented',
        firstTimestampBehavior: 'offset'
      }
      if (includeAudio && audioTrack?.audio) {
        muxerOptions.audio = {
          codec: 'aac',
          numberOfChannels: audioTrack.audio.channel_count,
          sampleRate: audioTrack.audio.sample_rate
        }
      }
      muxer = new Muxer(muxerOptions)

      const finalize = async () => {
        try {
          await framePipeline
          await decoder.flush()
          decoder.close()
          await encoder.flush()
          encoder.close()
          muxer.finalize()
          const outputBuffer = muxer.target.buffer
          onProgress?.(100)
          const baseName = (file.name || 'video').replace(/\.[^.]+$/, '')
          resolve(new File([outputBuffer], `${baseName}_compressed.mp4`, { type: 'video/mp4' }))
        } catch (err) {
          fail(err)
        }
      }

      tryFinalize = () => {
        if (videoAllSubmitted && audioAllDone && !finalizing) {
          finalizing = true
          finalize().catch(fail)
        }
      }

      encoder = new VideoEncoder({
        output: (chunk, metadata) => {
          if (encoder.state === 'closed') return
          if (encoderDtsBase < 0) encoderDtsBase = chunk.timestamp
          const dts = encoderDtsBase + encoderFrameCount * avgFrameDurationUs
          muxer.addVideoChunk(chunk, metadata, chunk.timestamp, chunk.timestamp - dts)
          encoderFrameCount += 1
          framesEncoded += 1
          updateProgress(framesEncoded)
        },
        error: (e) => fail(e)
      })

      encoder.configure({
        codec,
        width: targetWidth,
        height: targetHeight,
        framerate: frameRate,
        bitrate,
        bitrateMode: 'variable',
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime'
      })

      let decoderDescription
      try {
        const trak = mp4boxIn.getTrackById(videoTrackId)
        const stsd = trak?.mdia?.minf?.stbl?.stsd
        if (stsd?.entries?.[0]?.avcC) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
          stsd.entries[0].avcC.write(stream)
          decoderDescription = new Uint8Array(stream.buffer, 8)
        }
      } catch {
        /* optional */
      }

      decoder = new VideoDecoder({
        output: (frame) => {
          if (aborted || encoder.state === 'closed') {
            frame.close()
            return
          }
          enqueueFrame(frame, false)
        },
        error: (e) => fail(e)
      })

      decoder.configure({
        codec: videoTrack.codec,
        codedWidth: originalWidth,
        codedHeight: originalHeight,
        description: decoderDescription,
        hardwareAcceleration: 'prefer-hardware'
      })

      const audioDescription = includeAudio && audioTrack?.audio
        ? makeAudioSpecificConfig(audioTrack.audio.sample_rate, audioTrack.audio.channel_count)
        : undefined

      mp4boxIn.setExtractionOptions(videoTrackId, null, { nbSamples: SAMPLE_BATCH })
      if (includeAudio && audioTrack) {
        mp4boxIn.setExtractionOptions(audioTrackId, null, { nbSamples: SAMPLE_BATCH })
      }
      mp4boxIn.start()

      mp4boxIn.onSamples = (id, _user, samples) => {
        if (id === videoTrackId) {
          sampleFeedPromise = sampleFeedPromise
            .then(() => feedVideoSamples(samples))
            .catch(fail)
        } else if (id === audioTrackId && includeAudio && audioTrack?.audio) {
          for (const sample of samples) {
            if (!sample.data) continue
            const isFirst = audioSamplesAdded === 0
            const chunk = new EncodedAudioChunk({
              type: 'key',
              timestamp: (sample.cts / sample.timescale) * 1_000_000,
              duration: (sample.duration / sample.timescale) * 1_000_000,
              data: sample.data
            })
            const meta = isFirst && audioDescription
              ? {
                decoderConfig: {
                  codec: 'mp4a.40.2',
                  sampleRate: audioTrack.audio.sample_rate,
                  numberOfChannels: audioTrack.audio.channel_count,
                  description: audioDescription
                }
              }
              : undefined
            muxer.addAudioChunk(chunk, meta)
            audioSamplesAdded += 1
          }
          if (!audioAllDone && audioSamplesAdded >= audioTotalSamples) {
            audioAllDone = true
            tryFinalize()
          }
        }
      }
    }

    mp4boxIn.onError = (e) => fail(new Error(String(e)))

    feedMp4box(file, mp4boxIn, onProgress).catch(fail)
  })
}
