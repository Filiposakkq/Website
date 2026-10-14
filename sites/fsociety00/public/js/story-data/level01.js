// Level 01's text: the files `cat` can read, the hints and the route notes. The behavior is in ../level01.js and
// the command handlers; the words are here so a writer can change them without touching code.
//
// The key itself is NOT here: it is read from the page (see ../level01.js `getLevel01Key`).

export const LEVEL01_HINTS = [
  'three parts. inspect the page layers: markup, styles, and script.',
  'on desktop try ctrl+u or dev tools. on mobile use `source map` here, then read each listed file.',
  'the markup comment, a CSS custom property, and the JavaScript console each hold one part.',
];

/** The virtual files. A value is a function so a file can show live numbers (`attempts`). */
export const LEVEL01_FILES = {
  'readme.txt': () => [
    'sdb9 is sealed with a three-part key.',
    'the key is not in this system.',
    'it is in the page that shows you this system.',
    '',
    'part 1 :: the skeleton under the skin.',
    'part 2 :: the skin itself.',
    'part 3 :: what it whispers when no one is looking.',
    '',
    'join the parts with dashes. then unlock.',
  ],
  'notes.txt': () => [
    'they never delete anything.',
    'they overwrite. then they make sure',
    'nobody remembers there was something to overwrite.',
  ],
  'sdb9.lock': ({ attempts }) => [
    'target:   /dev/sdb9',
    'status:   LOCKED',
    `attempts: ${attempts}`,
    'key:      #####-#####-####   (3 parts)',
  ],
  'inbox/001.msg': () => [
    'the partition is not empty.',
    'it is locked.',
    'pts/1 keeps telling you to type abort.',
    'that closes the guest shell, not the remote operator.',
    'read the cleanup script before you trust either channel.',
  ],
  'watcher/session.log': () => [
    'operator: watcher // session: pts/1',
    'attached: before guest login',
    'request: abort guest session',
    'note: abort returns control to the remote operator.',
    'countermeasure: isolate pts/1 before cleanup.',
  ],
};

/** Which route may read which file (the other route gets "No such file or directory"). */
export const LEVEL01_FILE_ROUTE = {
  'watcher/session.log': 'watcher',
  'inbox/001.msg': 'unknown',
};

/** The evidence a file adds to the case file when it is read. */
export const LEVEL01_FILE_EVIDENCE = {
  'sdb9.lock': 'lock-header',
  'inbox/001.msg': 'route-note',
  'watcher/session.log': 'watcher-log',
};

export const LEVEL01_LS = {
  unknown: 'inbox/   notes.txt   readme.txt   page/   sdb9.lock',
  watcher: 'inbox/   notes.txt   readme.txt   page/   sdb9.lock   watcher/',
};

/** The three page layers `cat page/...` reads, and the line each must contain. */
export const LEVEL01_SOURCE_FILES = {
  'page/index.html': { path: '../index.html', clue: /sdb9-part-one|sdb9 :: layer 1\/3/, evidence: 'page-markup' },
  'page/styles.css': { path: '../styles.css', clue: /--sdb9-part-two/, evidence: 'page-style' },
  'page/js/source.js': { path: './source.js', clue: /sourcePartThree/, evidence: 'page-script' },
};

export const LEVEL01_SOURCE_MAP = [
  'SOURCE MAP :: /page',
  '  index.html       markup comment',
  '  styles.css       root custom property',
  '  js/source.js     console whisper',
];
