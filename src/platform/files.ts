import { registerPlugin } from '@capacitor/core'
import { nativeAndroid } from './reminders'
const files = registerPlugin<{
  save(options: { name: string; contents: string }): Promise<{ saved: boolean }>
}>('WaterFiles')
export async function saveJson(name: string, value: unknown) {
  const contents = JSON.stringify(value, null, 2)
  if (nativeAndroid) {
    if (!(await files.save({ name, contents })).saved) throw new Error('已取消保存；应用内数据未改变')
    return
  }
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
