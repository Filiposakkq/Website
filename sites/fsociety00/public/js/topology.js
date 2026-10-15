// The trace path as a text map (phase 4.4, "extra 8"): you -> CASE.hops relays -> the target. One model, two views:
//   - `topologyLines(secsLeft)`: a static snapshot for the terminal (`trace --status`), narrow enough for a phone;
//   - `createTopologyView(container)`: prebuilt elements for the board (phase 4.5), updated once per trace tick by
//     toggling a class and a text node: no per-frame rebuilds, no animation (so reduced motion needs nothing special).
// The path lights up node by node as the trace window `CASE.traceWindow` runs out. Only fictional documentation
// addresses are shown (story-data/hacking.js); nothing here reads or shows a real IP, location or identity.

import { CASE } from './story-data/constants.js';
import { TOPOLOGY_NODES } from './story-data/hacking.js';
import { pad2 } from './util.js';

const BAR_WIDTH = 16;

/** How far the trace has come with `secsLeft` seconds left: progress 0..1 and the number of nodes it reached (0..hops+1). */
export function topologyState(secsLeft) {
  const total = CASE.hops + 1;
  const progress = Math.min(1, Math.max(0, 1 - secsLeft / CASE.traceWindow));
  const reached = Math.min(total, Math.floor(progress * total));
  return {
    progress,
    percent: Math.round(progress * 100),
    reached,
    total,
    // The relays (not the target) the trace has passed, and the hops it still needs to reach the target.
    relaysReached: Math.min(CASE.hops, reached),
    hopsLeft: total - reached,
  };
}

const bar = (progress) => {
  const filled = Math.round(progress * BAR_WIDTH);
  return `[${'#'.repeat(filled)}${'.'.repeat(BAR_WIDTH - filled)}]`;
};

/** One node row: `[x] relay 1  198.51.100.12` (x = the trace has reached it; you are always reached). */
const rowText = (node, index, reached) => `[${index === 0 || index <= reached ? 'x' : ' '}] ${node.label.padEnd(7)} ${node.address}`;

/** The snapshot `trace --status` prints: the bar, the node list, the hops left. Every line is at most 34 characters. */
export function topologyLines(secsLeft) {
  const state = topologyState(secsLeft);
  return [
    `trace ${bar(state.progress)} ${state.percent}%`,
    ...TOPOLOGY_NODES.map((node, index) => rowText(node, index, state.reached)),
    `hops remaining: ${state.hopsLeft}`,
  ];
}

/**
 * The live view for the board: builds the elements once inside `container` and returns `{ update(secsLeft), state }`.
 * Reached nodes get the class `is-reached`; the markup is a list so a screen reader reads the path in order.
 */
export function createTopologyView(container) {
  const doc = container.ownerDocument;
  const list = doc.createElement('ol');
  list.className = 'topo-list';
  const rows = TOPOLOGY_NODES.map((node, index) => {
    const row = doc.createElement('li');
    row.className = 'topo-node';
    const mark = doc.createElement('span');
    mark.className = 'topo-mark';
    const label = doc.createElement('span');
    label.className = 'topo-label';
    label.textContent = `${node.label}  ${node.address}`;
    row.append(mark, label);
    list.append(row);
    return { row, mark, index };
  });
  const meter = doc.createElement('p');
  meter.className = 'topo-meter';
  container.append(list, meter);
  let last = null;
  return {
    update(secsLeft) {
      const state = topologyState(secsLeft);
      const key = `${state.reached}:${state.percent}`;
      if (key === last) return state;
      last = key;
      for (const { row, mark, index } of rows) {
        const reached = index === 0 || index <= state.reached;
        row.classList.toggle('is-reached', reached);
        mark.textContent = reached ? '[x]' : '[ ]';
      }
      meter.textContent = `trace ${bar(state.progress)} ${pad2(state.percent)}%  hops remaining: ${state.hopsLeft}`;
      return state;
    },
  };
}
