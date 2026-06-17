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

### 前置条件

1. 注册 [npm 账号](https://www.npmjs.com/signup)
2. 本机已安装 Node.js 18+
3. 包名 `browser-video-compress` 在 npm 上未被占用（首次发布前可在 [npmjs.com](https://www.npmjs.com/package/browser-video-compress) 搜索确认）

### 1. 登录 npm

```bash
npm login
```

按提示输入用户名、密码、邮箱；若开启了两步验证，需输入 OTP。

验证是否登录成功：

```bash
npm whoami
```

### 2. 本地检查

```bash
cd browser-video-compress
npm install
```

确认 `postinstall` 能正常复制 wasm 到 `assets/ffmpeg/`。

预览将要发布的文件（wasm 会随包一起发布，体积约 20MB）：

```bash
npm pack --dry-run
```

### 3. 修改版本号

每次发布前需递增 `package.json` 中的 `version`（遵循 [semver](https://semver.org/lang/zh-CN/)）：

| 变更类型 | 命令示例 | 适用场景 |
|----------|----------|----------|
| 补丁 | `npm version patch` | bug 修复 |
| 次版本 | `npm version minor` | 新增功能、向后兼容 |
| 主版本 | `npm version major` | 破坏性变更 |

也可手动编辑 `package.json` 中的 `"version"` 字段。

### 4. 发布

```bash
npm publish --access public
```

> 首次发布 scoped 包（如 `@LoveFanta/browser-video-compress`）必须加 `--access public`；当前包名为非 scoped，直接 `npm publish` 即可。

发布成功后，在 https://www.npmjs.com/package/browser-video-compress 可查看。

### 5. 验证安装

```bash
npm install browser-video-compress
```

或在其他项目中：

```bash
npm install browser-video-compress@latest
```

### 6. 更新已发布的版本

```bash
# 1. 修改代码
# 2. 递增版本
npm version patch   # 或 minor / major

# 3. 提交并推送 Git（可选但推荐）
git add package.json package-lock.json
git commit -m "chore: release v1.0.1"
git push

# 4. 再次发布
npm publish
```

### 常见问题

| 问题 | 处理方式 |
|------|----------|
| `403 Forbidden - You do not have permission to publish` | 包名已被他人占用，需修改 `package.json` 的 `name`（如改为 scoped：`@LoveFanta/browser-video-compress`） |
| `402 Payment Required` | 使用了 scoped 包但未加 `--access public` |
| `npm ERR! 403 Forbidden - Two-factor authentication` | 在 npm 账号设置中开启 2FA 后，发布时需使用 granular access token 或 `npm publish --otp=123456` |
| 想撤回错误版本 | `npm unpublish browser-video-compress@x.y.z`（发布后 72 小时内，且需无其他用户依赖） |

### 暂不发布 npm 时的安装方式

可直接从 GitHub 安装：

```bash
npm install github:LoveFanta/browser-video-compress
```

## License

MIT
