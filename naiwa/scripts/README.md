# 素材处理脚本（参考用）

这几个脚本是在开发机（Windows，`E:\游戏\.build\`）上处理素材时用的，**游戏运行不需要它们**，放在这里只是留个记录、方便以后重做素材。脚本里的路径是按开发机的文件夹写的，换机器要先改路径。

| 脚本 | 做什么 | 依赖 |
|---|---|---|
| `process_minions.mjs` | 把企鹅、刀盾狗两个 Tripo 模型（各约 85 MB）减面到约 1.1 万面、贴图压到 1024 JPG，保留骨骼 → `assets/models/minion-a.glb`、`minion-b.glb` | Node 20+，`@gltf-transform/core`、`@gltf-transform/functions`、`meshoptimizer`、`sharp` |
| `bake_cats.mjs` | 香蕉猫、OIIA 猫（没有骨骼、贴图展开很碎）：先把高模绕一圈“拍”成圆柱贴图，再减面到 8000 / 6500 面 → `assets/models/minion-c.glb`、`minion-d.glb` | 同上 |
| `gen_feidudu.py` | 用微软 Edge 朗读服务合成老外口音的“你的胆子真是肥嘟嘟的” → `assets/audio/feidudu.mp3`、`feidudu-echo.mp3`（脚本生成好几种声音，挑了 Andrew 和 Guy） | Python 3，`pip install edge-tts`，要联网 |

装依赖：`npm i @gltf-transform/core @gltf-transform/functions meshoptimizer sharp`。
