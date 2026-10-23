import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
function offlineManifest(native: boolean, base: string): Plugin {
  return {
    name: 'water-offline-manifest',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (native) return
      const core = new Set<string>(['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'])
      const visit = (name: string) => {
        if (core.has(name)) return
        core.add(name)
        const item = bundle[name]
        if (item?.type === 'chunk') item.imports.forEach(visit)
      }
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && item.isEntry) visit(name)
        if (name.endsWith('.css')) core.add(name)
      }
      const version = createHash('sha256')
        .update([...Object.keys(bundle)].sort().join('|'))
        .digest('hex')
        .slice(0, 16)
      const template = readFileSync('scripts/sw-template.js', 'utf8')
      const source = template
        .replaceAll('__CACHE_NAME__', JSON.stringify(`health-water-v3-${version}`))
        .replaceAll('__BASE_PATH__', JSON.stringify(base))
        .replaceAll('__CORE_FILES__', JSON.stringify([...core].map((name) => base + name)))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
export default defineConfig(({ mode }) => {
  const native = mode.startsWith('native')
  const cloud = mode.includes('cloud')
  const base = native ? './' : '/health-water-app/'
  if (mode !== 'development' && !existsSync('public/models/movenet/model.json'))
    throw new Error('缺少离线识别资源，请先运行 npm run assets:pose')
  return {
    base,
    plugins: [react(), offlineManifest(native, base)],
    define: { __CLOUD_ENABLED__: JSON.stringify(cloud) },
    resolve: { alias: { '@mediapipe/pose': path.resolve('src/mediapipe-pose-shim.js') } },
    build: { target: 'es2022', reportCompressedSize: true, manifest: true },
  }
})
