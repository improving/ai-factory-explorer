# Contributing to AI Factory Explorer

Thanks for helping. This project shows AI factory topology, and it shows only facts that a
source confirms. Two rules follow from that:

1. **Every value has a source.** A confirmed value names a public page or a document in this
   repository. A value that no source gives is `assumed`, with the reason in the note.
2. **Every view is testable.** A change to a view, a path, or a number comes with a unit test,
   and a change to a visible flow comes with a Playwright step.

## Set up

You need Node.js 24 or later.

```bash
npm ci
npm run dev        # the dev server, with hot reload of the app and the documents
```

The app reads the operator documents (`runbooks/`, `handbook/`, `handson/`) from disk at build
time, through `content/docs.ts`. An edit to a document reaches the portal on the next build.

## Check your change

```bash
npm run typecheck
npm test           # 2,100+ unit tests, including the source of every catalog fact
npm run build      # dist/index.html, one file
npm run e2e        # Playwright against the built file (run `npx playwright install chromium` once)
```

`npm test` fails when a cited line moves. If you edited a cited document, run
`npm run citations:relink`; if you added a citation, check its line and run
`npm run citations:lock`.

## Where things live

| Path | What it is |
|---|---|
| `src/catalog/` | The sourced facts: platforms, fabrics, racks, paths, failures, lifecycle |
| `src/topology/` | The graph of a factory, an SU, a rack, and a server |
| `src/views/` | The Cytoscape views and their styles |
| `src/routing/` | The path tracer and the factory paths |
| `src/simulate/` | The failure simulator and its impact model |
| `src/collectives/` | The NCCL model, the buffers, and the busbw limit |
| `src/schedule/` | The scheduling and load models |
| `src/diagnose/` | The symptom chain, the verdict, and the timeline |
| `src/ui/` | The React panels, the inspector, and the header |
| `content/` | The document allowlist, the build-time reader, and the rewrite |
| `docs/design/` | The design and the sourcing notes of each milestone |

## Add a fact

1. Find the public source, and the exact line or table that gives the value.
2. Add the value with `confirmed(value, formula, 'source')`, or with `assumed(value, note)`.
3. Run `npm test`; `tests/sources.test.ts` checks that the source resolves.

## Add a document to the Library

1. Put the file under `runbooks/`, `handbook/`, or `handson/`.
2. Add one entry to `content/docs.ts` with an id, a path, a reader-facing title, and a group.
3. Run `npx vitest run tests/docs.test.ts`. It fails on a missing path, a course code in a
   title, or a link that points at nothing.

## Add a guide

1. Open the view in the app, and copy the text after `#` from the address bar.
2. Add the step to `src/guides/guides.ts` with its `hash`, its `look`, and its `lesson`.
3. Run `npx vitest run tests/guide.test.ts`, then `npm run build && npx playwright test -g guide`.

## Commits and pull requests

- Keep each commit to one logical change.
- Write the commit message in the imperative mood, and say why the change is needed.
- Do not commit secrets, tokens, or a `.env` file.
- A pull request fills the template: what changed, why, and how you checked it.

## License

By contributing, you agree that your contribution is licensed under the Apache License,
Version 2.0 (see `LICENSE`).
