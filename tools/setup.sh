#!/usr/bin/env bash
# 在 Kiro Web 沙盒里装好测试环境：无界面浏览器（Playwright + Chromium）、three.js、中文字体。
# 沙盒的系统盘和家目录是只读的，所以都装在工作区里、仓库外面的 .tools 文件夹。约 1 分钟。
# 用法：bash tools/setup.sh
set -euo pipefail
TOOLS="${TOOLS:-/projects/sandbox/.tools}"
mkdir -p "$TOOLS/pw" "$TOOLS/fonts" "$TOOLS/fc-cache"

cd "$TOOLS/pw"
[ -f package.json ] || npm init -y >/dev/null
npm i -s playwright three@0.187.0
PLAYWRIGHT_BROWSERS_PATH="$TOOLS/pw-browsers" npx playwright install chromium-headless-shell

# 沙盒没有中文字体，截图里的中文会变成方块。下载 Noto Sans SC（SIL OFL 许可），用单独的字体配置指过去。
[ -s "$TOOLS/fonts/NotoSansSC.ttf" ] || curl -sL -o "$TOOLS/fonts/NotoSansSC.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
cat > "$TOOLS/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>$TOOLS/fonts</dir>
  <cachedir>$TOOLS/fc-cache</cachedir>
</fontconfig>
EOF
FONTCONFIG_FILE="$TOOLS/fonts.conf" fc-cache -f >/dev/null

echo "装好了。截图：bash tools/shot.sh <网页文件夹> <输出图片> [等待毫秒] [宽] [高]"
