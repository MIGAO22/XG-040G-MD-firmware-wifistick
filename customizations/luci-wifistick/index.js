'use strict';
'require fs';
'require form';
'require dom';
'require view';

function callStatus() {
	return fs.exec('/usr/libexec/wifistick-status', []).then(function(res) {
		return res && typeof res.stdout === 'string' ? res.stdout : '';
	});
}

function fmtUptime(secs) {
	secs = secs || 0;
	var d = Math.floor(secs / 86400),
	    h = Math.floor((secs % 86400) / 3600),
	    m = Math.floor((secs % 3600) / 60),
	    s = secs % 60;
	if (d > 0) return '%d天%d小时'.format(d, h);
	if (h > 0) return '%d小时%d分'.format(h, m);
	if (m > 0) return '%d分%d秒'.format(m, s);
	return '%d秒'.format(s);
}

function badge(ok, txtYes, txtNo) {
	return E('span', {
		style: 'display:inline-block;padding:.15em .5em;border-radius:.35em;font-weight:600;color:#fff'
			+ ';background:' + (ok ? '#5e9f35' : '#aa3938')
	}, ok ? txtYes : txtNo);
}

function row(k, v) {
	return E('div', { class: 'tr' }, [
		E('div', { class: 'td left', style: 'width:33%;font-weight:600' }, k),
		E('div', { class: 'td left' }, v)
	]);
}

function statusRows(d) {
	var dns = (d.dns || '-').trim();
	var rows = [];
	if (d.__dbg)
		rows.push(row(_('调试:浏览器收到的数据'), E('code', { style: 'word-break:break-all' }, String(d.__dbg))));
	rows.push(
		row(_('设备'), d.usb_name ? '%s（USB ID 19d2）'.format(d.usb_name.trim()) : _('未检测到随身WiFi')),
		row(_('网卡 eth2'), badge(!!d.present, _('已枚举'), _('不存在'))),
		row(_('USB 载波'), badge(!!d.carrier, _('正常'), _('无'))),
		row(_('接口拨号'), badge(!!d.linked, _('已上线'), _('未连接'))),
		row(_('IPv4 地址'), d.linked && d.ip && d.ip !== '-' ? '%s / %s'.format(d.ip, d.mask) : '-'),
		row(_('网关'), d.gw && d.gw !== '-' ? d.gw : '-'),
		row(_('DNS'), dns || '-'),
		row(_('外网探测'), badge(!!d.ping_ok, _('通畅'), _('不通'))),
		row(_('下载吞吐(采样)'), '%s KB/s'.format(d.speed)),
		row(_('本次在线'), fmtUptime(d.uptime)),
		row(_('接口跃点'), '%s'.format(d.metric)),
		row(_('开机自启'), badge(d.auto == 1, _('开'), _('关')))
	);
	return rows;
}

function parseStatus(v) {
	var dbg = 'typeof=' + typeof v + ' raw=' + String(v === undefined ? '<undefined>' : v).substring(0, 220);
	var d = v;
	if (typeof d === 'object' && d !== null && typeof d.stdout === 'string')
		d = d.stdout;
	if (typeof d === 'string') {
		try { d = JSON.parse(d); } catch(e) { d = {}; }
	}
	if (typeof d !== 'object' || d === null)
		d = {};
	if (Object.keys(d).length === 0)
		d.__dbg = dbg;
	if (d.usb_name === '-' || (typeof d.usb_name === 'string' && !d.usb_name.trim()))
		d.usb_name = '';
	return d;
}

return view.extend({
	title: _('随身WiFi'),

	render: function() {
		var m = new form.Map('network', _('随身WiFi'),
			_('USB 随身WiFi（RNDIS 网卡 eth2）上网设置。修改后点击"保存并应用"立即生效。'));

		var s = m.section(form.NamedSection, 'wanusb', 'interface', _('随身WiFi 接口'));
		s.addremove = false;
		s.anonymous = false;

		var o = s.option(form.DummyValue, '_status', _('当前状态'));
		o.load = function() {
			return callStatus().catch(function(err) {
				return JSON.stringify({ __dbg: '加载失败: ' + String(err) });
			});
		};
		o.renderWidget = function(section_id, option_id, cfgvalue) {
			var data = parseStatus(cfgvalue);

			var grid = E('div', { class: 'table cbi-section-table' }, statusRows(data));
			var btn = E('button', { class: 'btn cbi-button' }, _('刷新状态'));
			btn.addEventListener('click', function() {
				btn.classList.add('spinning');
				btn.disabled = true;
				callStatus().then(function(stdout) {
					dom.content(grid, statusRows(parseStatus(stdout)));
				}).catch(function(err) {
					dom.content(grid, statusRows({ __dbg: 'RPC失败: ' + String(err) }));
				}).finally(function() {
					btn.classList.remove('spinning');
					btn.disabled = false;
				});
			});

			return E('div', {}, [ grid, btn ]);
		};

		o = s.option(form.Flag, 'auto', _('开机自动连接'), _('关闭后随身WiFi不再自动拨号上网。'));
		o.default = '1';

		o = s.option(form.Value, 'metric', _('接口跃点'), _('数值越小优先级越高；有线 WAN 为 10，USB 默认 30 作兜底。'));
		o.datatype = 'uint';
		o.placeholder = '30';

		o = s.option(form.Value, 'macaddr', _('MAC 地址覆盖'), _('部分运营商绑定 MAC 时填写，一般留空。'));
		o.optional = true;
		o.placeholder = _('留空使用设备默认');

		return m.render();
	}
});
