export default class SystemModule {
	constructor(core) {
		this.core = core;
	}

	handleTabChange(tab) {
		switch(tab) {
			case 'system':
				this.loadSystemInfo();
				break;
		}
	}

	async loadSystemInfo() {
		if (!this.core.isFeatureEnabled('system')) return;

		try {
			const [status, boardInfo] = await this.core.ubusCall('system', 'board', {});

			if (status === 0 && boardInfo) {
				document.getElementById('system-hostname').value = boardInfo.hostname || '';
				document.getElementById('system-model').textContent = boardInfo.model || 'Unknown';
				document.getElementById('system-release').textContent = boardInfo.release?.description || 'Unknown';
			}
		} catch (err) {
			console.error('Failed to load system info:', err);
			this.core.showToast('Failed to load system information', 'error');
		}
	}

	async rebootSystem() {
		if (!confirm('Are you sure you want to reboot the system?')) return;

		try {
			await this.core.ubusCall('system', 'reboot', {});
			this.core.showToast('System is rebooting...', 'success');
			setTimeout(() => this.core.logout(), 2000);
		} catch (err) {
			this.core.showToast('Failed to reboot system', 'error');
		}
	}

	async loadPackages() {
		if (!this.core.isFeatureEnabled('packages')) return;

		try {
			const [status, result] = await this.core.ubusCall('file', 'read', {
				path: '/usr/lib/opkg/status'
			});

			const tbody = document.querySelector('#packages-table tbody');

			if (status !== 0 || !result?.data) {
				this.core.renderEmptyTable(tbody, 3, 'No packages found');
				return;
			}

			const packages = this.parseOpkgStatus(result.data);
			const rows = packages.slice(0, 100).map(pkg => `
				<tr>
					<td>${this.core.escapeHtml(pkg.name)}</td>
					<td>${this.core.escapeHtml(pkg.version)}</td>
					<td>${this.core.renderBadge('success', 'Installed')}</td>
				</tr>
			`).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load packages:', err);
		}
	}

	parseOpkgStatus(data) {
		const packages = [];
		const blocks = data.split('\n\n');

		for (const block of blocks) {
			const lines = block.split('\n');
			let pkg = {};

			for (const line of lines) {
				if (line.startsWith('Package: ')) {
					pkg.name = line.substring(9);
				} else if (line.startsWith('Version: ')) {
					pkg.version = line.substring(9);
				}
			}

			if (pkg.name) packages.push(pkg);
		}

		return packages;
	}
}
