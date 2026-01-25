# Contributing to Based

Development guide for the Based OpenWrt management interface.

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Auto-deploy to QEMU VM (localhost:2222)
pnpm dev

# Auto-deploy to physical router
pnpm dev:physical 192.168.1.35

# Edit files in custom/ - changes auto-deploy to target
```

---

## Architecture

### Stack
- **Frontend**: Vanilla JavaScript SPA (no frameworks)
- **Backend**: OpenWrt ubus RPC API (JSON-RPC 2.0)
- **Auth**: Session-based via ubus `session.login`
- **State**: localStorage for session tokens

### File Structure

```
custom/
├── index.html - UI structure + modals
├── app.js     - App logic + API calls
└── app.css    - Dark glassmorphic theme

scripts/
├── watch.js           - Auto-deploy on file changes
├── setup-qemu.sh      - Download OpenWrt image
├── start-vm.sh        - Start QEMU VM
└── quick-start.sh     - Automated setup
```

### Key Patterns

**All ubus calls follow this pattern:**

```javascript
async ubusCall(object, method, params) {
  const response = await fetch('/ubus', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'call',
      params: [
        this.sessionId,
        object,
        method,
        params
      ]
    })
  });
  const data = await response.json();
  return [data.result[0], data.result[1]];
}

// Usage
const [status, result] = await this.ubusCall('system', 'info', {});
```

**UCI configuration pattern:**

```javascript
// Get config
await this.ubusCall('uci', 'get', {
  config: 'network',
  section: 'lan'
});

// Set value
await this.ubusCall('uci', 'set', {
  config: 'network',
  section: 'lan',
  values: { ipaddr: '192.168.1.1' }
});

// Commit changes
await this.ubusCall('uci', 'commit', { config: 'network' });

// Restart service
await this.ubusCall('file', 'exec', {
  command: '/etc/init.d/network',
  params: ['restart']
});
```

---

## Development Environments

### Option 1: Physical Router (Recommended)

Fastest iteration with real hardware.

**Setup:**

```bash
# Generate SSH key (first time only)
ssh-keygen -t ed25519 -f ~/.ssh/router

# Copy key to router
ssh-copy-id -i ~/.ssh/router root@192.168.1.1

# Deploy initial files
scp -r custom/* root@192.168.1.1:/www/custom/

# Start auto-deploy to your router IP
pnpm dev:physical 192.168.1.35
```

**How auto-deploy works:**
- Watches `custom/` directory for changes
- On save, pipes files via SSH to `/www/custom/`
- Refresh browser to see changes (no router restart needed)

### Option 2: QEMU VM

Full OpenWrt x86_64 VM for isolated testing.

**Setup:**

```bash
# Download and configure OpenWrt image
./scripts/setup-qemu.sh

# Start VM (in separate terminal)
./scripts/start-vm.sh

# Start auto-deploy (in another terminal)
pnpm dev
```

**QEMU Configuration:**
- Machine: q35 (modern PC)
- RAM: 512MB
- CPU: 2 cores
- Network: user-mode networking (NAT)
- Port forwards:
  - `8080` → `80` (HTTP)
  - `2222` → `22` (SSH)
  - `4443` → `443` (HTTPS)

**Access:**
- Web UI: `http://localhost:8080/custom/`
- SSH: `ssh -p 2222 root@localhost`
- Default credentials: `root` / (no password)

**VM Management:**

```bash
# Interactive mode (see console output)
./scripts/start-vm.sh

# Exit QEMU console
Ctrl+A then X

# Background mode
./scripts/quick-start.sh

# Stop VM
ps aux | grep qemu
kill <PID>
```

**First-time VM network setup:**

```bash
# SSH into VM
ssh -p 2222 root@localhost

# Configure for QEMU user networking
uci set network.lan.proto='dhcp'
uci delete network.lan.ipaddr
uci delete network.lan.netmask
uci commit network
/etc/init.d/network restart

# Restart services
/etc/init.d/uhttpd restart
/etc/init.d/dropbear restart
```

**Automated setup:**

```bash
# Runs setup automatically using pexpect
./scripts/auto-setup-vm.py
```

### Option 3: Remote Router

Deploy to router without auto-watch.

```bash
# Single deploy
pnpm run deploy

# Or manual SCP
scp -r custom/* root@<router-ip>:/www/custom/
```

---

## Adding Features

### 1. Add UI Section

Edit `custom/index.html`:

```html
<!-- Add tab button -->
<nav>
  <a href="#" onclick="app.showSection('my-feature')">MY FEATURE</a>
</nav>

<!-- Add section content -->
<section id="my-feature-section" class="content-section hidden">
  <h2>MY FEATURE</h2>
  <!-- Your UI here -->
</section>
```

### 2. Add Logic

Edit `custom/app.js`:

```javascript
async loadMyFeature() {
  const [status, result] = await this.ubusCall('system', 'info', {});

  if (status !== 0) {
    this.showToast('Error', 'Failed to load data', 'error');
    return;
  }

  // Render data
  document.getElementById('my-data').innerHTML = result.hostname;
}

showSection(section) {
  // Add case for your section
  if (section === 'my-feature') {
    this.loadMyFeature();
  }
}
```

### 3. Add Styling

Edit `custom/app.css`:

```css
#my-feature-section {
  /* Your styles using existing design tokens */
}
```

---

## Testing

### Browser Testing

- Chrome 90+ (primary)
- Firefox 88+
- Safari 14+

### Manual Test Checklist

```
[ ] Login/logout flows
[ ] All navigation tabs load
[ ] Real-time stats update
[ ] Forms submit successfully
[ ] UCI changes persist
[ ] Error handling displays correctly
[ ] Mobile responsive layout
[ ] Dark theme consistency
```

### Debugging

**Browser DevTools:**
```javascript
// Check session
localStorage.getItem('sessionId')

// Test ubus call
fetch('/ubus', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'call',
    params: [sessionId, 'system', 'info', {}]
  })
}).then(r => r.json()).then(console.log)
```

**Router Logs:**
```bash
ssh root@192.168.1.1
logread -f  # Follow system log
```

---

## Performance

### Bundle Size

```bash
# Check uncompressed sizes
wc -c custom/*

# Simulate gzip
gzip -c custom/index.html | wc -c
gzip -c custom/app.js | wc -c
gzip -c custom/app.css | wc -c
```

### Router Impact

- CPU: Negligible (client-side rendering)
- RAM: ~1MB (serving static files)
- Storage: 80KB

---

## OpenWrt ubus API Reference

Common objects and methods:

```javascript
// System info
['system', 'info', {}]
['system', 'board', {}]

// Network interfaces
['network.interface', 'dump', {}]
['network.device', 'status', { name: 'br-lan' }]

// Wireless
['network.wireless', 'status', {}]

// UCI configuration
['uci', 'get', { config: 'network', section: 'lan' }]
['uci', 'set', { config: 'network', section: 'lan', values: {...} }]
['uci', 'commit', { config: 'network' }]

// File operations
['file', 'read', { path: '/etc/config/network' }]
['file', 'write', { path: '/tmp/test', data: 'content', base64: true }]
['file', 'exec', { command: '/sbin/reboot', params: [] }]

// DHCP leases
['luci-rpc', 'getDHCPLeases', {}]
```

Full API: `http://192.168.1.1/ubus` (requires authentication)

---

## Troubleshooting

### "Session ID invalid"
```bash
# Clear localStorage
localStorage.clear()
# Login again
```

### "Connection refused" (QEMU)
```bash
# VM might be slow to boot
sleep 60
curl http://localhost:8080
```

### "Permission denied" (ubus)
```bash
# Check rpcd ACLs
cat /usr/share/rpcd/acl.d/*
```

### Deploy fails
```bash
# Check SSH key
ssh -i ~/.ssh/router root@192.168.1.1 "echo test"

# Check watch.js SSH path
cat scripts/watch.js
```

---

## Code Style

- No semicolons
- Tabs for indentation
- Single quotes
- Async/await over promises
- No external dependencies
- Keep functions under 50 lines
- Comment complex ubus interactions

---

## Release Process

1. Test on physical hardware
2. Check bundle size (`gzip -c custom/* | wc -c`)
3. Update version in `package.json`
4. Create git tag: `git tag v1.x.x`
5. Push: `git push origin main --tags`

---

## Security

### What to Avoid

- ❌ Never commit router credentials
- ❌ Never bypass ubus authentication
- ❌ Never eval() user input
- ❌ Never expose session tokens in URLs
- ❌ Never disable HTTPS in production

### Best Practices

- ✅ Use ubus session system
- ✅ Validate all inputs client + server
- ✅ Clear sessions on logout
- ✅ Use UCI for all config changes
- ✅ Follow OpenWrt ACL patterns

---

## Resources

- [OpenWrt Documentation](https://openwrt.org/docs)
- [ubus API Guide](https://openwrt.org/docs/techref/ubus)
- [UCI Configuration](https://openwrt.org/docs/guide-user/base-system/uci)
- [rpcd Documentation](https://openwrt.org/docs/techref/rpcd)
