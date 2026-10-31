# 部署说明（给 WorkBuddy）

> 交付时间：2026-10-31 下午，**最终版**（版本号 `20261031final`，压缩包 `nai_缝合版_naiwa_最终版.zip`）。交付方：Kiro（本地会话）。用户不会写代码，请用中文大白话和他沟通。
>
> **最终版包含：** 勇者奶蛙玩法（喷字、变身捧腹大笑、倒下笑着复活、提伯尔特冲撞）、四种梗小怪、声音分层、梗循序渐进（新梗一个一个上，不密集）、🦘肥嘟嘟技能按钮（电脑按 F）、闪身步、第一/第三人称、**手机横屏竖屏都能玩**（同一个网址）；js、css 带版本号防手机缓存。
> **以这一版为准。** 之前交过的 `nai_缝合版_naiwa_20261031.zip`、`交付_缝合版/` 都是旧的，不要再用。
> **如果仓库里已经有旧的 `naiwa/`：** 先删掉整个 `naiwa/` 文件夹，再把这一版的复制进去（免得留下旧文件），提交说明写“奶蛙缝合版最终版：梗循序渐进、肥嘟嘟技能键、手机横竖屏”。还没放过就照第三节做。

## 一、这是什么
《罗密欧与朱丽叶 · 奶蛙缝合版》，一个**纯静态网页游戏**（three.js r187，用 importmap 加载 ES 模块）：
- **不需要构建**：没有 npm、没有打包、没有构建命令。整个文件夹原样放到任何静态网站上就能玩，入口是 `index.html`。
- **所有路径都是相对路径**，放在任何子路径下都能跑（比如 `/nai/naiwa/`）。
- 文件数和大小见第十一节下面的统计，最大的单个文件 1.3 MB（`assets/models/bigfrog.glb`），不需要 Git LFS。
- 已检查：代码里引用的文件都存在，大小写完全一致（GitHub Pages 区分大小写）；没有绝对路径；没有密钥、邮箱、手机号。
- 已模拟线上测过：把压缩包解开放在 `/nai/naiwa/` 下，用区分大小写的服务器打开，横屏（1280×720）和竖屏手机（390×844，触摸）都没有 404、没有报错。
- 手机横屏、竖屏都能玩，转过来画面自动重排；竖屏是一根手指拖着走。

## 二、先看这条：不要覆盖 nai 仓库的根目录
- 比赛仓库是 https://github.com/historycrew5423-art/nai ，GitHub Pages 从 **`dev` 分支的根目录**发布，线上网址 https://historycrew5423-art.github.io/nai/ 。
- 缝合版是从 `dev` 分支 **10-31 早上的 v0.2** 复制出来改的。之后 `dev` 上另一个 AI 又做了很多（截至 10-31 13:56 的提交 `2823f71`）：封面、选关、存档、第二部《暴风雨》（`src/island.js`）、3D 怪物、带动作的角色模型、模型压缩成 .gz、文件加版本号防缓存。
- 两边都改了 `index.html` 和 `src/` 里的好几个文件（`game.js`、`dialogue.js`、`style.css`、`input.js`、`boot.js` 等）。**如果把缝合版直接覆盖到仓库根目录，上面那些新东西会全部被冲掉。** 所以请不要这样做。

## 三、推荐做法：放进 dev 分支的 `naiwa/` 文件夹（只新增，不碰别人的文件）
这样线上会有两个版本，互不影响：
- 主线：https://historycrew5423-art.github.io/nai/
- 缝合版：https://historycrew5423-art.github.io/nai/naiwa/

步骤：
```bash
git clone https://github.com/historycrew5423-art/nai.git
cd nai
git checkout dev
git pull --rebase
# 把交付包里的 naiwa 文件夹整个复制进来，变成 nai/naiwa/（里面直接是 index.html、src/、assets/……）
git add naiwa
git status          # 确认只有 naiwa/ 下的新文件，没有改到别的文件
git commit -m "新增奶蛙缝合版：naiwa/ 文件夹（勇者奶蛙玩法、四种梗小怪、声音分层、闪身步、肥嘟嘟、第一/第三人称），网址 /nai/naiwa/"
git push origin dev
git fetch && git status   # 确认本地和远端一致
```
- 仓库现在的 `naiwa/` 不存在，不会和任何文件冲突。
- 仓库的规矩（见仓库根目录 `HANDOFF.md` 第〇、十节）：开发都在 `dev` 分支，提交说明用中文，推送前查密钥，推送后用 `git fetch` 核对。查密钥的命令：
  `git grep -nIE 'eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{16,}|[A-Za-z0-9._%+-]+@(qq|163|126|gmail|outlook|foxmail)\.com|(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)' -- naiwa ':!naiwa/assets' ':!naiwa/vendor'` 应该没有结果。
- 可选：在根目录 `README.md` 的「项目信息」里加一行“奶蛙缝合版：https://historycrew5423-art.github.io/nai/naiwa/”。这是别人也在改的文件，改之前先 `git pull --rebase`。

## 四、部署后怎么确认成功
1. 等 1 到 2 分钟（GitHub Pages 要重新发布），用**无痕窗口**打开 https://historycrew5423-art.github.io/nai/naiwa/ （网址最后要带 `/`）。
2. 应该看到标题“罗密欧与朱丽叶”，右下角（竖屏是最下面）写着“奶蛙缝合版 · 最终版”；点一下开始，马上开打：奶蛙大笑，一小队刀盾狗走进来，罗密欧自动喷“哈”字，有声音。企鹅、香蕉猫、OIIA 猫会隔几秒一种一种出来（这是故意的）。
3. 这几个地址都应该是 200：`naiwa/src/sfx.js`、`naiwa/src/pacing.js`、`naiwa/assets/models/minion-c.glb`、`naiwa/assets/audio/feidudu.mp3`。
4. 浏览器控制台不应该有红色报错。这一版的 js、css 都带了版本号 `?v=20261031final`，一般不会拿到旧缓存；万一看到 “does not provide an export named …”，等 10 分钟再强制刷新（GitHub Pages 缓存 10 分钟）。
5. 手机上试一下：横屏是左手拖着走、右手拖着瞄；竖屏是一根手指拖着走；右下角有🦘「肥嘟嘟」（喷字攒满后发光）和「变身」两个按钮。

## 五、如果用别的地方部署（不用 GitHub Pages）
腾讯云 CloudBase 静态托管、EdgeOne Pages、Vercel、Netlify、任何对象存储都可以：
- 把 `naiwa` 文件夹里的全部内容当网站根目录上传（或者放到任意子路径）。
- 构建命令留空，输出目录就是这个文件夹。
- 必须用 http(s) 打开，**不能双击 `index.html`**（ES 模块在 `file://` 下会被浏览器拦掉，白屏）。
- 文件类型照常就行：`.js` 要是 JavaScript 类型（一般的静态托管默认就是），`.glb`、`.mp3`、`.wav` 用默认类型也没问题。

## 六、不要做的事
- 不要跑 `npm install`、不要“构建”或“打包”，也不要再压缩 `assets/` 里的模型和音频（已经处理过了）。
- 不要把相对路径改成 `/assets/...` 这种绝对路径，放在 `/nai/naiwa/` 下会 404 白屏。
- 不要改文件名的大小写。
- 不要删除或修改 `naiwa/` 以外的任何文件（`.nojekyll`、`assets/ref/`、`assets/models/raw/`、`docs/` 等都是别人的）。
- 不要指望新建一个分支就能上线：这个仓库的 Pages 只发布 `dev` 分支。

## 七、如果用户想让缝合版直接当主网址
不能简单覆盖（见第二节）。要么请写代码的 AI 把两边的改动**合并**（主要是 `src/game.js`、`src/dialogue.js`、`src/style.css`、`src/input.js` 四个文件，新增的 `src/minions.js`、`src/naiwa.js`、`src/sfx.js`、`src/pacing.js`、`src/laugh-audio.js` 和 `assets/` 里的新文件可以直接带过去）；要么只在主线的封面上加一个跳到 `naiwa/` 的按钮。这两件事都要先问用户。

## 八、本地试玩
- Windows：双击 `naiwa/Play-Windows.bat`，会自动打开 http://127.0.0.1:8000/ 。
- 其他系统：在 `naiwa/` 里运行 `python -m http.server 8000`，浏览器打开 http://127.0.0.1:8000/ 。
- 测试用的网址参数：`?auto=1` 自动跳过对话和选卡、`?god=1` 不会死、`?act=3` 直接从第三幕开始、`?cam=1` / `?cam=2` 第三 / 第一人称开局、`?debug=1` 显示帧数、`?norevive=1` 关掉捧腹大笑复活、`?prologue=1` 开头先放序幕对话。

## 九、版权提醒（公开仓库、公开网址都要注意）
部分梗音效（myinstants 网友上传的咕咕嘎嘎、我的刀盾、香蕉猫、OIIA、闪身步）和奶龙口头禅原声，**权利没有核实**；“肥嘟嘟”是用微软 Edge 朗读服务合成的。比赛演示可以，公开商用前要换掉。每个文件的来源写在 `naiwa/缝合说明.md` 的「素材来源」表里，请保留这个文件。

## 十、提交比赛时要补勾的工具（比赛要求如实勾选）
| 工具或模型 | 用来做什么 |
|---|---|
| Kiro（Claude Opus 5.5） | 缝合版的全部代码、处理模型和音频 |
| Tripo | 企鹅、刀盾狗、香蕉猫、OIIA 猫、大奶蛙的模型（用户生成） |
| 微软 Edge 朗读（edge-tts） | 老外口音的“你的胆子真是肥嘟嘟的” |
| glTF-Transform、meshoptimizer、sharp | 模型减面、贴图压缩 |
| Puppeteer + Microsoft Edge（无界面） | 自动试玩和截图检查 |

## 十一、交付包里有什么
| 路径 | 是什么 |
|---|---|
| `index.html` | 入口 |
| `src/` | 游戏代码：`game.js` 主体、`minions.js` 四种 3D 小怪、`naiwa.js` 奶蛙玩法、`sfx.js` 声音分层、`pacing.js` 梗的节奏、`dialogue.js` 台词、`input.js` 摇杆、`skills.js` 技能、`stress.js` 压力测试（`?test=1`） |
| `vendor/three/` | three.js r187（MIT） |
| `assets/` | 模型、音效、动图、名画、头像、立牌 |
| `README.md` | 这个版本的首页说明（玩法、操作） |
| `缝合说明.md` | 改了什么、素材来源和许可 |
| `scripts/` | 处理素材的脚本（参考用） |
| `Play-Windows.bat`、`server.mjs` | 本地试玩用 |

统计（最终版）：74 个文件、约 10.8 MB，压缩包 `nai_缝合版_naiwa_最终版.zip` 约 7.7 MB；代码里引用的 53 个文件都在，大小写都对。
