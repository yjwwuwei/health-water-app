# 第三方资源

本项目代码采用根目录 [MIT 许可证](../LICENSE)。以下组件仍遵循各自许可证；下表不替代其完整许可文本。

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| React / React DOM | UI | MIT |
| Capacitor 8.5.3 | Android | MIT |
| idb | IndexedDB | ISC |
| Firebase JS SDK | 可选认证、同步 | Apache-2.0 |
| TensorFlow.js 4.22.0 | WASM 推理 | Apache-2.0 |
| MoveNet SinglePose Lightning v4 | 姿势模型 | Apache-2.0 |

依赖版本固定在 npm lockfile。[Google 模型来源](https://www.kaggle.com/models/google/movenet/tfJs/singlepose-lightning/4)。下载脚本通过 TensorFlow Hub 官方接口取得 model.json 和权重分片，按 scripts/pose-assets.lock.json 校验 SHA-256。WASM 来自 npm 锁定版本。

完整 Apache-2.0 文本保存在 licenses/TensorFlow-Apache-2.0.txt，构建前复制至模型和 WASM 目录；APK、Web 产物包含文本与 NOTICE。

Firebase 的 Node 传递依赖 @grpc/grpc-js 通过 override 固定为修复版 1.14.6，Firestore 模拟器回归覆盖该组合。浏览器使用 Web 传输。剩余开发工具告警需跟踪上游，不要使用 npm audit fix --force 将 Firebase 或 Capacitor 回退到旧主版本。
