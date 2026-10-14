// The story: segments of nodes (see ../engine.js). `tools/validate-story.mjs` validates this module and dry-runs it.
//
// Segment policy: the boot can be skipped with the hold control, the intro (the transmission up to the trust
// question) can be skipped to the choice, the rest cannot.
//
// MIGRATION (phase 3): Level 01 and the ending still run as one `run` node that calls the old code in
// story.js (`host.legacy`). Steps 3.6 and 3.7 replace them with nodes.

import { boot } from './boot.js';
import { intro } from './intro.js';
import { routes } from './routes.js';
import { label } from './dsl.js';

export const story = {
  initialState: { trusted: null },
  routes: {
    boot: { from: 'boot' },
  },
  segments: [
    { id: 'boot', skippable: 'boot', announce: false, nodes: [label('boot'), ...boot] },
    { id: 'intro', skippable: 'intro', nodes: [label('intro'), ...intro] },
    { id: 'choice', skippable: false, nodes: [label('trust'), ...routes] },
  ],
};
