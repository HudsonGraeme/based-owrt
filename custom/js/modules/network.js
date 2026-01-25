export default class NetworkModule {
	constructor(core) {
		this.core = core;

		this.core.registerRoute('/network', (path, subPaths) => {
			const pageElement = document.getElementById('network-page');
			if (pageElement) pageElement.classList.remove('hidden');

			const tab = subPaths[0] || 'interfaces';
			this.showSubTab(tab);
			this.attachSubTabListeners();
			this.attachActionListeners();
		});
	}

	attachSubTabListeners() {
		document.querySelectorAll('#network-page .tab-btn').forEach(btn => {
			if (btn.hasAttribute('data-network-listener')) return;
			btn.setAttribute('data-network-listener', 'true');
			btn.addEventListener('click', (e) => {
				const tab = e.target.getAttribute('data-tab');
				this.core.navigate(`/network/${tab}`);
			});
		});
	}

	attachActionListeners() {
		const interfacesTable = document.getElementById('interfaces-table');
		if (!interfacesTable || interfacesTable.hasAttribute('data-actions-listener')) return;

		interfacesTable.setAttribute('data-actions-listener', 'true');
		interfacesTable.addEventListener('click', (e) => {
			const button = e.target.closest('[data-action]');
			if (!button) return;

			const action = button.getAttribute('data-action');
			const id = button.getAttribute('data-id');

			if (action === 'edit') {
				this.editInterface(id);
			} else if (action === 'delete') {
				this.deleteInterface(id);
			}
		});
	}

	editInterface(id) {
		console.log('Edit interface:', id);
	}

	deleteInterface(id) {
		console.log('Delete interface:', id);
	}

	showSubTab(tab) {
		document.querySelectorAll('#network-page .tab-content').forEach(content => {
			content.classList.add('hidden');
		});
		document.querySelectorAll('#network-page .tab-btn').forEach(btn => {
			btn.classList.remove('active');
		});

		const tabContent = document.getElementById(`tab-${tab}`);
		if (tabContent) tabContent.classList.remove('hidden');

		const tabBtn = document.querySelector(`#network-page .tab-btn[data-tab="${tab}"]`);
		if (tabBtn) tabBtn.classList.add('active');

		switch(tab) {
			case 'interfaces':
				this.loadInterfaces();
				break;
		}
	}

	async loadInterfaces() {
		if (!this.core.isFeatureEnabled('network')) return;

		try {
			const [status, result] = await this.core.ubusCall('network.interface', 'dump', {});
			const tbody = document.querySelector('#interfaces-table tbody');

			if (status !== 0 || !result || !result.interface) {
				this.core.renderEmptyTable(tbody, 6, 'No interfaces found');
				return;
			}

			const rows = result.interface.map(iface => {
				const proto = iface.proto || 'none';
				const ipv4 = iface['ipv4-address']?.[0]?.address || '---.---.---.---';
				const status = iface.up ? 'UP' : 'DOWN';
				const statusBadge = iface.up ?
					this.core.renderBadge('success', status) :
					this.core.renderBadge('error', status);

				return `
					<tr>
						<td>${this.core.escapeHtml(iface.interface || 'Unknown')}</td>
						<td>${this.core.escapeHtml(proto).toUpperCase()}</td>
						<td>${ipv4}</td>
						<td>${iface.device || 'N/A'}</td>
						<td>${statusBadge}</td>
						<td>${this.core.renderActionButtons(iface.interface)}</td>
					</tr>
				`;
			}).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load interfaces:', err);
			this.core.showToast('Failed to load network interfaces', 'error');
		}
	}
}
