# 多人球形声音世界后端

这是与现有单机 Prototype 隔离的 V0.1 后端骨架。当前只包含：

- 开发环境固定身份；
- 每颗星球一个 Durable Object 权威房间；
- WebSocket 加入与离开；
- 球面点击目标移动；
- 权威位置快照。
- 服务端权威的相遇候选与 20 秒共同停留判定；
- 3 秒离开宽限和 60 秒近期活动校验。

相遇合格不会自动增加关系共鸣。当前已接入幂等的回应发起、对方接受、24 小时关系共鸣上限和本地持久化。D1、R2、正式登录、音频上传、种植、物品、赠送和正式部署尚未接入。

## 本地运行

```powershell
npm install
npm run check
npm run dev
```

健康检查：`GET /health`

权威相遇冒烟测试：`npm run encounter-smoke`。脚本会让两个开发客户端移动到球面中点并等待服务端确认 `qualified`。

先调用 `POST /v1/dev/sessions`，请求体为 `{ "userId": "dev-a" }`，允许值为
`dev-a`、`dev-b`、`dev-c`、`dev-d`。再使用返回的短期票据连接：

`ws://127.0.0.1:8787/v1/planets/dev-planet/connect?session=...`

开发身份入口在 `ENVIRONMENT=production` 时强制关闭。
