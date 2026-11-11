# 大沉默（工作名）

你是未来文明里最后一位人类执政官。宇宙里本该到处是文明，却一片沉默。在同样的命运降临之前，带领一个由 AI 运转的文明弄清楚：它们都去哪了。

垂直切片的灰盒版本已经可玩：六个星系、三种真相、四类证据、三件需要签字的事。画面是程序绘制的占位，文书用模板，还没有接入模型。下一步是真人试玩。

## 文档

- [游戏设计文档](docs/GDD.md)：现行设计的唯一依据，先读这个
- [垂直切片规格](docs/SLICE.md)：第一段要做出来的完整游戏，具体到每个星系和每个数值
- [架构](docs/ARCHITECTURE.md)

设计文档的来源，冲突时以设计文档为准：

- [使命](docs/MISSION.md)
- [世界、真相、一次苏醒](docs/DESIGN.md)
- [奇观图鉴与真实感规范](docs/WONDERS.md)

背景：

- [方向重估](docs/DIRECTIONS.md)：为什么转向以"理解"为核心的游戏
- [点子库](docs/IDEAS.md)：几轮头脑风暴的记录

## 开发

需要 Node 22 或更新的版本。

```
npm install
npm run dev       # 在本地打开游戏
npm test          # 自动测试
npm run typecheck
npm run sim       # 模拟对局：几种固定打法各打一遍三种真相，用来调数值
npm run build     # 构建静态站点，输出到 dist/
```

- 数值都在 `src/content/balance.ts`。
- 调试时可以在网址后加 `?seed=123` 指定种子，`?truth=dream`（或 `hunter`、`blackball`）指定真相，`?new` 丢掉存档重开。
- 发布：`.github/workflows/pages.yml` 把站点发布到 GitHub Pages，需要手动触发，用法写在文件开头。
