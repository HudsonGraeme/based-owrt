export default class ServicesModule {
	constructor(core) {
		this.core = core;
	}

	handleTabChange(tab) {
		switch(tab) {
			case 'qos':
				this.loadQoS();
				break;
			case 'ddns':
				this.loadDDNS();
				break;
		}
	}

	async loadQoS() {
		if (!this.core.isFeatureEnabled('qos')) return;

		try {
			const [status, result] = await this.core.uciGet('qos');
			const tbody = document.querySelector('#qos-table tbody');

			if (status !== 0 || !result?.values) {
				this.core.renderEmptyTable(tbody, 5, 'QoS not configured');
				return;
			}

			const qosRules = Object.entries(result.values)
				.filter(([key, val]) => val['.type'] === 'classify')
				.map(([key, val]) => ({
					name: key,
					...val
				}));

			if (qosRules.length === 0) {
				this.core.renderEmptyTable(tbody, 5, 'No QoS rules configured');
				return;
			}

			const rows = qosRules.map(rule => {
				const enabled = rule.enabled !== '0';
				const statusBadge = enabled ?
					this.core.renderBadge('success', 'ACTIVE') :
					this.core.renderBadge('error', 'INACTIVE');

				return `
					<tr>
						<td>${this.core.escapeHtml(rule.name)}</td>
						<td>${this.core.escapeHtml(rule.target || 'Default')}</td>
						<td>${this.core.escapeHtml(rule.proto || 'all')}</td>
						<td>${this.core.escapeHtml(rule.srchost || 'any')}</td>
						<td>${statusBadge}</td>
					</tr>
				`;
			}).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load QoS:', err);
		}
	}

	async loadDDNS() {
		if (!this.core.isFeatureEnabled('ddns')) return;

		try {
			const [status, result] = await this.core.uciGet('ddns');
			const tbody = document.querySelector('#ddns-table tbody');

			if (status !== 0 || !result?.values) {
				this.core.renderEmptyTable(tbody, 4, 'DDNS not configured');
				return;
			}

			const services = Object.entries(result.values)
				.filter(([key, val]) => val['.type'] === 'service')
				.map(([key, val]) => ({
					name: key,
					...val
				}));

			if (services.length === 0) {
				this.core.renderEmptyTable(tbody, 4, 'No DDNS services configured');
				return;
			}

			const rows = services.map(service => {
				const enabled = service.enabled === '1';
				const statusBadge = enabled ?
					this.core.renderBadge('success', 'ENABLED') :
					this.core.renderBadge('error', 'DISABLED');

				return `
					<tr>
						<td>${this.core.escapeHtml(service.name)}</td>
						<td>${this.core.escapeHtml(service.service_name || 'Custom')}</td>
						<td>${this.core.escapeHtml(service.domain || 'N/A')}</td>
						<td>${statusBadge}</td>
					</tr>
				`;
			}).join('');

			tbody.innerHTML = rows;
		} catch (err) {
			console.error('Failed to load DDNS:', err);
		}
	}
}
