import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Profile, ReminderConfig } from '../core/types'
interface ReminderPlugin {
  configure(
    options: ReminderConfig & { profile: Profile; goalMetDay: string },
  ): Promise<{ permission: string }>
  requestPermissions(): Promise<{ notifications: string }>
  status(): Promise<{ permission: string; enabled: boolean; nextAt: number }>
}
export const nativeAndroid = Capacitor.getPlatform() === 'android'
const plugin = registerPlugin<ReminderPlugin>('WaterReminders')
export async function configureReminders(config: ReminderConfig, profile: Profile, goalMetDay: string) {
  if (!nativeAndroid) return { permission: 'unsupported' }
  return plugin.configure({ ...config, profile, goalMetDay })
}
export async function requestNotifications() {
  if (!nativeAndroid) throw new Error('后台提醒仅在 Android 安装版中提供')
  const result = await plugin.requestPermissions()
  if (result.notifications !== 'granted') throw new Error('通知权限未开启，可到系统设置中允许通知')
}
export async function reminderStatus() {
  return nativeAndroid ? plugin.status() : { permission: 'unsupported', enabled: false, nextAt: 0 }
}
