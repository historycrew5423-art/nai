# 绑了骨骼、带动作的角色（10-31 11:00，Tripo）

用 Tripo CLI 自动绑骨（animate_rig，人形）再套动作（animate_retarget，原地播放），输出后用 `tools/process-anim.mjs` 缩小。

| 文件 | 角色 | 原模型 | 动作 |
|---|---|---|---|
| romeo.glb | 罗密欧 | ../fantasy.glb | idle 站立、walk 走、run 跑、jump 跳、hurt 受伤 |
| tybalt.glb | 提伯尔特 | ../minotaur.glb | idle、walk、run、slash 挥剑、hurt |
| mercutio.glb | 茂丘西奥 | ../raw/rabbit.glb（处理过的版本导入失败，用了原版） | idle、walk、run、fall 倒下、hurt |

- 朱丽叶（wedding-dress.glb）：Tripo 检查说绑不了骨（大婚纱把腿挡住了），游戏里仍用代码做动作。
- 费用：绑骨每个 25 积分，动作每个 10 积分，三个角色共 225 积分（账号余额 2600 → 2375）。
- 检查动作的页面：`tools/mock/anim.html?m=romeo`（每个动作取 4 帧排成一张）。
- 注意：Tripo 的 walk、run 动作把髋部整体挪开了约一米，游戏加载时会挪回原位（`src/game.js` 的 `fixHip`）。hurt 有 14 秒长，开头就是倒在地上的姿势，游戏里没用。
