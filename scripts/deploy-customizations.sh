#!/bin/bash
# 刷机后把定制文件推送到光猫。用法: ./scripts/deploy-customizations.sh [设备IP]
# 需在能 ssh root@设备 的环境运行（Git Bash / Linux / macOS）
set -e

DEV="${1:-192.168.1.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=8 root@$DEV"

echo "==> 目标设备: $DEV"

push() { # push <本地文件> <远端路径> [权限]
	$SSH "mkdir -p \"$(dirname "$2")\""
	cat "$1" | tr -d '\r' | $SSH "cat > $2"
	[ -n "$3" ] && $SSH "chmod $3 $2"
	echo "    OK: $2"
}

echo "==> 随身WiFi LuCI 页面"
push "$ROOT/customizations/luci-wifistick/wifistick-status" /usr/libexec/wifistick-status 755
push "$ROOT/customizations/luci-wifistick/luci-app-wifistick.json" /usr/share/rpcd/acl.d/luci-app-wifistick.json
push "$ROOT/customizations/luci-wifistick/luci-app-wifistick.menu.json" /usr/share/luci/menu.d/luci-app-wifistick.json
push "$ROOT/customizations/luci-wifistick/index.js" /www/luci-static/resources/view/wifistick/index.js

echo "==> NPU 概览定制"
push "$ROOT/customizations/npu/npu-status.sh" /usr/libexec/npu-status 755
push "$ROOT/customizations/npu/15_hardware_forwarding.js" /www/luci-static/resources/view/status/include/15_hardware_forwarding.js
push "$ROOT/customizations/npu/luci-mod-status-index.json" /usr/share/rpcd/acl.d/luci-mod-status-index.json

echo "==> 生效: 重启 rpcd、清 LuCI 缓存"
$SSH '/etc/init.d/rpcd restart; rm -f /tmp/luci-indexcache*; rm -rf /tmp/luci-modulecache/*'

echo "==> 验证状态脚本"
$SSH '/usr/libexec/wifistick-status'

echo "全部完成。浏览器 Ctrl+F5 后检查 网络→随身WiFi 与 状态→概览。"
