# fsociety00 story bible (canon as it exists in the code)

Written 2026-10-13 from `sites/fsociety00/public/js/{story,level01,casefile,trace,story-choices}.js` and `index.html` at `main` commit `841cad0`. **It describes what the code does today; it does not invent.** Line references (`S:` = `story.js`, `L:` = `level01.js`, `C:` = `casefile.js`, `T:` = `trace.js`, `H:` = `index.html`) drift after refactors: re-find with `grep`. "Not in code" means the story does not say it. **Spoilers:** this file explains the whole plot and puzzle (it never prints the Level 01 key itself).

Use it to keep the story consistent in phases 3 (story data), 4 (evidence), 6 (TRACED), 9 (hidden clues) and in any future story work. If you change canon, change this file in the same commit.

## 1. Scene timeline

1. **Launch dialog** (H:19-28): "INCOMING CONNECTION // FSOCIETY00", button `[ INITIALIZE SYSTEM ]`; status lines NEGOTIATING DISPLAY MODE, VERIFYING LOCAL CONSOLE, OPENING GUEST SESSION (S:1741-1771). Audio starts here, not before.
2. **BIOS / POST** (S:1236-1254): `FSOC-BIOS v0.0.1 (c) 2015 E Corp`, build `15-05-2015 03:14:07`, drives sda 512GB SSD, sdb 2TB HDD.
3. **GRUB and kernel log** (S:1257-1285): `Linux 4.19.0-fsoc`; a USB error followed by `Product: unknown`.
4. **Services, network, disk** (S:1289-1338): Tor and the "fsociety00 relay service" start, eth0 gets a `203.0.113.x` address (documentation range), 5 relay hops, `/dev/sdb1` unlocked, then `found unlisted partition: /dev/sdb9`, `contents: encrypted`, `owner: unknown`.
5. **First trace glitch** (S:1342-1349): `WARNING: unauthorized access detected`, `source: unknown`, `trace request failed.`
6. **Static, roll, blackout, then** `*** INCOMING TRANSMISSION ***` (`source: unknown`, `direct line open.`) (S:1359-1373).
7. **Hello message** (S:1378-1397): `<unknown> you're right on time.` in big text, then "i've been waiting for you", "you shouldn't be here / but you are.", "there is something hidden in this system.", "find it before they do.", "they are already looking for you." Then `*** unknown disconnected ***`, `wiping session...` and the screen is wiped.
8. **Logo reveal** (S:465-551, 1411-1415): glitchy decrypt of the pixel FSOCIETY logo, header `FS/00`, `RELAY ID // 0515`, caption `PRIVATE RELAY // TRUST NO ROUTE`, then `access level: GUEST`.
9. **Guest session and inbox** (S:1418-1441): `1 unread message` from unknown, subject `sdb9`; `cat ~/inbox/001.msg`: the partition is not empty, it is locked, the key is not in this system, it is hidden in the page itself, look closer.
10. **Level 01 intro** (S:1444-1470): `=== LEVEL 01 :: THE KEY ===`, target /dev/sdb9, LOCKED, 3 attempts, key `????????`. "you have 8 minutes." Trace HUD in the centre (480 s), then docks to the corner.
11. **Cut-off and lost connection** (S:1473-1506): unknown starts "sdb9 holds a list. everyone they have erased. and the key to open it is-" and is cut off; `*** connection lost ***`; IDS alerts; trace rate doubles; "you are on your own now."
12. **Watcher breaks in** (S:1512-1541): `*** new connection: watcher ***`: "i see you.", "<unknown> has been lying to you.", "there is no key.", "there is only the trace." Trace speed x3. Unknown reconnects: "don't listen to him. he wants you to stop looking."
13. **Trust choice** (S:1542-1553; `story-choices.js`): "who do you trust?" `trust <unknown>` (key 1) or `trust <watcher>` (key 2).
14. **Route dialogue and trace reset** (S:1557-1601): branch text (section 3), `ETA RESET: 02:00`, "two minutes. no extensions."
15. **Level 01 puzzle** (L:106-355): shell with `help`, `ls`, `cat`, `unlock`, `hint`, `trace`, `board`, `source map` (+ route commands).
16. **Victory** (S:1016-1221): sdb9 unlocks and mounts (`erased.list`, `ghost.sh`); the watcher says "close it. you do not know what is in there."; trace resets to 120 s; the player runs `./ghost.sh`; `cat erased.list` shows redacted rows 0001-0009, `...`, `4096 ERASED`, `4097 PENDING` which becomes GHOSTED; identity reveal (`unknown` is rewritten to `Mr. Robot` everywhere), `<Mr. Robot> hello, friend.` and "bonsoir."; `=== LEVEL 01 COMPLETE ===`, `[ALERT] watcher connection: retry attempt detected`, "you are a ghost. this is where the signal ends."
17. **Endings that fail:** `TRACE COMPLETE` (T:52-62, S:619-676: SIGNAL LOCATED, four phases, power down), `LOCKED OUT` (3 wrong keys, L:332), `SESSION COMPROMISED` (watcher route only, `abort`, S:678-717), `DEVELOPER SHUTDOWN TEST` (dev panel only; the case file records no outcome for it).

## 2. Characters and voices

- **unknown** (`<unknown>`, lowercase, calm, conspiratorial, typo effects). Sends the inbox note; "i can't tell you my name yet. they listen for it." (S:1563). Pushes the player to find the key in the page and later says it threw the watcher out (S:1051). After the reveal the label becomes `<Mr. Robot>`; typing sounds are suppressed for him.
- **watcher** (`<watcher>`, red/warn style, terse and accusatory). A hostile remote operator on `pts/1`, "attached: before guest login" (L:158-159). In the ghost sequence he opens a private line: "he is not trying to save you. he needs you to open it. when it opens, the list has your name too." and is cut off mid-sentence (S:970-988).
- **ghost** is not a character: it is the script `ghost.sh` (header comment "by the one who cannot say his name") and the state "you are a ghost".
- **Mr. Robot** is what `unknown` is renamed to in the reveal. The story only says "names are how they keep track of us... the one they gave me-" (S:1022-1024). **No backstory** is given.
- **Elliot easter egg:** `unlock elliot` shows a hooded silhouette for about 5 s (L:312-315). The case file calls it an "Unverified visual echo": atmosphere only, it verifies no identity (C:95-104). It is not connected to Mr. Robot in any text.

## 3. The two trust routes

| | Trust unknown | Trust watcher |
|---|---|---|
| Reply | unknown: "good. i wasn't sure you would."; watcher: "he can't say it because he does not trust you." | watcher: "smart. ... type abort. close the session before it logs you."; unknown breaks in: "he is lying." |
| Extra file | `cat inbox/001.msg` | `cat watcher/session.log` (and `watcher/` in `ls`) |
| Extra commands | `verify relay` | `isolate watcher`, `abort` |
| Evidence | `route-note` | `watcher-log` |
| Trap | none | `abort` ends in SESSION COMPROMISED |
| Outcome after ghost.sh | `verified-handoff` (relay verified and script inspected) else `unverified-handoff` | `contained-exit` (watcher isolated) else `open-relay-exit` |

The other route's evidence appears as "SEALED // OTHER BRANCH".

## 4. Lore facts

- **sdb9:** unlisted, encrypted, owner unknown; holds `erased.list` and `ghost.sh`.
- **Key:** three layers read from the page (a `<meta>`, a CSS custom property, a console message); the parts are named in the hints and the readme. **Do not print or move them in docs or code without keeping all three discoverable.**
- **ghost.sh:** steps CLOSE TRACE REQUEST, END REMOTE SESSION, REVOKE GUEST TOKEN, CLOSE LOCAL SHELL; label `FSOCIETY // CONTAINMENT ROUTINE`.
- **The list:** erased people; the player is record **4097** ("SESSION DOSSIER 4097"); "that is how they find people." (S:1180).
- **Fictional data only:** all IPs are `203.0.113.x`; E Corp, build date 2015, relay id 0515, `guest@fsociety00`, relays `7 / 9`. Never real IPs, locations or identities.
- **Timers:** 480 s at the start, 120 s after the trust choice, 120 s after the unlock; `hint` costs 30 s; watcher takeover sets 60 s at 8x speed.
- **Case file items** (C:3-105): `lock-header`, `page-markup`, `page-style`, `page-script`, `route-note`, `watcher-log`, `ghost-script`, `erased-list`, `elliot-echo`. Outcomes: VERIFIED HANDOFF, UNVERIFIED HANDOFF, CONTAINED EXIT, OPEN RELAY EXIT, SESSION COMPROMISED, LOCKED OUT, TRACE COMPLETE. Footer: "EVIDENCE IS NOT IDENTITY // VERIFY EVERY CHANNEL".

## 5. Voice and tone rules (derived from the code)

- Lowercase, short lines, no exclamation marks, calm menace; typos and cut-offs are a device ("the key to open it is-").
- unknown is warm but evasive; the watcher is cold and procedural; system messages are terse and technical (`[ALERT] ...`, `*** ... ***`).
- Everything is English. Names of real people, real IPs and real places are never used.

## 6. Loose ends and contradictions in the current code

These are **open**: do not "fix" one silently, ask the owner (they may be deliberate mystery).

1. The first speaker is never named before the reveal, and the reveal gives a name but no backstory ("the one they gave me-" is never completed).
2. The watcher says "there is no key" (S:1521) but the key exists and works; in ghost.sh he says "he needs you to open it" (S:977) while the script itself says "no key material requested" (S:853).
3. "you have 8 minutes" (S:1458), later "two minutes. no extensions." (S:1599); `hint` can cut the time further.
4. `abort` is described differently in three places: "close the session before it logs you" (watcher), "closes the guest shell and hands control to the remote operator" (L:153-154, C:54), and `verify relay` says it "maps to pts/0" (L:253).
5. The watcher's `retry attempt detected` and "he will find a way back" set up a sequel that does not exist.
6. Not in code: who "they" are, any year other than 2015, a PID for `ghost.sh` (phase 3's fake `ps aux` plans one: `ghost.sh` PID 1337), whose name Elliot is beyond the easter egg.
7. Developer route `ending` skips the trust choice, so it always uses the unknown route; `DEVELOPER SHUTDOWN TEST` records no case outcome.

## 7. Rules for changing the story

1. Keep the Level 01 puzzle intact (three-layer key, `unlock`, 3 attempts) and the "Do not break" list in `CLAUDE.md`.
2. Text changes belong in the story data (phase 3 engine), not scattered in code.
3. Resolve a loose end only with an owner decision recorded in the decisions log of `docs/overhaul/README.md`, then update this file.
4. New lore for hidden clues (phase 9) must agree with sections 2, 4 and 5 and stay short and in character.
5. Mentioning a location, IP or identity is for drama only: fictional or redacted, never derived from the player.
