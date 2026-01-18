#!/usr/bin/env python3
import sys
import time

try:
    import pexpect
except ImportError:
    print("pexpect not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "pexpect"])
    import pexpect

print("=" * 60)
print("OpenWrt VM Automatic Setup")
print("=" * 60)
print()

cmd = [
    "qemu-system-x86_64",
    "-M", "q35",
    "-m", "512",
    "-smp", "2",
    "-drive", "file=vm/openwrt.img,format=raw,if=virtio",
    "-device", "e1000,netdev=net0",
    "-netdev", "user,id=net0,hostfwd=tcp:127.0.0.1:8080-:80,hostfwd=tcp:127.0.0.1:2222-:22",
    "-nographic"
]

print("Starting QEMU...")
child = pexpect.spawn(" ".join(cmd), encoding='utf-8', timeout=300)
child.logfile = sys.stdout

print("\nWaiting for boot... (this takes 60-120 seconds)")
try:
    child.expect("Please press Enter to activate this console.", timeout=180)
    print("\n✓ Boot complete!")
    time.sleep(2)

    print("\nActivating console...")
    child.sendline("")
    child.expect("root@.*:/#", timeout=30)

    print("\n✓ Console active. Configuring network...")

    commands = [
        "uci set network.lan.proto='dhcp'",
        "uci delete network.lan.ipaddr",
        "uci delete network.lan.netmask",
        "uci commit network",
        "/etc/init.d/network restart",
    ]

    for cmd in commands:
        print(f"  Running: {cmd}")
        child.sendline(cmd)
        child.expect("root@.*:/#", timeout=30)
        time.sleep(1)

    print("\nWaiting for network to restart (15 seconds)...")
    time.sleep(15)

    print("\nRestarting services...")
    child.sendline("/etc/init.d/dropbear restart")
    child.expect("root@.*:/#", timeout=30)

    child.sendline("/etc/init.d/uhttpd restart")
    child.expect("root@.*:/#", timeout=30)

    print("\n" + "=" * 60)
    print("✓ Configuration complete!")
    print("=" * 60)
    print()
    print("Access LuCI at: http://localhost:8080")
    print("SSH access: ssh -p 2222 root@localhost")
    print()
    print("Press Ctrl+A then X to exit QEMU")
    print("Or Ctrl+C to terminate this script")
    print()

    child.interact()

except pexpect.TIMEOUT:
    print("\n✗ Timeout waiting for boot/console")
    print("Check vm/qemu.log for details")
    child.close()
    sys.exit(1)
except pexpect.EOF:
    print("\n✗ QEMU exited unexpectedly")
    child.close()
    sys.exit(1)
except KeyboardInterrupt:
    print("\n\nInterrupted by user")
    child.close()
    sys.exit(0)
