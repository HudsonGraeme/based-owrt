export default class NetworkModule {
	constructor(core) {
		this.core = core;
		this.subTabs = null;
		this.actionListener = null;

		this.core.registerRoute('/network', (path, subPaths) => {
			const pageElement = document.getElementById('network-page');
			if (pageElement) pageElement.classList.remove('hidden');

			if (!this.subTabs) {
				this.subTabs = this.core.setupSubTabs('network-page', {
					interfaces: () => this.loadInterfaces()
				});
				this.subTabs.attachListeners();
			}

			this.attachActionListeners();

			const tab = subPaths[0] || 'interfaces';
			this.subTabs.showSubTab(tab);
		});
	}

	attachActionListeners() {
		const interfacesTable = document.getElementById('interfaces-table');
		if (!interfacesTable || this.actionListener) return;

		this.actionListener = (e) => {
			const button = e.target.closest('[data-action]');
			if (!button) return;

			const action = button.getAttribute('data-action');
			const id = button.getAttribute('data-id');

			if (action === 'edit') {
				this.editInterface(id);
			} else if (action === 'delete') {
				this.deleteInterface(id);
			}
		};

		interfacesTable.addEventListener('click', this.actionListener);
	}

	editInterface(id) {
		console.log('Edit interface:', id);
	}

	deleteInterface(id) {
		console.log('Delete interface:', id);
	}

	cleanup() {
		if (this.subTabs) {
			this.subTabs.cleanup();
			this.subTabs = null;
		}

		if (this.actionListener) {
			const interfacesTable = document.getElementById('interfaces-table');
			if (interfacesTable) {
				interfacesTable.removeEventListener('click', this.actionListener);
			}
			this.actionListener = null;
		}
	}

	async loadInterfaces() {
		if (!this.core.isFeatureEnabled('network')) return;

		const tbody = document.querySelector('#interfaces-table tbody');

		this.core.showSkeleton('interfaces-table');

		try {
			const [status, result] = await this.core.ubusCall('network.interface', 'dump', {});

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
		} finally {
			this.core.hideSkeleton('interfaces-table');
		}
	}
}
