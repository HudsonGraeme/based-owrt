export default class DashboardModule {
	constructor(core) {
		this.core = core;
		this.pollInterval = null;
		this.bandwidthHistory = { down: [], up: [] };
		this.lastNetStats = null;
		this.lastCpuStats = null;
		this.bandwidthCanvas = null;
		this.bandwidthCtx = null;

		this.core.registerRoute('/dashboard', () => this.load());
	}

	async load() {
		const pageElement = document.getElementById('dashboard-page');
		if (pageElement) pageElement.classList.remove('hidden');
		try {
			const [status, systemInfo] = await this.core.ubusCall('system', 'info', {});
			const [boardStatus, boardInfo] = await this.core.ubusCall('system', 'board', {});

			const hostnameEl = document.getElementById('hostname');
			const uptimeEl = document.getElementById('uptime');
			const memoryEl = document.getElementById('memory');
			const memoryBarEl = document.getElementById('memory-bar');

			if (hostnameEl) hostnameEl.textContent = boardInfo.hostname || 'OpenWrt';
			if (uptimeEl) uptimeEl.textContent = this.core.formatUptime(systemInfo.uptime);

			const memPercent = ((systemInfo.memory.total - systemInfo.memory.free) / systemInfo.memory.total * 100).toFixed(0);
			if (memoryEl) memoryEl.textContent = this.core.formatMemory(systemInfo.memory);
			if (memoryBarEl) memoryBarEl.style.width = memPercent + '%';

			await this.updateCpuUsage();
			await this.updateNetworkStats();
			await this.updateWANStatus();
			await this.updateSystemLog();
			await this.updateConnections();
			this.initBandwidthGraph();
		} catch (err) {
			console.error('Failed to load dashboard:', err);
			this.core.showToast('Failed to load system information', 'error');
		}
	}

	async update() {
		await this.updateCpuUsage();
		await this.updateNetworkStats();
		await this.updateWANStatus();
	}

	async updateCpuUsage() {
		try {
			const [status, result] = await this.core.ubusCall('file', 'read', {
				path: '/proc/stat'
			});

			if (result && result.data) {
				const content = result.data;
				const cpuLine = content.split('\n')[0];
				const values = cpuLine.split(/\s+/).slice(1).map(Number);
				const idle = values[3];
				const total = values.reduce((a, b) => a + b, 0);

				if (this.lastCpuStats) {
					const idleDelta = idle - this.lastCpuStats.idle;
					const totalDelta = total - this.lastCpuStats.total;
					const usage = ((1 - idleDelta / totalDelta) * 100).toFixed(1);
					document.getElementById('cpu').textContent = usage + '%';
					document.getElementById('cpu-bar').style.width = usage + '%';
				}

				this.lastCpuStats = { idle, total };
			}
		} catch (err) {
			document.getElementById('cpu').textContent = 'N/A';
		}
	}

	async updateNetworkStats() {
		try {
			const [status, result] = await this.core.ubusCall('file', 'read', {
				path: '/proc/net/dev'
			});

			if (result && result.data) {
				const content = result.data;
				const lines = content.split('\n').slice(2);
				let totalRx = 0, totalTx = 0;

				lines.forEach(line => {
					if (!line.trim()) return;
					const parts = line.trim().split(/\s+/);
					if (parts[0].startsWith('lo:')) return;
					totalRx += parseInt(parts[1]) || 0;
					totalTx += parseInt(parts[9]) || 0;
				});

				if (this.lastNetStats) {
					const rxRate = (totalRx - this.lastNetStats.rx) / 1024 / 3;
					const txRate = (totalTx - this.lastNetStats.tx) / 1024 / 3;

					const downEl = document.getElementById('bandwidth-down');
					const upEl = document.getElementById('bandwidth-up');

					if (downEl) downEl.textContent = this.core.formatRate(rxRate);
					if (upEl) upEl.textContent = this.core.formatRate(txRate);

					this.bandwidthHistory.down.push(rxRate);
					this.bandwidthHistory.up.push(txRate);

					if (this.bandwidthHistory.down.length > 60) {
						this.bandwidthHistory.down.shift();
						this.bandwidthHistory.up.shift();
					}

					this.updateBandwidthGraph();
				}

				this.lastNetStats = { rx: totalRx, tx: totalTx };
			}
		} catch (err) {
			console.error('updateNetworkStats error:', err);
		}
	}

	async updateWANStatus() {
		try {
			const heroCard = document.getElementById('wan-status-hero');
			const wanStatusEl = document.getElementById('wan-status');
			const wanIpEl = document.getElementById('wan-ip');
			const lanIpEl = document.getElementById('lan-ip');

			if (!heroCard || !wanStatusEl || !wanIpEl || !lanIpEl) return;

			const [status, result] = await this.core.ubusCall('network.interface', 'dump', {});

			if (status !== 0 || !result || !result.interface) {
				heroCard.classList.add('offline');
				heroCard.classList.remove('online');
				wanStatusEl.textContent = 'UNKNOWN';
				return;
			}

			const interfaces = result.interface;

			let lanIface = interfaces.find(i => i.interface === 'lan' || i.device === 'br-lan');
			if (!lanIface) {
				lanIface = interfaces.find(i => i.up && i['ipv4-address'] && i['ipv4-address'].length > 0 && i.interface !== 'loopback');
			}

			let internetIface = null;
			let gateway = null;

			for (const iface of interfaces) {
				if (!iface.up || iface.interface === 'loopback') continue;
				if (iface.route) {
					const defaultRoute = iface.route.find(r => r.target === '0.0.0.0');
					if (defaultRoute) {
						internetIface = iface;
						gateway = defaultRoute.nexthop;
						break;
					}
				}
			}

			if (lanIface && lanIface['ipv4-address'] && lanIface['ipv4-address'][0]) {
				lanIpEl.textContent = lanIface['ipv4-address'][0].address;
			} else {
				lanIpEl.textContent = '---.---.---.---';
			}

			if (internetIface) {
				heroCard.classList.add('online');
				heroCard.classList.remove('offline');
				wanStatusEl.textContent = 'ONLINE';

				if (internetIface['ipv4-address'] && internetIface['ipv4-address'][0]) {
					wanIpEl.textContent = internetIface['ipv4-address'][0].address;
				} else if (gateway) {
					wanIpEl.textContent = `Gateway: ${gateway}`;
				} else {
					wanIpEl.textContent = 'Connected';
				}
			} else {
				heroCard.classList.add('offline');
				heroCard.classList.remove('online');
				wanStatusEl.textContent = 'OFFLINE';
				wanIpEl.textContent = 'No internet route';
			}
		} catch (err) {
			console.error('Failed to load WAN status:', err);
		}
	}

	async updateSystemLog() {
		try {
			const [status, result] = await this.core.ubusCall('file', 'exec', {
				command: '/usr/libexec/syslog-wrapper'
			});

			if (status === 0 && result && result.stdout) {
				const lines = result.stdout.split('\n').filter(l => l.trim()).slice(-20);
				const logHtml = lines.map(line => {
					let className = 'log-line';
					if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) {
						className += ' error';
					} else if (line.toLowerCase().includes('warn')) {
						className += ' warn';
					}
					return `<div class="${className}">${this.core.escapeHtml(line)}</div>`;
				}).join('');
				document.getElementById('system-log').innerHTML = logHtml || '<div class="log-line">No logs available</div>';
			} else {
				document.getElementById('system-log').innerHTML = '<div class="log-line" style="color: var(--steel-muted);">System log not available</div>';
			}
		} catch (err) {
			console.error('Failed to load system log:', err);
			document.getElementById('system-log').innerHTML = '<div class="log-line" style="color: var(--steel-muted);">System log not available</div>';
		}
	}

	async updateConnections() {
		try {
			const [arpStatus, arpResult] = await this.core.ubusCall('file', 'read', {
				path: '/proc/net/arp'
			}).catch(() => [1, null]);

			let deviceCount = 0;
			if (arpResult && arpResult.data) {
				const lines = arpResult.data.split('\n').slice(1);
				deviceCount = lines.filter(line => {
					if (!line.trim()) return false;
					const parts = line.trim().split(/\s+/);
					return parts.length >= 4 && parts[2] !== '0x0';
				}).length;
			}

			document.getElementById('clients').textContent = deviceCount;

			const [status, leases] = await this.core.ubusCall('luci-rpc', 'getDHCPLeases', {}).catch(() => [1, null]);
			const tbody = document.querySelector('#connections-table tbody');

			if (!leases || !leases.dhcp_leases || leases.dhcp_leases.length === 0) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">No active connections</td></tr>';
				return;
			}

			const rows = leases.dhcp_leases.map(lease => `
				<tr>
					<td>${this.core.escapeHtml(lease.ipaddr || 'Unknown')}</td>
					<td>${this.core.escapeHtml(lease.macaddr || 'Unknown')}</td>
					<td>${this.core.escapeHtml(lease.hostname || 'Unknown')}</td>
					<td><span class="badge badge-success">Active</span></td>
				</tr>
			`).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load connections:', err);
			document.getElementById('clients').textContent = 'N/A';
		}
	}

	initBandwidthGraph() {
		if (this.bandwidthCanvas && this.bandwidthCtx) return;

		const canvas = document.getElementById('bandwidth-graph');
		if (!canvas) return;

		this.bandwidthCanvas = canvas;
		this.bandwidthCtx = canvas.getContext('2d');

		canvas.width = canvas.offsetWidth;
		canvas.height = 200;
	}

	updateBandwidthGraph() {
		if (!this.bandwidthCtx || !this.bandwidthCanvas) return;

		const ctx = this.bandwidthCtx;
		const canvas = this.bandwidthCanvas;
		const width = canvas.width;
		const height = canvas.height;
		const padding = 20;

		ctx.clearRect(0, 0, width, height);

		const downData = this.bandwidthHistory.down;
		const upData = this.bandwidthHistory.up;

		if (downData.length < 2) return;

		const max = Math.max(...downData, ...upData, 100);
		const stepX = (width - padding * 2) / (downData.length - 1);

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.lineWidth = 1;
		for (let i = 0; i <= 4; i++) {
			const y = padding + (i * (height - padding * 2) / 4);
			ctx.beginPath();
			ctx.moveTo(padding, y);
			ctx.lineTo(width - padding, y);
			ctx.stroke();
		}

		ctx.fillStyle = 'rgba(226, 226, 229, 0.15)';
		ctx.beginPath();
		ctx.moveTo(padding, height - padding);
		downData.forEach((val, i) => {
			const x = padding + i * stepX;
			const y = height - padding - ((val / max) * (height - padding * 2));
			ctx.lineTo(x, y);
		});
		ctx.lineTo(width - padding, height - padding);
		ctx.closePath();
		ctx.fill();

		ctx.strokeStyle = 'rgba(226, 226, 229, 0.9)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		downData.forEach((val, i) => {
			const x = padding + i * stepX;
			const y = height - padding - ((val / max) * (height - padding * 2));
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.stroke();

		ctx.fillStyle = 'rgba(226, 226, 229, 0.08)';
		ctx.beginPath();
		ctx.moveTo(padding, height - padding);
		upData.forEach((val, i) => {
			const x = padding + i * stepX;
			const y = height - padding - ((val / max) * (height - padding * 2));
			ctx.lineTo(x, y);
		});
		ctx.lineTo(width - padding, height - padding);
		ctx.closePath();
		ctx.fill();

		ctx.strokeStyle = 'rgba(226, 226, 229, 0.5)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		upData.forEach((val, i) => {
			const x = padding + i * stepX;
			const y = height - padding - ((val / max) * (height - padding * 2));
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.stroke();
	}
}
