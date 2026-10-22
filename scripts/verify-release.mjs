import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
const html = readFileSync('dist/index.html', 'utf8')
const entry = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1])
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const files = new Set()
function visit(key) {
  const item = manifest[key]
  if (!item || files.has(item.file)) return
  files.add(item.file)
  ;(item.imports ?? []).forEach(visit)
}
for (const [key, item] of Object.entries(manifest)) if (item.isEntry) visit(key)
for (const url of entry) assert(!url.startsWith('/assets/'), 'Pages entry path must include repository base')
const size = [...files].reduce((sum, file) => sum + gzipSync(readFileSync(`dist/${file}`)).length, 0)
if (existsSync('dist/sw.js'))
  assert(
    !/__CACHE_NAME__|__BASE_PATH__|__CORE_FILES__/.test(readFileSync('dist/sw.js', 'utf8')),
    'Unresolved service worker placeholders',
  )
assert(size <= 150 * 1024, `首屏 JS ${size} bytes gzip exceeds 150 KiB`)
assert(existsSync('dist/models/movenet/model.json'), 'Missing bundled model')
assert(
  readdirSync('dist/wasm').some((n) => n.endsWith('.wasm')),
  'Missing WASM',
)
const installed = JSON.parse(readFileSync('node_modules/@capacitor/android/package.json', 'utf8'))
assert(Number(installed.version.split('.')[1]) >= 5 && installed.version !== '8.5.0', 'Unpatched Capacitor')
console.log(`本地资源检查通过；首屏 JS gzip ${size} bytes。签名、覆盖升级和真机验证仍为独立发布门槛。`)
