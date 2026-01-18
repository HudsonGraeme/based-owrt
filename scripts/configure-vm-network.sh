#!/usr/bin/env bash
set -e

echo "Configuring OpenWrt networking for QEMU user-mode..."
echo ""

cat > /tmp/openwrt-network-config.sh << 'EOF'
#!/bin/sh
uci set network.lan.ipaddr='10.0.2.15'
uci set network.lan.netmask='255.255.255.0'
uci set network.lan.gateway='10.0.2.2'
uci set network.lan.dns='10.0.2.3'
uci commit network
/etc/init.d/network restart
uci set uhttpd.main.listen_http='0.0.0.0:80'
uci set uhttpd.main.listen_https='0.0.0.0:443'
uci commit uhttpd
/etc/init.d/uhttpd restart
EOF

echo "Waiting for SSH to become available..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=2 -p 2222 root@localhost "echo ok" 2>/dev/null | grep -q ok; then
        echo "SSH connected!"
        break
    fi
    echo "Attempt $i/30..."
    sleep 2
done

echo "Uploading and executing network configuration..."
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P 2222 /tmp/openwrt-network-config.sh root@localhost:/tmp/
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 root@localhost "sh /tmp/openwrt-network-config.sh"

echo ""
echo "Network configured! LuCI should now be accessible at http://localhost:8080"
rm /tmp/openwrt-network-config.sh
