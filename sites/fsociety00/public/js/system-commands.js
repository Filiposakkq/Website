// The flavor commands (group "system"): they answer like the real tools, in the story world. Output text lives in
// story-data/system.js. None of them can be used to skip the puzzle: nothing here prints a part of the key.

import { SYSTEM_OUTPUT, DENIED, RESTRICTED } from './story-data/system.js';

/**
 * @param {ReturnType<typeof import('./commands.js').createRegistry>} registry
 * @param {{ line: Function, audio: { play: Function }, out?: HTMLElement, scrollTop?: () => void }} deps
 */
export function registerSystemCommands(registry, {
  line, audio, out = document.getElementById('output'), scrollTop = () => window.scrollTo(0, 0),
}) {
  const print = (rows, cls = '') => rows.forEach((row) => line(row, cls));
  const simple = (name, usage, summary, rows, extra = {}) => registry.register({
    name, group: 'system', usage, summary, ...extra,
    run() {
      audio.play('file-read');
      print(rows);
    },
  });

  simple('whoami', 'whoami', 'who you are on this machine', SYSTEM_OUTPUT.whoami);
  simple('pwd', 'pwd', 'print the working directory', SYSTEM_OUTPUT.pwd, { listed: () => false });
  simple('date', 'date', 'show the system date', SYSTEM_OUTPUT.date, { listed: () => false });
  simple('ps', 'ps aux', 'list processes', SYSTEM_OUTPUT.ps);
  simple('netstat', 'netstat -an', 'list network connections', SYSTEM_OUTPUT.netstat);
  simple('ifconfig', 'ifconfig', 'show network interfaces', SYSTEM_OUTPUT.ifconfig);
  simple('history', 'history', 'earlier commands', SYSTEM_OUTPUT.history);

  registry.register({
    name: 'uname', group: 'system', usage: 'uname -a', summary: 'system information',
    run(args) {
      audio.play('file-read');
      print(args.includes('-a') ? SYSTEM_OUTPUT.unameAll : SYSTEM_OUTPUT.uname);
    },
  });

  registry.register({
    name: 'echo', group: 'system', usage: 'echo <text>', summary: 'print text', listed: () => false,
    run(args) { line(args.join(' ') || ' '); },
  });

  // `clear` empties the terminal. It is only reachable while the prompt is live (the level shell), never during a
  // scripted scene, so the engine's own output is never cut in half.
  registry.register({
    name: 'clear', group: 'system', usage: 'clear', summary: 'clear the screen',
    run() {
      out.replaceChildren();
      scrollTop();
    },
  });

  for (const [word, message] of Object.entries(RESTRICTED)) {
    registry.register({ name: word, group: 'system', listed: () => false, run() { line(message, 'warn'); } });
  }
  for (const word of DENIED) {
    registry.register({
      name: word, group: 'system', listed: () => false,
      run() { line(`bash: ${word}: permission denied`, 'warn'); },
    });
  }
}
