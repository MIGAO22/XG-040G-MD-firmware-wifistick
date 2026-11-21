# XG-040G-MD OpenWrt 固件存档（随身WiFi 版）

当前在跑固件的完整存档：固件镜像 + 刷机后必须重部署的定制文件 + 配置备份 + 一键部署脚本。

## 固件

**当前在跑**：USB WiFi AP 版（含 RT3573 无线 + v2 聚合参数补丁）

- SHA256：`22044c3192f3a93c4dcd1aed5b6b7ebfc846a1cbca1ffaf6d4a2e656ee62eac0`（50247947B，本地存档 `wifi-fix/release/`）
- 来源：fork 发布 tag `2026.11.20-235516`（Actions run12，fork commit `82b3b3b`），源码基线仍钉定 `0b821bb…`（kernel 6.12.113，未升级 OpenWrt）
- 相比上一版新增：`kmod-rt2800-usb`+`rt2870.bin` 固件+`wpad-basic-mbedtls`+`iw`+`iwinfo`（USB WiFi 网卡 AP）；782 补丁 v2（`rx_agg_kib` 模块参数，默认 64）

上一版：64KiB 聚合镜像 `firmware/openwrt-airoha-an7581-bell_xg-040g-md-squashfs-sysupgrade.bin`，SHA256 `9bd6afd8…`（tag `2026.11.20-111615`，run 44643813866，fork commit `d4cacc8`）；再上一版（无聚合补丁，下载 1–35KB/s）：tag `2026.11.19-021059`，sha `7faeafda…`，见 git 历史

## RNDIS 下载慢修复（64KiB RX 聚合）

根因：内核 `generic_rndis_bind` 通告 max_transfer_size=2048，ZTE 19d2:0581 棒在该上限下不启用正常聚合、发畸形帧（rx_length_errors 占 ~98%），下载仅 1–35KB/s。修复=上游 f688218baa71 机制 backport + 19d2:0581 专用 driver_info，聚合上限提到 **64KiB**（16KiB 实测仍 ~52% 错帧；64KiB 实测 235–632KB/s，接近棒直插 PC 的 ~788KB/s 上限）。

- 补丁：`rndis-fix/782-usb-net-rndis-zte-0581-rx-aggregation.patch` **v2**（sha `ce3910fc…`；新增 `rx_agg_kib` 模块参数 0644 可运行时调整，默认 64，0=原版 2048。放 `target/linux/generic/pending-6.12/`，**不能放 patches-6.12**，quilt.mk 守卫会直接报错退出）
- 模块：`rndis-fix/rndis_host-6.12.113-rx-agg-param.ko`（v2 参数版，sha `e1ae9c52…`，已在跑固件内置）；`rndis-fix/rndis_host-6.12.113-rx-agg64k.ko`（v1 定稿 64KiB，sha `0d17d701…`，vermagic `6.12.113 SMP mod_unload aarch64`，可免刷机热装）

免刷机热装（ssh root@192.168.1.1，二进制必须原样 cat 传输，**禁用 tr -d '\r'**）：

```sh
ifdown wanusb; ifconfig eth2 down
echo "3-1:1.0" > /sys/bus/usb/drivers/rndis_host/unbind
rmmod rndis_host
cp rndis_host-6.12.113-rx-agg64k.ko /lib/modules/6.12.113/rndis_host.ko
modprobe rndis_host; ifup wanusb
```

回滚：旧模块备份在设备 `/etc/rndis-rollback/rndis_host.ko.orig`，同样流程换回即可。

## 刷机方法

LuCI → 系统 → 闪存备份/升级（勾选保留配置），或命令行：

```sh
sysupgrade -n firmware/openwrt-airoha-an7581-bell_xg-040g-md-squashfs-sysupgrade.bin
```

> 注意：sysupgrade 只保留 /etc，本仓库 `customizations/` 下的文件不在镜像里，**每次刷机后都要重新部署**（见下）。

## 刷机后定制部署

```sh
./scripts/deploy-customizations.sh 192.168.1.1
```

包含三组定制：

1. **随身WiFi LuCI 页面**（`customizations/luci-wifistick/`）：网络菜单下"随身WiFi"设置页，实时状态卡（设备/链路/IP/网关/DNS/外网探测/在线时长）+ 接收聚合上限下拉（0/16/32/64/128 KiB）+ 开机自启开关 + 接口跃点 + MAC 覆盖。
   - `wifistick-status` → `/usr/libexec/wifistick-status`（755）
   - `wifistick-agg` → `/usr/libexec/wifistick-agg`（755）；`wifistick-agg.init` → `/etc/init.d/wifistick-agg`（755，需 `enable`）
   - `luci-app-wifistick.json` → `/usr/share/rpcd/acl.d/`
   - `luci-app-wifistick.menu.json` → `/usr/share/luci/menu.d/luci-app-wifistick.json`
   - `index.js` → `/www/luci-static/resources/view/wifistick/index.js`（**目录刷机后不存在，脚本已自动 mkdir**）
2. **NPU 硬件转发概览**（`customizations/npu/`）：
   - `npu-status.sh` → `/usr/libexec/npu-status`（755）
   - `15_hardware_forwarding.js` → `/www/luci-static/resources/view/status/include/`
   - `luci-mod-status-index.json` → `/usr/share/rpcd/acl.d/`
3. **无线信道策略**（`customizations/luci-wireless/`，2026-11-21 新增）：
   - `wireless.js` → `/www/luci-static/resources/view/network/wireless.js`：给 radio 编辑表单-高级标签加两个开关——**自动避开 DFS 信道**（映射 `wireless.radioX.acs_exclude_dfs`）与 **仅用 5.8G 高速率频段**（映射 `wireless.radioX.chanlist='149 153 157 161'`，hostapd 真限制而非加权）
   - `version.uc` → `/usr/share/ucode/luci/version.uc`：revision 追加 `-xg1` 后缀。**坑：LuCI 资源 URL 的 `?v=` 用硬编码包版本，改 JS 文件后浏览器缓存不失效，必须同时 bump 这个版本号**（或无痕窗口验证）
   - `99-regdomain` → `/etc/hotplug.d/ieee80211/99-regdomain`（755）：phy 出现时按 `wireless.radio0.country` 执行 `iw reg set`。**坑：25.12 的 ucode 无线脚本不执行 iw reg set，config 里 country 不生效，内核一直停在 world(00)；且 UM 不在内核 regdb（无效代码），5.8G 在 world 域是 no-IR 不可用 AP——必须 country=US（或 CN）**
   - 配套 uci（脚本自动设置）：`wireless.radio0.country=US`、`acs_exclude_dfs=1`、`chanlist='149 153 157 161'`

## USB WiFi 网卡 AP（EDUP EW-7733UnD / RT3573）要点

- 固件已内置驱动栈（kmod-rt2800-usb + rt2870.bin + wpad-basic-mbedtls + iwinfo）；LuCI 网络→无线直接配 SSID/加密。
- **channel auto 是抛硬币**：ACS 可能选中 5.6G DFS 信道，rt2800 无雷达检测硬件 → `start_dfs_cac() failed` → AP-DISABLED（手机搜不到 SSID）。解法=开"自动避开 DFS"（或固定非 DFS 信道）；绕过 DFS 检测发射违反无线电法规，**不做**。
- 实测最终态：5.8G ch149 HT40（ACS 在 149/153/157/161 内自选），hostapd txpower 仍为 radio 配置值（默认 13dBm，可调高）。
- 重启连锁坑：ZTE 棒热重启枚举失败（error -110）需拔插；两设备同抢光猫 5V 时 RT3573 也可能掉线重枚举（phy 号会变 phy0→phy1，配置按 USB path 匹配不受影响）。
- 无线配置快照：`backups/wireless-uci-20261121.txt`（含 SSID/口令，仓库保持私有）。

## 网络配置要点（已含在配置备份里）

- `network.wanusb`：ifname eth2，proto dhcp，metric 30（有线 WAN eth1 metric 10 优先，USB 兜底）
- fw4 自动把 eth2 并入 wan zone 做 masq。**坑：`uci commit firewall` 后必须 `/etc/init.d/firewall reload`**，否则 NAT 不含新接口
- RNDIS 的 eth2 `operstate` 恒为 unknown，链路判断以 netifd 接口 up 为准（状态脚本已处理）

## 配置备份

`backups/cfg-after-rndis-20261119.tgz`：RNDIS 上网贯通后的 /etc 配置打包（含无线口令等敏感内容，仓库保持私有）。恢复：解包覆盖 /etc 后重启。

## 本固件 LuCI JS 兼容性备忘（26.320 版）

- base/view/dom 等类打包进 luci.js，无独立 js 文件；视图必须 `'require view'` + 顶层 `return view.extend({...})`
- 只有 `String.prototype.format`，没有 `.formatted`；`ui.button()` 不存在，用原生 `E('button')`
- `rpc.declare` 的 params 数组是形参名列表不是固定值；调 `file.exec` 请用 `fs.exec(command, [])`
