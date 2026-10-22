import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const origin = 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4/'
const update = process.argv.includes('--update-lock')
let lock = {}
try {
  lock = JSON.parse(await readFile('scripts/pose-assets.lock.json', 'utf8'))
} catch {
  if (!update) throw new Error('资源校验清单缺失；维护者须审阅后使用 --update-lock 初始化')
}
await mkdir('public/models/movenet', { recursive: true })
await mkdir('public/wasm', { recursive: true })
async function resource(name) {
  if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid model resource name')
  const target = `public/models/movenet/${name}`
  let bytes
  try {
    bytes = await readFile(target)
  } catch {
    const response = await fetch(origin + name + '?tfjs-format=file')
    if (!response.ok) throw new Error(`模型下载失败 ${response.status}: ${name}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (!update && lock[name] !== digest) throw new Error(`模型校验失败: ${name}`)
  lock[name] = digest
  await writeFile(target, bytes)
  return bytes
}
const model = JSON.parse((await resource('model.json')).toString('utf8'))
for (const manifest of model.weightsManifest) for (const name of manifest.paths) await resource(name)
for (const name of [
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
])
  await copyFile(`node_modules/@tensorflow/tfjs-backend-wasm/dist/${name}`, `public/wasm/${name}`)
await copyFile('node_modules/@tensorflow/tfjs-core/README.md', 'public/wasm/TFJS-README.md')
await copyFile('licenses/TensorFlow-Apache-2.0.txt', 'public/wasm/LICENSE.txt')
await copyFile('licenses/TensorFlow-Apache-2.0.txt', 'public/models/movenet/LICENSE.txt')
await writeFile(
  'public/models/movenet/NOTICE.txt',
  'MoveNet SinglePose Lightning float16 v4. Copyright Google. Apache License 2.0.\nSource: https://www.kaggle.com/models/google/movenet/tfJs/singlepose-lightning/4\nRuntime: TensorFlow.js 4.22.0 (Apache-2.0).\n',
)
if (update) await writeFile('scripts/pose-assets.lock.json', JSON.stringify(lock, null, 2) + '\n')
console.log(`模型资源已验证：${Object.keys(lock).length} 个文件；WASM 已复制`)
