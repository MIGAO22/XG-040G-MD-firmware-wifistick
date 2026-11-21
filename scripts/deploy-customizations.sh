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
push "$ROOT/customizations/luci-wifistick/wifistick-agg" /usr/libexec/wifistick-agg 755
push "$ROOT/customizations/luci-wifistick/wifistick-agg.init" /etc/init.d/wifistick-agg 755
$SSH '/etc/init.d/wifistick-agg enable'

echo "==> NPU 概览定制"
push "$ROOT/customizations/npu/npu-status.sh" /usr/libexec/npu-status 755
push "$ROOT/customizations/npu/15_hardware_forwarding.js" /www/luci-static/resources/view/status/include/15_hardware_forwarding.js
push "$ROOT/customizations/npu/luci-mod-status-index.json" /usr/share/rpcd/acl.d/luci-mod-status-index.json

echo "==> 无线信道定制（避开DFS开关 + 仅5.8G开关 + 法规域脚本 + JS缓存版本号）"
push "$ROOT/customizations/luci-wireless/wireless.js" /www/luci-static/resources/view/network/wireless.js
push "$ROOT/customizations/luci-wireless/version.uc" /usr/share/ucode/luci/version.uc
push "$ROOT/customizations/luci-wireless/99-regdomain" /etc/hotplug.d/ieee80211/99-regdomain 755
$SSH 'if uci -q get wireless.radio0.type >/dev/null; then
	uci set wireless.radio0.country=US
	uci set wireless.radio0.acs_exclude_dfs=1
	uci set wireless.radio0.chanlist="149 153 157 161"
	uci commit wireless
	iw reg set US
	wifi reload
fi'

echo "==> 生效: 重启 rpcd/uhttpd、清 LuCI 缓存"
$SSH '/etc/init.d/rpcd restart; /etc/init.d/uhttpd restart; rm -f /tmp/luci-indexcache*; rm -rf /tmp/luci-modulecache/*'

echo "==> 验证状态脚本"
$SSH '/usr/libexec/wifistick-status'

echo "全部完成。浏览器 Ctrl+F5 后检查 网络→随身WiFi 与 状态→概览。"
