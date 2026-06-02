import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getLeaderboard } from './firebase'
import { useAuth } from './AuthContext'

export default function Leaderboard({ onClose }) {
  const { user } = useAuth()
  const [type, setType] = useState('weekly')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await getLeaderboard(type)
        if (!cancelled) setEntries(data)
      } catch (e) {
        console.error('加载排行榜失败:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [type])

  const tabs = [
    { key: 'weekly', label: '本周', icon: ' ' },
    { key: 'monthly', label: '本月', icon: ' ' },
    { key: 'streak', label: '连续', icon: ' ' },
  ]

  const getValue = (entry) => {
    if (type === 'streak') return `${entry.streak} 天`
    return `${entry.totalAmount} ml`
  }

  const getSubtext = (entry) => {
    if (type === 'streak') return `累计 ${entry.totalAmount} ml`
    return `${entry.daysCount} 天有记录`
  }

  const getMedal = (index) => {
    if (index === 0) return ' '
    if (index === 1) return ' '
    if (index === 2) return ' '
    return `${index + 1}`
  }

  return (
    <motion.div
      className="lb-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="lb-card"
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="lb-header">
          <h2>排行榜</h2>
          <motion.button
            className="lb-close"
            onClick={onClose}
            whileTap={{ scale: 0.9 }}
          >✕</motion.button>
        </div>

        {/* Tab 切换 */}
        <div className="lb-tabs">
          {tabs.map(tab => (
            <motion.button
              key={tab.key}
              className={`lb-tab ${type === tab.key ? 'active' : ''}`}
              onClick={() => setType(tab.key)}
              whileTap={{ scale: 0.95 }}
            >
              <span className="lb-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </motion.button>
          ))}
        </div>

        {/* 列表 */}
        <div className="lb-list">
          {loading ? (
            <div className="lb-loading">
              <motion.div
                className="lb-spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p>加载中...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="lb-empty">
              <p>暂无数据</p>
              <p className="lb-empty-sub">登录后数据会自动同步到排行榜</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={type}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {entries.map((entry, index) => (
                  <motion.div
                    key={entry.uid}
                    className={`lb-item ${entry.uid === user?.uid ? 'me' : ''}`}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="lb-rank">{getMedal(index)}</div>
                    <div className="lb-user">
                      <span className="lb-name">
                        {entry.nickname}
                        {entry.uid === user?.uid && <span className="lb-me-tag">我</span>}
                      </span>
                      <span className="lb-sub">{getSubtext(entry)}</span>
                    </div>
                    <div className="lb-value">{getValue(entry)}</div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
