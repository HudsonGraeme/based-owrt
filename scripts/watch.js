import chokidar from 'chokidar';
import { execSync } from 'child_process';

const SSH = 'ssh -i ~/.ssh/router root@192.168.1.35';

console.log('Watching for changes in custom/...');

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
		console.log('Deploying to router...');

		execSync(`cat custom/index.html | ${SSH} "cat > /www/custom/index.html"`, { stdio: 'pipe' });
		execSync(`cat custom/app.js | ${SSH} "cat > /www/custom/app.js"`, { stdio: 'pipe' });
		execSync(`cat custom/app.css | ${SSH} "cat > /www/custom/app.css"`, { stdio: 'pipe' });

		console.log('Deployed successfully');
	} catch (err) {
		console.error('Deploy failed:', err.message);
	}
}

console.log('Ready. Save files in custom/ to trigger deploy.');
