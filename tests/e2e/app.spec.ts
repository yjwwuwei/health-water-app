import { test, expect } from '@playwright/test'
test('record, undo, edit, export and reload without any cloud initialization', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (/googleapis|firebase|tfhub|kaggle/.test(request.url())) external.push(request.url())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '给自己一点水分。' })).toBeVisible()
  await page.getByRole('button', { name: '+ 100 ml' }).click()
  await page.getByRole('button', { name: '+ 500 ml' }).click()
  await page.getByRole('button', { name: '撤销刚才那一笔' }).click()
  await expect(page.locator('.water-total strong')).toHaveText('100')
  await page.reload()
  await expect(page.locator('.water-total strong')).toHaveText('100')
  await page.getByRole('button', { name: '历史', exact: true }).click()
  await page.getByRole('button', { name: '编辑 100 毫升记录' }).click()
  await page.getByLabel('饮水量（ml）').fill('350')
  await page.getByRole('button', { name: '确认保存' }).click()
  await expect(page.locator('.record-detail strong')).toHaveText('350 ml')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON 备份', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/健康喝水-.*\.json/)
  expect(external).toEqual([])
})
test('serves the core app offline after first installation', async ({ page, context }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '+ 250 ml' }).click()
  await expect(page.locator('.water-total strong')).toHaveText('250')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect(page.locator('#water-update')).toHaveCount(0)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.water-total strong')).toHaveText('250')
  await page.getByRole('button', { name: '+ 100 ml' }).click()
  await expect(page.locator('.water-total strong')).toHaveText('350')
})
test('migrates old local data once and preserves its original date semantics', async ({ page, context }) => {
  await context.route('**/seed', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Migration fixture</title>' }),
  )
  await page.goto('/seed')
  await page.evaluate(async () => {
    localStorage.setItem('waterData', JSON.stringify({ records: { '2020-01-02': 1000 }, goal: 1800 }))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('health-water', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records', { keyPath: 'date' })
        request.result.createObjectStore('settings', { keyPath: 'key' })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['records', 'settings'], 'readwrite')
        tx.objectStore('records').put({ date: '2020-01-02', amount: 1500 })
        tx.objectStore('settings').put({ key: 'goal', value: 2300 })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
  })
  await page.goto('./')
  await expect(page.getByText('旧数据有 1 个日期需要核对')).toBeVisible()
  await page.getByRole('button', { name: '保留当前', exact: true }).click()
  await expect(page.getByText('旧数据有 1 个日期需要核对')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('旧数据有 1 个日期需要核对')).toHaveCount(0)
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('health-water-v3')
      r.onsuccess = () => resolve(r.result)
    })
    const records = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction('entities').objectStore('entities').getAll()
      r.onsuccess = () => resolve(r.result)
    })
    db.close()
    return { records, raw: localStorage.getItem('waterData') }
  })
  expect(result.records.filter((r: unknown) => (r as { kind: string }).kind === 'legacy')).toEqual([
    expect.objectContaining({ date: '2020-01-02', originalDate: '2020-01-02', amountMl: 1500 }),
  ])
  expect(result.raw).toContain('1000')
})
test('modal can be dismissed with Escape and focus returns', async ({ page }) => {
  await page.goto('./')
  const trigger = page.getByRole('button', { name: '＋ 自定义记录' })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
test('loads the bundled pose runtime and releases the camera when closed', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('显示趣味姿势打卡').check()
  await page.getByRole('button', { name: '今天', exact: true }).click()
  await page.getByRole('button', { name: '✧ 趣味姿势打卡' }).click()
  await page.getByRole('button', { name: '开始 / 重试' }).click()
  await expect(page.getByText('让肩部和双手入镜，将一只手抬到口鼻附近，保持 1.5 秒。')).toBeVisible({
    timeout: 30000,
  })
  // Canvas is sized only after estimatePoses resolves; loading the model is insufficient.
  await expect
    .poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .toBe(640)
  await page.evaluate(() => {
    ;(window as unknown as { testStream: MediaStream }).testStream = document.querySelector('video')!
      .srcObject as MediaStream
  })
  await page.getByRole('button', { name: '关闭对话框' }).click()
  expect(
    await page.evaluate(() =>
      (window as unknown as { testStream: MediaStream }).testStream
        .getTracks()
        .every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true)
  await expect(page.locator('.water-total strong')).toHaveText('0')
})
test('mobile layout fits 360px, with a shareable local preview screenshot', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: '+ 250 ml' }).click()
  await expect(page.locator('.water-total strong')).toHaveText('250')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect(page.locator('#water-update')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('v3-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '历史', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('goal celebration occurs once and a next-day goal does not rewrite today', async ({ page }) => {
  await page.goto('./')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+ 500 ml' }).click()
  await expect(page.getByText('今天的目标完成了。按照自己的节奏就好。')).toBeVisible()
  await page.getByRole('button', { name: '撤销刚才那一笔' }).click()
  await page.getByRole('button', { name: '+ 500 ml' }).click()
  await expect(page.getByText('今天的目标完成了。按照自己的节奏就好。')).toHaveCount(0)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('目标（ml）').fill('1800')
  await page.getByRole('button', { name: '保存目标' }).click()
  await page.getByRole('button', { name: '今天', exact: true }).click()
  await expect(page.getByText('今日目标 2,000 ml')).toBeVisible()
})
