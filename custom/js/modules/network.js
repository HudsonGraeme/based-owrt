export default class NetworkModule {
	constructor(core) {
		this.core = core;
	}

	handleTabChange(tab) {
		switch(tab) {
			case 'network':
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
						<td>${this.core.renderActionButtons('editInterface', 'deleteInterface', iface.interface)}</td>
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
