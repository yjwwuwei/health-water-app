import { useEffect, useRef, useState } from 'react'
import { login, readLegacyWithCredentials, resetPassword, configured } from '../cloud/firebase'
import { Modal } from './Modal'
export default function CloudPanel({
  legacyOnly,
  onClose,
  onImport,
  onLogin,
}: {
  legacyOnly: boolean
  onClose: () => void
  onImport: (raw: string) => void
  onLogin: (uid: string) => void
}) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (legacyOnly) {
        const backup = await readLegacyWithCredentials(email.trim(), password)
        if (active.current) onImport(JSON.stringify(backup))
      } else {
        const user = await login(email.trim(), password, register)
        if (active.current) {
          onLogin(user.uid)
          onClose()
        }
      }
    } catch (e) {
      if (active.current) setMessage(e instanceof Error ? e.message : '登录失败')
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <Modal title={legacyOnly ? '导入旧云数据' : '连接你的账号'} onClose={onClose}>
      <p className="muted">
        {legacyOnly
          ? '只读取你自己的旧版数据。导入前可预览，不会开启自动同步。'
          : '登录后可在设备之间同步。游客记录需要另行确认导入。'}
      </p>
      {!configured ? (
        <p role="status">此版本未配置云服务，请使用本地 JSON 备份迁移。</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            邮箱
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              minLength={6}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {!legacyOnly && (
            <label className="check">
              <input type="checkbox" checked={register} onChange={(e) => setRegister(e.target.checked)} />
              创建新账号
            </label>
          )}
          {message && (
            <p role="alert" className="error">
              {message}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? '处理中…' : legacyOnly ? '登录并读取' : register ? '注册' : '登录'}
          </button>
          {!legacyOnly && (
            <button
              type="button"
              className="text-button"
              disabled={busy || !email}
              onClick={() => {
                void resetPassword(email.trim())
                  .then(() => setMessage('重置邮件已发送，请查收'))
                  .catch((e) => setMessage(String(e)))
              }}
            >
              忘记密码
            </button>
          )}
        </form>
      )}
    </Modal>
  )
}
