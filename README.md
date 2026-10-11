# Filiposakkq sites

This repository contains separate static sites for the main personal page and project subdomains. Each site has its own asset root and Wrangler configuration so it can be deployed independently.

## Layout

```text
sites/
  main/
    public/                 # filiposakkq.dev site
    wrangler.jsonc
  fsociety00/
    public/                 # fsociety00.filiposakkq.dev site
    wrangler.jsonc
```

## Run locally

Run one of these from the repository root:

```sh
py -m http.server 8000 --directory sites/main/public
py -m http.server 8001 --directory sites/fsociety00/public
```

Then open `http://localhost:8000` for the personal page or `http://localhost:8001` for fsociety00. The game needs an HTTP server; ES modules and the mobile source viewer do not work reliably from `file://`.

## Deploy to Cloudflare Workers

Authenticate with Cloudflare, then deploy each site independently:

```sh
npx wrangler deploy --config sites/main/wrangler.jsonc
npx wrangler deploy --config sites/fsociety00/wrangler.jsonc
```

In Cloudflare, attach the main Worker to `filiposakkq.dev` and the fsociety00 Worker to `fsociety00.filiposakkq.dev`. Future projects can follow the same pattern: add a folder under `sites/`, give it its own static asset root and Wrangler config, and deploy it to its own hostname.

## fsociety00

The terminal game is a static HTML/CSS/JavaScript story and puzzle; it has no build step or server-side code.

- Fullscreen is recommended. Audio starts when you activate the opening screen; browser audio permissions require that interaction.
- Hold the lower-right skip control for 3 seconds to skip the BIOS or (after BIOS) the story intro. The trust choice and puzzle remain playable.
- The trace starts at 8 minutes and tightens to 2 minutes at the Level 01 puzzle. The trace continues while the tab is in the background. Reduced-motion preferences are respected.
- Open the CASE FILE tab or type `board` during the puzzle to inspect the evidence map, artifact provenance, trace status, choices, and session timeline.
- In the intelligence map, drag the empty board area to pan, use the zoom and fit controls to navigate, and select a node to inspect it. Keyboard users can focus the map and pan with arrow keys, zoom with `+`/`-`, or fit with `Home`; on mobile, pan horizontally to reach nodes beyond the initial view.
- Trusting Unknown opens a backchannel note and the `verify relay` action. Trusting Watcher opens a session log and the `isolate watcher` action. Inspect `ghost.sh` before running it to record a verified handoff.
- In the terminal, use `help`, `hint`, and `source map` for instructions.
- During the Level 01 puzzle, `unlock elliot` briefly shows an original hooded silhouette in the background.
- On `localhost`, use the `DEV` tab to jump to scenes and preview animations. It is a local testing convenience, not authentication.
- After GAME OVER, use the centered REBOOT SYSTEM control to restart without reloading the page.
- The story currently ends after Level 01; a sequel is not implemented.

## Overhaul documentation

A phased improvement plan (bug fixes, accessibility, audio, story engine, evidence board, animations, TRACED game over, developer panel, main site, mobile extras) is documented in [`docs/overhaul/README.md`](docs/overhaul/README.md). Each phase has its own file so it can be handed to a developer or an AI assistant independently.
