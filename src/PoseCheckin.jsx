import { useEffect, useRef, useState, useCallback } from 'react'

const DETECT_DURATION = 1500 // 连续检测1.5秒
const VIDEO_WIDTH = 320
const VIDEO_HEIGHT = 480

// 全局缓存模型，避免重复加载
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

// 骨架连接线
const SKELETON = [
  [5, 7], [7, 9],   // 左臂
  [6, 8], [8, 10],  // 右臂
  [5, 6],           // 肩膀
  [5, 11], [6, 12], // 躯干
  [11, 12],         // 臀部
  [11, 13], [13, 15], // 左腿
  [12, 14], [14, 16], // 右腿
  [0, 5], [0, 6],   // 鼻子到肩膀
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

        // 检测逻辑：手腕高于肩膀且靠近脸部
        const nose = keypoints.find(k => k.name === 'nose')
        const leftWrist = keypoints.find(k => k.name === 'left_wrist')
        const rightWrist = keypoints.find(k => k.name === 'right_wrist')
        const leftShoulder = keypoints.find(k => k.name === 'left_shoulder')
        const rightShoulder = keypoints.find(k => k.name === 'right_shoulder')

        let isDetected = false

        if (nose && nose.score > 0.4) {
          const checkWrist = (wrist, shoulder) => {
            if (!wrist || wrist.score < 0.4) return false
            // 手腕高于鼻子
            const aboveNose = wrist.y < nose.y
            // 水平靠近脸部（在鼻子两侧0.25范围内）
            const nearFace = Math.abs(wrist.x - nose.x) < 0.25
            return aboveNose && nearFace
          }

          isDetected = checkWrist(leftWrist, leftShoulder) || checkWrist(rightWrist, rightShoulder)

          // 更新状态提示
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
          if (!detectStartRef.current) {
            detectStartRef.current = Date.now()
          }
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
    } catch (e) {
      // 单帧失败，继续
    }

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
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
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
        if (!cancelled) {
          setError(e.message || '初始化失败')
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [detect])

  const handleStart = () => {
    setShowGuide(false)
  }

  return (
    <div className="pose-overlay">
      <div className="pose-header">
        <button className="pose-back" onClick={onCancel}>← 返回</button>
        <span>姿势打卡</span>
        <button className="pose-skip" onClick={onSkip}>跳过</button>
      </div>

      {/* 姿势示例引导 */}
      {showGuide && !loading && !error && (
        <div className="pose-guide-overlay">
          <div className="pose-guide-card">
            <h3>喝水姿势示范</h3>
            <div className="pose-guide-demo">
              <div className="pose-guide-figure">
                <svg viewBox="0 0 120 200" width="120" height="200">
                  {/* 头 */}
                  <circle cx="60" cy="30" r="18" fill="none" stroke="#4FC3F7" strokeWidth="3"/>
                  {/* 身体 */}
                  <line x1="60" y1="48" x2="60" y2="110" stroke="#4FC3F7" strokeWidth="3"/>
                  {/* 左手臂 - 举起喝水 */}
                  <line x1="60" y1="65" x2="35" y2="45" stroke="#4FC3F7" strokeWidth="3"/>
                  <line x1="35" y1="45" x2="42" y2="22" stroke="#FFC107" strokeWidth="3"/>
                  {/* 右手臂 - 垂下 */}
                  <line x1="60" y1="65" x2="85" y2="85" stroke="#4FC3F7" strokeWidth="3"/>
                  <line x1="85" y1="85" x2="90" y2="115" stroke="#4FC3F7" strokeWidth="3"/>
                  {/* 左腿 */}
                  <line x1="60" y1="110" x2="40" y2="170" stroke="#4FC3F7" strokeWidth="3"/>
                  {/* 右腿 */}
                  <line x1="60" y1="110" x2="80" y2="170" stroke="#4FC3F7" strokeWidth="3"/>
                  {/* 手（喝水手高亮） */}
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
            <button className="pose-guide-start" onClick={handleStart}>开始打卡</button>
          </div>
        </div>
      )}

      <div className="pose-viewport">
        <video
          ref={videoRef}
          className="pose-video"
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="pose-canvas"
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
        />
        {success && (
          <div className="pose-success">
            <span>✓</span>
          </div>
        )}
      </div>

      <div className="pose-bottom">
        {loading && !error && (
          <p className="pose-hint">正在加载姿态识别模型...</p>
        )}
        {error && (
          <p className="pose-error">{error}</p>
        )}
        {!loading && !error && !success && !showGuide && (
          <>
            <div className="pose-progress-bar">
              <div
                className="pose-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="pose-hint">{poseStatus}</p>
          </>
        )}
        {success && (
          <p className="pose-hint pose-hint-success">打卡成功！</p>
        )}
      </div>
    </div>
  )
}
