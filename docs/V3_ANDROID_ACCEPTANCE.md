# v3 Android 安装版验收

日期：2026-10-22，Asia/Shanghai。此次补齐本地模拟器验收，没有发布版本。

供公开审阅的原始结果副本：[3 项集成测试 XML](oss-evidence/android-2026-10-22/instrumentation.xml)、[6 项安装版流程结果](oss-evidence/android-2026-10-22/webview-smoke.json)、[模拟器实际重启结果](oss-evidence/android-2026-10-22/reboot.json)。测试代码位于 [ReminderIntegrationTest.java](../android/app/src/androidTest/java/com/yjwwuwei/healthwater/ReminderIntegrationTest.java)。下文 `artifacts/` 链接指本地保留的详细日志和开发产物，不随 Git 上传；所有数据均来自开发模拟器。原始验收快照中的许可证待定项已在后续 MIT 选择中解决，见 [LICENSE](../LICENSE)。

## 结果与环境

Android 16 / API 36、Google APIs x86_64 模拟器 `water-v3-api36`，设备序列号 `emulator-5572`；WebView 为 `133.0.6943.137`。测试包为 `com.yjwwuwei.healthwater.dev`，版本 3.0.0/300，WebView origin 为 `https://localhost/`。

3 项原生集成测试、6 项安装版流程检查和 1 项真实重启检查通过。原先的 40 项检查结果仍有效，加上此次实际执行的 3 项原生集成测试，已通过的自动化测试共 43 项；6 项流程检查及重启检查另计。本次没有重复执行未受影响的 Web、Rules 和 Java 单元测试。

应用 APK 未改变，仍为 [health-water-v3.0-dev.apk](../artifacts/v3/health-water-v3.0-dev.apk)，SHA-256：

```text
750cdf6e4dcbe7d88a23185f8318cf873c8c1f4794832cec8fed89212196bc8a
```

此次仅扩充原生测试源码并更新验收文档；没有修改业务代码或依赖。原有 57 项源码/构建输入中，56 项哈希相同，唯一变化是 `ReminderIntegrationTest.java`；4 项既有交付物哈希均相同。具体文件和哈希见 [机器可读验收证据](v3-android-acceptance.json) 与 [总验证记录](v3-verification.json)。

## 原生集成测试

执行 `node scripts/android-build.mjs :app:connectedDebugAndroidTest`，通过 `ANDROID_SERIAL=emulator-5572` 限定到本次创建的模拟器。3 项通过，0 失败、0 错误、0 跳过。

| 场景 | 已验证的行为 |
| --- | --- |
| 重启/时区接收逻辑 | 调用接收器后计算下一次有效提醒 |
| 达标与禁用 | 当日达标后推迟到次日，关闭后清除下一次时间 |
| 实际通知与稍后提醒 | 系统通知出现；发送通知按钮实际的 PendingIntent 后，记录 15 分钟稍后时间、撤下通知并重排；达标时撤下已显示通知 |

第一项通过接收器调用测试计算逻辑，不能单独证明系统会发送重启广播，因此另做下述真实设备重启。第三项检查真实 NotificationManager 状态，没有等待 15 分钟验证最终投递时刻。

证据：[JUnit XML](../artifacts/v3/native-acceptance-2026-10-22/instrumentation.xml)、[Gradle 日志](../artifacts/v3/native-acceptance-2026-10-22/instrumentation-gradle.log)、[测试 APK](../artifacts/v3/native-acceptance-2026-10-22/health-water-v3.0-androidTest.apk)。测试会清理开发包的提醒偏好，复测应使用可丢弃的开发模拟器。

## 安装版流程检查

通过 Playwright Android 接口连接已安装 APK 的实际 WebView，并使用 Android 系统返回键、系统文件选择器及原生桥接。

| 场景 | 结果 |
| --- | --- |
| 记录、撤销与进程重启 | 添加 100 / 500 ml 后撤销 500 ml，强制停止并重新启动后总量正确保留 |
| Android 返回键 | 第一按收起输入键盘，第二按关闭记录对话框，仍留在应用 |
| 取消导出 | 打开系统文件选择器，返回取消后提示取消，原记录保留 |
| 提醒开关 | UI 持久化完成后，原生状态反映开关；启用产生未来闹钟，禁用取消 |
| 实际保存备份 | 系统文档提供器写入中文文件名 `健康喝水-2026-10-22.json`；读取验证 `format=health-water`、`version=3` 和 7 个实体 |
| 姿势模型 | APK 内模型/WASM 在模拟摄像头上完成推理，画布为 480×640；返回关闭后视频轨道全部结束，没有增加饮水记录 |

证据：[6 项结果](../artifacts/v3/native-acceptance-2026-10-22/webview-smoke.json)、[实际导出文件](../artifacts/v3/native-acceptance-2026-10-22/native-export.json)、[首次打开截图](../artifacts/v3/native-acceptance-2026-10-22/android-first-launch.png)、[系统保存界面](../artifacts/v3/native-acceptance-2026-10-22/android-document-picker.png)、[相机推理截图](../artifacts/v3/native-acceptance-2026-10-22/android-pose.png)。所有记录均为本次模拟器生成的测试数据。

## 真实重启与收尾

开启提醒后退出到系统桌面，执行 `adb -s emulator-5572 reboot`。验证内核 boot ID 已改变、系统启动完成，然后在未打开应用 Activity 的情况下检查：

- Android 事件日志显示系统因广播启动 `ReminderReceiver`。
- AlarmManager 当前队列存在本包的 `RTC_WAKEUP` 和 `com.yjwwuwei.healthwater.REMIND`，不是历史取消日志。
- 再打开应用，300 ml 测试记录保留；通过 UI 关闭提醒后，原生 `enabled=false`、`nextAt=0`，实际队列也无本包闹钟。

证据：[重启结果](../artifacts/v3/native-acceptance-2026-10-22/reboot.json)、[重启后的实际闹钟队列](../artifacts/v3/native-acceptance-2026-10-22/reboot-verified-after-alarms.log)、[系统启动接收器日志](../artifacts/v3/native-acceptance-2026-10-22/reboot-verified-receiver.log)、[最终状态](../artifacts/v3/native-acceptance-2026-10-22/device-final-state.json)。

提醒和姿势功能已关闭，本次创建的模拟器已停止，ADB 无连接设备和临时转发端口。没有连接或操作实体手机。既有工具链 junction 保留原样。

## 验收过程中的修正

此前模拟器启动未被 ADB 识别；本次使用既有 ASCII 工具链路径、先启动 ADB、固定模拟器端口后连接成功。

初期流程脚本对键盘返回行为、Android 16 文件选择器 Activity 名称、异步受控复选框和含中文的 ADB 命令作了错误假设。调整检查方式后对应场景通过，失败日志以 `webview-smoke-*-attempt` 保留。最终 6 项结果由分段成功运行汇总，没有将失败场景计为通过。

首次重启检查误报闹钟缺失。随后直接读取系统队列与接收器启动日志，确认实际已恢复；修正脚本后再次重启，以新 boot ID、当前闹钟条目和未启动 Activity 三项证据确认通过。原始诊断日志与最终重启脚本一并保留，没有为这些验收脚本问题修改业务逻辑。

## 仍未覆盖

模拟器不能替代厂商手机后台限制、熄屏节电和通知最终投递时刻的验收；此次也未覆盖全部权限拒绝/恢复、真实摄像头旋转及姿势识别质量。旧签名覆盖升级、实体手机验收和生产云服务配置仍是 [发行门槛](V3_IMPLEMENTATION.md#仍需正式发行前完成)。
