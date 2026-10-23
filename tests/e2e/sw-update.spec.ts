import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

test('updates an installed worker only after confirmation and retains records', async ({ page }) => {
  let revision = 'first'
  const root = path.resolve('dist')
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, 'http://localhost').pathname
      if (!pathname.startsWith('/health-water-app/')) {
        response.writeHead(404).end()
        return
      }
      const relative = pathname.slice('/health-water-app/'.length) || 'index.html'
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep)) {
        response.writeHead(403).end()
        return
      }
      const mime: Record<string, string> = {
        '.js': 'application/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
      }
      let body = await readFile(target)
      if (relative === 'sw.js')
        body = Buffer.from(
          body.toString().replaceAll(/health-water-v3-[a-f0-9]+/g, `health-water-v3-test-${revision}`),
        )
      response
        .writeHead(200, {
          'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        .end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    await page.goto(`http://127.0.0.1:${address.port}/health-water-app/`)
    await page.getByRole('button', { name: '+ 100 ml' }).click()
    await expect(page.locator('.water-total strong')).toHaveText('100')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
        )
    })
    await expect(page.locator('#water-update')).toHaveCount(0)
    revision = 'second'
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update()
    })
    await expect(page.getByRole('button', { name: '保存并更新' })).toBeVisible()
    await page.getByRole('button', { name: '保存并更新' }).click()
    await expect(page.locator('#water-update')).toHaveCount(0)
    await expect(page.locator('.water-total strong')).toHaveText('100')
    const active = await page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.startsWith('health-water-v3-')),
    )
    expect(active).toContain('health-water-v3-test-second')
    expect(active).toContain('health-water-v3-test-first')
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})
