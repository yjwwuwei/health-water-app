import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { drinkingGesture } from '../pose/gesture'
export default function PoseCheckin({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: (source: 'manual' | 'pose') => void
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null)
  const [started, setStarted] = useState(false),
    [complete, setComplete] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState('点击开始后才会打开摄像头。'),
    [ratio, setRatio] = useState(4 / 3)
  useEffect(() => {
    if (!started) return
    let cancelled = false,
      stream: MediaStream | undefined,
      raf = 0,
      since = 0,
      lastFrame = 0
    const stop = () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      if (video.current) video.current.srcObject = null
    }
    const paused = () => {
      if (document.hidden) {
        stop()
        setStarted(false)
        setProgress(0)
        setMessage('进入后台后已暂停，点击开始可重试。')
      }
    }
    document.addEventListener('visibilitychange', paused)
    void (async () => {
      try {
        setMessage('正在准备摄像头和本地识别模型…')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('此设备无法使用摄像头，可跳过并手动记录')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const { loadDetector } = await import('../pose/detector')
        const detector = await loadDetector()
        if (cancelled) return
        setRatio(v.videoWidth / v.videoHeight || 4 / 3)
        setMessage('让肩部和双手入镜，将一只手抬到口鼻附近，保持 1.5 秒。')
        const frame = async (time: number) => {
          if (cancelled) return
          if (time - lastFrame < 100 || v.readyState < 2) {
            raf = requestAnimationFrame((t) => void frame(t))
            return
          }
          lastFrame = time
          try {
            const poses = await detector.estimatePoses(v, { flipHorizontal: false })
            if (cancelled) return
            const points = poses[0]?.keypoints ?? []
            const c = canvas.current!
            c.width = v.videoWidth
            c.height = v.videoHeight
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            ctx.fillStyle = '#73e7cc'
            for (const p of points)
              if ((p.score ?? 0) >= 0.4) {
                ctx.beginPath()
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
                ctx.fill()
              }
            if (drinkingGesture(points)) {
              if (!since) since = time
              const value = Math.min((time - since) / 1500, 1)
              setProgress(value)
              if (value >= 1) {
                setComplete(true)
                setMessage('动作完成！确认饮水量后再保存记录。')
                setStarted(false)
                return
              }
            } else {
              since = 0
              setProgress(0)
            }
            raf = requestAnimationFrame((t) => void frame(t))
          } catch (error) {
            if (!cancelled) {
              setMessage(error instanceof Error ? error.message : '识别失败，请重试')
              setStarted(false)
              setProgress(0)
            }
          }
        }
        raf = requestAnimationFrame((t) => void frame(t))
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : '摄像头无法打开')
          setStarted(false)
          setProgress(0)
        }
      }
    })()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', paused)
    }
  }, [started])
  return (
    <Modal title="趣味姿势打卡" onClose={onClose}>
      <p className="muted">画面只在设备上处理，不上传。这是一个小互动，不能验证实际饮水。</p>
      <div className="pose-view" style={{ aspectRatio: ratio }}>
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
      </div>
      <div
        className="pose-progress"
        role="progressbar"
        aria-label="动作保持进度"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <p role="status">{message}</p>
      {complete ? (
        <button className="primary full" onClick={() => onConfirm('pose')}>
          确认饮水量
        </button>
      ) : (
        <button
          className="primary full"
          disabled={started}
          onClick={() => {
            setProgress(0)
            setStarted(true)
          }}
        >
          {started ? '识别中…' : '开始 / 重试'}
        </button>
      )}
      <button className="full" onClick={() => onConfirm('manual')}>
        跳过，手动记录
      </button>
    </Modal>
  )
}
