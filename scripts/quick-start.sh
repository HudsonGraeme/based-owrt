#!/usr/bin/env bash
set -e

echo "=== OpenWrt VM Quick Start ==="
echo ""

if [ ! -f "vm/openwrt.img" ]; then
    echo "Setting up OpenWrt image..."
    ./scripts/setup-qemu.sh
fi

echo "Starting OpenWrt VM in background..."
nohup qemu-system-x86_64 \
    -M q35 \
    -m 512 \
    -smp 2 \
    -drive file=vm/openwrt.img,format=raw,if=virtio \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp:127.0.0.1:8080-:80,hostfwd=tcp:127.0.0.1:2222-:22 \
    -nographic \
    > vm/qemu.log 2>&1 &

QEMU_PID=$!
echo "VM started (PID: $QEMU_PID)"
echo ""

echo "Waiting for OpenWrt to boot (60 seconds)..."
sleep 60

echo "Configuring network for QEMU..."
for i in {1..20}; do
    if ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=3 -p 2222 root@localhost "
        uci set network.lan.proto='dhcp'
        uci commit network
        /etc/init.d/network restart
        sleep 5
        uci set uhttpd.main.listen_http='0.0.0.0:80'
        uci commit uhttpd
        /etc/init.d/uhttpd restart
    " 2>/dev/null; then
        echo "✓ Network configured"
        break
    fi
    echo "Retry $i/20..."
    sleep 3
done

echo ""
echo "Installing Based theme..."
sleep 5
./scripts/install-theme.sh localhost 2222

echo ""
echo "===================================="
echo "✓ Setup complete!"
echo ""
echo "Access LuCI at: http://localhost:8080"
echo "Login: root (no password)"
echo ""
echo "To stop VM: kill $QEMU_PID"
echo "===================================="
