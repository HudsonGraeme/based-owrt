#!/usr/bin/env bash
set -e

IMAGE_FILE="./vm/openwrt.img"

if [ ! -f "${IMAGE_FILE}" ]; then
    echo "OpenWrt image not found. Run ./scripts/setup-qemu.sh first"
    exit 1
fi

cat << 'EOF'
========================================
Starting OpenWrt VM (Manual Configuration)
========================================

When the VM boots:
1. Wait for "Please press Enter to activate this console." (60-90 seconds)
2. Press ENTER
3. Run these commands at the OpenWrt prompt:

   uci set network.lan.proto='dhcp'
   uci delete network.lan.ipaddr
   uci delete network.lan.netmask
   uci commit network
   /etc/init.d/network restart
   sleep 15
   /etc/init.d/dropbear restart
   /etc/init.d/uhttpd restart

4. Access LuCI at http://localhost:8080 (wait 30s after restart)
5. Press Ctrl+A then X to exit QEMU

Starting VM now...
========================================

EOF

sleep 2

exec qemu-system-x86_64 \
    -M q35 \
    -m 512 \
    -smp 2 \
    -drive file="${IMAGE_FILE}",format=raw,if=virtio \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp:127.0.0.1:8080-:80,hostfwd=tcp:127.0.0.1:2222-:22 \
    -nographic
