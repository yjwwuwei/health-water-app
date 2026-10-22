import { Capacitor } from '@capacitor/core'
import { repository } from '../data/repository'
export async function registerOffline() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  try {
    const scope = new URL(import.meta.env.BASE_URL, location.href).href
    if (Capacitor.isNativePlatform()) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const owned = registrations.filter((r) => r.scope === scope)
      await Promise.all(owned.map((r) => r.unregister()))
      if (owned.length) {
        const keys = await caches.keys()
        await Promise.all(
          keys
            .filter((key) => key === 'water-app-v1' || key.startsWith('health-water-v3-'))
            .map((key) => caches.delete(key)),
        )
        // unregister() alone leaves the current WebView controlled until navigation.
        if (navigator.serviceWorker.controller) {
          await (await repository.db).transaction(['entities', 'days', 'meta', 'outbox'], 'readonly').done
          location.reload()
        }
      }
      return
    }
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    let updating = false
    const offer = () => {
      if (
        !navigator.serviceWorker.controller ||
        !registration.active ||
        !registration.waiting ||
        document.getElementById('water-update')
      )
        return
      const banner = document.createElement('div')
      banner.id = 'water-update'
      banner.className = 'update-banner'
      banner.setAttribute('role', 'status')
      banner.append('新版本已准备好')
      const button = document.createElement('button')
      button.textContent = '保存并更新'
      button.onclick = async () => {
        button.disabled = true
        await (await repository.db).transaction(['entities', 'days', 'meta', 'outbox'], 'readonly').done
        updating = true
        registration.waiting?.postMessage('ACTIVATE_UPDATE')
      }
      banner.append(button)
      document.body.append(banner)
    }
    offer()
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', offer)
    })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      document.getElementById('water-update')?.remove()
      if (updating) location.reload()
    })
  } catch (error) {
    console.warn('离线缓存未就绪；已保存的记录不受影响', error)
  }
}
