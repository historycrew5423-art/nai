# 3D 怪物（10-31 11:40，Tripo）

用 `assets/ref/` 的 6 张参考图在 Tripo 生成 3D（`tripo generate image-to-model --model tripo-v3.1 -p face_limit=3000`，每个 30 积分），能绑骨的绑骨（25 积分）再套走路（10 积分，原地播放）。之后用和 `tools/process-anim.mjs` 一样的办法缩小（颜色贴图 512 JPG）。预览：`docs/images/monsters-3d-sheet.jpg`。

| 文件 | 怪 | 面数 | 动作 |
|---|---|---|---|
| lute.glb | 鲁特琴 | 2820 | walk（人形骨骼） |
| birdhead.glb | 鸟嘴面具客人 | 2822 | walk（人形骨骼；检查建议鸟类骨骼，但鸟类没有现成动作） |
| drum.glb | 鼓 | 2835 | walk（人形骨骼） |
| horn.glb | 号角 | 2923 | 没有骨骼（检查说绑不了），游戏里用代码做动作 |
| shade.glb | 亡魂 | 2790 | 没有骨骼（没有腿，飘着走），游戏里用代码做动作 |
| cerberus.glb | 三头犬 | 2866 | preset:quadruped:walk（四足骨骼） |

费用：生成 180 + 绑骨 100 + 走路 40 = 320 积分（余额 2375 → 2055）。
