# XG-040G-MD OpenWrt 固件存档（随身WiFi 版）

当前在跑固件的完整存档：固件镜像 + 刷机后必须重部署的定制文件 + 配置备份 + 一键部署脚本。

## 固件

- 文件：`firmware/openwrt-airoha-an7581-bell_xg-040g-md-squashfs-sysupgrade.bin`
- SHA256：`9bd6afd8e002e8c7eb4b106584f0fe5516e2e300f19e97e3b14df23abec886ff`（见 `firmware/sha256sums.txt`）
- 设备：XG-040G-MD（Airoha AN7581，2.5G 以太网 OpenWrt，放弃光口）
- 来源：xiangtailiang/openwrt 分支 openwrt-25.12，钉定源码 commit `0b821bb42f693b556e3e14e9f50f1f497fef98e4`（=稳定版 2026.11.10-030347 基线），经 fork MIGAO22/OpenWrt-for-XG-040G-MD 的 Actions run 44643813866 构建（fork commit `d4cacc8`），发布 tag `2026.11.20-111615`
- 内核：6.12.113；关键差异：内置 `kmod-usb-net-rndis`（ZTE 19d2:0581 识别为 eth2）+ **782 补丁：RNDIS RX 聚合上限 64KiB**（修复随身WiFi 下载极慢，见下节）
- 状态：镜像已校验存档；设备当前运行 2026.11.19 旧镜像 + 热替换的同款 64KiB 模块（效果等同，刷本镜像可整体固化）
- 上一版（无聚合补丁，下载 1–35KB/s）：tag `2026.11.19-021059`，sha `7faeafda…`，见 git 历史

## RNDIS 下载慢修复（64KiB RX 聚合）

根因：内核 `generic_rndis_bind` 通告 max_transfer_size=2048，ZTE 19d2:0581 棒在该上限下不启用正常聚合、发畸形帧（rx_length_errors 占 ~98%），下载仅 1–35KB/s。修复=上游 f688218baa71 机制 backport + 19d2:0581 专用 driver_info，聚合上限提到 **64KiB**（16KiB 实测仍 ~52% 错帧；64KiB 实测 235–632KB/s，接近棒直插 PC 的 ~788KB/s 上限）。

- 补丁：`rndis-fix/782-usb-net-rndis-zte-0581-rx-aggregation.patch`（放 `target/linux/generic/pending-6.12/`，**不能放 patches-6.12**，quilt.mk 守卫会直接报错退出）
- 模块：`rndis-fix/rndis_host-6.12.113-rx-agg64k.ko`（sha `0d17d701…`，vermagic `6.12.113 SMP mod_unload aarch64`，与在跑固件内核一致可免刷机热装）

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

包含两组定制：

1. **随身WiFi LuCI 页面**（`customizations/luci-wifistick/`）：网络菜单下"随身WiFi"设置页，实时状态卡（设备/链路/IP/网关/DNS/外网探测/在线时长）+ 开机自启开关 + 接口跃点 + MAC 覆盖。
   - `wifistick-status` → `/usr/libexec/wifistick-status`（755）
   - `luci-app-wifistick.json` → `/usr/share/rpcd/acl.d/`
   - `luci-app-wifistick.menu.json` → `/usr/share/luci/menu.d/luci-app-wifistick.json`
   - `index.js` → `/www/luci-static/resources/view/wifistick/index.js`
2. **NPU 硬件转发概览**（`customizations/npu/`）：
   - `npu-status.sh` → `/usr/libexec/npu-status`（755）
   - `15_hardware_forwarding.js` → `/www/luci-static/resources/view/status/include/`
   - `luci-mod-status-index.json` → `/usr/share/rpcd/acl.d/`

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
