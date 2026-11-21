'use strict';
'require baseclass';
'require fs';

function formatBytes(value) {
    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var unit = 0;
    value = Number(value) || 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return value.toFixed(unit ? 2 : 0) + ' ' + units[unit];
}

function formatUptime(secs) {
    secs = Number(secs) || 0;
    if (secs < 60)
        return secs + ' 秒';
    if (secs < 3600)
        return Math.floor(secs / 60) + ' 分钟';
    return Math.floor(secs / 3600) + ' 小时 ' + Math.floor(secs % 3600 / 60) + ' 分钟';
}

function yesno(value, onText, offText) {
    return value ? onText : offText;
}

return baseclass.extend({
    title: 'USB 设备状态',
    load: function() {
        return fs.exec('/usr/libexec/usb-devices-status', []).then(function(result) {
            if (result.code !== 0)
                return null;
            return JSON.parse(result.stdout);
        }).catch(function() { return null; });
    },
    render: function(status) {
        if (!status || !status.stick || !status.wifi)
            return E('p', { 'class': 'alert-message warning' }, 'USB 设备状态读取失败，请检查概览页读取权限。');

        var s = status.stick, w = status.wifi;
        var stickText;
        if (!s.present)
            stickText = E('span', { 'class': 'grey' }, '未插入');
        else if (s.link)
            stickText = E('span', { 'class': 'badge success' }, '在线 · %s · %s · 已运行 %s'.format(s.net, s.ip, formatUptime(s.uptime)));
        else
            stickText = E('span', { 'class': 'badge warning' }, '已插入，未连通(%s)'.format(s.net === '-' ? '无网卡' : s.net));

        var stickTraffic;
        if (!s.present)
            stickTraffic = E('span', { 'class': 'grey' }, '—');
        else
            stickTraffic = E('span', {}, '↓ %s / ↑ %s（接收错误 %s，聚合 %s）'.format(
                formatBytes(s.rx), formatBytes(s.tx), String(s.rxerr),
                s.agg > 0 ? s.agg + ' KiB' : '未启用'));

        var wifiText;
        if (!w.present)
            wifiText = E('span', { 'class': 'grey' }, '未插入');
        else if (!w.if || w.if === '-')
            wifiText = E('span', { 'class': 'badge warning' }, '已插入，驱动未就绪');
        else if (w.on)
            wifiText = E('span', { 'class': 'badge success' }, '热点 "%s" · %s · 信道 %s %s · 客户端 %d · %s dBm'.format(
                w.ssid, w.if, String(w.channel), w.ht, Number(w.clients) || 0, String(w.txpower)));
        else
            wifiText = E('span', { 'class': 'badge warning' }, '已插入，热点未开启(%s)'.format(w.if));

        var wifiTraffic;
        if (!w.present || !w.if || w.if === '-')
            wifiTraffic = E('span', { 'class': 'grey' }, '—');
        else
            wifiTraffic = E('span', {}, '↓ %s / ↑ %s'.format(formatBytes(w.rx), formatBytes(w.tx)));

        var rows = [
            ['随身WiFi（ZTE RNDIS 上网棒）', stickText],
            ['随身WiFi 流量', stickTraffic],
            ['USB 无线网卡（RT3573 热点）', wifiText],
            ['USB 无线网卡 流量', wifiTraffic]
        ];

        return E('div', {}, [
            E('table', { 'class': 'table' }, rows.map(function(row) {
                return E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td left', 'width': '33%' }, row[0]),
                    E('td', { 'class': 'td left' }, row[1])
                ]);
            })),
            E('p', { 'class': 'cbi-section-descr' }, '随概览自动刷新。随身WiFi 流量为 eth2 网卡累计字节；无线网卡流量为 AP 接口空口累计。聚合为 RNDIS 接收聚合上限（网络→随身WiFi 页面可调）。')
        ]);
    }
});
