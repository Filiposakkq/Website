// The evidence board (phase 4.5): a native <dialog> opened with the CASE FILE button or the `board` command.
// casefile.js owns the data and the rules; this file only draws `getView()` and sends the player's actions back
// (`connect`). Nothing here starts a timer: while the board is open it subscribes to the case file, which calls it on
// every change ('data') and once per trace second ('tick').
//
// Layout: on a wide screen four panes in a 2 x 2 grid (EVIDENCE LIST | NETWORK MAP / PACKET INTERCEPT LOG | TRACE
// STATUS); on a phone (max-width 720px) the same four panes are tabs (EVIDENCE, MAP, INTERCEPT, TRACE). The tab
// semantics (tablist, tabpanel, `hidden`) are only applied in the phone layout; the wide layout shows four regions.
//
// Accessibility: a modal dialog makes the page behind it (including the terminal's #srAnnouncer) inert, so the board
// has its own live region. Escape and the close button close it; focus returns to where it came from (the CASE FILE
// button when that opened it). Every map node is a real button in the page's tab order, and the map can be panned and
// zoomed with the keyboard (arrows, + / -, Home), the mouse (drag, wheel) and two fingers (pinch). Connecting two
// nodes works by selecting them (CONNECT on the detail card, then the second node); `connect e1 e2` does the same in
// the terminal. Animation: opacity only (the reveal fade), switched off by reduced motion and `body.quiet-motion`.

import { formatClock, pad2 } from './util.js';
import { createTopologyView } from './topology.js';

const STATE_LABEL = {
  hidden: 'UNOBSERVED', locked: 'LOCKED', unlocked: 'READ', decrypted: 'DECRYPTED', compromised: 'LOST',
};
const READABLE = ['unlocked', 'decrypted'];
const ANNOUNCED = ['evidence', 'intel', 'alert', 'scan', 'intercept', 'outcome'];
const WORLD = { width: 720, height: 440 };
const ZOOM = { min: 0.5, max: 2.25 };
const PHONE = '(max-width: 720px)';
const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (className, text, label) => {
  const element = el('button', className, text);
  element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  return element;
};
const clock = (secs) => (secs === null || !Number.isFinite(secs) ? 'NOT TRACKED' : formatClock(secs));

export function createBoardUI({ trigger, audio, getView, connect, subscribe, isStarted }) {
  let dialog = null;
  let refs = null;
  let unsubscribe = null;
  let lastFocus = null;
  let view = null;
  let topology = null;
  let layout = null;
  let seenEvents = 0;
  let riskKey = '';
  let fitted = false;
  const ui = {
    selected: '',
    tab: 'evidence',
    connectFrom: '',
    map: { x: 0, y: 0, scale: 1 },
  };
  const tabs = [
    ['evidence', 'EVIDENCE', 'EVIDENCE LIST'],
    ['map', 'MAP', 'NETWORK MAP'],
    ['intercept', 'INTERCEPT', 'PACKET INTERCEPT LOG'],
    ['trace', 'TRACE', 'TRACE STATUS'],
  ];

  const play = (cue) => audio?.play(cue);
  const byId = (id) => view.items.find((item) => item.id === id) ?? null;

  function announce(text) {
    if (!refs || !text) return;
    // The same sentence twice in a row would not be read again: alternate a trailing no-break space.
    const again = refs.live.textContent === text;
    refs.live.textContent = again ? `${text} ` : text;
  }

  // ---- the panes -------------------------------------------------------------------------------------------------

  function pane(id, title) {
    const section = el('section', `case-pane case-pane--${id}`);
    section.id = `casePane-${id}`;
    const heading = el('h3', 'case-pane-title', title);
    heading.id = `casePaneTitle-${id}`;
    const body = el('div', 'case-pane-body');
    section.append(heading, body);
    return { section, heading, body };
  }

  function renderList() {
    const { body, heading } = refs.panes.evidence;
    heading.textContent = `EVIDENCE LIST ${pad2(view.readable)} / ${pad2(view.total)}`;
    const list = el('ul', 'case-list');
    // Known records first, the unobserved placeholders last.
    const ordered = [...view.items].sort((a, b) => (a.state === 'hidden') - (b.state === 'hidden'));
    ordered.forEach((item, index) => {
      const row = el('li');
      const entry = button(`case-row is-${item.state}${item.id === ui.selected ? ' is-selected' : ''}${item.atRisk ? ' is-risk' : ''}`);
      entry.dataset.focusKey = `row-${item.id}`;
      entry.dataset.revealIndex = String(index);
      entry.style.setProperty('--i', String(index));
      if (item.id === ui.selected) entry.setAttribute('aria-current', 'true');
      const known = item.state !== 'hidden';
      entry.append(
        el('span', 'case-row-state', item.atRisk ? 'AT RISK' : STATE_LABEL[item.state]),
        el('span', 'case-row-code', known ? item.code : '--'),
        el('span', 'case-row-title', known && item.title ? item.title : 'UNOBSERVED SIGNAL'),
        el('span', 'case-row-type', known ? item.type : '')
      );
      entry.addEventListener('click', () => {
        if (ui.connectFrom && ui.connectFrom !== item.id) tryConnect(ui.connectFrom, item.id);
        else choose(item.id);
      });
      row.append(entry);
      list.append(row);
    });
    const detail = el('article', 'case-detail');
    detail.setAttribute('aria-live', 'off');
    refs.detail = detail;
    body.replaceChildren(list, detail);
    renderDetail();
  }

  function renderDetail() {
    const detail = refs.detail;
    const item = byId(ui.selected);
    if (!item) {
      detail.replaceChildren(el('p', 'case-empty', 'Select a node or a row to inspect it.'));
      return;
    }
    const known = item.state !== 'hidden';
    detail.className = `case-detail is-${item.state}`;
    const top = el('div', 'case-detail-top');
    top.append(el('span', 'case-tag', known ? `${item.type} // ${item.group}` : 'UNOBSERVED'), el('span', 'case-tag case-tag-state', item.atRisk ? 'AT RISK' : STATE_LABEL[item.state]));
    const parts = [top, el('h4', '', known && item.title ? item.title : 'Signal not yet observed')];

    if (item.state === 'compromised') {
      parts.push(el('p', 'case-warn', 'DATA CORRUPTED // lost to the trace'));
      const lost = el('div', 'case-lost');
      lost.setAttribute('aria-hidden', 'true');
      lost.append(el('p', 'case-copy', item.summary), el('p', 'case-copy', item.detail));
      parts.push(lost, el('p', 'sr-only', 'This record was overwritten by the trace and cannot be read.'));
    } else if (READABLE.includes(item.state)) {
      parts.push(
        el('p', 'case-source', `PROVENANCE // ${item.source}`),
        el('p', 'case-copy', item.detail),
        el('p', 'case-summary', item.summary)
      );
    } else if (item.state === 'locked') {
      const how = item.encrypted
        ? `Encrypted. Open it in the terminal: decrypt ${item.code} (${item.decryptSeconds} s).`
        : `Sealed. Read it in the terminal: dump ${item.file}`;
      parts.push(el('p', 'case-copy', how));
      if (item.decrypting) parts.push(el('p', 'case-note', 'DECRYPT RUNNING // watch the terminal'));
      if (item.atRisk) parts.push(el('p', 'case-warn', 'The trace is about to overwrite this record. Open it now.'));
    } else {
      parts.push(el('p', 'case-copy', 'This record is still outside the evidence chain. Find and inspect its source in the terminal.'));
      parts.push(el('p', 'case-summary', 'No conclusion drawn. Missing artifacts remain unknown, not false.'));
    }

    if (ui.connectFrom === item.id) parts.push(el('p', 'case-note', 'CONNECT MODE // select a second row or node'));
    if (READABLE.includes(item.state) && item.type !== 'INTEL') {
      const active = ui.connectFrom === item.id;
      const action = button(`case-action${active ? ' is-active' : ''}`, active ? 'CANCEL CONNECT' : 'CONNECT TO ...');
      action.dataset.focusKey = 'connect-toggle';
      action.setAttribute('aria-pressed', String(active));
      action.addEventListener('click', () => {
        ui.connectFrom = active ? '' : item.id;
        announce(active ? 'Connect cancelled.' : `Connect mode. Select a second row or node to connect with ${item.code}.`);
        renderMap();
        renderDetail();
      });
      parts.push(action);
    }
    detail.replaceChildren(...parts);
  }

  // ---- the map -----------------------------------------------------------------------------------------------------

  function renderMap() {
    const { body } = refs.panes.map;
    const controls = el('div', 'case-map-controls');
    const zoomOut = button('case-map-control', '−', 'Zoom out');
    const zoomIn = button('case-map-control', '+', 'Zoom in');
    const fit = button('case-map-control case-map-fit', 'FIT', 'Fit the whole map');
    controls.append(zoomOut, zoomIn, fit);
    const banner = el('p', `case-connect-banner${ui.connectFrom ? '' : ' is-idle'}`);
    const from = ui.connectFrom ? byId(ui.connectFrom) : null;
    banner.textContent = from ? `CONNECT MODE // select a node or row to link with ${from.code}` : 'Drag to pan, wheel or pinch to zoom. Select a node to inspect it.';

    const network = el('div', 'case-network');
    network.tabIndex = 0;
    network.setAttribute('role', 'group');
    network.setAttribute('aria-label', 'Evidence map. Arrow keys pan, plus and minus zoom, Home fits the map. The nodes are buttons.');
    const world = el('div', 'case-map-world');
    world.style.width = `${WORLD.width}px`;
    world.style.height = `${WORLD.height}px`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const placed = view.items.filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
    const connected = new Set(view.connected.map((pair) => [...pair].sort().join('|')));
    const drawn = new Set();
    placed.forEach((item) => item.links.forEach((otherId) => {
      const other = placed.find((entry) => entry.id === otherId);
      if (!other) return;
      const key = [item.id, other.id].sort().join('|');
      if (drawn.has(key)) return;
      drawn.add(key);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(item.x));
      line.setAttribute('y1', String(item.y));
      line.setAttribute('x2', String(other.x));
      line.setAttribute('y2', String(other.y));
      const both = READABLE.includes(item.state) && READABLE.includes(other.state);
      line.setAttribute('class', `${both ? 'linked' : ''}${connected.has(key) ? ' connected' : ''}`.trim());
      svg.append(line);
    }));
    world.append(svg);
    placed.forEach((item, index) => {
      const known = item.state !== 'hidden';
      const node = button(`case-node is-${item.state}${item.id === ui.selected ? ' is-selected' : ''}${item.id === ui.connectFrom ? ' is-source' : ''}${item.atRisk ? ' is-risk' : ''}`);
      node.dataset.focusKey = `node-${item.id}`;
      node.dataset.revealIndex = String(index);
      node.style.setProperty('--i', String(index));
      node.style.left = `${item.x}%`;
      node.style.top = `${item.y}%`;
      node.setAttribute('aria-label', known
        ? `${item.code} ${item.title}, ${item.atRisk ? 'at risk, ' : ''}${STATE_LABEL[item.state].toLowerCase()}. Select to ${ui.connectFrom && ui.connectFrom !== item.id ? 'connect' : 'inspect'}.`
        : 'Unobserved signal. Select to inspect.');
      node.append(
        el('span', 'case-node-code', known ? item.code : '--'),
        el('span', 'case-node-title', known && item.title ? item.title : 'UNOBSERVED'),
        el('span', 'case-node-state', item.atRisk ? 'AT RISK' : STATE_LABEL[item.state])
      );
      node.addEventListener('click', () => {
        if (ui.connectFrom && ui.connectFrom !== item.id) tryConnect(ui.connectFrom, item.id);
        else choose(item.id);
      });
      // A focused node must not scroll the clipped map: the map moves with its own transform.
      node.addEventListener('focus', () => {
        network.scrollLeft = 0;
        network.scrollTop = 0;
        reveal(item);
      });
      world.append(node);
    });
    network.append(world);
    body.replaceChildren(controls, banner, network);
    refs.network = network;
    refs.world = world;

    const apply = () => {
      if (!network.clientWidth) return; // the pane is hidden (phone tabs): nothing to measure
      const viewW = network.clientWidth;
      const viewH = network.clientHeight;
      const scaledW = WORLD.width * ui.map.scale;
      const scaledH = WORLD.height * ui.map.scale;
      ui.map.x = scaledW <= viewW ? (viewW - scaledW) / 2 : Math.min(0, Math.max(viewW - scaledW, ui.map.x));
      ui.map.y = scaledH <= viewH ? (viewH - scaledH) / 2 : Math.min(0, Math.max(viewH - scaledH, ui.map.y));
      world.style.transform = `translate(${ui.map.x}px, ${ui.map.y}px) scale(${ui.map.scale})`;
    };
    const zoomAt = (scale, x = network.clientWidth / 2, y = network.clientHeight / 2) => {
      const next = Math.min(ZOOM.max, Math.max(ZOOM.min, scale));
      const ratio = next / ui.map.scale;
      ui.map.x = x - (x - ui.map.x) * ratio;
      ui.map.y = y - (y - ui.map.y) * ratio;
      ui.map.scale = next;
      apply();
    };
    // Fit, but never smaller than 0.75: the node text must stay readable (the map scrolls instead).
    const fitMap = () => {
      if (!network.clientWidth) return;
      ui.map.scale = Math.min(1, Math.max(0.75, Math.min(network.clientWidth / WORLD.width, network.clientHeight / WORLD.height)));
      ui.map.x = (network.clientWidth - WORLD.width * ui.map.scale) / 2;
      ui.map.y = (network.clientHeight - WORLD.height * ui.map.scale) / 2;
      apply();
    };
    // Pans the map so that a node is fully inside the pane (a selected or focused node must never sit off screen).
    const reveal = (item) => {
      if (!network.clientWidth || !Number.isFinite(item?.x)) return;
      const cx = (item.x / 100) * WORLD.width * ui.map.scale + ui.map.x;
      const cy = (item.y / 100) * WORLD.height * ui.map.scale + ui.map.y;
      const halfW = 72 * ui.map.scale;
      const halfH = 34 * ui.map.scale;
      if (cx - halfW < 0) ui.map.x += halfW - cx;
      else if (cx + halfW > network.clientWidth) ui.map.x -= cx + halfW - network.clientWidth;
      if (cy - halfH < 0) ui.map.y += halfH - cy;
      else if (cy + halfH > network.clientHeight) ui.map.y -= cy + halfH - network.clientHeight;
      apply();
    };
    refs.applyMap = apply;
    refs.fitMap = fitMap;
    refs.reveal = reveal;
    zoomOut.addEventListener('click', () => zoomAt(ui.map.scale / 1.2));
    zoomIn.addEventListener('click', () => zoomAt(ui.map.scale * 1.2));
    fit.addEventListener('click', fitMap);

    // Pointer pan (one pointer) and pinch (two pointers).
    const pointers = new Map();
    let pinch = 0;
    network.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      network.setPointerCapture(event.pointerId);
      network.classList.add('is-panning');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    network.addEventListener('pointermove', (event) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const now = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, now);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          const bounds = network.getBoundingClientRect();
          zoomAt(ui.map.scale * (distance / pinch), (a.x + b.x) / 2 - bounds.left, (a.y + b.y) / 2 - bounds.top);
        }
        pinch = distance;
        return;
      }
      ui.map.x += now.x - last.x;
      ui.map.y += now.y - last.y;
      apply();
    });
    const stop = (event) => {
      pointers.delete(event.pointerId);
      pinch = 0;
      if (!pointers.size) network.classList.remove('is-panning');
    };
    network.addEventListener('pointerup', stop);
    network.addEventListener('pointercancel', stop);
    network.addEventListener('wheel', (event) => {
      event.preventDefault();
      const bounds = network.getBoundingClientRect();
      zoomAt(ui.map.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    network.addEventListener('keydown', (event) => {
      if (event.target !== network) return;
      const step = { ArrowLeft: [36, 0], ArrowRight: [-36, 0], ArrowUp: [0, 36], ArrowDown: [0, -36] }[event.key];
      if (step) {
        event.preventDefault();
        ui.map.x += step[0];
        ui.map.y += step[1];
        apply();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAt(ui.map.scale * 1.2);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomAt(ui.map.scale / 1.2);
      } else if (event.key === 'Home') {
        event.preventDefault();
        fitMap();
      }
    });
    if (fitted) apply();
    else if (network.clientWidth) {
      fitMap();
      fitted = true;
    }
  }

  // ---- intercept log, trace status ----------------------------------------------------------------------------------

  function renderIntercept() {
    const { body } = refs.panes.intercept;
    const log = el('div', 'case-log');
    if (!view.packets.length) {
      log.append(el('p', 'case-empty', 'No capture yet. Run intercept in the terminal.'));
    }
    view.packets.forEach((pass, index) => {
      const block = el('div', 'case-log-block');
      block.dataset.revealIndex = String(index);
      block.style.setProperty('--i', String(index));
      block.append(el('p', 'case-log-title', pass.title));
      pass.rows.forEach((row) => block.append(el('p', 'case-log-row', row)));
      log.append(block);
    });
    const captured = view.items.filter((item) => item.type === 'INTERCEPT' && item.state !== 'hidden');
    if (captured.length) {
      const list = el('ul', 'case-captured');
      captured.forEach((item) => list.append(el('li', '', `${item.code}  ${item.title}  [${STATE_LABEL[item.state]}]`)));
      log.append(el('p', 'case-log-title', 'CAPTURED'), list);
    }
    body.replaceChildren(log);
  }

  function renderTrace() {
    const { body } = refs.panes.trace;
    const status = el('div', 'case-trace-status');
    refs.traceTime = el('strong', 'case-trace-time');
    status.append(
      el('span', 'case-tag', 'TRACE'),
      refs.traceTime,
      el('span', 'case-tag', 'SOURCE [REDACTED]')
    );
    const map = el('div', 'case-topology');
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', 'Trace path');
    topology = createTopologyView(map);
    const current = view.conclusion;
    const assessment = el('article', `case-conclusion ${current.tone}`);
    assessment.append(el('span', 'case-tag', 'CURRENT ASSESSMENT'), el('h4', '', current.title), el('p', 'case-copy', current.text));
    const timeline = el('ol', 'case-timeline');
    const entries = [...view.events].reverse();
    if (!entries.length) timeline.append(el('li', 'case-empty', 'No decisions recorded yet.'));
    entries.forEach((entry, index) => {
      const row = el('li', `case-event ${entry.kind}`);
      row.dataset.revealIndex = String(index);
      row.style.setProperty('--i', String(Math.min(index, 12)));
      row.append(el('time', '', `T+${clock(entry.at)}`), el('span', 'case-event-type', entry.kind.toUpperCase()), el('strong', '', entry.title), el('span', 'case-event-detail', entry.detail));
      timeline.append(row);
    });
    body.replaceChildren(status, map, assessment, el('h4', 'case-subheading', 'TIMELINE'), timeline);
    refreshLive();
  }

  /** Once per trace second: the clock, the path and the footer. No rebuilding. */
  function refreshLive() {
    if (!refs) return;
    const left = view.traceLeft;
    refs.traceTime.textContent = view.outcome
      ? (view.outcome === 'trace-complete' ? 'COMPLETE' : 'CLOSED')
      : clock(left);
    if (Number.isFinite(left)) topology.update(left);
    refs.age.textContent = `SESSION AGE ${clock(view.elapsed)}`;
  }

  function renderHeaderStatus() {
    refs.status.textContent = view.outcome
      ? `CASE CLOSED // ${view.outcomeLabel}`
      : `LIVE // ${view.routeLabel || 'NO ROUTE YET'} // ${view.hintsUsed} HINTS // ${view.failedUnlocks} REJECTS`;
  }

  // ---- actions -----------------------------------------------------------------------------------------------------

  function choose(id) {
    ui.selected = id;
    play('node-select');
    refs.dialog.querySelectorAll('.case-row, .case-node').forEach((node) => {
      const key = node.dataset.focusKey?.replace(/^(row|node)-/, '');
      node.classList.toggle('is-selected', key === id);
      if (node.classList.contains('case-row')) {
        if (key === id) node.setAttribute('aria-current', 'true');
        else node.removeAttribute('aria-current');
      }
    });
    renderDetail();
    const item = byId(id);
    refs.reveal?.(item);
    announce(item && item.state !== 'hidden' ? `${item.code} ${item.title}, ${STATE_LABEL[item.state].toLowerCase()}.` : 'Unobserved signal.');
  }

  function tryConnect(idA, idB) {
    const a = byId(idA);
    const b = byId(idB);
    const result = connect(idA, idB);
    ui.connectFrom = '';
    if (result.ok) {
      ui.selected = result.intel.id;
      announce(`Connected ${a.code} and ${b.code}. Intel: ${result.intel.title}.`);
    } else if (result.reason === 'none') {
      announce(`No relation between ${a.code} and ${b.code}.${result.cost ? ` Trace minus ${result.cost} seconds.` : ''}`);
    } else if (result.reason === 'already') {
      announce(`${a.code} and ${b.code} are already linked.`);
    } else if (result.reason === 'locked') {
      announce(`${result.item.code} is not readable yet.`);
    } else if (result.reason === 'compromised') {
      announce(`${result.item.code} is lost.`);
    } else announce('Those two nodes cannot be connected.');
    // The case file notified 'data' while connecting (a success), but the mode must end in every case.
    refresh();
  }

  function setTab(id) {
    ui.tab = id;
    applyLayout();
    if (id === 'map' && refs.fitMap && !fitted && refs.network.clientWidth) {
      refs.fitMap();
      fitted = true;
    } else if (id === 'map') refs.applyMap?.();
    if (id === 'map') refs.reveal?.(byId(ui.selected));
  }

  function applyLayout() {
    if (!refs) return;
    const compact = layout.matches;
    refs.tabs.hidden = !compact;
    tabs.forEach(([id]) => {
      const { section, heading } = refs.panes[id];
      const tab = refs.tabButtons[id];
      if (compact) {
        section.setAttribute('role', 'tabpanel');
        section.setAttribute('aria-labelledby', tab.id);
        section.hidden = id !== ui.tab;
        heading.classList.add('sr-only');
        tab.setAttribute('aria-selected', String(id === ui.tab));
        tab.tabIndex = id === ui.tab ? 0 : -1;
        tab.classList.toggle('is-active', id === ui.tab);
      } else {
        section.setAttribute('role', 'region');
        section.setAttribute('aria-labelledby', heading.id);
        section.hidden = false;
        heading.classList.remove('sr-only');
      }
    });
    refs.dialog.classList.toggle('is-compact', compact);
    if (!compact && refs.applyMap) refs.applyMap();
  }

  // ---- building and refreshing ---------------------------------------------------------------------------------------

  /** Redraws everything from the case file's data and keeps the keyboard focus on the same node or row. */
  function refresh() {
    view = getView();
    const key = document.activeElement?.dataset?.focusKey;
    if (!ui.selected || !byId(ui.selected)) ui.selected = view.items.find((item) => READABLE.includes(item.state))?.id ?? view.items[0]?.id ?? '';
    if (ui.connectFrom && !byId(ui.connectFrom)) ui.connectFrom = '';
    riskKey = view.items.map((item) => (item.atRisk ? item.id : '')).join('');
    renderHeaderStatus();
    renderList();
    renderMap();
    renderIntercept();
    renderTrace();
    if (key) refs.dialog.querySelector(`[data-focus-key="${key}"]`)?.focus();
    const fresh = view.events.slice(seenEvents).filter((entry) => ANNOUNCED.includes(entry.kind));
    seenEvents = view.events.length;
    if (fresh.length) announce(fresh.map((entry) => entry.title).join('. '));
  }

  function onChange(kind) {
    if (!refs) return;
    if (kind === 'data') {
      // The reveal fade only plays for the first draw.
      refs.panel.classList.remove('is-opening');
      refresh();
      return;
    }
    view = getView();
    const key = view.items.map((item) => (item.atRisk ? item.id : '')).join('');
    if (key !== riskKey) refresh();
    else refreshLive();
  }

  function build() {
    dialog = el('dialog', 'case-dialog');
    dialog.setAttribute('aria-labelledby', 'caseTitle');
    const panel = el('div', 'case-panel is-opening');
    const header = el('header', 'case-header');
    const heading = el('div', 'case-heading');
    const title = el('h2', '', 'CASE FILE // INTELLIGENCE DASHBOARD');
    title.id = 'caseTitle';
    const status = el('p', 'case-status');
    heading.append(title, status);
    const close = button('case-close', 'CLOSE', 'Close the evidence board');
    close.addEventListener('click', () => api.close());
    header.append(heading, close);

    const live = el('p', 'sr-only');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    const tablist = el('div', 'case-tabs');
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Evidence board panels');
    const tabButtons = {};
    tabs.forEach(([id, label, full]) => {
      const tab = button('case-tab', label);
      tab.id = `caseTab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `casePane-${id}`);
      tab.setAttribute('aria-label', full);
      tab.addEventListener('click', () => setTab(id));
      tab.addEventListener('keydown', (event) => {
        const index = tabs.findIndex(([tabId]) => tabId === id);
        const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        const next = tabs[(target + tabs.length) % tabs.length][0];
        setTab(next);
        tabButtons[next].focus();
      });
      tabButtons[id] = tab;
      tablist.append(tab);
    });

    const grid = el('div', 'case-grid');
    const panes = {};
    tabs.forEach(([id, , full]) => {
      panes[id] = pane(id, full);
      grid.append(panes[id].section);
    });

    const footer = el('footer', 'case-footer');
    const age = el('span');
    footer.append(age, el('span', 'case-footer-note', 'EVIDENCE IS NOT IDENTITY // VERIFY EVERY CHANNEL'), el('span', '', 'ESC TO RETURN'));
    panel.append(header, live, tablist, grid, footer);
    dialog.append(panel);

    // A click on the backdrop (the dialog element itself, outside the panel) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) api.close();
    });
    dialog.addEventListener('close', cleanup);
    refs = { dialog, panel, status, live, tabs: tablist, tabButtons, panes, age };
  }

  function cleanup() {
    if (!dialog) return;
    unsubscribe?.();
    unsubscribe = null;
    const focusTarget = lastFocus && document.contains(lastFocus) ? lastFocus : trigger;
    dialog.remove();
    dialog = null;
    refs = null;
    topology = null;
    layout?.removeEventListener('change', applyLayout);
    layout = null;
    lastFocus = null;
    ui.connectFrom = '';
    focusTarget?.focus();
  }

  const api = {
    open() {
      if (!isStarted() || dialog) return;
      lastFocus = document.activeElement;
      layout = window.matchMedia(PHONE);
      build();
      document.body.append(dialog);
      dialog.showModal();
      layout.addEventListener('change', applyLayout);
      fitted = false;
      seenEvents = getView().events.length;
      applyLayout();
      refresh();
      unsubscribe = subscribe(onChange);
      play('board-open');
      announce(`Evidence board open. ${view.readable} of ${view.total} records readable.`);
    },
    close() {
      if (dialog?.open) dialog.close();
      else cleanup();
    },
    isOpen: () => !!dialog,
  };

  trigger.addEventListener('click', api.open);
  return api;
}
