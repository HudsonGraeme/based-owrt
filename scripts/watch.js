import chokidar from 'chokidar';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const target = args[0] || 'qemu';

let SSH;
let targetName;

if (target === 'qemu') {
	SSH = 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 root@localhost';
	targetName = 'QEMU VM (localhost:2222)';
} else {
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

watcher.on('all', (event, path) => {
	console.log(`[${event}] ${path}`);
	if (event === 'change' || event === 'add') {
		deploy();
	}
});

function deploy() {
	try {
		console.log(`Deploying to ${targetName}...`);

		execSync(`cat custom/index.html | ${SSH} "cat > /www/custom/index.html"`, { stdio: 'pipe' });
		execSync(`cat custom/app.js | ${SSH} "cat > /www/custom/app.js"`, { stdio: 'pipe' });
		execSync(`cat custom/app.css | ${SSH} "cat > /www/custom/app.css"`, { stdio: 'pipe' });

		console.log('Deployed successfully\n');
	} catch (err) {
		console.error('Deploy failed:', err.message);
	}
}

console.log('Ready. Save files in custom/ to trigger deploy.');
