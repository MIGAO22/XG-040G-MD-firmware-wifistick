#!/bin/sh
[ "$#" -eq 0 ] || exit 2
. /usr/share/libubox/jshn.sh
module_loaded=0
driver_bound=0
autoload=0
firewall_autostart=0
hardware_rules=0
wan_carrier=0
ppe_available=0
bound_lines=0
ppe_stats_available=0
ppe_packets=0
ppe_bytes=0
hw_offload_connections_available=0
hw_offload_connections=0
[ -d /sys/module/airoha_npu ] && module_loaded=1
[ -L /sys/bus/platform/drivers/airoha-npu/1e900000.npu ] && driver_bound=1
grep -qx airoha_npu /etc/modules.d/18-airoha-npu 2>/dev/null && autoload=1
/etc/init.d/firewall enabled >/dev/null 2>&1 && firewall_autostart=1
firmware_version=$(dmesg | sed -n 's/.*NPU fw version: \([0-9][0-9.]*\).*/\1/p' | tail -n 1)
software_config=$(uci -q get firewall.@defaults[0].flow_offloading)
hardware_config=$(uci -q get firewall.@defaults[0].flow_offloading_hw)
nft list flowtable inet fw4 ft 2>/dev/null | grep -q 'flags offload' && hardware_rules=1
[ "$(cat /sys/class/net/eth1/carrier 2>/dev/null)" = 1 ] && wan_carrier=1
if [ -r /proc/net/nf_conntrack ]; then
    hw_offload_connections=$(grep -c HW_OFFLOAD /proc/net/nf_conntrack)
    hw_offload_connections_available=1
fi
if [ -r /sys/kernel/debug/ppe/bind ]; then
    ppe_snapshot=$(awk '
        $2 == "BND" {
            flows++
            packet_value = ""
            byte_value = ""
            for (i = 3; i <= NF; i++) {
                if ($i ~ /^packets=[0-9]+$/) packet_value = substr($i, 9)
                if ($i ~ /^bytes=[0-9]+$/) byte_value = substr($i, 7)
            }
            if (packet_value != "" && byte_value != "") {
                stats_flows++
                packets += packet_value
                bytes += byte_value
            }
        }
        END { printf "%d %.0f %.0f %d\n", flows, packets, bytes, flows == stats_flows }
    ' /sys/kernel/debug/ppe/bind)
    if [ "$?" -eq 0 ]; then
        set -- $ppe_snapshot
        ppe_available=1
        bound_lines=$1
        ppe_packets=$2
        ppe_bytes=$3
        ppe_stats_available=$4
    fi
fi
IFS= read -r cpu_stat < /proc/stat
boot_id=$(cat /proc/sys/kernel/random/boot_id)
temperature_millic=
for zone in /sys/class/thermal/thermal_zone*; do
    [ "$(cat "$zone/type" 2>/dev/null)" = cpu-thermal ] || continue
    IFS= read -r temperature_millic < "$zone/temp"
    break
done
json_init
json_add_string cpu_stat "$cpu_stat"
json_add_string boot_id "$boot_id"
if [ -n "$temperature_millic" ]; then
    json_add_int temperature_millic "$temperature_millic"
else
    json_add_null temperature_millic
fi
json_add_boolean hw_offload_connections_available "$hw_offload_connections_available"
json_add_int hw_offload_connections "$hw_offload_connections"
json_add_boolean ppe_stats_available "$ppe_stats_available"
json_add_string ppe_packets "$ppe_packets"
json_add_string ppe_bytes "$ppe_bytes"
json_add_boolean module_loaded "$module_loaded"
json_add_boolean driver_bound "$driver_bound"
json_add_boolean autoload "$autoload"
json_add_boolean firewall_autostart "$firewall_autostart"
json_add_boolean software_config "$([ "$software_config" = 1 ] && printf 1 || printf 0)"
json_add_boolean hardware_config "$([ "$hardware_config" = 1 ] && printf 1 || printf 0)"
json_add_boolean hardware_rules "$hardware_rules"
json_add_boolean wan_carrier "$wan_carrier"
json_add_boolean ppe_available "$ppe_available"
json_add_int bound_lines "$bound_lines"
json_add_string firmware_version "$firmware_version"
json_dump
