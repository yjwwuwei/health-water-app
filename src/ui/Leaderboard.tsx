import { useEffect, useState } from 'react'
import { leaderboard, type BoardRow } from '../cloud/firebase'
import { localDate, monthRange, weekRange } from '../core/dates'
import { Modal } from './Modal'
export default function Leaderboard({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [rows, setRows] = useState<BoardRow[]>([])
  const [message, setMessage] = useState('加载中…')
  useEffect(() => {
    let active = true
    void leaderboard(period)
      .then((data) => {
        if (active) {
          setRows(data)
          setMessage(data.length ? '' : '这个周期还没有公开记录')
        }
      })
      .catch(() => {
        if (active) setMessage('榜单暂时无法读取，请稍后重试')
      })
    return () => {
      active = false
    }
  }, [period])
  const range = (period === 'week' ? weekRange : monthRange)(localDate())
  return (
    <Modal title="一起保持规律" onClose={onClose}>
      <p className="muted">自愿公开的个人记录，每天达标计一次。超额饮水不加分，数据由参与者自报。</p>
      <div className="segmented">
        <button
          aria-pressed={period === 'week'}
          onClick={() => {
            if (period !== 'week') {
              setRows([])
              setMessage('加载中…')
              setPeriod('week')
            }
          }}
        >
          本周
        </button>
        <button
          aria-pressed={period === 'month'}
          onClick={() => {
            if (period !== 'month') {
              setRows([])
              setMessage('加载中…')
              setPeriod('month')
            }
          }}
        >
          本月
        </button>
      </div>
      <p className="caption">{range.join(' — ')}</p>
      {message && <p role="status">{message}</p>}
      <ol className="record-list">
        {rows.map((row, index) => {
          const score = period === 'week' ? row.weekDays : row.monthDays
          const rank = rows.findIndex((r) => (period === 'week' ? r.weekDays : r.monthDays) === score) + 1
          return (
            <li key={row.uid}>
              <span className="rank">{rank}</span>
              <span>{row.nickname}</span>
              <strong>{score} 天</strong>
              <span className="sr-only">展示序号 {index + 1}</span>
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
