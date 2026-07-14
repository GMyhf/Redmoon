# CRIMSON RELAY

CRIMSON RELAY 是一个从零实现的网页在线动作 RPG（ARPG）原型：Linux 运行唯一权威服务器，浏览器与 Godot 4.3 原生客户端只提交输入并渲染服务器状态。项目面向轻量化游戏体验，支持组队升级、自动战斗与休闲挂机；账号、战斗和成长状态由服务端统一管理。

项目已在 GitHub 开源：[GMyhf/Redmoon](https://github.com/GMyhf/Redmoon)。服务器可以部署在 `clab.pku` 等 Linux 环境，并结合 [Tailscale](https://tailscale.com/) 组网，让授权用户从不同网络访问同一游戏服务。公开部署仍建议通过 HTTPS/WSS 反向代理，并按实际运营需求配置访问控制与防沉迷策略。

## 名称由来

“CRIMSON RELAY” 是对 `Redmoon` 的英文品牌化表达，也同时指向项目的世界观和技术特征：

- **Crimson** 意为深红、绯红，是 `Redmoon` 中“红”的更具史诗感的表达，对应《红月》式的压抑、科幻与热血氛围。
- **Relay** 意为接力或中继。在情怀层面，它代表将经典动作 RPG 的记忆以现代技术接力到今天；在技术层面，它呼应在线组队、跨网互联以及 Tailscale 所体现的网络中继与连接。

因此，这个名字可以理解为“绯红之传”或“红月中继站”，口号是：**跨越网络的红月记忆。**

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

- 八个原创职业，各有独立数值、普攻与 Q/E/R/C/F 技能组
- 浏览器创建角色并通过 WebSocket 加入共享区域
- 服务器权威处理移动、瞄准、攻击、伤害和重生
- 点击地面移动、点击敌人自动追击攻击的经典 aRPG 操作
- 多种原型职业、属性分配、技能升级与转生系统
- 装备掉落：十类物品、十二个穿戴位（含盾牌与三枚戒指），装备带等级要求、稀有度与强度评分
- 人形穿戴图：HUD 中按身体部位摆放装备格，点击可卸下；物品提示带强度评分和与已装备的对比
- 自动换装：拾取后自动穿上各部位最强装备，也可点「自动」按钮手动触发
- 4800×2700 大世界，城镇与九张主题猎场各自维护怪物、地图元数据、传送门和等级带
- 八个区域 Boss 阶梯（Lv130 → Lv1000），独立 90 秒重生与奖励
- 等级上限 1000；属性、五项技能、装备、任务、组队、聊天、自动战斗/加点/换装和转生均由服务器结算
- 第一个确定性组队副本「深红中继密库」按队伍平均等级生成固定敌阵与一次性结算，带实例容量和 15 分钟超时回收
- 中央城镇安全区（免疫怪物伤害、加速恢复）、修复药剂（`V` 键饮用）
- 自动战斗（`T` 键开关）：站立时自动反击射程内的敌人
- 城镇五座传送门直达各地貌猎场，各猎场设回城门（站上约 0.6 秒触发）
- 飘字伤害数字、受击闪白、右下角小地图与原创合成音效
- 敌人、经验、任务、升级与实时状态同步
- 浏览器支持可拖动/折叠/重置 HUD 与独立移动端布局；Godot 客户端覆盖同一套成长、商店、队伍、账号和副本操作

操作：左键点击地面移动（可按住拖动），左键点击敌人锁定并自动攻击，右键朝准星方向手动攻击（空格亦可），`WASD`/方向键手动移动（会取消点击指令），`Q`/`E` 使用技能，`V` 饮用背包中的第一瓶修复药剂。属性、技能升级、重生和转生（10 级解锁，重置等级换取永久强化）使用界面按钮。

世界战斗状态保存在内存中。账号进度默认原子保存到 owner-only 的 `data/accounts.json`，
可通过 `PERSIST_PATH` 改路径或设为空串禁用；设置 `DATABASE_URL` 后改用 PostgreSQL
版本化账号表与事务审计表。会话令牌只保存 SHA-256 摘要，客户端可生成一次性恢复码或
主动轮换令牌；官方客户端会在新建、找回或轮换前先持久化客户端生成的 `nextToken`，即使
提交成功后的响应丢失也能安全重试。凭据变更持久化成功后才回传。

## 常用命令

```bash
npm start       # 启动服务器
npm run dev     # 文件变更后自动重启
npm test        # 运行服务器测试（快速，无浏览器）
npm run test:browser  # 浏览器真实交互测试（CDP 驱动系统 Chrome；可用 CHROME_BIN 指定路径）
npm run check   # 检查服务器与浏览器脚本语法
npm run check:godot  # 需要 Godot 4.3+，检查原生客户端项目
```

代码分为 `src/server/`（Linux 服务端）、`public/`（浏览器客户端）、`test/`（自动化测试）和 `deploy/`（部署样例）。协议与演进方案见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，历次改进见 [CHANGELOG.md](CHANGELOG.md)。

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

端口和监听地址可通过 `/etc/crimson-relay.env` 覆盖，例如 `HOST=127.0.0.1`、`PORT=8080`。
服务使用临时动态用户；未设置 `DATABASE_URL` 时，账号存档由 systemd `StateDirectory`
放在 `/var/lib/crimson-relay/accounts.json`，不写项目目录。JSON 适合本地和单实例，
长期公开部署使用 PostgreSQL。`/health`、`/ready` 与 `/metrics` 报告持久化、审计、tick、
事件循环、快照耗时和慢连接状态；HTTPS/WSS 样例见 `deploy/`。
默认 `data/` 和 systemd 状态目录由服务管理为 0700；显式 `PERSIST_PATH` 指向已有父目录时
不会改该目录权限，只有专用目录才应设置 `PERSIST_MANAGE_DIRECTORY=1`。

## 路线图

1. 公开运营前先完成 PostgreSQL 实库迁移演练、恢复/轮换值班手册、审计保留策略和持续容量观测。
2. 将当前进程内确定性副本迁移到有版本票据的独立 worker，并把现有 15 秒断线保席扩展到跨 worker 续接。
3. 继续补 Godot 打包、签名、输入法和跨平台发布验证，不再优先做纯视觉装饰。
4. PvP、赛季、拍卖行与更多地图暂缓，待账号安全、容量和副本路由经过长期运行验证后再排期。
