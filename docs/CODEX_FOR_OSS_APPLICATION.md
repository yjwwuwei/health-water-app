# health-water-app Codex for OSS 申请材料

更新日期：2026-10-22，Asia/Shanghai。申请目标：六个月 ChatGPT Pro（含 Codex）；不申请 API 额度或 Codex Security。状态：材料已更新，尚未提交表单。

维护者已选择 MIT，并授权公开 `codex/v3-rebuild` 开发分支。v3 本地维护累计通过 43 项自动化测试；另完成 6 项 Android 安装版流程检查和 1 项模拟器真实重启检查。公开进度：正在准备首次提交与推送，远程 CI 结果待核验。以下可复制文案须在分支公开后使用。

## 复用现有维护成果

沿用已实施的 v3 维护方案，不另建维护计划。基线为 `998e170cbac7663e853fc2b13f223963df55c7c1`，开发分支为 `codex/v3-rebuild`。正式发行仍按 [实施与验收记录](V3_IMPLEMENTATION.md)中的剩余门槛推进。

| 可核实成果 | 证据与边界 |
| --- | --- |
| TypeScript 模块化、逐笔记录、真实撤销、历史编辑及本地日期规则 | [单元/界面测试](../tests/unit)、[浏览器用例](../tests/e2e)。这是开发版本。 |
| 保留旧数据的迁移：新旧库分开、事务备份、指纹与完成标记；不伪造旧汇总的逐笔时间 | [迁移代码](../src/data/migration.ts)、[数据库测试](../tests/unit/repository.test.ts)。旧签名覆盖升级仍待验证。 |
| 默认离线使用、账号隔离、显式游客认领、增量队列与回执、冲突确认和删除处理 | [同步实现](../src/cloud/sync.ts)、[权限测试](../tests/rules/firestore.test.ts)。v3.1 云功能为预览，未部署生产。 |
| 43 项自动化测试通过 | 23 单元/React + 6 Firestore 模拟器 + 8 Chromium + 3 Android 单元 + 3 Android 集成；见 [验证记录](v3-verification.json)及 [原生 JUnit XML](oss-evidence/android-2026-10-22/instrumentation.xml)。 |
| Android 安装包完成 6 项流程检查及重启恢复检查 | [验收说明](V3_ANDROID_ACCEPTANCE.md)、[流程结果](oss-evidence/android-2026-10-22/webview-smoke.json)、[重启结果](oss-evidence/android-2026-10-22/reboot.json)。覆盖记录持久化、返回键、文件导出、提醒开关和相机释放；使用模拟器，不能替代真机。 |
| 干净安装、类型检查、lint、Web 与 Android 开发包构建通过 | [README](../README.md)、[验证记录](v3-verification.json)。远程 CI 待首次推送后核验。 |
| 依赖和资源维护 | 当日生产依赖审计为 0 告警；开发工具仍有 9 个受影响包、3 个独立公告，见 [审计报告](V3_DEPENDENCY_AUDIT.md)。首屏 JS gzip 78247 字节；模型资源按需加载并校验哈希。 |
| 开源许可与项目说明 | 已添加 [MIT 许可证](../LICENSE)，并保留 [第三方许可说明](THIRD_PARTY.md)、[隐私说明](PRIVACY.md)及验收记录。 |

本次复核：57/57 个当前源码与构建输入、4/4 个既有产物，以及 46/46 个后续 Android 验收文件均与各自记录的 SHA-256 匹配。后续原生集成测试已实际运行；原先 40 项测试的业务输入没有变化，不重复运行整套本地检查。原始哈希反映本地文件字节，Git 的文本换行规范化可能改变文件字节而不改变内容。

[2026-10-22 核验快照](oss-evidence/2026-10-22.json)保存本次结果；[2026-10-21 旧基线](oss-evidence/2026-10-21.json)保留历史结论。原始维护快照中的“许可证待定”反映当时状态，现已由维护者的 MIT 选择解决。

## 公开范围与申请表

公开范围：v3 源码、测试、构建配置、文档、MIT 许可和精选的模拟器测试结果。开发包与完整本地日志继续保存在 `artifacts/v3/`；第三方模型由校验下载脚本获取。申请突出可审阅的维护成果，不使用未经证实的下载量、用户数、机构采用或生态地位。

| 字段 | 填写内容 |
| --- | --- |
| 姓氏、名字和 ChatGPT 邮箱 | 已由用户提供，仅用于官方表单，不写入公开仓库 |
| GitHub 用户名 | yjwwuwei |
| 仓库 | https://github.com/yjwwuwei/health-water-app |
| 审核用开发分支 | https://github.com/yjwwuwei/health-water-app/tree/codex/v3-rebuild |
| 角色 | 主要维护者 |
| 申请范围 | ChatGPT Pro；API 额度及 Codex Security 不勾选 |
| 组织 ID、API 用途 | 不申请 API，不填写 |
| 表单状态 | 尚未填写、提交；操作工具没有可连接浏览器，内置浏览器不可用 |

[官方项目说明](https://developers.openai.com/community/codex-for-oss)、[项目条款](https://learn.chatgpt.com/docs/codex-for-oss-terms)及[申请表](https://openai.com/zh-Hans-CN/form/codex-for-oss/)已核对。是否入选由官方审核决定，文案不承诺通过。

## 可复制文案

以下中英文二选一。项目理由及补充说明均控制在表单各 500 字符限制内。公开状态确认后才使用含“public / 公开”的表述。

### 项目理由 中文

262/500 字符。

```text
我是 health-water-app 的主要维护者，维护一款默认离线可用的 React/TypeScript + Capacitor 饮水记录应用。MIT 许可的 v3 开发分支公开了逐笔记录、真实撤销、保留原始数据的迁移、账号隔离和增量同步实现。43 项自动化测试通过，覆盖单元/界面、浏览器、Firestore 权限及 Android 提醒；另完成安装版文件导出、相机释放和重启恢复检查。项目可为小型跨平台应用提供数据可靠性与隐私边界的实践参考。我计划用 Codex Pro 补充迁移回归、审查同步逻辑并维护发布质量。
```

### 补充说明 中文

227/500 字符。

```text
源码及 MIT 许可：https://github.com/yjwwuwei/health-water-app/tree/codex/v3-rebuild 。验收记录和原生测试结果位于该分支 docs/。2026-10-22 本地干净安装、类型检查、lint、Web/Android 构建通过，生产依赖审计为 0 告警。项目仍处早期，0 star、0 fork，暂无采用数据；真机、旧签名覆盖升级及生产云部署待完成。申请仅面向含 Codex 的 Pro。
```

### 项目理由 英文

491/500 字符。

```text
I maintain health-water-app, an MIT-licensed, offline-first React/TypeScript and Capacitor hydration app. The public v3 branch adds per-entry records, safe legacy migration, account isolation and incremental sync. All 43 automated tests passed locally across UI, browser, Firestore rules and Android reminders. The project offers a practical example of reliable local data and explicit privacy boundaries. I would use Codex Pro for migration regressions, sync review and release maintenance.
```

### 补充说明 英文

460/500 字符。

```text
Source, MIT license and verification: https://github.com/yjwwuwei/health-water-app/tree/codex/v3-rebuild . Local checks cover clean install, type/lint checks and Web/Android builds. The Oct 22 production dependency audit had zero alerts. Android emulator checks cover export, camera release and reboot recovery. This is an early project with no verified adoption; physical-device checks, legacy signing and production cloud deployment remain. Pro support only.
```

## 提交状态

本次已获得维护者对 MIT、公开开发分支以及可操作时代交申请的授权。浏览器工具返回空应用/浏览器列表，尝试创建内置浏览器标签也返回不可用，因此没有输入身份资料或点击提交。

分支公开和 CI 完成后补记公开提交及运行链接；只有看到官方提交成功回执，才将申请状态改为已提交。

