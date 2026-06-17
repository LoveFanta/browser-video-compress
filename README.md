# browser-video-compress

浏览器端 MP4 视频压缩：优先 WebCodecs 硬件加速，不可用时回退 FFmpeg.wasm。

## 安装

```bash
npm install browser-video-compress
# 或本地路径
npm install ../learn/browser-video-compress
```

安装后会自动将 FFmpeg wasm 复制到包内 `assets/ffmpeg/`。

业务项目还需把 wasm 部署到可访问的静态目录：

```bash
npx browser-video-compress-copy-ffmpeg ./public/ffmpeg
```

## 快速使用

```javascript
import {
  configureVideoCompress,
  compressVideoFile,
  VIDEO_COMPRESS_QUALITY
} from 'browser-video-compress'

// 若静态资源不在站点根路径 /ffmpeg/，先配置
configureVideoCompress({
  ffmpegAssetBase: '/my-app/ffmpeg/',       // 对应 public/ffmpeg
  recommendedDevUrl: 'http://localhost:5173' // 可选，用于错误提示
})

const input = document.querySelector('input[type=file]').files[0]
const output = await compressVideoFile(input, {
  quality: VIDEO_COMPRESS_QUALITY.MEDIUM,
  onProgress: (percent) => console.log(percent)
})
```

## Vue 组合式 API

```javascript
import { useVideoCompress } from 'browser-video-compress/vue'

const {
  setSourceFile,
  compress,
  progress,
  compressEtaText,
  needCompress
} = useVideoCompress()
```

## 环境要求

| 能力 | 条件 |
|------|------|
| WebCodecs | HTTPS 或 localhost |
| FFmpeg 多线程 | 页面 `crossOriginIsolated: true`（需 COOP/COEP 响应头） |
| FFmpeg 降级 | 部署 `public/ffmpeg/mt` 与 `public/ffmpeg/st` |

开发时勿通过局域网 IP（如 `http://192.168.x.x`）访问，否则 WebCodecs 不可用。

## 发布到 npm

```bash
cd browser-video-compress
npm publish
```

## License

MIT
