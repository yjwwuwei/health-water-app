import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const DETECT_DURATION = 1500
const VIDEO_WIDTH = 320
const VIDEO_HEIGHT = 480

let cachedDetector = null
let modelLoading = null

async function getDetector() {
  if (cachedDetector) return cachedDetector
  if (modelLoading) return modelLoading

  modelLoading = (async () => {
    const tf = await import('@tensorflow/tfjs')
    await import('@tensorflow/tfjs-backend-wasm')
    await tf.setBackend('wasm')
    await tf.ready()

    const poseDetection = await import('@tensorflow-models/pose-detection')
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    )
    cachedDetector = detector
    modelLoading = null
    return detector
  })()

  return modelLoading
}

const SKELETON = [
  [5, 7], [7, 9],
  [6, 8], [8, 10],
  [5, 6],
  [5, 11], [6, 12],
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [0, 5], [0, 6],
]

export default function PoseCheckin({ onSuccess, onCancel, onSkip }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const detectStartRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [showGuide, setShowGuide] = useState(true)
  const [poseStatus, setPoseStatus] = useState('等待检测')

  const drawSkeleton = useCallback((ctx, keypoints, width, height) => {
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 3
    SKELETON.forEach(([i, j]) => {
      const a = keypoints[i]
      const b = keypoints[j]
      if (a && b && a.score > 0.3 && b.score > 0.3) {
        ctx.beginPath()
        ctx.moveTo(a.x * width, a.y * height)
        ctx.lineTo(b.x * width, b.y * height)
        ctx.stroke()
      }
    })
    keypoints.forEach((kp) => {
      if (kp.score > 0.3) {
        ctx.fillStyle = kp.name === 'nose' ? '#FF5722' :
                        kp.name?.includes('wrist') ? '#FFC107' : '#66BB6A'
        ctx.beginPath()
        ctx.arc(kp.x * width, kp.y * height, 5, 0, 2 * Math.PI)
        ctx.fill()
      }
    })
  }, [])

  const detect = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    const ctx = canvas.getContext('2d')
    try {
      const detector = await getDetector()
      const poses = await detector.estimatePoses(video)
      if (poses.length > 0) {
        const keypoints = poses[0].keypoints
        drawSkeleton(ctx, keypoints, canvas.width, canvas.height)

        const nose = keypoints.find(k => k.name === 'nose')
        const leftWrist = keypoints.find(k => k.name === 'left_wrist')
        const rightWrist = keypoints.find(k => k.name === 'right_wrist')

        let isDetected = false

        if (nose && nose.score > 0.4) {
          const checkWrist = (wrist) => {
            if (!wrist || wrist.score < 0.4) return false
            return wrist.y < nose.y && Math.abs(wrist.x - nose.x) < 0.25
          }

          isDetected = checkWrist(leftWrist) || checkWrist(rightWrist)

          if (isDetected) {
            setPoseStatus('检测到喝水姿势！保持不动...')
          } else {
            const leftUp = leftWrist && leftWrist.score > 0.4 && leftWrist.y < nose.y
            const rightUp = rightWrist && rightWrist.score > 0.4 && rightWrist.y < nose.y
            if (leftUp || rightUp) {
              setPoseStatus('手靠近脸部一点')
            } else {
              setPoseStatus('请把手举到嘴边')
            }
          }
        } else {
          setPoseStatus('请面向摄像头')
        }

        if (isDetected) {
          if (!detectStartRef.current) detectStartRef.current = Date.now()
          const elapsed = Date.now() - detectStartRef.current
          const p = Math.min(elapsed / DETECT_DURATION, 1)
          setProgress(p)
          if (p >= 1) {
            setSuccess(true)
            setTimeout(() => onSuccess(), 800)
            return
          }
        } else {
          detectStartRef.current = null
          setProgress(0)
        }
      } else {
        setPoseStatus('请站在摄像头前')
      }
    } catch (e) {}

    rafRef.current = requestAnimationFrame(detect)
  }, [drawSkeleton, onSuccess])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        await getDetector()
        if (cancelled) return
        setLoading(false)
        rafRef.current = requestAnimationFrame(detect)
      } catch (e) {
        if (!cancelled) setError(e.message || '初始化失败')
      }
    }
    init()
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [detect])

  return (
    <motion.div
      className="pose-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pose-header">
        <motion.button
          className="pose-back"
          onClick={onCancel}
          whileTap={{ scale: 0.9 }}
        >← 返回</motion.button>
        <span>姿势打卡</span>
        <motion.button
          className="pose-skip"
          onClick={onSkip}
          whileTap={{ scale: 0.9 }}
        >跳过</motion.button>
      </div>

      <AnimatePresence>
        {showGuide && !loading && !error && (
          <motion.div
            className="pose-guide-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="pose-guide-card"
              initial={{ scale: 0.7, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.7, y: 50 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <h3>喝水姿势示范</h3>
              <div className="pose-guide-demo">
                <div className="pose-guide-figure">
                  <svg viewBox="0 0 120 200" width="120" height="200">
                    <circle cx="60" cy="30" r="18" fill="none" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="60" y1="48" x2="60" y2="110" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="60" y1="65" x2="35" y2="45" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="35" y1="45" x2="42" y2="22" stroke="#FFC107" strokeWidth="3"/>
                    <line x1="60" y1="65" x2="85" y2="85" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="85" y1="85" x2="90" y2="115" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="60" y1="110" x2="40" y2="170" stroke="#4FC3F7" strokeWidth="3"/>
                    <line x1="60" y1="110" x2="80" y2="170" stroke="#4FC3F7" strokeWidth="3"/>
                    <circle cx="42" cy="22" r="6" fill="#FFC107"/>
                    <circle cx="90" cy="115" r="5" fill="#4FC3F7" opacity="0.5"/>
                  </svg>
                </div>
                <div className="pose-guide-text">
                  <p className="pose-guide-step">1. 面朝摄像头站好</p>
                  <p className="pose-guide-step">2. 把一只手举到嘴边</p>
                  <p className="pose-guide-step">3. 保持 1.5 秒不动</p>
                </div>
              </div>
              <motion.button
                className="pose-guide-start"
                onClick={() => setShowGuide(false)}
                whileTap={{ scale: 0.95 }}
              >开始打卡</motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pose-viewport">
        <video ref={videoRef} className="pose-video" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="pose-canvas" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <AnimatePresence>
          {success && (
            <motion.div
              className="pose-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
              >✓</motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pose-bottom">
        {loading && !error && (
          <motion.p
            className="pose-hint"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >正在加载姿态识别模型...</motion.p>
        )}
        {error && <p className="pose-error">{error}</p>}
        {!loading && !error && !success && !showGuide && (
          <>
            <div className="pose-progress-bar">
              <motion.div
                className="pose-progress-fill"
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={poseStatus}
                className="pose-hint"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >{poseStatus}</motion.p>
            </AnimatePresence>
          </>
        )}
        {success && (
          <motion.p
            className="pose-hint pose-hint-success"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >打卡成功！</motion.p>
        )}
      </div>
    </motion.div>
  )
}
