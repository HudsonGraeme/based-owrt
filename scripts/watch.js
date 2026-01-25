import { execSync } from 'child_process';
import chokidar from 'chokidar';

const args = process.argv.slice(2);

let target = args[0] || 'qemu';

if (args[0] === '--ip' && args[1]) {
	target = args[1];
} else if (args[0] && args[0].startsWith('--')) {
	console.error('Error: Invalid argument. Usage:');
	console.error('  pnpm dev                          # Deploy to QEMU VM');
	console.error('  pnpm dev:physical 192.168.1.XXX    # Deploy to physical router');
	process.exit(1);
}

let SSH;
let targetName;

if (target === 'qemu') {
	SSH = 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 root@localhost';
	targetName = 'QEMU VM (localhost:2222)';
} else {
	const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
	if (!ipPattern.test(target)) {
		console.error(`Error: Invalid IP address: ${target}`);
		console.error('Usage: pnpm dev:physical 192.168.1.XXX');
		process.exit(1);
	}
	SSH = `ssh -i ~/.ssh/router root@${target}`;
	targetName = `Physical router (${target})`;
}

console.log(`Watching for changes in custom/...`);
console.log(`Target: ${targetName}\n`);

const watcher = chokidar.watch('custom', {
	persistent: true,
	ignoreInitial: true,
	awaitWriteFinish: {
		stabilityThreshold: 300,
		pollInterval: 100
	}
});

const aclWatcher = chokidar.watch('rpcd-acl.json', {
	persistent: true,
	ignoreInitial: true,
	awaitWriteFinish: {
		stabilityThreshold: 300,
		pollInterval: 100
	}
});

watcher.on('all', (event, path) => {
	console.log(`[${event}] ${path}`);
	if (event === 'change' || event === 'add') {
		deploy();
	}
});

aclWatcher.on('all', (event, path) => {
	console.log(`[${event}] ${path}`);
	if (event === 'change' || event === 'add') {
		deployACL();
	}
});

function deploy() {
	try {
		console.log(`Deploying to ${targetName}...`);

		execSync(`${SSH} "mkdir -p /www/custom/js/modules"`, { stdio: 'pipe' });

		execSync(`cat custom/index.html | ${SSH} "cat > /www/custom/index.html"`, { stdio: 'pipe' });
		execSync(`cat custom/app.css | ${SSH} "cat > /www/custom/app.css"`, { stdio: 'pipe' });

		execSync(`cat custom/js/core.js | ${SSH} "cat > /www/custom/js/core.js"`, { stdio: 'pipe' });
		execSync(`cat custom/js/modules/dashboard.js | ${SSH} "cat > /www/custom/js/modules/dashboard.js"`, {
			stdio: 'pipe'
		});
		execSync(`cat custom/js/modules/network.js | ${SSH} "cat > /www/custom/js/modules/network.js"`, {
			stdio: 'pipe'
		});
		execSync(`cat custom/js/modules/system.js | ${SSH} "cat > /www/custom/js/modules/system.js"`, {
			stdio: 'pipe'
		});
		execSync(`cat custom/js/modules/vpn.js | ${SSH} "cat > /www/custom/js/modules/vpn.js"`, { stdio: 'pipe' });
		execSync(`cat custom/js/modules/services.js | ${SSH} "cat > /www/custom/js/modules/services.js"`, {
			stdio: 'pipe'
		});

		console.log('Deployed successfully\n');
	} catch (err) {
		console.error('Deploy failed:', err.message);
	}
}

function deployACL() {
	try {
		console.log(`Deploying ACL to ${targetName}...`);

		execSync(`cat rpcd-acl.json | ${SSH} "cat > /usr/share/rpcd/acl.d/based-openwrt.json"`, { stdio: 'pipe' });
		execSync(`${SSH} "/etc/init.d/rpcd restart"`, { stdio: 'pipe' });

		console.log('ACL deployed and rpcd restarted\n');
	} catch (err) {
		console.error('ACL deploy failed:', err.message);
	}
}

console.log('Ready. Save files in custom/ or rpcd-acl.json to trigger deploy.');
