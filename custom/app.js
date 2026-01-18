class OpenWrtApp {
	constructor() {
		this.sessionId = localStorage.getItem('ubus_session');
		this.pollInterval = null;
		this.loadHistory = [];
		this.lastNetStats = null;
		this.lastCpuStats = null;
		this.init();
	}

	async init() {
		if (this.sessionId) {
			const valid = await this.validateSession();
			if (valid) {
				this.showMainView();
				this.loadDashboard();
				this.startPolling();
			} else {
				this.showLoginView();
			}
		} else {
			this.showLoginView();
		}
		this.attachEventListeners();
	}

	async ubusCall(object, method, params = {}) {
		const response = await fetch('/ubus', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Math.random(),
				method: 'call',
				params: [this.sessionId || '00000000000000000000000000000000', object, method, params]
			})
		});

		const data = await response.json();
		if (data.error) throw new Error(data.error.message);
		return data.result;
	}

	async login(username, password) {
		try {
			const result = await fetch('/ubus', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'call',
					params: ['00000000000000000000000000000000', 'session', 'login', {
						username,
						password
					}]
				})
			}).then(r => r.json());

			if (result.result && result.result[1] && result.result[1].ubus_rpc_session) {
				this.sessionId = result.result[1].ubus_rpc_session;
				localStorage.setItem('ubus_session', this.sessionId);
				return true;
			}
			return false;
		} catch (err) {
			console.error('Login error:', err);
			return false;
		}
	}

	async validateSession() {
		try {
			await this.ubusCall('session', 'access', {});
			return true;
		} catch {
			return false;
		}
	}

	async logout() {
		try {
			await this.ubusCall('session', 'destroy', {});
		} catch {}
		localStorage.removeItem('ubus_session');
		this.sessionId = null;
		this.stopPolling();
		this.showLoginView();
	}

	async loadDashboard() {
		try {
			const [status, systemInfo] = await this.ubusCall('system', 'info', {});
			const [boardStatus, boardInfo] = await this.ubusCall('system', 'board', {});

			document.getElementById('hostname').textContent = boardInfo.hostname || 'OpenWrt';
			document.getElementById('uptime').textContent = this.formatUptime(systemInfo.uptime);

			const memPercent = ((systemInfo.memory.total - systemInfo.memory.free) / systemInfo.memory.total * 100).toFixed(0);
			document.getElementById('memory').textContent = this.formatMemory(systemInfo.memory);
			document.getElementById('memory-bar').style.width = memPercent + '%';

			const loadAvg = (systemInfo.load[0] / 65536).toFixed(2);
			document.getElementById('load').textContent = systemInfo.load.map(l => (l / 65536).toFixed(2)).join(', ');

			this.loadHistory.push(parseFloat(loadAvg));
			if (this.loadHistory.length > 60) this.loadHistory.shift();
			this.updateLoadGraph();

			await this.updateCpuUsage();
			await this.updateNetworkStats();
			await this.updateSystemLog();
			await this.updateConnections();
		} catch (err) {
			console.error('Failed to load dashboard:', err);
			this.showToast('Error', 'Failed to load system information', 'error');
		}
	}

	async updateCpuUsage() {
		try {
			const [status, result] = await this.ubusCall('file', 'read', {
				path: '/proc/stat'
			});

			if (result && result.data) {
				const content = atob(result.data);
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
			const [status, result] = await this.ubusCall('file', 'read', {
				path: '/proc/net/dev'
			});

			if (result && result.data) {
				const content = atob(result.data);
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
					const rxRate = (totalRx - this.lastNetStats.rx) / 1024 / 5;
					const txRate = (totalTx - this.lastNetStats.tx) / 1024 / 5;
					document.getElementById('net-rx').textContent = this.formatRate(rxRate);
					document.getElementById('net-tx').textContent = this.formatRate(txRate);
				}

				this.lastNetStats = { rx: totalRx, tx: totalTx };
			}
		} catch (err) {
			document.getElementById('net-rx').textContent = 'N/A';
			document.getElementById('net-tx').textContent = 'N/A';
		}
	}

	async updateSystemLog() {
		try {
			const [status, result] = await this.ubusCall('file', 'read', {
				path: '/var/log/messages'
			}).catch(() => [1, null]);

			if (result && result.data) {
				const lines = atob(result.data).split('\n').filter(l => l.trim()).slice(-20);
				const logHtml = lines.map(line => {
					let className = 'log-line';
					if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) {
						className += ' error';
					} else if (line.toLowerCase().includes('warn')) {
						className += ' warn';
					}
					return `<div class="${className}">${this.escapeHtml(line)}</div>`;
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
			const [status, leases] = await this.ubusCall('luci-rpc', 'getDHCPLeases', {}).catch(() => [1, null]);
			const tbody = document.querySelector('#connections-table tbody');

			if (!leases || !leases.dhcp_leases || leases.dhcp_leases.length === 0) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">No active connections</td></tr>';
				document.getElementById('clients').textContent = '0';
				return;
			}

			const rows = leases.dhcp_leases.map(lease => `
				<tr>
					<td>${this.escapeHtml(lease.ipaddr || 'Unknown')}</td>
					<td>${this.escapeHtml(lease.macaddr || 'Unknown')}</td>
					<td>${this.escapeHtml(lease.hostname || 'Unknown')}</td>
					<td><span class="badge badge-success">Active</span></td>
				</tr>
			`).join('');

			tbody.innerHTML = rows;
			document.getElementById('clients').textContent = leases.dhcp_leases.length;
		} catch (err) {
			console.error('Failed to load connections:', err);
			document.getElementById('clients').textContent = 'N/A';
		}
	}

	updateLoadGraph() {
		const svg = document.getElementById('load-graph');
		const width = 300;
		const height = 80;
		const data = this.loadHistory;

		if (data.length < 2) return;

		const max = Math.max(...data, 1);
		const points = data.map((val, i) => {
			const x = (i / (data.length - 1)) * width;
			const y = height - (val / max) * height;
			return `${x},${y}`;
		}).join(' ');

		const line = `<polyline class="graph-line" points="${points}" />`;
		const fill = `<polygon class="graph-fill" points="0,${height} ${points} ${width},${height}" />`;

		svg.innerHTML = svg.innerHTML.split('</defs>')[0] + '</defs>' + fill + line;
	}

	startPolling() {
		this.stopPolling();
		this.pollInterval = setInterval(() => {
			const currentPage = document.querySelector('.page:not(.hidden)');
			if (currentPage && currentPage.id === 'dashboard-page') {
				this.loadDashboard();
			}
		}, 5000);
	}

	stopPolling() {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}

	async rebootSystem() {
		if (!confirm('Are you sure you want to reboot the system?')) return;
		try {
			await this.ubusCall('system', 'reboot', {});
			this.showToast('Success', 'System is rebooting...', 'success');
			setTimeout(() => this.logout(), 2000);
		} catch (err) {
			this.showToast('Error', 'Failed to reboot system', 'error');
		}
	}

	async restartNetwork() {
		if (!confirm('Restart network services? This may interrupt connectivity.')) return;
		try {
			await this.ubusCall('file', 'exec', { command: '/etc/init.d/network', params: ['restart'] });
			this.showToast('Success', 'Network services restarting...', 'success');
		} catch (err) {
			this.showToast('Error', 'Failed to restart network', 'error');
		}
	}

	async restartFirewall() {
		try {
			await this.ubusCall('file', 'exec', { command: '/etc/init.d/firewall', params: ['restart'] });
			this.showToast('Success', 'Firewall restarted successfully', 'success');
		} catch (err) {
			this.showToast('Error', 'Failed to restart firewall', 'error');
		}
	}

	formatUptime(seconds) {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${days}d ${hours}h ${minutes}m`;
	}

	formatMemory(mem) {
		const total = (mem.total / 1024 / 1024).toFixed(0);
		const free = (mem.free / 1024 / 1024).toFixed(0);
		const used = total - free;
		const percent = ((used / total) * 100).toFixed(0);
		return `${used}MB / ${total}MB (${percent}%)`;
	}

	formatRate(kbps) {
		if (kbps < 1) return `${(kbps * 1024).toFixed(0)} B/s`;
		if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
		return `${(kbps / 1024).toFixed(2)} MB/s`;
	}

	escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	showLoginView() {
		document.getElementById('login-view').classList.remove('hidden');
		document.getElementById('main-view').classList.add('hidden');
	}

	showMainView() {
		document.getElementById('login-view').classList.add('hidden');
		document.getElementById('main-view').classList.remove('hidden');
	}

	showError(message) {
		const errorEl = document.getElementById('login-error');
		if (errorEl) {
			errorEl.textContent = message;
			setTimeout(() => errorEl.textContent = '', 3000);
		}
	}

	showToast(title, message, type = 'info') {
		const toast = document.createElement('div');
		toast.className = `toast ${type}`;
		toast.innerHTML = `
			<div class="toast-title">${this.escapeHtml(title)}</div>
			<div class="toast-message">${this.escapeHtml(message)}</div>
		`;
		document.body.appendChild(toast);
		setTimeout(() => toast.remove(), 4000);
	}

	attachEventListeners() {
		document.getElementById('login-form').addEventListener('submit', async (e) => {
			e.preventDefault();
			const username = document.getElementById('username').value;
			const password = document.getElementById('password').value;

			const success = await this.login(username, password);
			if (success) {
				this.showMainView();
				this.loadDashboard();
				this.startPolling();
			} else {
				this.showError('Invalid credentials');
			}
		});

		document.getElementById('logout-btn').addEventListener('click', () => {
			this.logout();
		});

		document.getElementById('reboot-btn').addEventListener('click', () => {
			this.rebootSystem();
		});

		document.getElementById('restart-network-btn').addEventListener('click', () => {
			this.restartNetwork();
		});

		document.getElementById('restart-firewall-btn').addEventListener('click', () => {
			this.restartFirewall();
		});

		document.querySelectorAll('.nav a').forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const page = e.target.dataset.page;
				this.navigateTo(page);
			});
		});

		document.querySelectorAll('.tab-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const tabName = e.target.dataset.tab;
				const page = e.target.closest('.page');
				this.switchTab(page, tabName);
			});
		});

		document.getElementById('ping-btn').addEventListener('click', () => {
			this.runPing();
		});

		document.getElementById('traceroute-btn').addEventListener('click', () => {
			this.runTraceroute();
		});

		document.getElementById('wol-btn').addEventListener('click', () => {
			this.sendWakeOnLan();
		});

		document.getElementById('close-interface-modal').addEventListener('click', () => {
			this.closeInterfaceConfig();
		});

		document.getElementById('cancel-interface-btn').addEventListener('click', () => {
			this.closeInterfaceConfig();
		});

		document.getElementById('save-interface-btn').addEventListener('click', () => {
			this.saveInterfaceConfig();
		});

		document.getElementById('edit-iface-proto').addEventListener('change', () => {
			this.updateStaticConfigVisibility();
		});

		document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
			this.closeInterfaceConfig();
		});

		document.getElementById('close-wireless-modal').addEventListener('click', () => {
			this.closeWirelessConfig();
		});

		document.getElementById('cancel-wireless-btn').addEventListener('click', () => {
			this.closeWirelessConfig();
		});

		document.getElementById('save-wireless-btn').addEventListener('click', () => {
			this.saveWirelessConfig();
		});

		document.getElementById('edit-wifi-encryption').addEventListener('change', () => {
			this.updateWirelessKeyVisibility();
		});

		document.getElementById('add-forward-btn').addEventListener('click', () => {
			this.openForwardRule();
		});

		document.getElementById('close-forward-modal').addEventListener('click', () => {
			this.closeForwardRule();
		});

		document.getElementById('cancel-forward-btn').addEventListener('click', () => {
			this.closeForwardRule();
		});

		document.getElementById('save-forward-btn').addEventListener('click', () => {
			this.saveForwardRule();
		});

		document.getElementById('add-static-lease-btn').addEventListener('click', () => {
			this.openStaticLease();
		});

		document.getElementById('close-static-lease-modal').addEventListener('click', () => {
			this.closeStaticLease();
		});

		document.getElementById('cancel-static-lease-btn').addEventListener('click', () => {
			this.closeStaticLease();
		});

		document.getElementById('save-static-lease-btn').addEventListener('click', () => {
			this.saveStaticLease();
		});

		document.getElementById('backup-btn').addEventListener('click', () => {
			this.generateBackup();
		});

		document.getElementById('reset-btn').addEventListener('click', () => {
			this.resetToDefaults();
		});

		document.getElementById('change-password-btn')?.addEventListener('click', () => {
			this.changePassword();
		});

		document.getElementById('save-general-btn')?.addEventListener('click', () => {
			this.saveGeneralSettings();
		});

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				this.stopPolling();
			} else {
				const currentPage = document.querySelector('.page:not(.hidden)');
				if (currentPage && currentPage.id === 'dashboard-page') {
					this.startPolling();
				}
			}
		});
	}

	navigateTo(page) {
		document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
		document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));

		document.getElementById(`${page}-page`).classList.remove('hidden');
		document.querySelector(`[data-page="${page}"]`).classList.add('active');

		if (page === 'dashboard') {
			this.loadDashboard();
			this.startPolling();
		} else {
			this.stopPolling();
			if (page === 'network') {
				this.loadNetworkData();
			} else if (page === 'system') {
				this.loadSystemData();
			}
		}
	}

	switchTab(page, tabName) {
		page.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
		page.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

		page.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
		page.querySelector(`#tab-${tabName}`).classList.remove('hidden');

		if (tabName === 'interfaces') {
			this.loadNetworkInterfaces();
		} else if (tabName === 'wireless') {
			this.loadWireless();
		} else if (tabName === 'firewall') {
			this.loadFirewallRules();
		} else if (tabName === 'dhcp') {
			this.loadDHCPLeases();
		} else if (tabName === 'startup') {
			this.loadServices();
		} else if (tabName === 'software') {
			this.loadPackages();
		}
	}

	async loadNetworkData() {
		this.loadNetworkInterfaces();
	}

	async loadSystemData() {
		const [status, boardInfo] = await this.ubusCall('system', 'board', {});
		if (boardInfo) {
			const hostnameInput = document.getElementById('system-hostname');
			if (hostnameInput) {
				hostnameInput.value = boardInfo.hostname || 'OpenWrt';
			}
		}
	}

	async loadNetworkInterfaces() {
		try {
			const [status, result] = await this.ubusCall('network.interface', 'dump', {});
			const tbody = document.querySelector('#interfaces-table tbody');

			if (!result || !result.interface || result.interface.length === 0) {
				tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--steel-muted);">No interfaces found</td></tr>';
				return;
			}

			const rows = result.interface.map(iface => {
				const statusBadge = iface.up ? '<span class="badge badge-success">UP</span>' : '<span class="badge badge-error">DOWN</span>';
				const ipaddr = (iface['ipv4-address'] && iface['ipv4-address'][0]) ? iface['ipv4-address'][0].address : 'N/A';
				const rxBytes = ((iface.statistics?.rx_bytes || 0) / 1024 / 1024).toFixed(2);
				const txBytes = ((iface.statistics?.tx_bytes || 0) / 1024 / 1024).toFixed(2);
				const proto = iface.proto || 'unknown';

				return `
					<tr>
						<td>${this.escapeHtml(iface.interface || 'Unknown')}</td>
						<td>${this.escapeHtml(proto).toUpperCase()}</td>
						<td>${statusBadge}</td>
						<td>${this.escapeHtml(ipaddr)}</td>
						<td>${rxBytes} / ${txBytes} MB</td>
						<td>
							<a href="#" class="action-link" data-iface="${this.escapeHtml(iface.interface)}">Configure</a>
						</td>
					</tr>
				`;
			}).join('');

			tbody.innerHTML = rows;

			document.querySelectorAll('#interfaces-table .action-link').forEach(link => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const ifaceName = e.target.dataset.iface;
					this.openInterfaceConfig(ifaceName);
				});
			});
		} catch (err) {
			console.error('Failed to load network interfaces:', err);
			const tbody = document.querySelector('#interfaces-table tbody');
			tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--steel-muted);">Failed to load interfaces</td></tr>';
		}
	}

	async openInterfaceConfig(ifaceName) {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'network',
				section: ifaceName
			});

			document.getElementById('edit-iface-name').value = ifaceName;
			document.getElementById('edit-iface-proto').value = config.values.proto || 'static';
			document.getElementById('edit-iface-ipaddr').value = config.values.ipaddr || '';
			document.getElementById('edit-iface-netmask').value = config.values.netmask || '';
			document.getElementById('edit-iface-gateway').value = config.values.gateway || '';

			const dns = config.values.dns || [];
			const dnsStr = Array.isArray(dns) ? dns.join(' ') : (dns || '');
			document.getElementById('edit-iface-dns').value = dnsStr;

			this.updateStaticConfigVisibility();
			document.getElementById('interface-modal').classList.remove('hidden');
		} catch (err) {
			console.error('Failed to load interface config:', err);
			this.showToast('Error', 'Failed to load interface configuration', 'error');
		}
	}

	closeInterfaceConfig() {
		document.getElementById('interface-modal').classList.add('hidden');
	}

	updateStaticConfigVisibility() {
		const proto = document.getElementById('edit-iface-proto').value;
		const staticConfig = document.getElementById('static-config');
		if (proto === 'static') {
			staticConfig.style.display = 'block';
		} else {
			staticConfig.style.display = 'none';
		}
	}

	async saveInterfaceConfig() {
		try {
			const ifaceName = document.getElementById('edit-iface-name').value;
			const proto = document.getElementById('edit-iface-proto').value;

			await this.ubusCall('uci', 'set', {
				config: 'network',
				section: ifaceName,
				values: {
					proto: proto
				}
			});

			if (proto === 'static') {
				const ipaddr = document.getElementById('edit-iface-ipaddr').value;
				const netmask = document.getElementById('edit-iface-netmask').value;
				const gateway = document.getElementById('edit-iface-gateway').value;
				const dns = document.getElementById('edit-iface-dns').value.split(/\s+/).filter(d => d);

				const staticValues = { proto };
				if (ipaddr) staticValues.ipaddr = ipaddr;
				if (netmask) staticValues.netmask = netmask;
				if (gateway) staticValues.gateway = gateway;
				if (dns.length > 0) staticValues.dns = dns;

				await this.ubusCall('uci', 'set', {
					config: 'network',
					section: ifaceName,
					values: staticValues
				});
			}

			await this.ubusCall('uci', 'commit', {
				config: 'network'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/network',
				params: ['reload']
			});

			this.showToast('Success', 'Interface configuration saved', 'success');
			this.closeInterfaceConfig();
			setTimeout(() => this.loadNetworkInterfaces(), 2000);
		} catch (err) {
			console.error('Failed to save interface config:', err);
			this.showToast('Error', 'Failed to save configuration', 'error');
		}
	}

	async loadWireless() {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'wireless'
			});

			const tbody = document.querySelector('#wireless-table tbody');
			const rows = [];

			if (!config || !config.values) {
				tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--steel-muted);">No wireless devices found</td></tr>';
				return;
			}

			for (const [section, sectionData] of Object.entries(config.values)) {
				if (sectionData['.type'] === 'wifi-iface') {
					const radio = sectionData.device || 'unknown';
					const ssid = sectionData.ssid || 'N/A';
					const disabled = sectionData.disabled === '1';
					const encryption = sectionData.encryption || 'none';

					const statusBadge = disabled ?
						'<span class="badge badge-error">DISABLED</span>' :
						'<span class="badge badge-success">ENABLED</span>';

					let radioInfo = await this.getRadioInfo(radio);
					const channel = radioInfo.channel || 'Auto';
					const signal = radioInfo.signal || 'N/A';

					rows.push(`
						<tr>
							<td>${this.escapeHtml(radio)}</td>
							<td>${this.escapeHtml(ssid)}</td>
							<td>${this.escapeHtml(String(channel))}</td>
							<td>${statusBadge}</td>
							<td>${this.escapeHtml(encryption)}</td>
							<td>
								<a href="#" class="action-link" data-wifi-section="${this.escapeHtml(section)}" data-wifi-radio="${this.escapeHtml(radio)}">Configure</a>
							</td>
						</tr>
					`);
				}
			}

			if (rows.length === 0) {
				tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--steel-muted);">No wireless interfaces found</td></tr>';
			} else {
				tbody.innerHTML = rows.join('');

				document.querySelectorAll('#wireless-table .action-link').forEach(link => {
					link.addEventListener('click', (e) => {
						e.preventDefault();
						const section = e.target.dataset.wifiSection;
						const radio = e.target.dataset.wifiRadio;
						this.openWirelessConfig(section, radio);
					});
				});
			}
		} catch (err) {
			console.error('Failed to load wireless:', err);
			const tbody = document.querySelector('#wireless-table tbody');
			tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--steel-muted);">Failed to load wireless</td></tr>';
		}
	}

	async getRadioInfo(radio) {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'wireless',
				section: radio
			});
			return config?.values || {};
		} catch {
			return {};
		}
	}

	async openWirelessConfig(section, radio) {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'wireless',
				section: section
			});

			const values = config.values;
			document.getElementById('edit-wifi-section').value = section;
			document.getElementById('edit-wifi-radio').value = radio;
			document.getElementById('edit-wifi-ssid').value = values.ssid || '';
			document.getElementById('edit-wifi-encryption').value = values.encryption || 'none';
			document.getElementById('edit-wifi-key').value = values.key || '';
			document.getElementById('edit-wifi-disabled').value = values.disabled || '0';
			document.getElementById('edit-wifi-hidden').value = values.hidden || '0';

			const [radioStatus, radioConfig] = await this.ubusCall('uci', 'get', {
				config: 'wireless',
				section: radio
			});

			const radioValues = radioConfig.values;
			const channelSelect = document.getElementById('edit-wifi-channel');
			const currentChannel = radioValues.channel || 'auto';
			const band = radioValues.band || radioValues.hwmode || '2g';

			channelSelect.innerHTML = '<option value="auto">Auto</option>';
			if (band.includes('5') || band.includes('a')) {
				for (let ch of [36, 40, 44, 48, 149, 153, 157, 161, 165]) {
					channelSelect.innerHTML += `<option value="${ch}">${ch}</option>`;
				}
			} else {
				for (let ch = 1; ch <= 13; ch++) {
					channelSelect.innerHTML += `<option value="${ch}">${ch}</option>`;
				}
			}
			channelSelect.value = currentChannel;

			document.getElementById('edit-wifi-txpower').value = radioValues.txpower || '';

			this.updateWirelessKeyVisibility();
			document.getElementById('wireless-modal').classList.remove('hidden');
		} catch (err) {
			console.error('Failed to load wireless config:', err);
			this.showToast('Error', 'Failed to load wireless configuration', 'error');
		}
	}

	closeWirelessConfig() {
		document.getElementById('wireless-modal').classList.add('hidden');
	}

	updateWirelessKeyVisibility() {
		const encryption = document.getElementById('edit-wifi-encryption').value;
		const keyGroup = document.getElementById('wifi-key-group');
		if (encryption === 'none') {
			keyGroup.style.display = 'none';
		} else {
			keyGroup.style.display = 'block';
		}
	}

	async saveWirelessConfig() {
		try {
			const section = document.getElementById('edit-wifi-section').value;
			const radio = document.getElementById('edit-wifi-radio').value;
			const ssid = document.getElementById('edit-wifi-ssid').value;
			const encryption = document.getElementById('edit-wifi-encryption').value;
			const key = document.getElementById('edit-wifi-key').value;
			const disabled = document.getElementById('edit-wifi-disabled').value;
			const hidden = document.getElementById('edit-wifi-hidden').value;
			const channel = document.getElementById('edit-wifi-channel').value;
			const txpower = document.getElementById('edit-wifi-txpower').value;

			if (!ssid) {
				this.showToast('Error', 'SSID is required', 'error');
				return;
			}

			if (encryption !== 'none' && (!key || key.length < 8)) {
				this.showToast('Error', 'Password must be at least 8 characters', 'error');
				return;
			}

			const ifaceValues = { ssid, encryption, disabled, hidden };
			if (encryption !== 'none') {
				ifaceValues.key = key;
			}

			await this.ubusCall('uci', 'set', {
				config: 'wireless',
				section: section,
				values: ifaceValues
			});

			const radioValues = {};
			if (channel) radioValues.channel = channel;
			if (txpower) radioValues.txpower = txpower;

			if (Object.keys(radioValues).length > 0) {
				await this.ubusCall('uci', 'set', {
					config: 'wireless',
					section: radio,
					values: radioValues
				});
			}

			await this.ubusCall('uci', 'commit', {
				config: 'wireless'
			});

			await this.ubusCall('file', 'exec', {
				command: '/sbin/wifi',
				params: ['reload']
			});

			this.showToast('Success', 'Wireless configuration saved. WiFi reloading...', 'success');
			this.closeWirelessConfig();
			setTimeout(() => this.loadWireless(), 3000);
		} catch (err) {
			console.error('Failed to save wireless config:', err);
			this.showToast('Error', 'Failed to save configuration', 'error');
		}
	}

	async loadFirewallRules() {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'firewall'
			});

			const tbody = document.querySelector('#firewall-table tbody');
			const rows = [];

			if (!config || !config.values) {
				tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--steel-muted);">No rules configured</td></tr>';
				return;
			}

			for (const [section, sectionData] of Object.entries(config.values)) {
				if (sectionData['.type'] === 'redirect') {
					const name = sectionData.name || section;
					const proto = sectionData.proto || 'tcp';
					const srcDport = sectionData.src_dport || 'N/A';
					const destIp = sectionData.dest_ip || 'N/A';
					const destPort = sectionData.dest_port || srcDport;
					const enabled = sectionData.enabled !== '0';

					const statusBadge = enabled ?
						'<span class="badge badge-success">YES</span>' :
						'<span class="badge badge-error">NO</span>';

					rows.push(`
						<tr>
							<td>${this.escapeHtml(name)}</td>
							<td>${this.escapeHtml(proto).toUpperCase()}</td>
							<td>${this.escapeHtml(srcDport)}</td>
							<td>${this.escapeHtml(destIp)}</td>
							<td>${this.escapeHtml(destPort)}</td>
							<td>${statusBadge}</td>
							<td>
								<a href="#" class="action-link" data-forward-section="${this.escapeHtml(section)}">Edit</a> |
								<a href="#" class="action-link-danger" data-forward-delete="${this.escapeHtml(section)}">Delete</a>
							</td>
						</tr>
					`);
				}
			}

			if (rows.length === 0) {
				tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--steel-muted);">No rules configured</td></tr>';
			} else {
				tbody.innerHTML = rows.join('');

				document.querySelectorAll('#firewall-table .action-link').forEach(link => {
					link.addEventListener('click', (e) => {
						e.preventDefault();
						const section = e.target.dataset.forwardSection;
						this.openForwardRule(section);
					});
				});

				document.querySelectorAll('#firewall-table .action-link-danger').forEach(link => {
					link.addEventListener('click', (e) => {
						e.preventDefault();
						const section = e.target.dataset.forwardDelete;
						this.deleteForwardRule(section);
					});
				});
			}
		} catch (err) {
			console.error('Failed to load firewall rules:', err);
			const tbody = document.querySelector('#firewall-table tbody');
			tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--steel-muted);">Failed to load rules</td></tr>';
		}
	}

	async openForwardRule(section = null) {
		try {
			if (section) {
				const [status, config] = await this.ubusCall('uci', 'get', {
					config: 'firewall',
					section: section
				});

				const values = config.values;
				document.getElementById('edit-forward-section').value = section;
				document.getElementById('edit-forward-name').value = values.name || '';
				document.getElementById('edit-forward-proto').value = values.proto || 'tcp';
				document.getElementById('edit-forward-src-dport').value = values.src_dport || '';
				document.getElementById('edit-forward-dest-ip').value = values.dest_ip || '';
				document.getElementById('edit-forward-dest-port').value = values.dest_port || '';
				document.getElementById('edit-forward-enabled').value = values.enabled === '0' ? '0' : '1';
			} else {
				document.getElementById('edit-forward-section').value = '';
				document.getElementById('edit-forward-name').value = '';
				document.getElementById('edit-forward-proto').value = 'tcp';
				document.getElementById('edit-forward-src-dport').value = '';
				document.getElementById('edit-forward-dest-ip').value = '';
				document.getElementById('edit-forward-dest-port').value = '';
				document.getElementById('edit-forward-enabled').value = '1';
			}

			document.getElementById('forward-modal').classList.remove('hidden');
		} catch (err) {
			console.error('Failed to load forward rule:', err);
			this.showToast('Error', 'Failed to load rule configuration', 'error');
		}
	}

	closeForwardRule() {
		document.getElementById('forward-modal').classList.add('hidden');
	}

	async saveForwardRule() {
		try {
			const section = document.getElementById('edit-forward-section').value;
			const name = document.getElementById('edit-forward-name').value;
			const proto = document.getElementById('edit-forward-proto').value;
			const srcDport = document.getElementById('edit-forward-src-dport').value;
			const destIp = document.getElementById('edit-forward-dest-ip').value;
			const destPort = document.getElementById('edit-forward-dest-port').value;
			const enabled = document.getElementById('edit-forward-enabled').value;

			if (!name || !srcDport || !destIp) {
				this.showToast('Error', 'Name, external port, and internal IP are required', 'error');
				return;
			}

			const values = {
				name,
				src: 'wan',
				proto,
				src_dport: srcDport,
				dest: 'lan',
				dest_ip: destIp,
				target: 'DNAT',
				enabled
			};

			if (destPort) {
				values.dest_port = destPort;
			}

			if (section) {
				await this.ubusCall('uci', 'set', {
					config: 'firewall',
					section: section,
					values: values
				});
			} else {
				await this.ubusCall('uci', 'add', {
					config: 'firewall',
					type: 'redirect',
					name: name,
					values: values
				});
			}

			await this.ubusCall('uci', 'commit', {
				config: 'firewall'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/firewall',
				params: ['reload']
			});

			this.showToast('Success', 'Port forwarding rule saved', 'success');
			this.closeForwardRule();
			setTimeout(() => this.loadFirewallRules(), 2000);
		} catch (err) {
			console.error('Failed to save forward rule:', err);
			this.showToast('Error', 'Failed to save rule', 'error');
		}
	}

	async deleteForwardRule(section) {
		if (!confirm('Delete this port forwarding rule?')) return;

		try {
			await this.ubusCall('uci', 'delete', {
				config: 'firewall',
				section: section
			});

			await this.ubusCall('uci', 'commit', {
				config: 'firewall'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/firewall',
				params: ['reload']
			});

			this.showToast('Success', 'Rule deleted', 'success');
			setTimeout(() => this.loadFirewallRules(), 2000);
		} catch (err) {
			console.error('Failed to delete rule:', err);
			this.showToast('Error', 'Failed to delete rule', 'error');
		}
	}

	async loadDHCPLeases() {
		try {
			const [status, result] = await this.ubusCall('luci-rpc', 'getDHCPLeases', {}).catch(() => [1, null]);
			const tbody = document.querySelector('#dhcp-leases-table tbody');

			if (!result || !result.dhcp_leases || result.dhcp_leases.length === 0) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">No active leases</td></tr>';
			} else {
				const rows = result.dhcp_leases.map(lease => {
					const expires = lease.expires ? `${Math.floor(lease.expires / 60)}m` : 'Static';
					return `
						<tr>
							<td>${this.escapeHtml(lease.hostname || 'Unknown')}</td>
							<td>${this.escapeHtml(lease.ipaddr || 'Unknown')}</td>
							<td>${this.escapeHtml(lease.macaddr || 'Unknown')}</td>
							<td>${expires}</td>
						</tr>
					`;
				}).join('');
				tbody.innerHTML = rows;
			}

			await this.loadStaticLeases();
		} catch (err) {
			console.error('Failed to load DHCP leases:', err);
		}
	}

	async loadStaticLeases() {
		try {
			const [status, config] = await this.ubusCall('uci', 'get', {
				config: 'dhcp'
			});

			const tbody = document.querySelector('#dhcp-static-table tbody');
			const rows = [];

			if (!config || !config.values) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">No static leases</td></tr>';
				return;
			}

			for (const [section, sectionData] of Object.entries(config.values)) {
				if (sectionData['.type'] === 'host') {
					const name = sectionData.name || section;
					const mac = sectionData.mac || 'N/A';
					const ip = sectionData.ip || 'N/A';

					rows.push(`
						<tr>
							<td>${this.escapeHtml(name)}</td>
							<td>${this.escapeHtml(mac)}</td>
							<td>${this.escapeHtml(ip)}</td>
							<td>
								<a href="#" class="action-link" data-static-lease-section="${this.escapeHtml(section)}">Edit</a> |
								<a href="#" class="action-link-danger" data-static-lease-delete="${this.escapeHtml(section)}">Delete</a>
							</td>
						</tr>
					`);
				}
			}

			if (rows.length === 0) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">No static leases</td></tr>';
			} else {
				tbody.innerHTML = rows.join('');

				document.querySelectorAll('#dhcp-static-table .action-link').forEach(link => {
					link.addEventListener('click', (e) => {
						e.preventDefault();
						const section = e.target.dataset.staticLeaseSection;
						this.openStaticLease(section);
					});
				});

				document.querySelectorAll('#dhcp-static-table .action-link-danger').forEach(link => {
					link.addEventListener('click', (e) => {
						e.preventDefault();
						const section = e.target.dataset.staticLeaseDelete;
						this.deleteStaticLease(section);
					});
				});
			}
		} catch (err) {
			console.error('Failed to load static leases:', err);
			const tbody = document.querySelector('#dhcp-static-table tbody');
			tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">Failed to load static leases</td></tr>';
		}
	}

	async openStaticLease(section = null) {
		try {
			if (section) {
				const [status, config] = await this.ubusCall('uci', 'get', {
					config: 'dhcp',
					section: section
				});

				const values = config.values;
				document.getElementById('edit-static-lease-section').value = section;
				document.getElementById('edit-static-lease-name').value = values.name || '';
				document.getElementById('edit-static-lease-mac').value = values.mac || '';
				document.getElementById('edit-static-lease-ip').value = values.ip || '';
			} else {
				document.getElementById('edit-static-lease-section').value = '';
				document.getElementById('edit-static-lease-name').value = '';
				document.getElementById('edit-static-lease-mac').value = '';
				document.getElementById('edit-static-lease-ip').value = '';
			}

			document.getElementById('static-lease-modal').classList.remove('hidden');
		} catch (err) {
			console.error('Failed to load static lease:', err);
			this.showToast('Error', 'Failed to load lease configuration', 'error');
		}
	}

	closeStaticLease() {
		document.getElementById('static-lease-modal').classList.add('hidden');
	}

	async saveStaticLease() {
		try {
			const section = document.getElementById('edit-static-lease-section').value;
			const name = document.getElementById('edit-static-lease-name').value;
			const mac = document.getElementById('edit-static-lease-mac').value;
			const ip = document.getElementById('edit-static-lease-ip').value;

			if (!mac || !ip) {
				this.showToast('Error', 'MAC address and IP address are required', 'error');
				return;
			}

			const values = { name: name || mac, mac, ip };

			if (section) {
				await this.ubusCall('uci', 'set', {
					config: 'dhcp',
					section: section,
					values: values
				});
			} else {
				await this.ubusCall('uci', 'add', {
					config: 'dhcp',
					type: 'host',
					name: name || mac,
					values: values
				});
			}

			await this.ubusCall('uci', 'commit', {
				config: 'dhcp'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/dnsmasq',
				params: ['reload']
			});

			this.showToast('Success', 'Static DHCP lease saved', 'success');
			this.closeStaticLease();
			setTimeout(() => this.loadStaticLeases(), 2000);
		} catch (err) {
			console.error('Failed to save static lease:', err);
			this.showToast('Error', 'Failed to save lease', 'error');
		}
	}

	async deleteStaticLease(section) {
		if (!confirm('Delete this static DHCP lease?')) return;

		try {
			await this.ubusCall('uci', 'delete', {
				config: 'dhcp',
				section: section
			});

			await this.ubusCall('uci', 'commit', {
				config: 'dhcp'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/dnsmasq',
				params: ['reload']
			});

			this.showToast('Success', 'Static lease deleted', 'success');
			setTimeout(() => this.loadStaticLeases(), 2000);
		} catch (err) {
			console.error('Failed to delete static lease:', err);
			this.showToast('Error', 'Failed to delete lease', 'error');
		}
	}

	async loadServices() {
		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/bin/ls',
				params: ['/etc/init.d']
			});

			const tbody = document.querySelector('#services-table tbody');

			if (!result || !result.stdout) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">Failed to load services</td></tr>';
				return;
			}

			const services = result.stdout.trim().split('\n').filter(s =>
				s && !s.startsWith('README') && !s.includes('rcS') && !s.includes('rc.') && s !== 'boot'
			).sort();

			const rows = await Promise.all(services.map(async service => {
				const enabled = await this.isServiceEnabled(service);
				const running = await this.isServiceRunning(service);

				const statusBadge = running ?
					'<span class="badge badge-success">RUNNING</span>' :
					'<span class="badge badge-error">STOPPED</span>';

				const enabledBadge = enabled ?
					'<span class="badge badge-success">YES</span>' :
					'<span class="badge">NO</span>';

				return `
					<tr>
						<td>${this.escapeHtml(service)}</td>
						<td>${statusBadge}</td>
						<td>${enabledBadge}</td>
						<td>
							<a href="#" class="action-link" data-service="${this.escapeHtml(service)}" data-action="start">Start</a> |
							<a href="#" class="action-link" data-service="${this.escapeHtml(service)}" data-action="stop">Stop</a> |
							<a href="#" class="action-link" data-service="${this.escapeHtml(service)}" data-action="restart">Restart</a> |
							<a href="#" class="action-link" data-service="${this.escapeHtml(service)}" data-action="${enabled ? 'disable' : 'enable'}">${enabled ? 'Disable' : 'Enable'}</a>
						</td>
					</tr>
				`;
			}));

			tbody.innerHTML = rows.join('');

			document.querySelectorAll('#services-table .action-link').forEach(link => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const service = e.target.dataset.service;
					const action = e.target.dataset.action;
					this.manageService(service, action);
				});
			});
		} catch (err) {
			console.error('Failed to load services:', err);
			const tbody = document.querySelector('#services-table tbody');
			tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--steel-muted);">Failed to load services</td></tr>';
		}
	}

	async isServiceEnabled(service) {
		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/' + service,
				params: ['enabled']
			});
			return result && result.code === 0;
		} catch {
			return false;
		}
	}

	async isServiceRunning(service) {
		try {
			const [status, result] = await this.ubusCall('file', 'read', {
				path: '/var/run/' + service + '.pid'
			});
			return result && result.data;
		} catch {
			return false;
		}
	}

	async manageService(service, action) {
		try {
			this.showToast('Info', `${action}ing ${service}...`, 'info');

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/' + service,
				params: [action]
			});

			this.showToast('Success', `Service ${action} completed`, 'success');
			setTimeout(() => this.loadServices(), 2000);
		} catch (err) {
			console.error('Failed to manage service:', err);
			this.showToast('Error', `Failed to ${action} service`, 'error');
		}
	}

	async loadPackages() {
		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/bin/opkg',
				params: ['list-installed']
			});

			const tbody = document.querySelector('#packages-table tbody');

			if (!result || !result.stdout) {
				tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--steel-muted);">Failed to load packages</td></tr>';
				return;
			}

			const lines = result.stdout.trim().split('\n').filter(l => l.trim());
			const packages = lines.map(line => {
				const parts = line.split(' - ');
				return {
					name: parts[0],
					version: parts[1] || 'unknown'
				};
			}).sort((a, b) => a.name.localeCompare(b.name));

			const rows = packages.map(pkg => `
				<tr>
					<td>${this.escapeHtml(pkg.name)}</td>
					<td>${this.escapeHtml(pkg.version)}</td>
					<td>
						<a href="#" class="action-link-danger" data-package="${this.escapeHtml(pkg.name)}">Remove</a>
					</td>
				</tr>
			`).join('');

			tbody.innerHTML = rows;

			document.querySelectorAll('#packages-table .action-link-danger').forEach(link => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const pkg = e.target.dataset.package;
					this.removePackage(pkg);
				});
			});
		} catch (err) {
			console.error('Failed to load packages:', err);
			const tbody = document.querySelector('#packages-table tbody');
			tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--steel-muted);">Failed to load packages</td></tr>';
		}
	}

	async removePackage(pkg) {
		if (!confirm(`Remove package ${pkg}? This may break dependencies.`)) return;

		try {
			this.showToast('Info', `Removing ${pkg}...`, 'info');

			await this.ubusCall('file', 'exec', {
				command: '/bin/opkg',
				params: ['remove', pkg]
			});

			this.showToast('Success', `Package ${pkg} removed`, 'success');
			setTimeout(() => this.loadPackages(), 2000);
		} catch (err) {
			console.error('Failed to remove package:', err);
			this.showToast('Error', 'Failed to remove package', 'error');
		}
	}

	async runPing() {
		const host = document.getElementById('ping-host').value.trim();
		if (!host) {
			this.showToast('Error', 'Please enter a hostname or IP address', 'error');
			return;
		}

		const output = document.getElementById('ping-output');
		output.innerHTML = '<div class="log-line"><span class="spinner"></span> Running ping...</div>';

		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/bin/ping',
				params: ['-c', '4', host]
			});

			if (result && result.stdout) {
				const lines = result.stdout.split('\n').filter(l => l.trim());
				output.innerHTML = lines.map(l => `<div class="log-line">${this.escapeHtml(l)}</div>`).join('');
			} else {
				output.innerHTML = '<div class="log-line error">Ping failed or permission denied</div>';
			}
		} catch (err) {
			output.innerHTML = '<div class="log-line error">Failed to execute ping</div>';
		}
	}

	async generateBackup() {
		try {
			this.showToast('Info', 'Generating backup...', 'info');

			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/sbin/sysupgrade',
				params: ['-b', '/tmp/backup.tar.gz']
			});

			const [readStatus, backupData] = await this.ubusCall('file', 'read', {
				path: '/tmp/backup.tar.gz',
				base64: true
			});

			if (backupData && backupData.data) {
				const blob = this.base64ToBlob(backupData.data, 'application/gzip');
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `openwrt-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
				a.click();
				URL.revokeObjectURL(url);

				this.showToast('Success', 'Backup downloaded', 'success');
			} else {
				this.showToast('Error', 'Failed to read backup file', 'error');
			}
		} catch (err) {
			console.error('Failed to generate backup:', err);
			this.showToast('Error', 'Failed to generate backup', 'error');
		}
	}

	base64ToBlob(base64, mimeType) {
		const byteCharacters = atob(base64);
		const byteArrays = [];

		for (let offset = 0; offset < byteCharacters.length; offset += 512) {
			const slice = byteCharacters.slice(offset, offset + 512);
			const byteNumbers = new Array(slice.length);
			for (let i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}
			const byteArray = new Uint8Array(byteNumbers);
			byteArrays.push(byteArray);
		}

		return new Blob(byteArrays, { type: mimeType });
	}

	async resetToDefaults() {
		if (!confirm('Reset all settings to factory defaults? This will ERASE ALL CONFIGURATION and reboot the router.')) return;
		if (!confirm('Are you ABSOLUTELY SURE? This cannot be undone!')) return;

		try {
			this.showToast('Warning', 'Resetting to factory defaults...', 'error');

			await this.ubusCall('file', 'exec', {
				command: '/sbin/firstboot',
				params: ['-y']
			});

			await this.ubusCall('system', 'reboot', {});

			this.showToast('Info', 'Router is resetting and rebooting...', 'info');
			setTimeout(() => this.logout(), 2000);
		} catch (err) {
			console.error('Failed to reset:', err);
			this.showToast('Error', 'Failed to reset to defaults', 'error');
		}
	}

	async changePassword() {
		const newPassword = document.getElementById('new-password').value;
		const confirmPassword = document.getElementById('confirm-password').value;

		if (!newPassword || !confirmPassword) {
			this.showToast('Error', 'Please enter both password fields', 'error');
			return;
		}

		if (newPassword !== confirmPassword) {
			this.showToast('Error', 'Passwords do not match', 'error');
			return;
		}

		if (newPassword.length < 6) {
			this.showToast('Error', 'Password must be at least 6 characters', 'error');
			return;
		}

		try {
			await this.ubusCall('file', 'exec', {
				command: '/bin/sh',
				params: ['-c', `echo -e "${newPassword}\\n${newPassword}" | passwd root`]
			});

			this.showToast('Success', 'Password changed successfully', 'success');
			document.getElementById('new-password').value = '';
			document.getElementById('confirm-password').value = '';
		} catch (err) {
			console.error('Failed to change password:', err);
			this.showToast('Error', 'Failed to change password', 'error');
		}
	}

	async saveGeneralSettings() {
		try {
			const hostname = document.getElementById('system-hostname').value;
			const timezone = document.getElementById('system-timezone').value;

			if (!hostname) {
				this.showToast('Error', 'Hostname is required', 'error');
				return;
			}

			await this.ubusCall('uci', 'set', {
				config: 'system',
				section: '@system[0]',
				values: {
					hostname: hostname,
					timezone: timezone || 'UTC'
				}
			});

			await this.ubusCall('uci', 'commit', {
				config: 'system'
			});

			await this.ubusCall('file', 'exec', {
				command: '/etc/init.d/system',
				params: ['reload']
			});

			this.showToast('Success', 'Settings saved successfully', 'success');
		} catch (err) {
			console.error('Failed to save settings:', err);
			this.showToast('Error', 'Failed to save settings', 'error');
		}
	}

	async runTraceroute() {
		const host = document.getElementById('traceroute-host').value.trim();
		if (!host) {
			this.showToast('Error', 'Please enter a hostname or IP address', 'error');
			return;
		}

		const output = document.getElementById('traceroute-output');
		output.innerHTML = '<div class="log-line"><span class="spinner"></span> Running traceroute...</div>';

		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/usr/bin/traceroute',
				params: ['-m', '15', host]
			});

			if (result && result.stdout) {
				const lines = result.stdout.split('\n').filter(l => l.trim());
				output.innerHTML = lines.map(l => `<div class="log-line">${this.escapeHtml(l)}</div>`).join('');
			} else {
				output.innerHTML = '<div class="log-line error">Traceroute failed or permission denied</div>';
			}
		} catch (err) {
			output.innerHTML = '<div class="log-line error">Failed to execute traceroute</div>';
		}
	}

	async sendWakeOnLan() {
		const mac = document.getElementById('wol-mac').value.trim();
		if (!mac) {
			this.showToast('Error', 'Please enter a MAC address', 'error');
			return;
		}

		const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
		if (!macRegex.test(mac)) {
			this.showToast('Error', 'Invalid MAC address format', 'error');
			return;
		}

		const output = document.getElementById('wol-output');
		output.innerHTML = '<div class="log-line"><span class="spinner"></span> Sending WOL packet...</div>';

		try {
			const [status, result] = await this.ubusCall('file', 'exec', {
				command: '/usr/bin/etherwake',
				params: [mac]
			}).catch(() => {
				return this.ubusCall('file', 'exec', {
					command: '/usr/bin/wol',
					params: [mac]
				});
			});

			output.innerHTML = '<div class="log-line" style="color: #00ff00;">WOL packet sent successfully to ' + this.escapeHtml(mac) + '</div>';
			this.showToast('Success', 'Wake-on-LAN packet sent', 'success');
		} catch (err) {
			output.innerHTML = '<div class="log-line error">Failed to send WOL packet. Make sure etherwake or wol package is installed.</div>';
			this.showToast('Error', 'Failed to send WOL packet', 'error');
		}
	}
}

new OpenWrtApp();
