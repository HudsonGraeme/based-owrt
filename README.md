<div align="center">

# Based

**Modern OpenWrt Management Interface**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Size](https://img.shields.io/badge/size-10KB%20gzipped-green)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

[Demo](https://hudsongraeme.github.io/based-owrt/) • [Install](#installation) • [Features](#features)

</div>

![Based OpenWrt Dashboard](https://github.com/user-attachments/assets/dc150d3c-75fc-480b-a0bd-10b67cdc6226)

---

## What is this?

A complete standalone web interface for OpenWrt routers. Not a LuCI theme—pure vanilla JavaScript SPA using OpenWrt's native ubus API.

**10KB gzipped. Zero dependencies. Three files.**

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

**Quick start:**

```bash
scp -r custom/* root@192.168.1.1:/www/custom/
```

**First time setup** (if you get 404):

```bash
ssh root@192.168.1.1
uci set uhttpd.main.home='/www'
uci commit uhttpd
/etc/init.d/uhttpd restart
```

**Configure permissions** (required for full dashboard functionality):

```bash
scp rpcd-acl.json root@192.168.1.1:/usr/share/rpcd/acl.d/based-openwrt.json
ssh root@192.168.1.1 "/etc/init.d/rpcd restart"
```

This grants read-only permissions for:
- WAN/LAN status display on dashboard
- Package list viewing in Software tab

Access at `http://192.168.1.1/custom/` and login with your root credentials.

---

## Security

Uses OpenWrt's native authentication system. Same security model as LuCI:

| Feature | Based | LuCI |
|---------|-------|------|
| Authentication | ubus sessions | ubus sessions |
| Authorization | rpcd ACLs | rpcd ACLs |
| Execution | Client-side only | Server-side Lua |

All operations validated server-side. No privilege escalation paths.

---

## Development

**Auto-deploy on save:**

```bash
# QEMU VM
pnpm dev

# Physical router
pnpm dev:physical 192.168.1.35
```

**Project structure:**

```
custom/
├── index.html    (14KB) - Application shell
├── app.js        (53KB) - Features & logic
└── app.css       (13KB) - Styling

Total: 80KB → 10KB gzipped
```

**Adding features:**

```javascript
// All ubus calls use this pattern:
const [status, result] = await this.ubusCall('system', 'info', {});
```

---

## Comparison

| | Based | LuCI |
|---|---|---|
| **Bundle** | 10KB gzipped | 500KB+ |
| **Files** | 3 static | 200+ Lua |
| **Stack** | Vanilla JS | Lua templates |
| **Install** | Copy 3 files | Package manager |
| **Upgrade** | Copy 3 files | `opkg update` |

Both are equally secure—identical auth & permission systems.

---

## Browser Support

Chrome 90+ • Firefox 88+ • Safari 14+ • Any modern browser

---

## License

MIT

