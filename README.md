# 健康喝水 v3

以 Android 为主的离线饮水记录应用，使用 React、TypeScript、IndexedDB 和 Capacitor。主要页面为「今天」「历史」「设置」。

## 体验 v3 预览版

- [下载 v3.0.0-beta.1](https://github.com/yjwwuwei/health-water-app/releases/tag/v3.0.0-beta.1)：提供 Android 开发 APK、Web 静态包与 SHA-256 校验文件。
- [打开网页版](https://yjwwuwei.github.io/health-water-app/)：支持本地记录、历史、备份和首次访问后的离线使用。
- [版本说明与安装须知](docs/releases/v3.0.0-beta.1.md)。Android 安装后显示「健康喝水 Dev」，可以与旧版并存；旧应用数据不会自动进入新包，请保留旧版。

## 版本范围

- **v3.0 默认构建**：游客记录、真实撤销、历史补记/编辑/删除、JSON 备份迁移、Android 原生提醒、默认关闭的趣味姿势打卡。
- **v3.1 云预览构建**：邮箱账号、增量同步、显式游客认领、冲突处理、自愿参加的周/月达标天数榜单。生产 Rules、索引、账号配置仍需单独部署验收。
- Web 支持核心记录、历史、备份和首次访问后的离线使用。后台提醒仅在 Android 安装版提供。

饮水目标可自行调整，下一天生效。姿势打卡不验证真实饮水，不自动记账、不增加排名分数；画面只在本机处理。

## 开发与测试

需要 Node.js 24：

```sh
npm ci
npm run assets:pose
npm run dev
```

开发路径为 /health-water-app/。缺少 Firebase 配置时，本地功能正常使用。模型资源不提交 Git；下载脚本按 scripts/pose-assets.lock.json 校验，校验失败会停止。

```sh
npm run check
npm run build
npm run verify:release
npx playwright install chromium
npm run test:e2e
npm run test:rules
```

check 包括 TypeScript、ESLint、单元和 React 回归。浏览器测试使用生产构建。Rules 测试需 JDK 21，固定使用 demo-health-water 和 127.0.0.1:8085，不连接生产 Firestore。

## Android

准备 JDK 21、Android SDK 平台 36、Build Tools 和 Platform Tools，设置 JAVA_HOME、ANDROID_HOME。脚本也识别被忽略的 .tools/jdk-21* 和 .tools/android-sdk，不修改系统环境变量。

```sh
npm run build:apk
# 已有模拟器或设备时：
node scripts/android-build.mjs :app:connectedDebugAndroidTest
```

build:apk 依次构建相对资源路径、同步 Capacitor、运行原生单元测试并生成 android/app/build/outputs/apk/debug/app-debug.apk。开发包为 **com.yjwwuwei.healthwater.dev**，版本 3.0.0/300，可与旧版并存。

生产包名仍为 com.yjwwuwei.healthwater，WebView 保持 https://localhost。生产签名从 WATER_KEYSTORE、WATER_STORE_PASSWORD、WATER_KEY_ALIAS、WATER_KEY_PASSWORD 环境变量读取，不提交密钥。

**旧版签名私钥尚未确认找回，当前开发 APK 不能作为旧用户的覆盖升级包。** 不要为了升级要求用户卸载旧版。详见 [实施与验收记录](docs/V3_IMPLEMENTATION.md)。

Windows 中文路径使用 Gradle 的 file.encoding=COMPAT 生成原生编码参数文件，Java 源码显式按 UTF-8 编译。[Gradle 已知问题](https://github.com/gradle/gradle/issues/30304)。

## 云功能预览

复制 .env.example 为被忽略的 .env.local，填写自己的 Firebase Web 配置。只启用 Email/Password Auth 和 Firestore；不依赖 Functions、付费服务器、短信或图片上传。

```sh
npm run build:cloud
npm run build:apk:cloud
```

Android 云预览开发包版本为 3.1.0/310。实际启用前须审阅并部署 firestore.rules 和 firestore.indexes.json，验证认证域名和邮箱登录。本轮没有部署生产规则。

游客资料与各 UID 分开保存，登录不会自动上传游客记录。记录变更和 outbox 同事务提交；队列按序重试，操作回执保证幂等。冲突由用户选择，删除优先。

榜单只保存昵称、周期和达标天数，一次最多读取 20 条摘要。每自然日最多计一次，只使用有逐笔记录及已知目标的数据，超额饮水不增加分数。它是有界的自报统计，不提供强防作弊保证。退出会删除摘要并撤回账号授权，其他设备不能自动重新加入。

正常单次记录同步写入实体、账号序列、回执，共 3 次写入；重试/事务竞争会增加读取。仅在前台联网时检查和同步，失败保持本地数据并退避重试。免费配额需维护者观察，不承诺无限用量。

## 迁移与恢复

新库 health-water-v3 与旧库 health-water 分开。旧 localStorage 和数据库保留；迁移事务同时保存原文备份、SHA-256 指纹、转换后数据和完成标记。

旧每日汇总保留原 UTC 日期，不伪造逐笔时间或历史目标。两份旧本地记录不一致时逐日确认；不同来源的同日汇总不相加。未确认归属的资料留在游客空间。

JSON 导入先预览，冲突可保留当前或采用备份；已删除条目不会复活。导入前快照留在本地备份库。原文导出用于排查和重建，日常迁移使用带 format: health-water、version: 3 的 JSON 导出。

v3.0 读取旧云资料不会开启持续同步。v3.1 在用户确认、且本地导入和备份保存成功后才排队冻结该账号旧版写入；冻结失败可重试，旧云原始资料仍可读取。预览取消或保存失败不冻结旧客户端。

回退 UI 不会把新逐笔记录写回旧每日汇总。回退前导出 v3 JSON，并保留两个数据库，不要自动降级数据库或删除迁移备份。

## 工程与发布

数据、同步、平台桥接、识别及 UI 分别位于 src/data、src/cloud、src/platform、src/pose、src/ui。测试位于 tests/unit、tests/rules、tests/e2e 和 Android 测试目录。

CI 检查 Web、权限及 Android 构建。Pages 部署改为手动触发，并先运行检查和浏览器测试；配置 github-pages environment 保护规则后再启用。已移除批量暂存并推送的 npm run push。

项目代码采用 [MIT 许可证](LICENSE)。第三方组件和模型遵循各自许可证，详见 [第三方资源](docs/THIRD_PARTY.md)。另见 [隐私说明](docs/PRIVACY.md)、[实施与验收记录](docs/V3_IMPLEMENTATION.md)、[Android 安装版验收](docs/V3_ANDROID_ACCEPTANCE.md)、[开发依赖审计](docs/V3_DEPENDENCY_AUDIT.md)。
