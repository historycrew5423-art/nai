#!/usr/bin/env bash
# 用无界面浏览器打开本地网页、等几秒、截图，并打印页面报错和帧数（页面里的 window.__fps）。
# 先运行一次 tools/setup.sh。
# 用法：bash tools/shot.sh <网页文件夹> <输出图片> [等待毫秒] [宽] [高]
set -euo pipefail
TOOLS="${TOOLS:-/projects/sandbox/.tools}"
export TOOLS
export PLAYWRIGHT_BROWSERS_PATH="$TOOLS/pw-browsers"
export FONTCONFIG_FILE="$TOOLS/fonts.conf"
exec node "$(dirname "$0")/shot.mjs" "$@"
