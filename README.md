<div align="center">

# Based

**Modern OpenWrt Management Interface**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[Demo](https://hudsongraeme.github.io/based-owrt/) • [Install](#installation) • [Features](#features)

</div>

![Based OpenWrt Dashboard](https://github.com/user-attachments/assets/dc150d3c-75fc-480b-a0bd-10b67cdc6226)

---

## What is this?

A complete standalone web interface for OpenWrt routers. Not a LuCI theme—pure vanilla JavaScript SPA using OpenWrt's native ubus API.

```bash
scp -r custom/* root@192.168.1.1:/www/custom/
# Access at http://192.168.1.1/custom/
```

---

## Features

<table>
<tr>
<td width="50%">

### 📊 Dashboard
- Live system stats & graphs
- Network traffic monitoring
- System logs
- Active connections
- Quick actions

### 🌐 Network
- Interface configuration
- Wireless management (SSID, encryption)
- Firewall & port forwarding
- DHCP leases (active + static)
- Diagnostics (ping, traceroute, WOL)

</td>
<td width="50%">

### ⚙️ System
- Hostname & timezone
- Password management
- Backup & restore
- Package management
- Service control
- Init script management

### 🎨 Design
- Dark glassmorphic UI
- Responsive tables
- Real-time updates
- Toast notifications
- Smooth animations

</td>
</tr>
</table>

---

## Installation

### Option 1: Package (Recommended)

Download the ipk for your architecture from [Releases](https://github.com/HudsonGraeme/based-owrt/releases/latest):

```bash
wget https://github.com/HudsonGraeme/based-owrt/releases/latest/download/based-ui_VERSION_ARCH.ipk
opkg install based-ui_VERSION_ARCH.ipk
```

Available architectures: x86_64, ramips/mt7621, ath79, mediatek/filogic, bcm27xx, ipq40xx, mvebu, ipq806x

Replace `VERSION_ARCH` with your specific file from the releases page.

### Option 2: Manual Install

**Quick start:**

```bash
scp -r custom/* root@192.168.1.1:/www/custom/
scp rpcd-acl.json root@192.168.1.1:/usr/share/rpcd/acl.d/based-openwrt.json
ssh root@192.168.1.1 "/etc/init.d/rpcd restart"
```

**First time setup** (if you get 404):

```bash
ssh root@192.168.1.1
uci set uhttpd.main.home='/www'
uci commit uhttpd
/etc/init.d/uhttpd restart
```

**What the ACL grants:**
- WAN/LAN status display on dashboard
- Bandwidth monitoring
- Device count
- Package list viewing in Software tab

Access at `http://192.168.1.1/custom/` and login with your root credentials.

---

## Building from Source

To build the ipk package yourself:

```bash
# In OpenWrt buildroot
git clone https://github.com/HudsonGraeme/based-owrt.git package/based-ui
make package/based-ui/compile
```

The package will be in `bin/packages/*/base/based-ui_*.ipk`

---

## Security

Uses OpenWrt's native authentication system. Same security model as LuCI:

| Feature | Based | LuCI |
|---------|-------|------|
| Authentication | ubus sessions | ubus sessions |
| Authorization | rpcd ACLs | rpcd ACLs |

All operations validated server-side. No privilege escalation paths.

---

## Development

**Auto-deploy on save:**

```bash
# QEMU VM
pnpm dev

# Physical router
pnpm dev:physical 192.168.1.1
```

**Project structure:**

```
custom/
├── index.html    - Application shell
├── app.css       - Styling
└── js/
    ├── core.js   - Core functionality
    └── modules/  - Feature modules (dashboard, network, system, vpn, services)
```

**Adding features:**

```javascript
// All ubus calls use this pattern:
const [status, result] = await this.ubusCall('system', 'info', {});
```

---

## Browser Support

Chrome 90+ • Firefox 88+ • Safari 14+ • Any modern browser

---

## License

MIT

