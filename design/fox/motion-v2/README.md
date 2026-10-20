# 原图端点版 · 已接入右下角

2026-10-19。原来的三张获确认 PNG 作为固定端点，分别生成 4 段动作的 6 张中间姿态，共 24 张新中间帧。起点、终点与静止时直接显示原有 FoxArtwork / FoxSittingRig，不让生成图片替代原图。中间帧在 320px 方形画布内注册至原图的轮廓范围，保留原图的底部对齐方式。

2026-10-20 图片微调：使用内置 `image_gen` 修正坐起第 2、3 张中间姿态的前腿长度和粗细，改为逐步收爪和伸展。只替换图集第 0 行的第 2、3 列（从 0 计数），其他 30 格像素不变，未重新运行测试、构建或浏览器验证。[改图提示词](rise-leg-fix.prompt.txt)、[修正后分镜](rise-leg-fix-preview.png)；修正前源图保存在 `rise-source-before-leg-fix.png`。

已接入全站 FoxPet：趴卧 → 坐姿、坐姿 → 趴卧、趴卧 → 睡眠、睡眠 → 趴卧。坐姿和睡姿互转经趴卧中转。动作进行中只保留最新目标，完成当前段后继续；收起、减少动态效果、页面失活或动作素材不可用时立即结束帧动画。离开坐姿前给原有头部追踪 180ms 归正，坐稳后再恢复追踪。

预览页 `/fox-preview` 的动作区已切换到同一套 V2 素材；放大预览及 180px 预览的首尾也使用原始 DOM 图片。下方“让它待在右下角”的姿态选择可直接检查真实角落组件。旧 V1 素材与文档保留作历史参考。

## 素材与生成方式

内置 `image_gen`，原图为固定参考，无 CLI/API 回退。

| 动作 | 提示词 | 生成原图 |
| --- | --- | --- |
| 坐起 | [rise.prompt.txt](rise.prompt.txt) | [rise-source.png](rise-source.png) |
| 趴下 | [lie.prompt.txt](lie.prompt.txt) | [lie-source.png](lie-source.png) |
| 入睡 | [sleep.prompt.txt](sleep.prompt.txt) | [sleep-source.png](sleep-source.png) |
| 苏醒 | [wake.prompt.txt](wake.prompt.txt) | [wake-source.png](wake-source.png) |

- [运行图集](../../../src/assets/fox/motion/fox-motion-v2.webp)：2560 × 1280，320px 格，lossless WebP，约 1713 KiB。
- [分镜对照](contact.png)
- [原图范围、帧注册参数及端点校验](alignment.json)
- [可重复生成脚本](../../../scripts/prepare-fox-motion-v2.mjs)：`node scripts/prepare-fox-motion-v2.mjs`。

脚本保留原图完整画布，不裁切端点；逐像素校验图集 8 个起止格与原图等比缩放后的 RGBA 相同（忽略完全透明像素的无意义 RGB）。真实运行的首尾使用原有优化图片，而非图集端点，从而避免原图/图集分辨率或压缩造成的交接差异。生成的中间帧仍存在手绘笔触变化，端点校验并不代表中间所有细节逐像素相同。

验证：27 项测试通过，包括四条路径、首尾使用原图、经趴卧中转、连续改变目标、动作中收起、减少动态效果/不可用素材回退和头部归正。生产构建通过（26 页）。浏览器验证坐起中间帧、结束回原图、坐姿入睡、苏醒时快速切换目标、收起/展开、头部追踪 22° 后归正、390px 窄屏和深色背景，无横向溢出或控制台错误。未提交或部署。
