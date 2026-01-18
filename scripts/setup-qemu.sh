#!/usr/bin/env bash
set -e

OPENWRT_VERSION="23.05.5"
IMAGE_URL="https://downloads.openwrt.org/releases/${OPENWRT_VERSION}/targets/x86/64/openwrt-${OPENWRT_VERSION}-x86-64-generic-ext4-combined.img.gz"
IMAGE_DIR="./vm"
IMAGE_FILE="${IMAGE_DIR}/openwrt.img"

echo "Setting up OpenWrt QEMU environment..."

if ! command -v qemu-system-x86_64 &> /dev/null; then
    echo "QEMU not found. Installing via Homebrew..."
    brew install qemu
fi

mkdir -p "${IMAGE_DIR}"

if [ ! -f "${IMAGE_FILE}" ]; then
    echo "Downloading OpenWrt ${OPENWRT_VERSION}..."
    curl -L "${IMAGE_URL}" -o "${IMAGE_DIR}/openwrt.img.gz"

    echo "Extracting image..."
    gunzip "${IMAGE_DIR}/openwrt.img.gz"

    echo "Resizing image to 1GB..."
    qemu-img resize "${IMAGE_FILE}" 1G
else
    echo "OpenWrt image already exists at ${IMAGE_FILE}"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: ./scripts/start-vm.sh"
echo "2. Wait for boot (30-60 seconds)"
echo "3. Access LuCI at http://192.168.1.1"
echo "4. Default credentials: root / (no password)"
