// The flavor commands of the guest shell: whoami, uname, ps, netstat, ifconfig, history, date and the system files
// `cat` can read. They make the machine feel real and give a few extra clues; none of them prints the key.
//
// World facts (keep these consistent with story-data/boot.js and the story bible): user guest (uid 1000) on host
// fsociety00, kernel 4.4.0-fsoc, a rogue adapter eth0:1, the suspicious ghost.sh as PID 1337, the watcher attached
// as pts/1 before the guest logged in, one outbound connection to a redacted host on port 4444.
// Only documentation-range addresses (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 10.0.0.0/8) appear here.

export const HOSTNAME = 'fsociety00';
export const USER = 'guest';
export const NOW = 'Thu Sep 24 03:41:09 UTC 2015';

export const SYSTEM_OUTPUT = {
  whoami: ['guest (uid=1000) - restricted shell'],
  unameAll: ['Linux fsociety00 4.4.0-fsoc #1 SMP x86_64 GNU/Linux'],
  uname: ['Linux'],
  pwd: ['/home/guest'],
  date: [NOW],
  ps: [
    'USER       PID %CPU %MEM COMMAND',
    'root         1  0.0  0.1 /sbin/init',
    'root         2  0.0  0.0 [kthreadd]',
    'root       214  0.0  0.0 [kworker/0:2]',
    'root       388  0.0  0.2 /usr/sbin/NetworkManager --no-daemon',
    'root       412  0.0  0.1 /usr/sbin/sshd -D',
    'root       977  0.0  0.1 sshd: watcher@pts/1',
    'guest     1204  0.0  0.1 -bash',
    'root      1337  3.2  0.4 /bin/sh /root/ghost.sh --hold',
    'guest     1688  0.0  0.0 ps aux',
  ],
  netstat: [
    'Active Internet connections (servers and established)',
    'Proto Recv-Q Send-Q Local Address           Foreign Address         State',
    'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN',
    'tcp        0      0 10.0.2.15:22            198.51.100.7:51044      ESTABLISHED',
    'tcp        0    312 10.0.2.15:49122         203.0.113.███:4444      ESTABLISHED',
    'udp        0      0 10.0.2.15:68            0.0.0.0:*',
  ],
  ifconfig: [
    'eth0      Link encap:Ethernet  HWaddr 52:54:00:12:34:56',
    '          inet addr:10.0.2.15  Bcast:10.0.2.255  Mask:255.255.255.0',
    '          UP BROADCAST RUNNING MULTICAST  MTU:1500',
    '',
    'eth0:1    Link encap:Ethernet  HWaddr 52:54:00:de:ad:01',
    '          inet addr:192.0.2.66  Bcast:192.0.2.255  Mask:255.255.255.0',
    '          UP BROADCAST RUNNING  (adapter not in /etc/network/interfaces)',
    '',
    'lo        Link encap:Local Loopback',
    '          inet addr:127.0.0.1  Mask:255.0.0.0',
    '          UP LOOPBACK RUNNING  MTU:65536',
  ],
  history: [
    '    1  ls /dev',
    '    2  cat /dev/sdb9',
    '    3  cat sdb9.lock',
    '    4  mount /dev/sdb9 /mnt',
    '    5  ssh-keygen -l -f sdb9.pub',
    '    6  ./ghost.sh',
    '    7  history -c',
  ],
};

/** `cat`-able system files. The leading slash is stripped by `cat` (var/log/auth.log). */
export const SYSTEM_FILES = {
  'var/log/auth.log': () => [
    'Sep 24 02:51:12 fsociety00 sshd[611]: Failed password for root from 203.0.113.41 port 40322 ssh2',
    'Sep 24 02:51:15 fsociety00 sshd[611]: Failed password for root from 203.0.113.41 port 40322 ssh2',
    'Sep 24 02:58:40 fsociety00 sshd[640]: Failed password for admin from 198.51.100.23 port 51877 ssh2',
    'Sep 24 03:09:02 fsociety00 sshd[702]: Accepted publickey for watcher from 198.51.100.7 port 51044 ssh2',
    'Sep 24 03:09:02 fsociety00 sshd[702]: pam_unix(sshd:session): session opened for user watcher (pts/1)',
    'Sep 24 03:14:07 fsociety00 login[981]: pam_unix(login:session): session opened for user guest',
  ],
};

/** Commands that exist on a real machine but are not for a restricted guest shell. */
export const DENIED = [
  'sudo', 'su', 'rm', 'mv', 'cp', 'chmod', 'chown', 'kill', 'killall', 'ssh', 'nc', 'wget', 'curl', 'mount',
  'umount', 'dd', 'passwd', 'vi', 'vim', 'nano', 'reboot', 'shutdown', 'apt', 'apt-get',
];

export const RESTRICTED = { cd: 'rbash: cd: restricted' };
