# 全渠道坐席辅助系统 · 前端

面向企业内部坐席的**售前咨询 · 售后处理 · 排班请假 · 协作审批 · 销售分析 · 权限管理**一体化控制台。
依据 `_refs/` 下的 PRD v2.1、角色首页 IA 与原型视觉（v3 浅色企业后台）实现，全量数据为固定种子生成的**虚构数据**，同时提供 Web 与 Windows 桌面两种运行方式。`_refs/` 为内部需求与原型资料，未纳入版本库，不影响构建与运行。

技术栈：**Vue 3.5 + Element Plus 2.9 + Axios + ECharts 5 + Pinia + Vue Router 4 + Vite 6**；富文本用 **Tiptap 2**（`@tiptap/vue-3` + StarterKit + Image + Placeholder）。

---

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物
npm run lint       # ESLint 9（flat config）
npm run lint:style # Stylelint 16（含 postcss-html）
```

Node 18+。演示账号密码统一为 `123456`，登录页可一键切换 8 类角色。

| 账号 | 姓名 | 角色 | 数据范围 |
| --- | --- | --- | --- |
| `agent01` | 林晓 | 坐席（含质检工作区） | 本人 |
| `lead01` | 周敏 | 组长 | 本组 |
| `mgr01` | 陈志远 | 经理／主管 | 本部门 |
| `gm01` | 苏文清 | 总经理 | 全量 · 只读 |
| `admin01` | 系统管理员 | 管理员 | 全量读写 + 配置 |
| `qa01` | 何静 | 质检 | 仅质检模块 |
| `catalog01` | 徐蕾 | 商品资料运营 | 仅商品资料库 |
| `fin01` | 赵明 | 账务复核人 | 仅资金复核 |

### 跨账号联动演示路径

8 个演示账号共用同一份 Mock 数据（`localStorage` 的 `aac:mockdb`），登出再登入另一个账号，上一步产生的数据就会出现在对方待办里。初始批次已固定好下列线索，不会被随机种子冲掉：

| 步骤 | 操作账号 | 动作 | 换账号后看到什么 |
| --- | --- | --- | --- |
| 1 | `agent01` 林晓 | 工作台接入「待接入」会话 → 生成报价单 | `lead01` 会话管理里该会话变「进行中」、归属林晓；报价单进销售台账 |
| 2 | `agent01` | 把会话转接给周敏 | `lead01` 转接确认出现待办（180 秒倒计时）→ 同意后会话归属改为周敏，林晓侧不再可见 |
| 3 | `agent01` | 请假管理提交申请 | `lead01` / `mgr01` 请假列表出现待审批 → 通过后林晓侧状态变「已通过」 |
| 4 | `agent01` | 售后工单受理「设备开机无响应」 | `mgr01` 可见并流转到退款 → `fin01` 复核 → `gm01` 终审（≥12 万） |
| 5 | `admin01` | 系统 → 审计日志 | 以上每一步都有「谁 / 何时 / 改了什么」的记录 |

演示前用 `admin01` → 系统 → 数据初始化 → 恢复初始数据，可回到干净批次。

---

## Web 部署（云服务器）

同一份 `dist/` 可直接静态托管，不需要 Node 后端或数据库：

```bash
bash deploy/deploy-web.sh               # 构建 + 上传 + 配置 Nginx + 验证
bash deploy/deploy-web.sh --skip-build  # 复用已有 dist/
```

- 目标：任意一台装了 Nginx 的 Linux 云服务器（示例为 Ubuntu + `ubuntu` 账号 + `~/.ssh/id_ed25519` 免密登录）。
- 服务器地址不写进仓库：执行前用环境变量传入，`SERVER_IP=203.0.113.10 bash deploy/deploy-web.sh`（另有 `SSH_USER` / `SSH_KEY` 可覆盖）。
- 访问：`http://<你的服务器地址>/aac/`，与其它站点共用 80 端口，互不影响。
- 服务器静态目录 `/var/www/aac`；站点配置 `deploy/nginx-site.conf`，首次部署前会先备份 Nginx 原站点配置。
- 站点用 `vite.config.js` 的 `base: './'` + hash 路由，因此子路径部署无需 `try_files` 回退；`/aac` 会 301 到 `/aac/`。
- 纯 HTTP 裸 IP（无域名、无 HTTPS）；Mock 数据仍按浏览器 `localStorage` 隔离，跨账号联动只在同一浏览器内成立。

---

## 桌面应用（Electron）

除浏览器方式外，同一套代码可打包成 Windows 桌面程序，双击即用、无需浏览器与服务器。

```bash
npm run app:dev     # 开发模式：自动起 Vite 再拉起 Electron
npm run app:dir     # 只出免安装目录 release/win-unpacked/
npm run app:build   # 出安装包 release/坐席辅助系统-<版本>-安装程序.exe
npm run icon        # 重新生成 build/icon.png 与 build/icon.ico
```

产物：

| 路径 | 说明 |
| --- | --- |
| `release/坐席辅助系统-2.1.0-安装程序.exe` | NSIS 安装程序（可选安装目录、建桌面与开始菜单快捷方式） |
| `release/win-unpacked/全渠道坐席辅助系统.exe` | 免安装版，整个目录可直接拷贝运行 |

### 关键设计

- **用自定义 `app://` 协议加载，不用 `file://`**。`file://` 下各窗口的 `localStorage` 与 `BroadcastChannel` 归属不稳定，而本系统的跨账号、坐席↔客户联动完全依赖这两者；`app://aac` 给所有窗口一个共同且可持久化的 origin，演示数据在重启后仍在（`%APPDATA%\全渠道坐席辅助系统`）。
- **客户窗口是独立 BrowserWindow**：主进程 `setWindowOpenHandler` 接管 `window.open`，固定 520×880，已打开则复用并前置，不会重复弹窗。
- **关闭后台节流**（`backgroundThrottling: false`），坐席页切到后台（客户窗口获得焦点）时仍能实时收消息。
- **打包不依赖 winCodeSign**：`win.signAndEditExecutable = false`，改用 `electron/afterPack.cjs`（纯 JS 的 `resedit`）写入图标与版本信息。electron-builder 自带的 rcedit 会下载含 macOS 符号链接的 winCodeSign 归档，在非管理员 Windows 上解压必然失败，整条打包链会断在最后一步。
- 前端依赖全部在 `devDependencies`：产物已由 Vite 打包进 `dist/`，运行时不需要 `node_modules`，`app.asar` 保持 3 MB 左右。

> 若打包机上 `electron-builder` 仍要联网下载二进制，可设 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 与 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。

---

## 权限与请求设计

**三层拦截，前端不硬编码角色：**

1. **菜单由服务端下发** —— 登录返回 `menus[]`，`router.addRoute` 只注册有权限的路由，无权限路径进入 404 兜底页；
2. **接口二次校验** —— 每个 Mock handler 用 `requirePerm(user, activeRole, 'perm:code')` 与 `filterByScope()` 做权限码 + 数据范围过滤，越权返回 403；
3. **按钮级兜底** —— `v-perm="'order:cancel'"` 指令直接移除 DOM，不置灰、不提示「无权限」。

**双轨矩阵**：菜单可见范围（`menus`）× 数据范围（`self / group / dept / all / all-readonly / 模块级`）。
多角色账号（如 `agent01` 兼质检）可在顶栏切换工作区，请求通过 `X-Active-Role` 头声明当前角色。

**axios 封装**（`src/api/http.js`）：请求拦截注入 `Authorization` 与 `X-Active-Role`；响应拦截解包 `{code,message,data}`、统一错误提示、401 清理登录态并跳转 `#/login?redirect=`；支持 `config.silent` 静默。

---

## Mock 后端（无需真实服务）

`src/mock/` 是一个挂在 **axios adapter** 上的本地服务，具备真实 HTTP 语义（状态码、业务码、分页、403/401）：

- `seed.js` 固定种子 `mulberry32(SEED=20261109)`，同一种子可复现同一批数据；
- `generate.js` 生成 16 账号、48 客户主体、27 分类、89 SKU、140 订单、52 售后、26 会话、56 工单、14 天排班、32 请假、40 审批、18 转接、26 退款、30 对账批次、28 抽检样本、68 审计、360 条埋点；
- `db.js` 提供 `paginate / filterByScope / requirePerm / logAudit / pushNotification` 等；
- 数据持久化在 `localStorage`（前缀 `aac:`），「系统 → 数据初始化」可执行校验、保存快照、重建数据、恢复初始数据。

切换真实后端时，删掉 `createMockAdapter()` 并改 `baseURL` 即可，其余代码不变。

### 写操作是否真的落库

会改变业务状态的操作都走 `POST / PUT` 接口 → 修改 Mock 数据库 → `persist()` 写入 `localStorage`，刷新后仍在；同时追加一条审计日志（系统 → 审计日志可查）。

| 域 | 写操作 | 落库结果 |
| --- | --- | --- |
| 审批 | 通过 / 驳回 | `approvals.status`、审批人、审批时间；≥12 万或岗位调动仅 gm / admin 可批 |
| 请假 | 提交 / 通过 / 驳回 / 撤回 | `leaves` 新增或状态变更，区间自动折算天数 |
| 排班 | 调班 / 发布 | `schedules` 班次变更，发布后对坐席可见 |
| 转接 | 接收 / 拒绝 | `transfers.status`；接收后会话归属改为接收人 |
| 会话 | 接入 / 结束 / 发送消息 / 草稿 / 报价 / 转接 | `sessions.status` 与 `messages` 追加；报价写入 `quotes` 台账 |
| 售后 | 创建 / 受理 / 检测 / 通过 / 拒绝 | `aftersales` 按状态机流转，退款进入 `refunds` |
| 资金 | 复核 / 终审 / 对账差异说明 | `refunds` 状态与终审人，凭证号生成；对账备注留痕 |
| 订单 | 下单 / 取消 / 开票 | `orders` 新增、库存扣减与回滚、发票号写回订单 |
| 商品 | 新建 / 编辑 / 合规 / 发布 / 下架 | `products.status` 按状态机流转，非法跳转被拒 |
| 质检 | 评分 / 退回重答 | `qaSamples.score` 与 `status` |
| 工单 | 创建 / 分派 | `tickets` 新增或受理人变更 |
| 系统 | 用户增改 / 角色权限 / 参数配置 / 通知已读 / 数据初始化 | `users`、`roleOverrides`、`settings`、`notifications` 等 |

参数配置不是摆设：`transferExpireSeconds` 改变转接页倒计时基数，`plaintextExportWatermark` 控制导出是否带水印编号，`realtimeEnabled` 决定是否继续轮询并影响顶栏状态文案，`mockFailureRate` > 0 时按比例注入 500（认证与配置接口除外，避免关不掉），`finalApproveThreshold` 控制资金终审阈值。

刷新后数据仍在的前提：同一浏览器、未清站点数据、`DB_VERSION` 未升级。升级版本会重建初始批次。

> 自定义 adapter 不会自动校验状态码：Mock 内部用 `settle()` 按 `validateStatus` 抛错，否则 401 会被当成成功响应，响应拦截器拿不到登录态失效。

---

## 页面清单（28 条动态路由）

| 分组 | 页面 |
| --- | --- |
| 工作台 | 首页（待办 / 概览 / 快捷入口 / 告警四区，告警行可下钻详情并跳转处理）、坐席工作台（三栏 + 机器人上下文交接 + 消息头像 + 草稿卡片 + 吸底操作条） |
| 服务 | 会话管理、工单中心、售后工单（保修判定 / 四链路动作） |
| 商品 | 产品信息查询（分类树懒加载）、型号对比（≤4 型号差异高亮）、资料审核（状态机流转） |
| 销售 | 报价与下单、订单管理、发票管理 |
| 资金 | 退款复核、日对账、终审中心（≥12 万） |
| 人力 | 排班日历（班次矩阵 / 调班 / 发布）、请假管理（申请 / 审批 / 撤回） |
| 协作 | 转接确认（倒计时 + 确认门）、审批中心（L1/L2 + 岗位调动） |
| 分析 | 销售分析（趋势 / 渠道 / 品类 / 漏斗 / 排行 / SLA）、坐席效果 |
| 质检 | 抽检队列（草稿 vs 发送差异、评分、退回） |
| 系统 | 用户管理、角色权限、菜单权限矩阵、审计日志、数据初始化、参数配置 |

---

## 客户侧实时对话（演示）

登录页底部「客户身份进入」会打开一个独立的客户窗口（路由 `#/customer-chat`，公开路由，不占用坐席登录态），用来演示「客户先进线、坐席后接入」的完整链路：

1. **机器人接待**：客户先与智能助手小 A 对话，机器人按商品资料库回答参数 / 价格 / 保修，并把关注点记在会话里；
2. **转人工**：客户点「转人工」或说出「人工 / 客服」，会话进入 `waiting`，机器人上下文（意图、槽位、建议回复）随会话留存；
3. **公共队列**：未分配坐席的待接入会话进入所有坐席的「工作台 → 待接入」列表，谁先接入或先回复就归谁（此前会话都是预分配，客户进线后无人可见）；
4. **双向实时**：坐席接入后客户窗口立即显示「坐席 林晓 正在为你服务」；任一方发消息，另一方约 1 秒内收到，并有「正在输入」提示。

**实时通道**：`src/realtime/chatBus.js` 用 `BroadcastChannel` 在同一浏览器的窗口间广播（`localStorage` 信号兜底），语义对齐 WSS 的服务端推送；`db.js` 同时监听 `storage` 事件作废内存快照，避免另一个窗口读到旧快照再写回覆盖。

**富文本输入**（`RichComposer.vue`，坐席与客户共用）：

- 工具栏：加粗 / 斜体 / 删除线 / 无序列表 / 有序列表 / 引用 / 插入图片 / 表情；
- 图片：支持 `Ctrl+V` 粘贴截图、拖拽、选择文件；超过 220KB 的图片按最长边 900px 重采样为 JPEG 以控制 `localStorage` 占用，单条最多 6 张；图片插入后自动补空段落，继续输入不会把图替换掉；
- 表情：`utils/emojis.js` 维护 5 组共 400+ 个 Unicode 表情（常用 40 / 表情 114 / 手势 60 / 物品 120 / 符号 110），量级对齐微信默认表情面板；「常用」页会把最近用过的 16 个置顶（存 `aac:emoji-recent`），面板点外部/`Esc`/发送后自动收起，选中表情后保持展开以便连发；
- 表情面板是自绘浮层（`Teleport` 到 `body` + `position: fixed`，向上贴按钮展开、空间不足自动翻到下方），不再用 `el-popover`——原先的栅格在白底容器外溢出、遮罩错位；
- 消息以 HTML 存进 `sessions.messages`，渲染前经 `utils/html.js` 过滤脚本与内联事件。

**已读回执**（对齐企业微信）：坐席与客户各自只在自己的气泡下看到状态——对方看过显示「✓ 已读」，未看显示「未读」，悬停可看到对方查看的具体时间。

- 数据：消息对象新增 `readAt`（时间戳），随 `sessions.messages` 落库；机器人消息不参与回执。
- 接口：客户侧 `POST /api/customer/sessions/:id/read` 标记坐席发来的消息，坐席侧 `POST /api/workbench/read` 标记客户发来的消息；标记成功后通过实时通道广播 `read` 事件，另一端无需刷新即可从「未读」变「已读」。
- 触发时机与微信一致：只有窗口处于可见状态（`document.visibilityState === 'visible'`）才算读过；切回该窗口时补一次回执。坐席端额外在选中有未读消息的会话时回执。
- 若客户窗口没开或停在别的标签页，坐席那条消息会一直显示「未读」，切回窗口后自动变「已读」——这条链路可以直接用来演示。

**图片预览**（`RichMessage.vue`，坐席与客户共用）：气泡内的图片 `cursor: zoom-in`，点击用 `el-image-viewer` 全屏放大（深色遮罩、可滚轮缩放、Esc 关闭）；同一条消息有多张图时可左右切换，点击遮罩或关闭按钮退出。

演示步骤：登录页点「客户身份进入」→ 发一句话 → 转人工 → 另开窗口用 `agent01` 登录 → 工作台「待接入」接入该会话 → 两边对聊（可互相发图），并把两个窗口并排摆放——对方看到消息后，气泡下方的「未读」会实时变成「✓ 已读」。

---

## 关键实现

- **动态路由重装**：菜单签名（`menus` key 排序串）变化时重装路由，并用 `{ path, query, hash }` 重新匹配，避免深链首次进入落到 404。
- **分类树首屏优化**：`el-tree lazy` + cascader 共用 `GET /api/products/categories?parentId=`，每次只返回一层，首屏仅请求一级。
- **参数护栏**：工作台生成草稿时，未收录参数（故障率、竞品、底价等）直接拒答并说明原因，不编造；命中参数返回资料库原文与来源。
- **机器人上下文交接**：客户先与 AI 沟通，机器人完成意图识别与槽位收集后转人工；坐席在工作台看到接待时长、意图、已收集信息、转人工原因与建议回复，消息按「机器人 / 客户 / 坐席」区分头像。
- **幂等**：订单、售后、转接提交带 `idempotencyKey`，重复提交返回原单据。
- **二次确认**：发送消息只在**本机首次**发送时确认（`aac:chat-send-confirmed`，确认一次后不再打断）；代客下单、终审、发布排班、恢复初始数据等不可逆操作仍每次确认。
- **ECharts 按需引入**：`echarts/core` + Bar/Line/Pie/Funnel，`VChart.vue` 封装 ResizeObserver 自适应；涨红跌绿沿用 A 股习惯。
- **代码规范**：ESLint 9 flat config（`vue/recommended`）+ Stylelint 16（`stylelint-config-standard` + `postcss-html`）+ `.editorconfig`。

---

## 目录结构

```
src/
├── api/          # http.js（axios + 拦截器）、index.js（接口分组）
├── components/   # PageHeader / StatCard / VChart / StatusTag / ProductThumb / RichComposer / RichMessage
├── composables/  # useTable（列表状态：加载、分页、查询、汇总）
├── layouts/      # BasicLayout（侧栏 + 顶栏 + 实时状态）
├── mock/         # seed / dict / generate / db / api/*（14 个 handler）/ index.js（adapter）
├── realtime/     # chatBus（跨窗口实时通道：BroadcastChannel + 存储兜底）
├── router/       # 动态路由表 + 守卫
├── stores/       # user（登录态、菜单、权限、角色）、app（折叠、通知、实时）
├── styles/       # variables.css（设计令牌）、index.css（全局与 EP 覆写）
├── utils/        # format / storage / permission（v-perm）/ image（压缩）/ html（清洗）/ emojis（表情分组）
└── views/        # 28 个后台页面 + customer/CustomerChatView（客户侧窗口）
_refs/            # PRD v2.1、角色首页 IA、原型 HTML/CSS（视觉依据，不参与构建，未纳入版本库）
```

---

## 已知限制

- 无真实后端：所有数据在浏览器内生成并持久化，清空站点数据即回到初始批次；
- 客户会话与图片消息都写 `localStorage`：图片压缩后约 100–200KB/张，5MB 配额下建议单场演示不超过 20 张；
- 客户侧实时通道是浏览器内广播，只在同一浏览器的窗口之间生效；`/api/customer/*` 是无鉴权的演示接口，仅本地 Mock 有意义；
- 跨账号联动只在**同一浏览器**内成立：登录态与数据库都存在 `localStorage`，两个标签页分别登录不同账号会互相顶号，跨设备也不共享数据；演示时请在单窗口「退出 → 登录」切换账号；
- 导出只写审计并返回水印编号，**不产出真实文件**；
- 会话是静态演示数据：坐席发出的消息会真实追加，但客户不会自动回复、也不会产生新会话；
- 质检抽检比例是生成参数，修改后需在「数据初始化」重建数据才会生成新批次；
- 实时推送为 15s 轮询模拟（可在参数配置关闭，关闭后顶栏显示“实时推送已关闭”）；
- 仅实现浅色主题（设计稿 v3 为浅色企业后台）；
- `element-plus` 全量引入（1.2 MB / gzip 378 KB），后续可按需引入进一步瘦身；
- 桌面端未做代码签名，首次运行可能出现 SmartScreen 提示（选择“仍要运行”）；安装包约 79 MB，主要体积来自 Electron 运行时。

---

## 许可证

[MIT](LICENSE) © 2026 Heruta。可自由用于商业项目，保留版权与许可声明即可。
