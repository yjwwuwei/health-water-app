// IndexedDB 本地存储 - 支持100年数据
import { openDB } from 'idb'

const DB_NAME = 'health-water'
const DB_VERSION = 1

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 每日记录表
      if (!db.objectStoreNames.contains('records')) {
        db.createObjectStore('records', { keyPath: 'date' })
      }
      // 设置表
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    },
  })
}

// 迁移 localStorage 数据到 IndexedDB
export async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('waterData')
    if (!raw) return
    const data = JSON.parse(raw)
    const db = await getDB()

    // 迁移每日记录
    if (data.records) {
      const tx = db.transaction('records', 'readwrite')
      for (const [date, amount] of Object.entries(data.records)) {
        await tx.store.put({ date, amount, updatedAt: Date.now() })
      }
      await tx.done
    }

    // 迁移设置
    const tx = db.transaction('settings', 'readwrite')
    await tx.store.put({ key: 'goal', value: data.goal || 2000 })
    await tx.store.put({ key: 'checkInEnabled', value: data.checkInEnabled || false })
    await tx.done

    // 迁移完成后清除 localStorage
    localStorage.removeItem('waterData')
    console.log('数据已从 localStorage 迁移到 IndexedDB')
  } catch (e) {
    console.error('迁移失败:', e)
  }
}

// 读取所有记录
export async function loadAllRecords() {
  const db = await getDB()
  const all = await db.getAll('records')
  const records = {}
  for (const item of all) {
    records[item.date] = item.amount
  }
  return records
}

// 读取单日记录
export async function loadRecord(date) {
  const db = await getDB()
  const item = await db.get('records', date)
  return item ? item.amount : 0
}

// 保存单日记录
export async function saveRecord(date, amount) {
  const db = await getDB()
  await db.put('records', { date, amount, updatedAt: Date.now() })
}

// 读取设置
export async function loadSetting(key, defaultValue) {
  const db = await getDB()
  const item = await db.get('settings', key)
  return item ? item.value : defaultValue
}

// 保存设置
export async function saveSetting(key, value) {
  const db = await getDB()
  await db.put('settings', { key, value })
}

// 导出所有数据（用于云同步）
export async function exportAllData() {
  const db = await getDB()
  const records = await db.getAll('records')
  const goal = await loadSetting('goal', 2000)
  const checkInEnabled = await loadSetting('checkInEnabled', false)
  return { records, goal, checkInEnabled, exportedAt: Date.now() }
}

// 导入数据（从云端恢复）
export async function importAllData(data) {
  const db = await getDB()
  if (data.records) {
    const tx = db.transaction('records', 'readwrite')
    for (const item of data.records) {
      const existing = await tx.store.get(item.date)
      // 只导入更新的数据
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        await tx.store.put(item)
      }
    }
    await tx.done
  }
  if (data.goal) await saveSetting('goal', data.goal)
  if (data.checkInEnabled !== undefined) await saveSetting('checkInEnabled', data.checkInEnabled)
}
