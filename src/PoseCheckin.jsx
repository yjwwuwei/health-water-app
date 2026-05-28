import { useEffect, useRef, useState, useCallback } from 'react'

const DETECT_DURATION = 1000 // 连续检测1秒才算成功
const VIDEO_WIDTH = 320
const VIDEO_HEIGHT = 240

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
  const detectorRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const detectStartRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const checkPose = useCallback((keypoints) => {
    const nose = keypoints.find(k => k.name === 'nose')
    const leftWrist = keypoints.find(k => k.name === 'left_wrist')
    const rightWrist = keypoints.find(k => k.name === 'right_wrist')

    if (!nose || nose.score < 0.5) return false

    const checkWrist = (wrist) => {
      if (!wrist || wrist.score < 0.5) return false
      // 手腕高于鼻子（手臂上举）
      const raisedUp = wrist.y < nose.y - 0.05
      // 手腕水平靠近脸部
      const nearFace = Math.abs(wrist.x - nose.x) < 0.2
      return raisedUp && nearFace
    }

    return checkWrist(leftWrist) || checkWrist(rightWrist)
  }, [])

  const drawSkeleton = useCallback((ctx, keypoints, width, height) => {
    ctx.clearRect(0, 0, width, height)

    // 画连接线
    ctx.strokeStyle = '#4FC3F7'
    ctx.lineWidth = 3
    SKELETON.forEach(([i, j]) => {
      const a = keypoints[i]
      const b = keypoints[j]
      if (a.score > 0.3 && b.score > 0.3) {
        ctx.beginPath()
        ctx.moveTo(a.x * width, a.y * height)
        ctx.lineTo(b.x * width, b.y * height)
        ctx.stroke()
      }
    })

    // 画关键点
    keypoints.forEach((kp, i) => {
      if (kp.score > 0.3) {
        ctx.fillStyle = i === 0 ? '#FF5722' : // 鼻子红色
                        (kp.name === 'left_wrist' || kp.name === 'right_wrist') ? '#FFC107' : // 手腕黄色
                        '#66BB6A' // 其他绿色
        ctx.beginPath()
        ctx.arc(kp.x * width, kp.y * height, 5, 0, 2 * Math.PI)
        ctx.fill()
      }
    })
  }, [])

  const detect = useCallback(async () => {
    const detector = detectorRef.current
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!detector || !video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }

    const ctx = canvas.getContext('2d')
    try {
      const poses = await detector.estimatePoses(video)
      if (poses.length > 0) {
        const keypoints = poses[0].keypoints
        drawSkeleton(ctx, keypoints, canvas.width, canvas.height)

        const isDetected = checkPose(keypoints)
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
      }
    } catch (e) {
      // 单帧检测失败，继续
    }

    rafRef.current = requestAnimationFrame(detect)
  }, [checkPose, drawSkeleton, onSuccess])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        // 获取摄像头
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

        // 初始化 TF.js WASM 后端
        const tf = await import('@tensorflow/tfjs')
        await import('@tensorflow/tfjs-backend-wasm')
        await tf.setBackend('wasm')
        await tf.ready()

        if (cancelled) return

        // 创建姿态检测器
        const poseDetection = await import('@tensorflow-models/pose-detection')
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        )

        if (cancelled) {
          detector.dispose()
          return
        }
        detectorRef.current = detector
        setLoading(false)

        // 开始检测循环
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
      if (detectorRef.current) detectorRef.current.dispose()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [detect])

  return (
    <div className="pose-overlay">
      <div className="pose-header">
        <button className="pose-back" onClick={onCancel}>← 返回</button>
        <span>姿势打卡</span>
        <button className="pose-skip" onClick={onSkip}>跳过</button>
      </div>

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
        {!loading && !error && !success && (
          <>
            <div className="pose-progress-bar">
              <div
                className="pose-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="pose-hint">
              请做出喝水姿势（手举到嘴边）
            </p>
          </>
        )}
        {success && (
          <p className="pose-hint pose-hint-success">打卡成功！</p>
        )}
      </div>
    </div>
  )
}
