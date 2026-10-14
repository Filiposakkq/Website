// The story: segments of nodes (see ../engine.js). `tools/validate-story.mjs` validates this module and dry-runs it.
//
// Segment policy: the boot can be skipped with the hold control, the intro (the transmission up to the trust
// question) can be skipped to the choice, the rest cannot.
//
// MIGRATION (phase 3): the intro and everything after it still run as `run` nodes that call the old code in
// story.js (`host.legacy`). Each of steps 3.4 to 3.7 replaces one of them with nodes.

import { boot } from './boot.js';
import { label, run } from './dsl.js';

export const story = {
  initialState: { trusted: null },
  routes: {
    boot: { from: 'boot' },
  },
  segments: [
    { id: 'boot', skippable: 'boot', announce: false, nodes: [label('boot'), ...boot] },
    { id: 'intro', skippable: 'intro', nodes: [label('intro'), run((host) => host.legacy.intro(), 'legacy: transmission to trust question')] },
    { id: 'choice', skippable: false, nodes: [label('trust'), run((host) => host.legacy.rest(), 'legacy: trust choice, routes, level 01, ending')] },
  ],
};
