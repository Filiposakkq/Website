# Deploying to Cloudflare

Written 2026-10-13. Everything about how the two sites are built and deployed in one place. Items marked **owner to confirm** are settings in the Cloudflare dashboard that are not visible from the repository.

## The two Workers

| Site folder | Worker name (dashboard AND `wrangler.jsonc` `"name"`) | Hostname |
|---|---|---|
| `sites/main` | `filiposakkq` | `filiposakkq.dev` |
| `sites/fsociety00` | `fsociety` | `fsociety.filiposakkq.dev` |

Both are static sites served as Workers static assets (`"assets": { "directory": "./public" }`). There is no build step.

## `wrangler.jsonc` rules

```jsonc
{
  "name": "fsociety",            // must equal the Worker name in the dashboard
  "compatibility_date": "2026-10-01",
  "previews": {},                // required by preview builds, may be empty
  "assets": { "directory": "./public" }
}
```

- **`name` must match the dashboard.** If it does not, Workers Builds fail. Never rename a Worker in the config only: a rename creates a new Worker with a new URL.
- **`previews: {}` is required.** Preview builds run `npx wrangler preview`, which fails with `Your Wrangler configuration is missing a previews block` without it. Cloudflare's docs say the block may be empty and that top-level settings stay production settings; they do not state explicitly how an empty block behaves with `wrangler deploy`, so watch the first production build after any change here.

## Builds

- **Production:** a push (merge) to `main` builds and deploys both Workers. **Never push to `main` directly**; merge a reviewed pull request ("Squash and merge", see `merging.md`).
- **Preview:** each pull request branch builds a preview URL. The owner tests the game there, on a phone and on desktop (`owner-test-checklist.md`), before merging.
- **Root directory** of each Cloudflare project: `sites/main` and `sites/fsociety00` (**owner to confirm**). `tools/` and `docs/` are not deployed; Wrangler only publishes `sites/*/public`.
- **Build watch paths** (so a docs-only change does not redeploy everything): **owner to confirm** what is set.

## Manual deploy (rarely needed)

```sh
npx wrangler deploy --config sites/main/wrangler.jsonc
npx wrangler deploy --config sites/fsociety00/wrangler.jsonc
```

## When a build fails

1. Open the Worker in Cloudflare, then Builds, open the failed build and read the log. The first `ERROR` line is usually the cause.
2. Known causes so far:
   - Worker name mismatch (`name` differs from the dashboard name).
   - Missing `previews` block (message quoted above).
3. Fix on the PR branch, push, and let the preview rebuild. Do not change dashboard names to fit a wrong config.

## Rollback

See "Rollback" in the master README: Cloudflare dashboard "roll back to previous deployment", or the GitHub "Revert" button on the merged PR. The git tag `pre-overhaul` marks the state before the overhaul began (`git checkout pre-overhaul` to look at it).
