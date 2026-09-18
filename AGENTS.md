# Blocklight

TypeScript mapping library in `packages/blocklight`; Vite playground in `playground`.

- Keep core independent of React, Next.js, NYC field names and application APIs.
- Never silently fetch from Prospect, private databases or commercial tile providers.
- Retain source provenance and terms for bundled public data. Code is MIT; source
  data has its own terms. Do not include credentials or personal records.
- 311 values are request counts, not confirmed violations or building-quality scores.
- Match a request to at most one footprint; retain unmatched totals. Never duplicate
  a lot-level request across multiple buildings.
- Run `npm run check`; use `npm run test:browser` for rendering/lifecycle changes.
- Parallel editors work on separate branches in separate git worktrees.
- Do not publish, push, or create a public remote unless the user requests it.
