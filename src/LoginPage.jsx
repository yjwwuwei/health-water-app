import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  registerWithEmail,
  loginWithEmail,
  loginAnonymously,
} from './firebase'

export default function LoginPage({ onClose }) {
  const [mode, setMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password, nickname)
      } else {
        await loginWithEmail(email, password)
      }
      onClose()
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? '该邮箱已注册'
        : e.code === 'auth/invalid-email' ? '邮箱格式不正确'
        : e.code === 'auth/weak-password' ? '密码至少6位'
        : e.code === 'auth/user-not-found' ? '用户不存在'
        : e.code === 'auth/wrong-password' ? '密码错误'
        : e.code === 'auth/invalid-credential' ? '邮箱或密码错误'
        : e.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setLoading(true)
    try {
      await loginAnonymously()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="login-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="login-card"
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="login-header">
          <h2> </h2>
          <p>登录后可同步数据到云端</p>
        </div>

        <form onSubmit={handleEmailAuth} className="login-form">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="昵称"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="login-input"
            />
          )}
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="login-input"
            required
          />
          <input
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            minLength={6}
            required
          />

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                className="login-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >{error}</motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="login-btn primary"
            disabled={loading}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? '请稍候...' : mode === 'register' ? '注册' : '登录'}
          </motion.button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <span>没有账号？
              <button onClick={() => { setMode('register'); setError('') }}>
                注册
              </button>
            </span>
          ) : (
            <span>已有账号？
              <button onClick={() => { setMode('login'); setError('') }}>
                登录
              </button>
            </span>
          )}
        </div>

        <div className="login-divider">
          <span>或者</span>
        </div>

        <motion.button
          className="login-btn guest"
          onClick={handleGuest}
          disabled={loading}
          whileTap={{ scale: 0.95 }}
        >
          游客模式（数据仅本地）
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
