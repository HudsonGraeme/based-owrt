# Based - Modern OpenWrt Theme

Finally, a modern management interface for OpenWrt routers.

**Not a LuCI theme** - this is a complete standalone web UI that uses OpenWrt's native ubus RPC API. Total bundle size: ~44KB uncompressed, ~10KB gzipped.

## Quick Start

```bash
# Deploy to your router (replace with your router's IP)
scp -r custom/* root@192.168.1.1:/www/custom/

# Access at http://192.168.1.1/custom/
# Login with your root credentials
```

## Why This Exists

LuCI hasn't changed much in years. Based provides:
- Modern, clean interface built with vanilla JavaScript
- Single-page application architecture
- Minimal footprint optimized for router hardware (10KB gzipped)
- No external dependencies or CDN requests
- Full UI customization without template constraints

## Features

### Dashboard
- Live system monitoring (CPU, memory, load, network traffic)
- Real-time graphs with SVG rendering
- System log viewer
- Active DHCP connections
- Quick actions (reboot, restart services)
- Auto-refresh with intelligent polling

### Network Management
- **Interfaces**: View/configure network interfaces, status monitoring, traffic stats
- **Wireless**: Radio configuration, SSID management, client monitoring
- **Firewall**: Port forwarding rules, traffic rules
- **DHCP**: Active and static lease management
- **Diagnostics**: Live ping and traceroute tools

### System Management
- **General**: Hostname, timezone configuration
- **Administration**: Password management, SSH settings
- **Backup/Restore**: Configuration backup, factory reset
- **Software**: Package management
- **Startup**: Service management and init scripts

## Design

Pure monochrome aesthetic with modern UI patterns:
- Glassmorphic cards with backdrop blur
- System font stack (no web fonts)
- Dark gradient backgrounds
- Responsive data tables
- Status badges and progress bars
- Toast notifications
- Smooth transitions

## Architecture

```
Browser (Vanilla JS SPA)
    ↓
Static Files (/www/custom/)
    ↓
uhttpd Web Server
    ↓
/ubus JSON-RPC Endpoint
    ↓
rpcd (ubus RPC daemon)
    ↓
OpenWrt System (UCI, services, network)
```

**Security Model:**
- Uses OpenWrt's native session-based authentication
- All operations enforced by rpcd ACL policies
- Same security guarantees as LuCI
- No privilege escalation paths
- XSS protection via input sanitization

## Installation

### Deploy to Your Router

**Quick Deploy (3 files, no dependencies):**

```bash
# Replace 192.168.1.1 with your router's IP
scp -r custom/* root@192.168.1.1:/www/custom/
```

**Or manually:**

```bash
# 1. SSH into your router
ssh root@192.168.1.1

# 2. Create directory
mkdir -p /www/custom

# 3. Exit SSH and copy files
scp custom/index.html root@192.168.1.1:/www/custom/
scp custom/app.js root@192.168.1.1:/www/custom/
scp custom/app.css root@192.168.1.1:/www/custom/
```

**Access the interface:**
- Open http://192.168.1.1/custom/ (replace with your router's IP)
- Login with your OpenWrt root credentials

That's it. Three files, no dependencies, no configuration needed.

### First Time Setup

If you get "404 Not Found", enable uhttpd access to /www:

```bash
ssh root@192.168.1.1
uci set uhttpd.main.home='/www'
uci commit uhttpd
/etc/init.d/uhttpd restart
```

### Development Setup (macOS with QEMU)

Test locally using QEMU without Docker:

```bash
# 1. Install QEMU and download OpenWrt image
./scripts/setup-qemu.sh

# 2. Start the VM (in a new terminal)
./scripts/start-vm.sh

# 3. Wait 60 seconds for boot, then deploy
cat custom/index.html | ssh -p 2222 root@127.0.0.1 "cat > /www/custom/index.html"
cat custom/app.js | ssh -p 2222 root@127.0.0.1 "cat > /www/custom/app.js"
cat custom/app.css | ssh -p 2222 root@127.0.0.1 "cat > /www/custom/app.css"

# 4. Access at http://localhost:8080/custom/
# Login: root / admin
```

### Development Workflow

After making changes:

```bash
# Option 1: Auto-deploy on file save (recommended)
pnpm dev

# Option 2: Manual deploy
pnpm deploy
```

The `dev` script watches `custom/` for changes and automatically deploys to the QEMU VM.

### Deploying to Real Router During Development

To deploy to your actual router instead of QEMU:

```bash
# One-time deploy
scp custom/app.js root@192.168.1.1:/www/custom/

# Or create a custom watch script for your router
# Edit scripts/watch.js and change SSH target from:
# -p 2222 root@127.0.0.1
# to:
# root@192.168.1.1
```

## File Structure

```
custom/
├── index.html    (12.6KB / 2.5KB gzipped) - Application shell
├── app.js        (20.2KB / 4.7KB gzipped) - All logic & features
└── app.css       (11.5KB / 2.5KB gzipped) - Complete styling

Total: 44KB uncompressed, 10KB gzipped
```

## Security

### What's Secure

✅ **Native Authentication**: Uses OpenWrt's session system (same as LuCI)
✅ **ACL-Protected**: All ubus calls validated by rpcd policies
✅ **No Privilege Escalation**: Can't bypass permission system
✅ **XSS Protection**: Input sanitization via `escapeHtml()`
✅ **CSRF Protection**: Same-origin policy + origin-bound sessions
✅ **Minimal Attack Surface**: 3 static files vs LuCI's 200+ files

### Considerations

⚠️ Session tokens in localStorage (same XSS risk as LuCI)
⚠️ Inherits HTTP/HTTPS config from OpenWrt (enable HTTPS on your router)
⚠️ Rate limiting handled server-side by rpcd

### Why It's Safe

This is not a security bypass or exploit - it's a **sanctioned API client**:

- OpenWrt exposes `/ubus` intentionally for management interfaces
- LuCI uses the same ubus calls under the hood
- We inherit OpenWrt's entire security model (rpcd + ACLs)
- Can't do anything the user's ACL doesn't permit
- Deleting `/www/custom/` doesn't affect OpenWrt functionality

Think of it like writing a REST API client for an existing authenticated API.

## Upgrades

### OpenWrt System Upgrades

```bash
# The UI survives OpenWrt upgrades if you don't use -n flag
sysupgrade image.bin

# If you do wipe (/www/ gets cleared):
sysupgrade -n image.bin
# Just re-copy the 3 files after upgrade
```

### LuCI Compatibility

This UI runs alongside LuCI - they don't conflict:
- LuCI remains available at http://router/
- This UI available at http://router/custom/
- Both use the same ubus backend
- Can have both installed simultaneously

## Comparison to LuCI

| Feature | OpenWrt Control Panel | LuCI |
|---------|----------------------|------|
| **Size** | 44KB (10KB gzipped) | 500KB+ |
| **Files** | 3 static files | 200+ Lua files |
| **Dependencies** | None | lua, luci-base, rpcd-mod-rrdns, etc. |
| **Architecture** | Vanilla JS SPA | Lua server-side templates |
| **Auth** | ubus sessions | ubus sessions (same) |
| **Security** | rpcd ACLs | rpcd ACLs (same) |
| **Upgrade Impact** | Copy 3 files | Package management |
| **Customization** | Full UI control | Template constraints |
| **Rendering** | Client-side | Server-side |

Both are equally secure - they use identical authentication and permission systems.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any modern browser with ES6+ support

## Performance

Optimizations for router hardware:
- All resources embedded (no external requests)
- Polling pauses when tab hidden
- Only dashboard auto-refreshes
- Uses ubus `file.read` for proc filesystem
- Efficient DOM updates
- Hardware-accelerated CSS animations
- No framework overhead

## Development

### Adding New Features

1. Add HTML structure to `index.html`
2. Add styling to `app.css`
3. Add logic to `app.js` (use `this.ubusCall()` for backend)
4. Deploy to test VM
5. Verify with browser DevTools

### ubus API Examples

```javascript
// Get system info
const [status, info] = await this.ubusCall('system', 'info', {});

// Read file
const [status, result] = await this.ubusCall('file', 'read', {
  path: '/proc/stat'
});

// Execute command (if ACL permits)
const [status, result] = await this.ubusCall('file', 'exec', {
  command: '/bin/ping',
  params: ['-c', '4', '8.8.8.8']
});
```

### Debugging

```bash
# Watch network requests in browser DevTools
# All ubus calls visible in Network tab

# SSH into router to check logs
ssh root@192.168.1.1
logread | grep rpcd

# Test ubus calls directly
ubus -S <session_token> call system info
```

## Troubleshooting

### 404 Not Found

If you get a 404 error when accessing the interface:

```bash
# Ensure uhttpd is serving /www
ssh root@192.168.1.1
uci set uhttpd.main.home='/www'
uci commit uhttpd
/etc/init.d/uhttpd restart
```

### Connection Refused / Cannot Connect

- Verify your router's IP address: `ip route | grep default`
- Check if SSH is enabled: System → Administration → SSH Access
- Try accessing standard LuCI first: http://192.168.1.1/

### Files Not Updating

After copying files, hard refresh your browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

### Permission Denied (SSH)

```bash
# Ensure SSH access is enabled on your router
ssh root@192.168.1.1
# If prompted, set a root password first through LuCI
```

## License

Apache 2.0
