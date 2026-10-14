// The story: segments of nodes (see ../engine.js). `tools/validate-story.mjs` validates this module and dry-runs it.
//
// Segment policy: the boot can be skipped with the hold control, the intro (the transmission up to the trust
// question) can be skipped to the choice, the rest cannot.
//
// MIGRATION (phase 3): the Level 01 shell (3.8) and the end of the ending (3.7) still run as `run` nodes that call
// the old code (`host.legacy`).

import { boot } from './boot.js';
import { intro } from './intro.js';
import { routes } from './routes.js';
import { ghost } from './ghost.js';
import { label, run } from './dsl.js';

export const story = {
  initialState: { trusted: null },
  routes: {
    boot: { from: 'boot' },
    unlock: { from: 'unlock' },
  },
  segments: [
    { id: 'boot', skippable: 'boot', announce: false, nodes: [label('boot'), ...boot] },
    { id: 'intro', skippable: 'intro', nodes: [label('intro'), ...intro] },
    { id: 'choice', skippable: false, nodes: [label('trust'), ...routes] },
    { id: 'ending', skippable: false, nodes: [...ghost, run((host, flow) => host.legacy.ending(flow.state.trusted), 'legacy: the erased list to the identity reveal (3.7)')] },
  ],
};
