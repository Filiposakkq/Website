const out = document.getElementById('output');
const screen = document.getElementById('screen');
const promptLine = document.getElementById('promptLine');
const skipHint = document.getElementById('skipHint');

let skip = false;
addEventListener('pointerdown', () => { skip = true; });
addEventListener('keydown', () => { skip = true; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (ms) => (skip ? Promise.resolve() : sleep(ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const ip = () => `${rand(11, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`;
const scroll = () => window.scrollTo(0, document.body.scrollHeight);

function line(text = '', cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text || '\u00a0';
  out.appendChild(d);
  scroll();
  return d;
}

async function type(text, cls = '', speed = 35) {
  const d = line('', cls);
  d.textContent = '';
  for (const ch of text) {
    d.textContent += ch;
    await wait(speed);
  }
  return d;
}

async function bar(label, ms = 1500) {
  const d = line();
  const total = 16;
  for (let i = 0; i <= total; i++) {
    const pct = Math.round((i / total) * 100);
    d.textContent = `${label} [${'#'.repeat(i)}${'.'.repeat(total - i)}] ${pct}%`;
    await wait(ms / total);
  }
}

// kernel log s časovým razítkem
let kt = 0;
async function klog(text, cls = 'dim') {
  kt += Math.random() * 0.35;
  line(`[${kt.toFixed(3).padStart(7)}] ${text}`, cls);
  await wait(rand(30, 110));
}

// systemd styl: [ OK ] služba
async function svc(text, state = 'OK', ms) {
  const d = document.createElement('div');
  const tag = document.createElement('span');
  tag.className = 'dim';
  tag.textContent = '[ .... ] ';
  d.append(tag, text);
  out.appendChild(d);
  scroll();
  await wait(ms ?? rand(150, 550));
  tag.textContent = state === 'OK' ? '[  OK  ] ' : '[FAILED] ';
  tag.className = state === 'OK' ? '' : 'warn';
  await wait(40);
}

async function memtest() {
  const d = line();
  const total = 16384;
  for (let mb = 0; mb <= total; mb += 512) {
    d.textContent = `Memory test: ${mb} MB`;
    await wait(22);
  }
  d.textContent = `Memory test: ${total} MB OK`;
}

async function glitch() {
  if (skip) return;
  screen.classList.add('glitch');
  await sleep(500);
  screen.classList.remove('glitch');
}

async function blackout(ms = 1400) {
  screen.style.opacity = '0';
  await wait(ms);
  out.innerHTML = '';
  window.scrollTo(0, 0);
  screen.style.opacity = '1';
}

async function flash() {
  if (skip) return;
  screen.classList.add('flash');
  await sleep(180);
  screen.classList.remove('flash');
}

async function boot() {
  await wait(600);

  // 1) BIOS / POST
  line('FSOC-BIOS v0.0.1  (c) 2015 E Corp', 'dim');
  line('Build 15-05-2015 03:14:07', 'dim');
  line();
  await wait(300);
  line('CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz');
  await wait(200);
  await memtest();
  await wait(200);
  line('Detecting drives...');
  await wait(500);
  line('  sda  512GB  SSD  OK', 'dim');
  await wait(180);
  line('  sdb  2TB    HDD  OK', 'dim');
  await wait(180);
  line('  sdc  ----   no media', 'dim');
  await wait(600);
  line();

  // 2) bootloader
  line('GNU GRUB  version 2.02');
  await wait(400);
  line('Loading Linux 4.19.0-fsoc ...');
  await wait(700);
  line('Loading initial ramdisk ...');
  await wait(900);
  line();

  // 3) kernel log
  await klog('Linux version 4.19.0-fsoc (root@fsociety00) (gcc 8.3.0)');
  await klog('Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1 ro quiet');
  await klog('x86/fpu: Supporting XSAVE feature 0x001: x87 floating point');
  await klog('BIOS-provided physical RAM map:');
  await klog('BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable');
  await klog('BIOS-e820: [mem 0x0000000000100000-0x00000003ffffffff] usable');
  await klog('NX (Execute Disable) protection: active');
  await klog('DMI: E Corp / FSOC-MB 1.0.3, BIOS 0.0.1');
  await klog('tsc: Detected 3600.000 MHz processor');
  await klog('ACPI: Core revision 20180810');
  await klog('PCI: Using configuration type 1 for base access');
  await klog('NET: Registered protocol family 2');
  await klog('TCP: Hash tables configured (established 131072)');
  await klog('usb 1-1: new high-speed USB device number 2');
  await klog('usb 1-1: device descriptor read/64, error -71', 'warn');
  await klog('usb 1-1: Product: unknown');
  await klog('EXT4-fs (sda1): mounted filesystem with ordered data mode');
  await klog('random: crng init done');
  line();
  await wait(400);

  // 4) služby
  await svc('Started Journal Service.');
  await svc('Mounted /boot.');
  await svc('Started udev Kernel Device Manager.');
  await svc('Reached target Local File Systems.');
  await svc('Started Network Manager.');
  await svc('Started OpenSSH server daemon.');
  await svc('Started Tor anonymity daemon.');
  await svc('Started fsociety00 relay service.');
  line();

  // 5) kontrola disku
  await bar('fsck /dev/sda1', 1300);
  line('/dev/sda1: clean, 41392/3276800 files', 'dim');
  await wait(300);
  line();

  // 6) síť
  line('Bringing up network...', 'dim');
  await wait(400);
  line(`eth0: link up, 1000Mbps full duplex`);
  await wait(300);
  line(`eth0: inet ${ip()}  (spoofed)`, 'dim');
  await wait(500);
  line('Building secure tunnel...', 'dim');
  await wait(300);
  for (let i = 1; i <= 5; i++) {
    line(`  hop ${i}: ${ip()}   ${rand(18, 210)}ms`, 'dim');
    await wait(rand(250, 500));
  }
  line('Tunnel established.');
  await wait(500);
  line();

  // 7) šifrovaný disk
  await svc('Starting cryptsetup for /dev/sdb1...', 'OK', 700);
  await bar('decrypting /dev/dat', 1800);
  await svc('Mounted /dev/dat.');
  await wait(500);
  line();
  line('scanning for partitions...', 'dim');
  await wait(900);
  line('found unlisted partition: /dev/sdb9', 'warn');
  await wait(500);
  line('size:  0 bytes', 'dim');
  await wait(250);
  line('owner: unknown', 'dim');
  await wait(900);
  line();

  // 8) něco je špatně
  line('WARNING: unauthorized access detected', 'warn');
  await wait(700);
  line('source: unknown', 'warn');
  await wait(800);
  line('tracing connection...', 'dim');
  await wait(1300);
  line('trace failed.', 'warn');
  await wait(700);
  await flash();
  await glitch();
  await blackout(1500);

  // 9) příběh
  await type('hello, friend.', 'big', 130);
  await wait(500);
  await flash();
  await glitch();
  await wait(1200);
  line();
  await type('you should not be here.', '', 60);
  await wait(1100);
  await type('but you are.', 'warn', 90);
  await wait(1300);
  line();
  await type('there is something hidden in this system.');
  await wait(900);
  await type('find it before they do.');
  await wait(1300);
  line();
  await type('they are already looking for you.', 'warn', 70);
  await glitch();
  await wait(800);
  line();

  skipHint.hidden = true;
  promptLine.hidden = false;
  scroll();
}

boot();
    
