#!/usr/bin/env bash
set -e

IMAGE_FILE="./vm/openwrt.img"

if [ ! -f "${IMAGE_FILE}" ]; then
    echo "OpenWrt image not found. Run ./scripts/setup-qemu.sh first"
    exit 1
fi

echo "Starting OpenWrt VM..."
echo ""
echo "IMPORTANT: After boot (60s), access via http://localhost:8080"
echo "First-time setup required - see scripts/configure-vm-network.sh"
echo ""
echo "Press Ctrl+A then X to exit QEMU console"
echo ""

exec qemu-system-x86_64 \
    -M q35 \
    -m 512 \
    -smp 2 \
    -drive file="${IMAGE_FILE}",format=raw,if=virtio \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp:127.0.0.1:8080-:80,hostfwd=tcp:127.0.0.1:2222-:22,hostfwd=tcp:127.0.0.1:4443-:443 \
    -nographic
