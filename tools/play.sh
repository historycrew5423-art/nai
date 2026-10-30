#!/usr/bin/env bash
# 机器人试玩正式游戏，见 tools/play.mjs
TOOLS="${TOOLS:-/projects/sandbox/.tools}"
export TOOLS
export PLAYWRIGHT_BROWSERS_PATH="$TOOLS/pw-browsers"
export FONTCONFIG_FILE="$TOOLS/fonts.conf"
exec node "$(dirname "$0")/play.mjs" "$@"
