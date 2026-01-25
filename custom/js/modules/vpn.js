export default class VPNModule {
	constructor(core) {
		this.core = core;
	}

	async loadWireGuard() {
		if (!this.core.isFeatureEnabled('wireguard')) return;

		try {
			const [status, result] = await this.core.uciGet('network');
			const tbody = document.querySelector('#wireguard-table tbody');

			if (status !== 0 || !result?.values) {
				this.core.renderEmptyTable(tbody, 4, 'No WireGuard interfaces configured');
				return;
			}

			const wgInterfaces = Object.entries(result.values)
				.filter(([key, val]) => val.proto === 'wireguard')
				.map(([key, val]) => ({
					name: key,
					...val
				}));

			if (wgInterfaces.length === 0) {
				this.core.renderEmptyTable(tbody, 4, 'No WireGuard interfaces configured');
				return;
			}

			const rows = wgInterfaces.map(iface => {
				const enabled = iface.disabled !== '1';
				const statusBadge = enabled ?
					this.core.renderBadge('success', 'ENABLED') :
					this.core.renderBadge('error', 'DISABLED');

				return `
					<tr>
						<td>${this.core.escapeHtml(iface.name)}</td>
						<td>${this.core.escapeHtml(iface.private_key?.substring(0, 20) || 'N/A')}...</td>
						<td>${this.core.escapeHtml(iface.listen_port || 'N/A')}</td>
						<td>${statusBadge}</td>
					</tr>
				`;
			}).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load WireGuard config:', err);
			this.core.showToast('Failed to load WireGuard configuration', 'error');
		}
	}
}
