export default class SystemModule {
	constructor(core) {
		this.core = core;
		this.subTabs = null;

		this.core.registerRoute('/system', (path, subPaths) => {
			const pageElement = document.getElementById('system-page');
			if (pageElement) pageElement.classList.remove('hidden');

			if (!this.subTabs) {
				this.subTabs = this.core.setupSubTabs('system-page', {
					general: () => this.loadSystemInfo(),
					software: () => this.loadPackages()
				});
				this.subTabs.attachListeners();
			}

			const tab = subPaths[0] || 'general';
			this.subTabs.showSubTab(tab);
		});
	}

	cleanup() {
		if (this.subTabs) {
			this.subTabs.cleanup();
			this.subTabs = null;
		}
	}

	async loadSystemInfo() {
		if (!this.core.isFeatureEnabled('system')) return;

		try {
			const [status, boardInfo] = await this.core.ubusCall('system', 'board', {});

			if (status === 0 && boardInfo) {
				const hostnameInput = document.getElementById('system-hostname');
				if (hostnameInput) {
					hostnameInput.value = boardInfo.hostname || '';
				}
			}
		} catch (err) {
			console.error('Failed to load system info:', err);
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

		const tbody = document.querySelector('#packages-table tbody');

		this.core.showSkeleton('packages-table');

		try {
			const [status, result] = await this.core.ubusCall('file', 'read', {
				path: '/usr/lib/opkg/status'
			});

			if (status !== 0 || !result?.data) {
				this.core.renderEmptyTable(tbody, 3, 'No packages found');
				return;
			}

			const packages = this.parseOpkgStatus(result.data);
			const totalPackages = packages.length;
			const rows = packages.slice(0, 100).map(pkg => `
				<tr>
					<td>${this.core.escapeHtml(pkg.name)}</td>
					<td>${this.core.escapeHtml(pkg.version)}</td>
					<td>${this.core.renderBadge('success', 'Installed')}</td>
				</tr>
			`).join('');

			tbody.innerHTML = rows;

			if (totalPackages > 100) {
				const messageRow = `<tr><td colspan="3" style="text-align: center; color: var(--steel-muted);">Showing 100 of ${totalPackages} packages</td></tr>`;
				tbody.insertAdjacentHTML('beforeend', messageRow);
			}
		} catch (err) {
			console.error('Failed to load packages:', err);
		} finally {
			this.core.hideSkeleton('packages-table');
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
