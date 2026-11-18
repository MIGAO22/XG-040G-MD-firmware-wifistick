'use strict';
'require baseclass';
'require fs';

function cpuSample(status) {
    if (typeof status.cpu_stat !== 'string' || !status.boot_id)
        return null;
    var fields = status.cpu_stat.trim().split(/\s+/);
    if (fields[0] !== 'cpu' || fields.length < 9)
        return null;
    var counters = fields.slice(1, 9).map(Number);
    if (counters.some(function(value) { return !Number.isSafeInteger(value) || value < 0; }))
        return null;
    return {
        bootId: status.boot_id,
        total: counters.reduce(function(sum, value) { return sum + value; }, 0),
        idle: counters[3] + counters[4]
    };
}

function cpuUsage(current, previous) {
    if (!current || !previous || current.bootId !== previous.bootId)
        return null;
    var total = current.total - previous.total;
    var idle = current.idle - previous.idle;
    if (total <= 0 || idle < 0 || idle > total)
        return null;
    return 100 * (total - idle) / total;
}

function usageDisplay(usage, unavailable) {
    if (usage === null)
        return unavailable;
    var text = usage.toFixed(1) + '%';
    return E('div', { 'class': 'cbi-progressbar', 'title': text },
        E('div', { 'style': 'width: ' + usage.toFixed(2) + '%' }));
}

function formatBytes(value) {
    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return value.toFixed(unit ? 2 : 0) + ' ' + units[unit];
}

return baseclass.extend({
    title: 'CPU / NPU 实时状态',
    load: function() {
        return fs.exec('/usr/libexec/npu-status', []).then(function(result) {
            if (result.code !== 0)
                return null;
            return JSON.parse(result.stdout);
        }).catch(function() { return null; });
    },
    render: function(status) {
        if (!status) {
            this.previousCpuSample = null;
            return E('p', { 'class': 'alert-message warning' }, '状态读取失败，请检查路由器连接或概览页读取权限。');
        }
        var current = cpuSample(status);
        var usage = cpuUsage(current, this.previousCpuSample);
        this.previousCpuSample = current;
        var driverReady = status.module_loaded && status.driver_bound;
        var offloadingReady = status.software_config && status.hardware_config && status.hardware_rules;
        var rows = [
            ['CPU 温度', Number.isFinite(status.temperature_millic) ? (status.temperature_millic / 1000).toFixed(1) + ' °C' : '传感器不可获取'],
            ['CPU 使用率', usageDisplay(usage, current ? '采样中…' : '不可获取')],
            ['NPU 硬件卸载连接数', status.hw_offload_connections_available ? String(status.hw_offload_connections) : '连接统计不可读取'],
            ['PPE 硬件绑定流数', status.ppe_available ? String(status.bound_lines) : '流表不可读取'],
            ['当前硬件绑定流累计流量', status.ppe_stats_available ? formatBytes(Number(status.ppe_bytes)) + '（' + status.ppe_packets + ' 包）' : '流量统计不可读取'],
            ['NPU 硬件加速', driverReady ? (offloadingReady ? '驱动已就绪，硬件卸载规则已启用' : '驱动已就绪，硬件卸载规则未启用') : '驱动未就绪']
        ];
        return E('div', {}, [
            E('table', { 'class': 'table' }, rows.map(function(row) {
                return E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td left', 'width': '33%' }, row[0]),
                    E('td', { 'class': 'td left' }, row[1])
                ]);
            })),
            E('p', { 'class': 'cbi-section-descr' }, '随概览自动刷新。连接数来自内核 HW_OFFLOAD 标记；转发流量为当前 PPE 硬件绑定流的累计字节和包数，流解绑后数值可能下降，不是开机总流量或 NPU 使用百分比。CPU 使用率为两次采样间的全核心平均值。')
        ]);
    }
});
