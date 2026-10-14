// The boot of a compromised machine: BIOS, GRUB, kernel log, services (one fails), the unlisted partition the
// whole story is about, warnings, then a login. Text and order follow the plan (section 5). Hold-to-skip applies
// to the whole segment. Cues (phase 2): boot-prompt, boot-memtest, drive-seek, boot-checkpoint, kernel-start,
// boot-fail (played by the failing `svc`), trace-warning, boot-complete.
//
// Story hooks kept from the earlier boot: the unlisted partition /dev/sdb9 ("encrypted", "owner: unknown") and the
// failed trace, because the transmission and the level text that follow refer to them.
// Fictional data only: documentation-range addresses and made-up identifiers.

import {
  line, blank, wait, jitter, sfx, probe, memtest, klog, svc, cmd,
} from './dsl.js';

const bios = [
  wait(600),
  sfx('boot-prompt'),
  line('AMIBIOS (C) 2015 E Corp Systems', 'dim'),
  line('FSOC-BIOS v3.1.4 Release 09/23/2015', 'dim'),
  blank(),
  wait(300),
  line('CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz'),
  sfx('boot-checkpoint'),
  wait(250),
  sfx('boot-memtest'),
  memtest(16384, 2400),
  jitter(60, 140),
  line('  Extended Memory: 16252MB', 'dim'),
  jitter(60, 140),
  line('  L1 Cache: 256KB  L2 Cache: 1024KB  L3 Cache: 8192KB', 'dim'),
  blank(),
  wait(350),
  sfx('drive-seek'),
  probe('Detecting Primary Master... ', 'WDC WD10EZEX-00W 931.5GB', 900),
  probe('Detecting Primary Slave...  ', 'None', 650),
  probe('Detecting Secondary Master... ', 'ATAPI DVD-ROM', 800),
  sfx('boot-checkpoint'),
  line('PCI Device Listing:'),
  jitter(80, 150),
  line('  Bus 0, Dev 2:  Intel HD Graphics 4600', 'dim'),
  jitter(80, 150),
  line('  Bus 0, Dev 26: Intel 9 Series USB EHCI', 'dim'),
  jitter(80, 150),
  line('  Bus 0, Dev 31: Intel 9 Series LPC', 'dim'),
  jitter(80, 150),
  line('  Bus 1, Dev 0:  Realtek RTL8168 GbE', 'dim'),
  blank(),
  wait(500),
  line('Press DEL to enter Setup, F12 for Boot Menu...', 'dim'),
  wait(1000),
  blank(),
];

const bootloader = [
  sfx('boot-checkpoint'),
  line('Loading GRUB...'),
  wait(700),
  line('  GNU GRUB version 2.02', 'dim'),
  wait(600),
  blank(),
  line("Booting 'fsociety-os (kernel 4.4.0-custom)'..."),
  wait(900),
  sfx('kernel-start'),
  blank(),
];

const kernel = [
  klog(0.0, 'Linux version 4.4.0-fsoc (root@fsociety)'),
  klog(0.0, 'Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1'),
  klog(0.041523, 'ACPI: RSDP 0x00000000000F0490'),
  klog(0.126842, 'Initializing cgroup subsys cpu'),
  klog(0.284012, 'pid_max: default: 32768 minimum: 301'),
  klog(0.310511, 'Security Framework initialized'),
  klog(0.310515, 'SELinux: Disabled at boot.'),
  klog(0.493211, 'NET: Registered protocol family 2'),
  klog(1.01234, 'e1000: eth0 NIC Link is Up 1000 Mbps'),
  klog(1.234102, 'EXT4-fs (sda1): mounted filesystem'),
  klog(1.502831, 'systemd[1]: Detected architecture x86-64.'),
  blank(),
  wait(400),
];

const services = [
  sfx('boot-checkpoint'),
  svc('Started Journal Service.'),
  svc('Started Network Manager.'),
  svc('Reached target Network.'),
  svc('Failed to start Firewall Service.', 'FAILED', 900),
  svc('Started OpenSSH Server.'),
  svc('Reached target Multi-User System.'),
  blank(),
  wait(400),
];

// The hook the rest of the story hangs on: an unlisted, encrypted partition with no owner.
const partition = [
  line('scanning for partitions...', 'dim'),
  wait(900),
  line('found unlisted partition: /dev/sdb9', 'warn'),
  wait(500),
  line('contents: encrypted', 'dim'),
  wait(250),
  line('owner: unknown', 'dim'),
  wait(900),
  blank(),
];

const warnings = [
  sfx('trace-warning'),
  line('WARNING: Unauthorized network adapter detected on eth0:1', 'warn'),
  wait(700),
  line("WARNING: Unknown process 'ghost.sh' running as PID 1337", 'warn'),
  wait(700),
  line('WARNING: Outbound connection to [REDACTED] on port 4444', 'warn'),
  wait(1000),
  blank(),
];

const login = [
  cmd('guest', { prompt: 'fsociety-os login: ', speed: 90, pause: 500 }),
  cmd('password', { prompt: 'Password: ', speed: 70, pause: 600, mask: true }),
  line('Last login: Thu Sep 24 03:14:07 2015 from 203.0.113.???', 'dim'),
  blank(),
  line('guest@fsociety00:~$'),
  sfx('boot-complete'),
  wait(900),
];

// The machine notices the intruder and the trace fails. This is where the skippable boot ends.
const compromise = [
  blank(),
  line('WARNING: unauthorized access detected', 'warn'),
  wait(700),
  line('source: unknown', 'warn'),
  wait(800),
  line('tracing connection...', 'dim'),
  wait(1300),
  line('trace request failed.', 'warn'),
  wait(700),
];

export const boot = [...bios, ...bootloader, ...kernel, ...services, ...partition, ...warnings, ...login, ...compromise];
