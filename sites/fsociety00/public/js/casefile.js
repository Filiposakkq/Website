const EVIDENCE = [
  {
    id: 'lock-header',
    group: 'TARGET',
    title: 'SDB9 lock header',
    source: 'cat sdb9.lock',
    summary: 'A sealed partition is mounted locally. The lock stores no key, only its shape.',
    detail: 'Three unknown parts are required. The key is not in the guest filesystem, so the investigation must move into the page layers.',
    x: 12,
    y: 22,
    links: ['page-markup', 'page-style'],
  },
  {
    id: 'page-markup',
    group: 'PAGE LAYER',
    title: 'Markup fragment',
    source: 'cat page/index.html',
    summary: 'The document skeleton contains the first fragment.',
    detail: 'A comment in the markup holds the first piece. Its location supports the note that the key is distributed across the page.',
    x: 36,
    y: 14,
    links: ['page-style', 'page-script'],
  },
  {
    id: 'page-style',
    group: 'PAGE LAYER',
    title: 'Style fragment',
    source: 'cat page/styles.css',
    summary: 'The shell stylesheet contains the second fragment.',
    detail: 'A custom property in the stylesheet holds the second piece. It is separate from the markup clue.',
    x: 36,
    y: 50,
    links: ['page-script', 'lock-header'],
  },
  {
    id: 'page-script',
    group: 'PAGE LAYER',
    title: 'Script fragment',
    source: 'cat page/js/source.js or hint',
    summary: 'A source whisper holds the final key fragment.',
    detail: 'The JavaScript source contains the last piece. Read all three fragments in order and join them with dashes.',
    x: 58,
    y: 30,
    links: ['lock-header', 'ghost-script'],
  },
  {
    id: 'route-note',
    group: 'BACKCHANNEL',
    title: 'Unknown’s relay note',
    source: 'cat inbox/001.msg',
    summary: 'A private note warns that the watcher’s abort instruction targets the guest session.',
    detail: 'The unknown operator claims the trace can be closed with the local containment script. The note is not proof by itself; inspect the script before execution.',
    x: 12,
    y: 78,
    route: 'unknown',
    links: ['ghost-script', 'page-script'],
  },
  {
    id: 'watcher-log',
    group: 'SESSION LOG',
    title: 'Watcher session record',
    source: 'cat watcher/session.log',
    summary: 'The watcher attached before the guest and issued an abort request against the guest shell.',
    detail: 'This is the watcher branch’s audit trail. It exposes a safer option: isolate pts/1 before cleaning up the trace.',
    x: 36,
    y: 84,
    route: 'watcher',
    links: ['ghost-script', 'lock-header'],
  },
  {
    id: 'ghost-script',
    group: 'PAYLOAD',
    title: 'Containment script',
    source: 'cat ghost.sh',
    summary: 'The script closes the trace request, disconnects the watcher, and invalidates the guest token.',
    detail: 'Reading before execution lets you judge the cleanup steps. The unknown branch encourages inspection; the watcher branch can isolate the remote session first.',
    x: 80,
    y: 50,
    links: ['page-script', 'erased-list'],
  },
  {
    id: 'erased-list',
    group: 'IMPACT',
    title: 'Erased-user index',
    source: 'cat /mnt/sdb9/erased.list',
    summary: 'The partition contains a numbered list of erased identities. Guest 4097 is added as its newest record.',
    detail: 'The session was not an isolated target. The index suggests the same operation has been repeated across many accounts.',
    x: 80,
    y: 82,
    links: ['ghost-script'],
  },
  {
    id: 'elliot-echo',
    group: 'ANOMALY',
    title: 'Unverified visual echo',
    source: 'unlock elliot',
    summary: 'A hooded figure briefly appears behind the terminal.',
    detail: 'The image is an unexplained local signal. It is atmospheric evidence only; it does not verify the identity behind either channel.',
    x: 58,
    y: 8,
    links: ['page-script'],
  },
];

const ROUTE_LABELS = {
  unknown: 'UNKNOWN // BACKCHANNEL',
  watcher: 'WATCHER // SESSION OPERATOR',
};

const OUTCOME_LABELS = {
  'verified-handoff': 'VERIFIED HANDOFF',
  'unverified-handoff': 'UNVERIFIED HANDOFF',
  'contained-exit': 'CONTAINED EXIT',
  'open-relay-exit': 'OPEN RELAY EXIT',
  'session-compromised': 'SESSION COMPROMISED',
  'locked-out': 'LOCKED OUT',
  'trace-complete': 'TRACE COMPLETE',
};

const create = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function createCaseFile({ trigger, getTraceLeft = () => null }) {
  const state = {
    startedAt: 0,
    route: '',
    boardUnlocked: false,
    discoveries: new Set(),
    decisions: [],
    events: [],
    hintsUsed: 0,
    failedUnlocks: 0,
    outcome: '',
    selected: 'lock-header',
    activeTab: 'network',
    mapView: { x: 0, y: 0, scale: 1 },
    ghostScriptInspected: false,
    relayVerified: false,
    watcherIsolated: false,
  };
  let overlay = null;
  let refreshInterval = 0;
  let lastFocus = null;

  const elapsed = () => state.startedAt ? Math.floor((performance.now() - state.startedAt) / 1000) : 0;
  const timeLabel = (seconds) => {
    if (seconds === null || !Number.isFinite(seconds)) return 'NOT TRACKED';
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const visibleEvidence = () => EVIDENCE.filter((item) => !item.route || item.route === state.route);
  const discoveredEvidence = () => visibleEvidence().filter((item) => state.discoveries.has(item.id));

  function recordEvent(kind, title, detail = '') {
    state.events.push({ kind, title, detail, at: elapsed() });
    updateTrigger();
    if (overlay) render();
  }

  function updateTrigger() {
    trigger.hidden = !state.boardUnlocked;
    trigger.querySelector('.case-count').textContent = String(state.discoveries.size).padStart(2, '0');
    trigger.setAttribute('aria-label', `Open evidence board, ${state.discoveries.size} evidence items`);
  }

  function start(route = 'main') {
    state.startedAt = performance.now();
    state.route = route;
    state.boardUnlocked = false;
    state.discoveries = new Set();
    state.decisions = [];
    state.events = [];
    state.hintsUsed = 0;
    state.failedUnlocks = 0;
    state.outcome = '';
    state.selected = 'lock-header';
    state.activeTab = 'network';
    state.mapView = { x: 0, y: 0, scale: 1 };
    trigger.classList.remove('case-trigger--revealed');
    state.ghostScriptInspected = false;
    state.relayVerified = false;
    state.watcherIsolated = false;
    recordEvent('system', 'CASE OPENED', 'Local guest session initialized.');
    updateTrigger();
  }

  function discover(id, detail = '') {
    const item = EVIDENCE.find((entry) => entry.id === id);
    if (!item || (item.route && item.route !== state.route) || state.discoveries.has(id)) return;
    state.discoveries.add(id);
    if (!state.boardUnlocked) {
      state.boardUnlocked = true;
      trigger.classList.remove('case-trigger--revealed');
      void trigger.offsetWidth;
      trigger.classList.add('case-trigger--revealed');
    }
    recordEvent('evidence', `EVIDENCE ADDED // ${item.title}`, detail || item.source);
  }

  function decide(id, title, detail) {
    const decision = { id, title, detail, at: elapsed() };
    state.decisions.push(decision);
    recordEvent('decision', title, detail);
    return decision;
  }

  function chooseTrust(route) {
    if (!ROUTE_LABELS[route]) return;
    state.route = route;
    decide('trust', `TRUST // ${route.toUpperCase()}`, ROUTE_LABELS[route]);
    recordEvent('route', 'BRANCH ACCESS GRANTED', route === 'unknown'
      ? 'A backchannel note is available under inbox/.'
      : 'The watcher session record is available under watcher/.');
  }

  function markHint() {
    state.hintsUsed++;
    decide('hint', `HINT REQUESTED // ${state.hintsUsed}`, 'A trace penalty was accepted in exchange for guidance.');
  }

  function markFailedUnlock() {
    state.failedUnlocks++;
    recordEvent('action', `KEY REJECTED // ATTEMPT ${state.failedUnlocks}`, 'The partition did not accept this key.');
  }

  function inspectGhostScript() {
    state.ghostScriptInspected = true;
    decide('script-inspected', 'PAYLOAD INSPECTED', 'ghost.sh was read before execution.');
    discover('ghost-script');
  }

  function verifyRelay() {
    state.relayVerified = true;
    decide('relay-verified', 'RELAY VERIFIED', 'The unknown channel’s warning was checked against the guest-session route.');
  }

  function isolateWatcher() {
    state.watcherIsolated = true;
    decide('watcher-isolated', 'PTS/1 ISOLATED', 'The watcher channel was quarantined before cleanup.');
  }

  function setOutcome(outcome) {
    if (!OUTCOME_LABELS[outcome]) return;
    state.outcome = outcome;
    recordEvent('outcome', `CASE CONCLUSION // ${OUTCOME_LABELS[outcome]}`, conclusion().text);
  }

  function setFailureOutcome(reason) {
    const outcome = reason === 'SESSION COMPROMISED' ? 'session-compromised'
      : reason === 'LOCKED OUT' ? 'locked-out'
        : reason === 'TRACE COMPLETE' ? 'trace-complete'
          : '';
    if (!outcome) return;
    state.outcome = outcome;
    recordEvent('outcome', `CASE CONCLUSION // ${OUTCOME_LABELS[outcome]}`, reason);
  }

  function conclusion() {
    if (state.outcome === 'verified-handoff') return {
      title: 'Verified, then executed',
      text: 'You checked the relay and inspected the cleanup script before running it. The session was contained with the strongest available chain of evidence.',
      tone: 'secure',
    };
    if (state.outcome === 'unverified-handoff') return {
      title: 'Signal trusted; payload unverified',
      text: 'You followed the backchannel without first inspecting the script. The immediate trace was closed, but the payload’s provenance remains uncertain.',
      tone: 'caution',
    };
    if (state.outcome === 'contained-exit') return {
      title: 'Operator contained',
      text: 'You read the watcher’s session record and isolated pts/1 before cleanup. The remote channel was denied a clean path back into the guest shell.',
      tone: 'secure',
    };
    if (state.outcome === 'open-relay-exit') return {
      title: 'Trace closed; relay left open',
      text: 'The cleanup removed the active session, but the watcher channel was not isolated first. The trace is quiet, not permanently gone.',
      tone: 'caution',
    };
    if (state.outcome === 'session-compromised') return {
      title: 'Guest session compromised',
      text: 'The abort request transferred session control to the watcher. The decision and route are preserved in this dossier.',
      tone: 'caution',
    };
    if (state.outcome === 'locked-out') return {
      title: 'Partition lockout',
      text: 'Three rejected keys closed access to the partition. The evidence collected before lockout remains in the board.',
      tone: 'caution',
    };
    if (state.outcome === 'trace-complete') return {
      title: 'Trace completed',
      text: 'The monitoring request completed before the investigation could finish.',
      tone: 'caution',
    };
    if (!state.route) return {
      title: 'No route selected',
      text: 'The operators have not been chosen yet. Trust is a recorded decision, not proof of identity.',
      tone: 'neutral',
    };
    if (state.route === 'watcher' && state.watcherIsolated) return {
      title: 'Watcher channel contained',
      text: 'You chose the watcher, then used the session log to isolate his connection. Keep the distinction between a useful lead and a trusted operator.',
      tone: 'secure',
    };
    if (state.route === 'unknown' && state.relayVerified && state.ghostScriptInspected) return {
      title: 'Backchannel corroborated',
      text: 'The relay was checked and the script was inspected. Independent checks support the handoff, although the author is still unknown.',
      tone: 'secure',
    };
    return {
      title: 'Investigation in progress',
      text: 'Collect artifacts and compare their sources. A confident message is not the same thing as corroborated evidence.',
      tone: 'neutral',
    };
  }

  function evidenceStatus(item) {
    if (state.discoveries.has(item.id)) return 'COLLECTED';
    return item.route ? 'SEALED // OTHER BRANCH' : 'NOT YET OBSERVED';
  }

  function statCard(label, value, note, tone = '') {
    const card = create('div', `case-stat${tone ? ` ${tone}` : ''}`);
    card.append(create('span', 'case-stat-label', label), create('strong', 'case-stat-value', value), create('span', 'case-stat-note', note));
    return card;
  }

  function renderHeader() {
    const header = create('header', 'case-header');
    const heading = create('div', 'case-heading');
    heading.append(
      create('p', 'case-eyebrow', 'FSOCIETY // FIELD INTELLIGENCE'),
      create('h2', '', 'EVIDENCE BOARD'),
      create('p', 'case-subtitle', 'SESSION DOSSIER 4097 // LOCAL INVESTIGATION')
    );
    const right = create('div', 'case-header-right');
    const status = create('span', 'case-status', state.outcome ? 'CASE CLOSED' : 'LIVE SESSION');
    const close = create('button', 'case-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close evidence board');
    close.addEventListener('click', closeBoard);
    right.append(status, close);
    header.append(heading, right);
    return header;
  }

  function renderStats() {
    const grid = create('div', 'case-stats');
    const evidenceCount = discoveredEvidence().length;
    const traceLabel = state.outcome
      ? state.outcome === 'trace-complete' ? 'COMPLETE' : 'CLOSED'
      : timeLabel(traceLeft());
    grid.append(
      statCard('ARTIFACTS', `${String(evidenceCount).padStart(2, '0')} / ${String(visibleEvidence().length).padStart(2, '0')}`, 'verified observations'),
      statCard('TRUST ROUTE', state.route ? state.route.toUpperCase() : 'UNDECIDED', 'operator selection', state.route === 'watcher' ? 'danger' : ''),
      statCard(state.outcome ? 'TRACE STATUS' : 'TRACE REMAINING', traceLabel, state.outcome ? 'session investigation status' : 'timer continues while board is open', 'danger'),
      statCard('COSTS', `${state.hintsUsed} HINTS / ${state.failedUnlocks} REJECTS`, 'time penalty / key failures')
    );
    return grid;
  }

  function traceLeft() {
    return getTraceLeft();
  }

  function renderTabs() {
    const nav = create('nav', 'case-tabs');
    nav.setAttribute('aria-label', 'Evidence board views');
    const tabs = [
      ['network', 'INTELLIGENCE MAP', 'MAP'],
      ['evidence', `ARTIFACTS ${String(discoveredEvidence().length).padStart(2, '0')}`, `FILES ${String(discoveredEvidence().length).padStart(2, '0')}`],
      ['decisions', `CASE TIMELINE ${String(state.events.length).padStart(2, '0')}`, `LOG ${String(state.events.length).padStart(2, '0')}`],
    ];
    tabs.forEach(([id, label, compactLabel]) => {
      const button = create('button', `case-tab${state.activeTab === id ? ' active' : ''}`);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.activeTab === id));
      button.setAttribute('aria-label', label);
      button.append(create('span', 'case-tab-full', label), create('span', 'case-tab-compact', compactLabel));
      button.addEventListener('click', () => { state.activeTab = id; render(); });
      nav.appendChild(button);
    });
    return nav;
  }

  function renderNetwork() {
    const section = create('section', 'case-network-view');
    const title = create('div', 'case-section-heading');
    title.append(create('h3', '', 'SIGNAL RELATIONSHIPS'), create('span', '', 'PAN THE BOARD // SELECT A NODE TO INSPECT'));
    const controls = create('div', 'case-map-controls');
    const zoomOut = create('button', 'case-map-control', '−');
    const zoomIn = create('button', 'case-map-control', '+');
    const fit = create('button', 'case-map-control case-map-fit', 'FIT MAP');
    [[zoomOut, 'Zoom out'], [zoomIn, 'Zoom in'], [fit, 'Fit entire map']].forEach(([button, label]) => {
      button.type = 'button';
      button.setAttribute('aria-label', label);
      controls.appendChild(button);
    });
    const network = create('div', 'case-network');
    network.setAttribute('role', 'group');
    network.setAttribute('aria-label', 'Interactive evidence map. Drag the map background to pan. Use arrow keys to pan, plus and minus to zoom, or Home to fit the map. Select a node to inspect it.');
    network.tabIndex = 0;
    const world = create('div', 'case-map-world');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const visible = visibleEvidence();
    const edges = new Set();
    visible.forEach((item) => item.links.forEach((linkedId) => {
      const target = visible.find((entry) => entry.id === linkedId);
      if (!target) return;
      const edgeKey = [item.id, target.id].sort().join('|');
      if (edges.has(edgeKey)) return;
      edges.add(edgeKey);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(item.x));
      line.setAttribute('y1', String(item.y));
      line.setAttribute('x2', String(target.x));
      line.setAttribute('y2', String(target.y));
      line.setAttribute('class', state.discoveries.has(item.id) && state.discoveries.has(target.id) ? 'linked' : '');
      svg.appendChild(line);
    }));
    world.appendChild(svg);
    visible.forEach((item) => {
      const found = state.discoveries.has(item.id);
      const node = create('button', `case-node${found ? ' found' : ''}${state.selected === item.id ? ' selected' : ''}`);
      node.type = 'button';
      node.style.setProperty('--node-x', `${item.x}%`);
      node.style.setProperty('--node-y', `${item.y}%`);
      node.setAttribute('aria-label', `${item.title}, ${found ? 'collected' : 'not observed'}. Select to inspect.`);
      node.append(create('span', 'case-node-dot'), create('span', 'case-node-title', found ? item.title : 'UNOBSERVED'));
      node.addEventListener('click', () => {
        state.selected = item.id;
        state.activeTab = 'evidence';
        render();
      });
      world.appendChild(node);
    });
    network.appendChild(world);
    const dimensions = () => ({
      viewportWidth: network.clientWidth,
      viewportHeight: network.clientHeight,
      worldWidth: world.scrollWidth,
      worldHeight: world.scrollHeight,
    });
    const applyTransform = () => {
      const { viewportWidth, viewportHeight, worldWidth, worldHeight } = dimensions();
      const scaledWidth = worldWidth * state.mapView.scale;
      const scaledHeight = worldHeight * state.mapView.scale;
      state.mapView.x = scaledWidth <= viewportWidth
        ? (viewportWidth - scaledWidth) / 2
        : Math.min(0, Math.max(viewportWidth - scaledWidth, state.mapView.x));
      state.mapView.y = scaledHeight <= viewportHeight
        ? (viewportHeight - scaledHeight) / 2
        : Math.min(0, Math.max(viewportHeight - scaledHeight, state.mapView.y));
      world.style.transform = `translate(${state.mapView.x}px, ${state.mapView.y}px) scale(${state.mapView.scale})`;
      network.dataset.zoom = `${Math.round(state.mapView.scale * 100)}%`;
    };
    const zoomAt = (scale, x = network.clientWidth / 2, y = network.clientHeight / 2) => {
      const nextScale = Math.min(2.25, Math.max(0.45, scale));
      const ratio = nextScale / state.mapView.scale;
      state.mapView.x = x - (x - state.mapView.x) * ratio;
      state.mapView.y = y - (y - state.mapView.y) * ratio;
      state.mapView.scale = nextScale;
      applyTransform();
    };
    const fitMap = () => {
      const { viewportWidth, viewportHeight, worldWidth, worldHeight } = dimensions();
      state.mapView.scale = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight, 1);
      state.mapView.x = (viewportWidth - worldWidth * state.mapView.scale) / 2;
      state.mapView.y = (viewportHeight - worldHeight * state.mapView.scale) / 2;
      applyTransform();
    };
    zoomOut.addEventListener('click', () => zoomAt(state.mapView.scale / 1.2));
    zoomIn.addEventListener('click', () => zoomAt(state.mapView.scale * 1.2));
    fit.addEventListener('click', fitMap);
    let pan = null;
    network.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      network.setPointerCapture(event.pointerId);
      network.classList.add('panning');
    });
    network.addEventListener('pointermove', (event) => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      state.mapView.x += event.clientX - pan.x;
      state.mapView.y += event.clientY - pan.y;
      pan.x = event.clientX;
      pan.y = event.clientY;
      applyTransform();
    });
    const stopPan = (event) => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      pan = null;
      network.classList.remove('panning');
    };
    network.addEventListener('pointerup', stopPan);
    network.addEventListener('pointercancel', stopPan);
    network.addEventListener('wheel', (event) => {
      event.preventDefault();
      const bounds = network.getBoundingClientRect();
      zoomAt(state.mapView.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    network.addEventListener('keydown', (event) => {
      if (event.target !== network) return;
      const directions = {
        ArrowLeft: [36, 0],
        ArrowRight: [-36, 0],
        ArrowUp: [0, 36],
        ArrowDown: [0, -36],
      };
      if (directions[event.key]) {
        event.preventDefault();
        state.mapView.x += directions[event.key][0];
        state.mapView.y += directions[event.key][1];
        applyTransform();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAt(state.mapView.scale * 1.2);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomAt(state.mapView.scale / 1.2);
      } else if (event.key === 'Home') {
        event.preventDefault();
        fitMap();
      }
    });
    applyTransform();
    section.append(title, network, renderSelectedEvidence());
    section.insertBefore(controls, network);
    return section;
  }

  function renderSelectedEvidence() {
    const item = EVIDENCE.find((entry) => entry.id === state.selected) || visibleEvidence()[0];
    if (!item) return create('div', 'case-analysis');
    const found = state.discoveries.has(item.id);
    const analysis = create('article', `case-analysis${found ? ' verified' : ' sealed'}`);
    const top = create('div', 'case-analysis-top');
    top.append(create('span', 'case-evidence-group', item.group), create('span', 'case-evidence-status', evidenceStatus(item)));
    analysis.append(
      top,
      create('h4', '', found ? item.title : 'Signal not yet observed'),
      create('p', 'case-source', `PROVENANCE // ${item.source}`),
      create('p', 'case-analysis-copy', found ? item.detail : 'This record is still outside the evidence chain. Find and inspect its source in the terminal.'),
      create('p', 'case-analysis-summary', found ? item.summary : 'No conclusion drawn. Missing artifacts remain unknown, not false.')
    );
    return analysis;
  }

  function renderEvidenceList() {
    const section = create('section', 'case-evidence-view');
    const intro = create('div', 'case-section-heading');
    intro.append(create('h3', '', 'ARTIFACT REGISTER'), create('span', '', `${discoveredEvidence().length} VERIFIED / ${visibleEvidence().length} KNOWN SOURCES`));
    const list = create('div', 'case-evidence-list');
    visibleEvidence().forEach((item) => {
      const found = state.discoveries.has(item.id);
      const button = create('button', `case-evidence-row${found ? ' found' : ''}${state.selected === item.id ? ' selected' : ''}`);
      button.type = 'button';
      button.append(
        create('span', 'case-evidence-mark', found ? '●' : '○'),
        create('span', 'case-evidence-group', item.group),
        create('span', 'case-evidence-title', found ? item.title : 'UNOBSERVED SIGNAL'),
        create('span', 'case-evidence-source', found ? item.source : 'source not inspected'),
        create('span', 'case-evidence-status', evidenceStatus(item))
      );
      button.addEventListener('click', () => { state.selected = item.id; render(); });
      list.appendChild(button);
    });
    section.append(intro, list, renderSelectedEvidence());
    return section;
  }

  function renderDecisions() {
    const section = create('section', 'case-decisions-view');
    const heading = create('div', 'case-section-heading');
    heading.append(create('h3', '', 'DECISIONS & EVENT TIMELINE'), create('span', '', 'NEWEST EVENTS FIRST'));
    const conclusionCard = create('article', `case-conclusion ${conclusion().tone}`);
    const current = conclusion();
    conclusionCard.append(
      create('span', 'case-eyebrow', 'CURRENT ASSESSMENT'),
      create('h4', '', current.title),
      create('p', '', current.text)
    );
    const timeline = create('ol', 'case-timeline');
    const entries = [...state.events].reverse();
    if (!entries.length) timeline.appendChild(create('li', 'case-empty', 'No decisions recorded yet.'));
    entries.forEach((entry) => {
      const row = create('li', `case-event ${entry.kind}`);
      row.append(
        create('time', '', `T+${timeLabel(entry.at)}`),
        create('span', 'case-event-type', entry.kind.toUpperCase()),
        create('strong', '', entry.title),
        create('span', 'case-event-detail', entry.detail)
      );
      timeline.appendChild(row);
    });
    section.append(heading, conclusionCard, timeline);
    return section;
  }

  function renderFooter() {
    const footer = create('footer', 'case-footer');
    footer.append(
      create('span', '', `SESSION AGE ${timeLabel(elapsed())}`),
      create('span', '', 'EVIDENCE IS NOT IDENTITY // VERIFY EVERY CHANNEL'),
      create('span', '', 'ESC TO RETURN')
    );
    return footer;
  }

  function refreshLiveValues() {
    if (!overlay) return;
    const values = overlay.querySelectorAll('.case-stat-value');
    if (values[2]) values[2].textContent = state.outcome
      ? state.outcome === 'trace-complete' ? 'COMPLETE' : 'CLOSED'
      : timeLabel(traceLeft());
    const age = overlay.querySelector('.case-footer span');
    if (age) age.textContent = `SESSION AGE ${timeLabel(elapsed())}`;
  }

  function render() {
    if (!overlay) return;
    const panel = overlay.querySelector('.case-panel');
    panel.replaceChildren(
      renderHeader(),
      renderStats(),
      renderTabs(),
      state.activeTab === 'network' ? renderNetwork()
        : state.activeTab === 'evidence' ? renderEvidenceList()
          : renderDecisions(),
      renderFooter()
    );
  }

  function closeBoard() {
    if (!overlay) return;
    clearInterval(refreshInterval);
    refreshInterval = 0;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    overlay = null;
    lastFocus?.focus();
    lastFocus = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBoard();
    }
  }

  function openBoard() {
    if (!state.startedAt || overlay) return;
    lastFocus = document.activeElement;
    overlay = create('div', 'case-overlay');
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) closeBoard();
    });
    const panel = create('section', 'case-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Session evidence board');
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
    render();
    panel.querySelector('.case-close')?.focus();
    refreshInterval = setInterval(refreshLiveValues, 1000);
  }

  trigger.addEventListener('click', openBoard);
  updateTrigger();

  return {
    start,
    discover,
    chooseTrust,
    markHint,
    markFailedUnlock,
    inspectGhostScript,
    verifyRelay,
    isolateWatcher,
    decide,
    setOutcome,
    setFailureOutcome,
    open: openBoard,
    snapshot: () => ({
      route: state.route,
      discoveries: [...state.discoveries],
      decisions: [...state.decisions],
      hintsUsed: state.hintsUsed,
      failedUnlocks: state.failedUnlocks,
      ghostScriptInspected: state.ghostScriptInspected,
      relayVerified: state.relayVerified,
      watcherIsolated: state.watcherIsolated,
      outcome: state.outcome,
    }),
  };
}
