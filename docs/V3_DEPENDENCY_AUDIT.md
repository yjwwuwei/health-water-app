# v3 开发依赖审计

核查日期：2026-10-22（Asia/Shanghai）。基线与分支沿用 `v3-verification.json`。本轮核对锁文件、实际安装文件、命令入口、官方 npm 注册表和上游安全公告。

**结论：生产依赖审计为 0；全树仍为 9 个告警包（3 high、6 moderate），对应 3 个独立安全公告。当前依赖范围内没有可用的兼容修复，未修改依赖、业务代码或构建输入。** 9 是 npm 的包级计数；`uuid` 有两份受影响安装，因此 audit 的 `nodes` 合计是 10 个路径。不能把这些数字描述为 9 或 10 个独立漏洞。

详细机器记录见 [v3-dependency-audit.json](v3-dependency-audit.json)。本轮原始审计、注册表响应摘要、调用点摘录和验证前快照位于被忽略的 `artifacts/v3/dependency-audit-2026-10-22/`。

## 告警包及来源

直接依赖为 Firebase CLI 和 Capacitor CLI，其余为传递依赖。以下严重程度保持 npm audit 原值，不因本项目的可达性评估而降级。

| 告警包与实际版本 | 依赖关系 | npm 严重程度 | 根公告 |
| --- | --- | --- | --- |
| `firebase-tools@15.34.0` | 直接开发依赖，根范围 `^15.8.0` | high | B、O、U 传递汇总 |
| `chokidar@3.6.0` | Firebase CLI → chokidar | high | B |
| `braces@3.0.3` | Firebase CLI → chokidar → braces | high | B |
| `@google-cloud/pubsub@5.3.1` | Firebase CLI → Pub/Sub | moderate | O |
| `@opentelemetry/core@1.30.1` | Firebase CLI → Pub/Sub → OpenTelemetry | moderate | O |
| `gaxios@6.7.1` | Firebase CLI → gaxios；其认证库也共享这份 gaxios | moderate | U |
| `uuid@9.0.1`、`uuid@7.0.3` | gaxios → uuid 9；xcode → uuid 7 | moderate | U，npm 合并为一个告警包 |
| `xcode@3.0.1` | Capacitor CLI → xcode | moderate | U |
| `@capacitor/cli@8.5.3` | 直接开发依赖，精确固定 `8.5.3` | moderate | U 传递汇总 |

锁文件中这 10 个安装路径均为 `dev: true`。这只能说明依赖归属，不能单独证明开发服务器或测试过程没有风险；实际调用判断如下。

## 三项公告与实际触发条件

### B：braces 的递归栈耗尽

公告 [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 为 high，影响 `<=3.0.3`，核查时无已发布修复版本。深度嵌套的 brace 模式进入递归 AST 遍历时，可能耗尽 Node.js 调用栈；一般字符串长度限制不等同于嵌套深度限制。

`firebase-tools/lib/emulator/firestoreEmulator.js:23` 调用 `chokidar.watch(rulesPath)`。chokidar 的 `index.js:256–258` 在路径具有 glob、且含 `{` 时调用 `braces.expand`。本项目 `firebase.json` 把 rules 固定为 `firestore.rules`，当前解析路径也不含 brace；Rules 文件内容、饮水记录和 Firestore 网络请求均不会成为这个 glob 参数。因此当前 Rules 测试的 watcher 可达，但漏洞所需的深层 brace 输入不成立。若以后将监听路径改为外部输入或复杂 glob，须重新评估。

还核对了 npm 依赖图之外的嵌入副本：**Vite 8.3.5 的 `dist/node/chunks/node.js` 包含 braces 3.0.3 和经过上游补丁处理的 chokidar 3.6.0。** 这是同一公告的额外代码副本，不增加独立公告数，也没有擅自计入 npm 的 9 个告警包。Vite 在该文件 `24811–24814` 默认设置 `disableGlobbing: true`，本项目未覆盖它；`12290–12293` 和 `11892–11898` 的条件使 brace 展开分支不启用。针对实际配置创建并关闭无监听端口的开发 server，确认 watcher 的该选项确为 `true`。一次性 Web/Native 构建没有开启 `build.watch`。

### O：OpenTelemetry Baggage 内存分配

上游公告 [GHSA-8988-4f7v-96qf / CVE-2026-54285](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf) 为 moderate，修复从 `2.8.0` 开始。触发点是 `W3CBaggagePropagator.extract()` 对不可信的大体积 baggage 输入进行解析；接收传输没有大小约束时风险更高。

本项目只启动 Firestore emulator。安装的 Pub/Sub `build/src/telemetry-tracing.js:68、536、577` 使用 `W3CTraceContextPropagator`；核查 Firebase CLI、Pub/Sub 和项目源码，未发现配置受影响的 `W3CBaggagePropagator`。CLI 可能加载相关模块，但不等于执行受影响函数。当前四种命令路径未发现该公告的触发入口；未来引入 Baggage 接收器或自定义消息传播器时，这个结论需重审。

### U：uuid 输出缓冲区边界检查

上游公告 [GHSA-w5hq-g745-h8pq / CVE-2026-41907](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) 为 moderate。它针对 `v3()`、`v5()`、`v6()` API 方法接受过小输出 buffer 或不合法 offset 时的部分写入问题；这里的数字是 API 名称。公告列出的修复为 `11.1.1`、`12.0.1`、`13.0.1`。

实际安装的 gaxios `build/src/gaxios.js:417` 使用 `v4()` 生成 multipart boundary；xcode `lib/pbxProject.js:90` 使用 `v4()` 生成项目标识，均无输出 buffer 参数。这些调用不满足该漏洞条件。Android 同步明确选择 android 分支，不执行 iOS 项目更新；即使未来执行当前 xcode 的标识生成方法，该调用仍为 `v4()`。

## 对当前命令的影响

| 命令/场景 | braces | OpenTelemetry | uuid |
| --- | --- | --- | --- |
| `npm run dev` | Vite 内嵌副本存在；实测禁用 glob，未发现该触发路径 | 应用入口和 Vite 配置未使用受影响传播器 | 应用入口未使用上述 gaxios/xcode 副本 |
| `npm run build`、`build:cloud` | Vite 工具内有副本；一次性构建未启用监听 | 不运行 Firebase CLI 的 Pub/Sub 路径 | 不运行 gaxios/xcode 工具路径 |
| `npm run build:apk`、`build:apk:cloud` | 同一次性 Native Web 构建；Gradle 不调用这些 npm 模块 | 不启动 Firebase emulator | Capacitor CLI 安装/可加载 xcode，但 android 分支不执行 iOS 更新，已查 UUID 调用也为 `v4()` |
| `npm run test:rules` | Firebase CLI watcher 可达；固定 rules 路径不满足攻击输入条件 | 仅 Firestore，未发现 Baggage 接收调用 | CLI HTTP 工具可能使用 gaxios；其 UUID 调用为 `v4()` |

这些结论限于当前锁文件、安装代码、脚本及配置。没有把“开发依赖”或“生产 audit 为 0”当作所有开发过程安全的证明，也没有把静态调用审查描述成渗透测试。三个受影响包未作为应用运行时依赖进入 Web/Android 客户端；Vite 的内嵌副本属于构建工具本身。

## 为何没有更新锁文件

核查来源为 [官方 npm 注册表](https://registry.npmjs.org/)，具体请求 URL、查询时间和响应 ETag 已存入机器记录。

| 依赖边/根约束 | 当前与范围内最高稳定版 | 能移除该告警的方向 | 本轮处理 |
| --- | --- | --- | --- |
| Firebase CLI `^15.8.0` | `15.34.0` | 等上游调整其传递依赖 | 已是范围内最高版本 |
| Capacitor CLI 精确 `8.5.3` | `8.5.3`，也是 latest | 等上游采用更新的 xcode | 与 core/android 保持 `8.5.3` 对齐 |
| chokidar `^3.6.0` → braces `~3.0.2` | `3.6.0` → `3.0.3` | braces 尚无修复；chokidar 新主版本超出范围 | 保留并记录监听输入边界 |
| Pub/Sub `^5.2.0` → OTel `^1.30.1` | `5.3.1` → `1.30.1` | Pub/Sub `6.3.1` 已依赖 OTel `^2.8.0`，但跨主版本 | 不强行覆盖传递依赖 |
| gaxios `^6.7.0` → uuid `^9.0.1` | `6.7.1` → `9.0.1` | gaxios 新主版本移除 uuid；或 uuid 升至修复主版本 | 均超出当前依赖边范围 |
| xcode `^3.0.1` → uuid `^7.0.3` | `3.0.1` → `7.0.3` | xcode `4.0.0` 已移除 uuid | 跨主版本，交由 Capacitor 上游适配 |
| Vite 精确 `8.3.5` | `8.3.5`，也是 latest | 等上游更新内嵌实现 | 当前 glob 禁用，保留证据 |

未采用 audit 建议的 Firebase CLI `14.23.0` 或 Capacitor CLI `8.4.3` 回退，也未执行 `npm audit fix --force`。既有 `@grpc/grpc-js: 1.14.6` override 保持原样，未新增 override。弃用提示与安全公告分开记录，不能把 uuid 弃用提示额外计作漏洞。

下次修改这些工具、监听配置或加入新的传播器时，重新执行全树和生产 audit、检查受影响 API。优先接受父包在现有范围内发布的修复；若必须跨主版本，单独评估兼容性并运行受影响检查。任何构建输入变化后，都要重新生成受影响产物及对应哈希记录。

## 本轮验证与证据

- 全树 audit 前后均为 9 个告警包；命令退出码 1 表示仍有告警，不能记为通过。生产 audit 为 0，退出码 0。
- `npm ls` 检查通过；查询的锁文件版本与实际安装版本一致。
- Vite watcher 定向核验通过：未开放监听端口，`disableGlobbing=true`，核验后已关闭 server。
- 原验收记录的 57 个源码/构建输入 SHA-256、4 个产物 SHA-256（3 个包及预览图）逐项匹配。依赖和构建输入没有变化，因此复用原 40 项通过记录，没有声称本轮重新执行这些测试，也没有重打无变化的包。
- 原有两份 OSS 草稿/证据保持原 SHA-256；规划简报未修改。没有推送、部署、签名变更、真机操作或临时 junction 清理。

原始证据目录包含 `audit-inherited.json`、`audit-before.json`、`audit-after.json`、`audit-production.json`、`registry.json`、`advisories.json`、`npm-ls.json`、`dependency-edges.json`、`installed-packages.json`、`call-sites.json`、`vite-watch-probe.json`、`verification-before.json`、`integrity.json`。可提交的机器摘要为同目录 `v3-dependency-audit.json`；忽略目录不是 GitHub 上可用的审计附件。
