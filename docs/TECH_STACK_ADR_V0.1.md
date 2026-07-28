# 多人球形声音世界技术选型 ADR V0.1

**状态：** 已接受，用于本地多人技术验证  
**日期：** 2026-07-26  
**上游规则：** `CORE_LOOP_V0.2.md`  
**服务边界：** `MULTIPLAYER_BACKEND_CONTRACT_V0.1.md`

## 1. 决策

V0.1 采用以下组合：

- Web 客户端继续使用现有 Vite + TypeScript + Three.js；
- Cloudflare Worker 承担 HTTP API、鉴权适配和实时连接入口；
- 每颗星球由一个 SQLite-backed Durable Object 作为权威房间；
- D1 保存跨星球的身份、邀请、成员索引、目录和资源元数据；
- R2 只保存音频二进制文件，通过短期授权地址访问；
- 首轮只实现开发身份适配器，不把具体登录供应商写死在领域逻辑中。

这不是永久架构承诺。它只覆盖邀请制四人星球、低并发实时移动、关系互动、轻种植、物品与声音绑定的首轮验证。

## 2. 为什么选择“每颗星球一个 Durable Object”

一颗星球最多四名成员，天然适合由一个单线程权威房间协调。移动目标、权威位置、相遇计时、双向回应、作物、碎片账本、物品和赠送可以在同一个星球事务域内处理，避免客户端自行决定结果。

Durable Objects 原生支持 WebSocket 协调；休眠 WebSocket 可以在无人发送消息时降低持续连接成本。SQLite-backed Durable Object 提供强一致、事务化的星球内存储，适合防止重复收获、重复购买和重复赠送。

## 3. 数据归属

| 存储 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| Planet Durable Object SQLite | 在线状态、权威位置、相遇与回应、关系共鸣、菜地、碎片账本、物品实例、摆放、星球内赠送 | 音频文件、跨星球搜索、全局目录 |
| D1 | 用户、角色基础资料、星球目录、邀请、成员索引、物品与作物配置、音频元数据 | 高频位置快照、星球内事务账本 |
| R2 | 原始音频及处理后的音频对象 | 权限真相、物品状态、关系状态 |

V0.1 中一名玩家只属于一颗主星球，因此碎片、物品和关系均可安全留在 Planet Durable Object 内。如果未来允许多颗星球、跨星球市场或全局背包，再迁移到独立关系数据库事务域。

## 4. 一致性边界

Durable Object、D1 和 R2 之间不存在跨存储原子事务，因此禁止把一次经济操作拆到多个存储中完成。

- 收获、兑换、购买、摆放、赠送和共鸣增加全部在 Planet Durable Object 的单次 SQLite 事务内完成；
- D1 只保存可重建的星球摘要和跨星球索引；
- Planet Durable Object 使用 outbox 记录待同步摘要，失败可重试；
- 音频上传使用 `pending -> uploaded -> verified -> ready -> retired` 状态机；
- 新音频未进入 `ready` 前，正式声音引用保持不变；
- R2 对象删除采用延迟清理，避免元数据与文件短暂不一致时丢失原声音。

## 5. 实时协议决策

- 客户端发送球面目标方向，不直接上传任意当前位置；
- Planet Durable Object 以 10—20 Hz 推进大圆路径移动；
- 初始以 10 Hz 广播权威位置快照；
- 本地角色继续预测移动，远端角色插值显示；
- 相遇计时只读取服务端权威位置；
- 声音距离衰减和混音继续在客户端完成；
- WebSocket 只推送状态结果，经济写入仍走带幂等键的命令接口。

频率是首轮预算，不是永久常量，后续根据延迟、流量与移动观感调整。

## 6. 身份策略

首轮本地验证使用明确标注为开发环境的身份适配器：

- 允许选择四个固定开发用户之一；
- 服务端仍从已签发的开发会话读取用户身份，不接受请求体自报 `userId`；
- 生产构建必须关闭开发身份入口；
- 公开测试前必须接入正式身份供应商，并完成会话撤销、封禁和设备令牌策略。

这样可以先验证权威房间与核心循环，不把登录产品决策混入底层领域代码。

## 7. 未选择方案

### Supabase 单独承担后端

Supabase 的 Postgres、Auth、Storage、Realtime 和行级权限很适合关系数据与私有音频，但 Broadcast/Presence 本身不是权威游戏模拟循环。若再增加专门房间服务器，首轮架构反而会多一层。

### Firebase

Firestore 事务可用，但在线状态通常需要 Realtime Database 与 Cloud Functions 再同步到 Firestore。对本项目的关系、物品账本和赠送事务而言，数据边界更分散。

### 自建常驻 Node WebSocket 服务器

控制力最高，但首轮需要额外处理进程托管、房间路由、断线恢复、数据库连接和水平扩展。当前四人邀请制验证不值得先承担这些运维面。

## 8. 已知风险与处理

1. **平台绑定：** 领域规则保持纯 TypeScript，Cloudflare 绑定只存在于适配层。
2. **Durable Object 热点：** 每颗星球只有四人，首轮不构成热点；若单星球扩至大规模公共空间必须重审。
3. **跨存储一致性：** 通过单一事务归属、outbox 和音频状态机处理，不伪造分布式事务。
4. **身份尚未定案：** 开发身份只能用于本地和受控环境，公开测试前是强制阻断项。
5. **音频隐私：** R2 地址必须短期有效，服务端先验证星球成员资格；日志不记录完整签名地址。
6. **部署区域与合规：** 尚未决定，任何真实用户音频上传前必须重新确认存储区域、删除流程与隐私文本。

## 9. 本地实施顺序

### A. 权威房间骨架

- 新建隔离的 `backend/` 工程；
- 建立 Worker 路由、Planet Durable Object 和共享协议类型；
- 实现开发身份与固定开发星球；
- 两个浏览器连接同一房间并收到权威快照。

### B. 移动与相遇

- 抽取纯 TypeScript 球面数学；
- 服务端校验移动目标并推进位置；
- 客户端接入预测与远端插值；
- 实现相遇候选、累计、离开宽限和资格事件。

### C. 关系与轻种植

- 实现回应发起、接受和 24 小时幂等限制；
- 实现四格菜地、成熟时间、浇水上限和收获；
- 实现回声碎片账本、兑换与购买事务。

### D. 物品与声音

- 实现物品实例、球面摆放、收回与赠送；
- 最后接入 R2 上传和短期访问授权；
- 在这一步之前只使用已有占位音频，不进入美术资产生产。

## 10. 技术验收门槛

- 两个客户端可以加入同一开发星球并互见移动；
- 篡改位置、速度、身份和旧连接写入会被拒绝；
- 相遇不能由客户端伪造；
- 回应、收获、兑换、购买和赠送重复提交不会重复生效；
- 修改客户端时间不能让作物提前成熟；
- 房间重启后星球关键状态可恢复；
- 非成员不能加入房间或获取声音访问授权；
- 本地自动化测试覆盖球面移动、状态机、事务和幂等边界；
- 整个阶段不需要正式角色、星球、作物或物品美术。

## 11. 重新评估触发条件

出现以下任一情况时重新评估本 ADR：

- 单颗星球成员或同时在线人数明显超过当前四人模型；
- 一名玩家需要加入多颗星球；
- 出现跨星球市场、交易或全局背包；
- 需要复杂的公开发现、搜索或排行榜；
- 需要独立原生客户端长期运行；
- 真实用户音频的部署区域或合规要求与当前平台能力冲突。

## 12. 官方依据

- Cloudflare Durable Objects：https://developers.cloudflare.com/durable-objects/
- Durable Objects WebSocket：https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- SQLite-backed Durable Objects：https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cloudflare D1 API：https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare R2 预签名 URL：https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Supabase Realtime：https://supabase.com/docs/guides/realtime
- Firebase Presence：https://firebase.google.com/docs/firestore/solutions/presence

