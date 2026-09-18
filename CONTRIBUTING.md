# Contributing to Blocklight

Use Node 22.12+; run `npm install`, then `npm run dev`.

Keep the rendering core framework-independent and city-independent. React belongs
behind its optional entry point. Applications own their data URLs and credentials.
Every new source needs attribution, date/coverage information and a reproducible
preparation script. Never check in private application data or secrets.

Run `npm run check` and `npm run test:browser` for rendering/lifecycle changes.
Add a focused test for behavior that can regress. Review both themes and narrow
screens. Document API changes in the README. Do not publish packages from a PR.

Parallel editors must use separate branches and git worktrees. The coordinating
session reviews and integrates their work.
