// The story: segments of nodes (see ../engine.js). `tools/validate-story.mjs` validates this module and dry-runs it.
//
// Segment policy: the boot can be skipped with the hold control, the intro (the transmission up to the trust
// question) can be skipped to the choice, the rest cannot.
//
// MIGRATION (phase 3): the Level 01 shell (3.8) still runs as a `run` node that calls the old code (`host.legacy`).

import { boot } from './boot.js';
import { intro } from './intro.js';
import { routes } from './routes.js';
import { ghost } from './ghost.js';
import { ending } from './ending.js';
import { label } from './dsl.js';

export const story = {
  initialState: { trusted: null },
  routes: {
    boot: { from: 'boot' },
    unlock: { from: 'unlock' },
    reveal: { from: 'reveal' },
  },
  segments: [
    { id: 'boot', skippable: 'boot', announce: false, nodes: [label('boot'), ...boot] },
    { id: 'intro', skippable: 'intro', nodes: [label('intro'), ...intro] },
    { id: 'choice', skippable: false, nodes: [label('trust'), ...routes] },
    { id: 'ending', skippable: false, nodes: [...ghost, ...ending] },
  ],
};
