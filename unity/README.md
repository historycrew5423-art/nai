# Verona Arenas — Unity场景

当前阶段：第一幕舞会大厅灰盒完成，等待用户验收。其他三幕、美术与GLB导出尚未开始。

用 Unity Hub 打开本目录的 `VeronaArenas` 项目（Unity 6000.3.27f1），双击场景 `Assets/Verona/Scenes/Act1_Ballroom_Graybox.unity`。

- `GameCam`：文档规定的游戏镜头，只覆盖大厅中央。
- `OverviewCam_ReviewOnly`：只供审阅全场布局，默认关闭，不取代GameCam。
- 菜单 `Verona > Act 1 > Validate and Capture Graybox`：验收当前场景并重新输出截图。
- 菜单 `Verona > Act 1 > Build Graybox`：重建灰盒，会替换当前场景，先保存其他工作。

截图在 `output/screens/`，尺寸1600×900；数值验收在 `output/scene/act1-graybox-validation.md`，制作记录在 `日志.md`。

灰盒只使用本项目原创脚本、Unity自带几何体和4种URP/Lit灰色材质，无外部素材与费用。所有场景几何体和8个独立障碍物碰撞体位于 `Arena_Act1`，灯光与相机位于其外。
