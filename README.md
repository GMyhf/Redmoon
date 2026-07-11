# CRIMSON RELAY

CRIMSON RELAY 是一个从零实现的在线动作 RPG 原型：Linux 运行权威服务器，macOS/Linux 玩家直接使用现代浏览器进入游戏。当前版本先验证联网战斗、角色成长和部署链路；后续原生客户端计划使用 Godot。

> 本项目不是《红月》的复刻、私服或兼容服务器，也不包含其代码、协议、角色、剧情、地图、美术、音乐或其他资产。名称、世界观、内容和实现均保持原创，详见[知识产权边界](#知识产权边界)。

## 快速开始

需要 Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:3000`。同一局域网试玩时：

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

然后在 macOS/Linux 浏览器访问 `http://<server-ip>:3000`。公网部署应在反向代理上启用 HTTPS/WSS，不要直接暴露未加密端口。健康检查为 `GET /health`。

## 当前可玩切片

- 浏览器创建角色并通过 WebSocket 加入共享区域
- 服务器权威处理移动、瞄准、攻击、伤害和重生
- 多种原型职业、属性分配和技能升级
- 敌人、经验、任务、升级与实时状态同步
- 无需下载客户端，桌面键鼠即可游玩

操作：`WASD`/方向键移动，鼠标瞄准，按住左键或按空格进行普通攻击，`Q`/`E` 使用技能。属性、技能升级和重生使用界面按钮。

这是架构验证版本：世界状态保存在内存中，服务重启后不会保留角色进度。

## 常用命令

```bash
npm start       # 启动服务器
npm run dev     # 文件变更后自动重启
npm test        # 运行测试
npm run check   # 检查服务器与浏览器脚本语法
```

代码分为 `src/server/`（Linux 服务端）、`public/`（浏览器客户端）、`test/`（自动化测试）和 `deploy/`（部署样例）。协议与演进方案见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## Linux 部署

将仓库安装到 `/opt/crimson-relay`，安装生产依赖，再启用样例服务：

```bash
sudo install -d -m 0755 /opt/crimson-relay
sudo cp -a package.json package-lock.json public src /opt/crimson-relay/
sudo npm --prefix /opt/crimson-relay ci --omit=dev
sudo install -m 0644 deploy/crimson-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crimson-relay
```

端口和监听地址可通过 `/etc/crimson-relay.env` 覆盖，例如 `HOST=127.0.0.1`、`PORT=8080`。服务使用临时动态用户且不写项目目录；未来持久化数据应放入 PostgreSQL 或显式配置的 systemd 状态目录。

## 路线图

1. 固化消息协议、断线恢复、延迟补偿和压力测试。
2. PostgreSQL 账户、角色、物品与审计记录。
3. Godot macOS/Linux 原生客户端，与浏览器客户端共用版本化协议。
4. 多区域和副本进程、匹配、队伍及跨区路由。
5. 原创 PvP 模式、赛季、拍卖行和可重复成长/转生系统。

## 知识产权边界

本仓库采用 clean-room（洁净室）方式开发：只借鉴“等距视角、实时联网、属性成长”等通用玩法概念，不读取、反编译或复用原游戏及任何第三方服务器的代码、数据和网络协议。当前画面由原创 Canvas 几何图形和仓库内原创 SVG 构成。贡献不得提交抓取或提取的素材、复刻地图、原角色/剧情文本、商标化界面或未经许可的音乐与图像。外部游戏只能作为历史与类型背景；所有可发布内容必须有清晰授权或由本项目独立创作。

CRIMSON RELAY 与《红月》、Redmoon2 及其权利人或运营者没有隶属、授权或背书关系。
