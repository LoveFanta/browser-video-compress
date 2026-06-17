#!/usr/bin/env node
/**
 * 将 FFmpeg wasm 资源复制到目标目录。
 *
 * 用法：
 *   node scripts/copy-ffmpeg-core.mjs              # 复制到包内 assets/ffmpeg（postinstall）
 *   npx browser-video-compress-copy-ffmpeg ./public/ffmpeg   # 复制到业务项目 public
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetRoot = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(pkgRoot, 'assets/ffmpeg')

const copies = [
  {
    from: resolve(pkgRoot, 'node_modules/@ffmpeg/core-mt/dist/esm'),
    to: resolve(targetRoot, 'mt'),
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']
  },
  {
    from: resolve(pkgRoot, 'node_modules/@ffmpeg/core/dist/esm'),
    to: resolve(targetRoot, 'st'),
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm']
  }
]

for (const { from, to, files } of copies) {
  if (!existsSync(from)) {
    console.warn(`[browser-video-compress] skip missing: ${from}`)
    continue
  }
  mkdirSync(to, { recursive: true })
  for (const file of files) {
    cpSync(resolve(from, file), resolve(to, file))
  }
  console.log(`[browser-video-compress] copied ${files.length} file(s) -> ${to}`)
}
