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

	async fetchSystemInfo() {
		const [status, boardInfo] = await this.core.ubusCall('system', 'board', {});
		if (status !== 0) throw new Error('Failed to fetch system info');
		return boardInfo;
	}

	updateHostnameInput(hostname) {
		const hostnameInput = document.getElementById('system-hostname');
		if (hostnameInput) {
			hostnameInput.value = hostname || '';
		}
	}

	async loadSystemInfo() {
		if (!this.core.isFeatureEnabled('system')) return;

		try {
			const systemInfo = await this.fetchSystemInfo();
			this.updateHostnameInput(systemInfo.hostname);
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

	async fetchPackages() {
		const [status, result] = await this.core.ubusCall('file', 'read', {
			path: '/usr/lib/opkg/status'
		});

		if (status !== 0 || !result?.data) {
			throw new Error('Failed to fetch packages');
		}

		return result.data;
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

	renderPackageRow(pkg) {
		return `
			<tr>
				<td>${this.core.escapeHtml(pkg.name)}</td>
				<td>${this.core.escapeHtml(pkg.version)}</td>
				<td>${this.core.renderBadge('success', 'Installed')}</td>
			</tr>
		`;
	}

	renderPackagesTable(packages, limit = 100) {
		const displayedPackages = packages.slice(0, limit);
		const rows = displayedPackages.map(pkg => this.renderPackageRow(pkg)).join('');

		let html = rows;

		if (packages.length > limit) {
			html += `<tr><td colspan="3" style="text-align: center; color: var(--steel-muted);">Showing ${limit} of ${packages.length} packages</td></tr>`;
		}

		return html;
	}

	updatePackagesTable(packages) {
		const tbody = document.querySelector('#packages-table tbody');
		if (!tbody) return;

		if (packages.length === 0) {
			this.core.renderEmptyTable(tbody, 3, 'No packages found');
			return;
		}

		tbody.innerHTML = this.renderPackagesTable(packages);
	}

	async loadPackages() {
		if (!this.core.isFeatureEnabled('packages')) return;

		this.core.showSkeleton('packages-table');

		try {
			const data = await this.fetchPackages();
			const packages = this.parseOpkgStatus(data);
			this.updatePackagesTable(packages);
		} catch (err) {
			console.error('Failed to load packages:', err);
			const tbody = document.querySelector('#packages-table tbody');
			if (tbody) {
				this.core.renderEmptyTable(tbody, 3, 'Failed to load packages');
			}
		} finally {
			this.core.hideSkeleton('packages-table');
		}
	}
}
