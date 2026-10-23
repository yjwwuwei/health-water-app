import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-converter'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import {
  createDetector,
  SupportedModels,
  movenet,
  type PoseDetector,
} from '@tensorflow-models/pose-detection'
let loading: Promise<PoseDetector> | undefined
export function loadDetector(): Promise<PoseDetector> {
  return (loading ??= (async () => {
    setWasmPaths(new URL(`${import.meta.env.BASE_URL}wasm/`, location.href).href)
    tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false)
    if (!(await tf.setBackend('wasm'))) throw new Error('此设备无法启动识别引擎，可继续手动记录')
    await tf.ready()
    return createDetector(SupportedModels.MoveNet, {
      modelType: movenet.modelType.SINGLEPOSE_LIGHTNING,
      enableSmoothing: true,
      modelUrl: new URL(`${import.meta.env.BASE_URL}models/movenet/model.json`, location.href).href,
    })
  })().catch((error) => {
    loading = undefined
    throw error
  }))
}
