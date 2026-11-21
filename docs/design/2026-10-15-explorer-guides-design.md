# AI Factory Explorer: in-app guides: design

**Use:** the design of the in-app guides of the AI Factory Explorer.
**Before:** [Collectives mode](2026-10-14-collectives-mode-design.md) and [milestones 11 and 12](2026-10-14-collectives-m11-m12-design.md) (PR #36).

## 1. Goal and constraints

Goal (from the user): SREs find the explorer hard to understand without help.
A guide takes a user through one mode, step by step, inside the app.

Decisions (from the user):

- The guides are in-app guided tours, not Markdown pages.
- The first version has 6 short guides, one or two for each mode, with 4 to 7 steps each.
  (The time view of milestone 19 added an eighth step to "First tour", because the view is a view of the fabric.)
- Approach: show-and-tell steps, written as data (not interactive steps, not a tour library).

Success: a new user opens a guide and follows its steps.
At each step, the user sees the right view, what to look at, and the lesson.
No step is wrong or empty, now or after a later change to the app (the tests open each step).

Constraints (the same as the rest of the app):

- The build stays one offline file; no new dependency.
- The URL keeps the state; an incorrect URL value gives the default.
- With reduced motion, nothing moves.
- No name of the customer, no location, and no total GPU count of the site.
- All text is ASD-STE100; Markdown uses semantic line breaks.
- A guide adds no new claim: each number and each lesson is a fact that the app already shows.

## 2. What the user sees

### 2.1 Open a guide

- The header gets a **Guides** button, next to the help button (`?`).
- It opens a list of the guides: for each guide, its title, its goal in one sentence, and its number of steps.
- The help dialog gets one line: "New here? Start with Guides → First tour."
  No dialog opens by itself.

### 2.2 Follow a guide

- A card shows at the bottom-left of the canvas, above the bottom panel.
  It does not cover the bar, the inspector, or the bottom panel.
- The card shows:
  the guide title and "Step k of n";
  the step title;
  **Look at:** one to three sentences;
  **Lesson:** one sentence (optional).
- Buttons: **Back**, **Next** (**Finish** on the last step), and **Close**.
  The last step names the next guide, with a button that opens it.
- A step opens its view: the same state that a link gives (the configuration, the mode, the view, the selection, the trace, the failures, and the Collectives state).
- A step can highlight one part of the screen with an outline (for example the busbw limit).
  With reduced motion, the outline does not pulse.
- A step can do one page action that a link cannot do: paste a sample `nccl-tests` output into the reader, or clear the reader.

### 2.3 Explore during a guide

- The user can click, step, and change things; the card stays.
- When the view is no longer the view of the step, the card shows **Show this step again**: it opens the view of the step again and does its action again.
- The URL keeps the guide and the step: `guide=<id>.<step>` (the step counts from 1).
  "Copy link" shares the step; a reload keeps the card (the page action does not run again until "Show this step again").
- **Close** removes the card and keeps the view.

## 3. The guides

Each step names its view; the plan gives the exact link of each step.

### 3.1 First tour (`first`, Explore)

1. The fabric of 1 SU of DGX B300: the servers, the rails, the leaves, and the spines.
   Lesson: each GPU has its own NIC, on its own rail.
2. A leaf selected: the inspector shows its specs, its failure signals, and what to read.
3. One server (the node view): 8 GPUs, the NVSwitch chips, and the NICs.
   Lesson: inside a server, the GPUs talk over NVLink; between servers, over the NICs.
4. The factory overview: each network (compute, storage, management, and the others) is one block.
5. A rack face and its port map.
6. Search (`/`) for a part or a runbook; "Copy link" gives the view to another person.

### 3.2 Trace a GPU-to-GPU path (`trace`, Trace)

1. Two GPUs in one server: NVLink only.
2. The same GPU number on two servers: the same rail, through one leaf.
3. Different GPU numbers on two servers: PXN (NVLink to the GPU on the rail of the peer, then one leaf).
4. Two servers in different SUs: through a spine.
5. The hop table and the bottleneck of a path.
   Lesson: a longer path has more parts that can fail.

### 3.3 Simulate a failure (`simulate`, Simulate)

1. A NIC down: the impact panel shows what it hits.
2. A GPU with Xid 79: the alert, the owner, and the runbook.
3. A degraded cable: a slow path, not a broken one.
4. A leaf down: how far one failure reaches.
5. Repair and reset.
   Lesson: the blast radius depends on where the part is.

### 3.4 Collectives basics (`collectives`, Collectives)

1. Ring AllReduce on 1 node at step 0: the diagram, the canvas, the buffer strip, and the busbw panel.
2. The same ring at step 7: each GPU has the full sum of one chunk.
   Lesson: AllReduce is a ReduceScatter followed by an AllGather.
3. The same ring at the last step: the limit is 900 GB/s, set by NVLink.
4. 2 nodes: 800 GB/s, set by the NICs (8 channels × 100 GB/s); the Channel select is highlighted.
5. All channels on the canvas; the "Your busbw" field is highlighted.
6. A NIC down: "No path from rank 7 to rank 8".
   Lesson: one bad link stops the collective.

### 3.5 Read nccl-tests output (`reader`, Collectives)

1. A good run on 2 nodes, pasted: 84 % of the limit, with the chart and the table.
2. A slow run: below the threshold, with the link to RB-02.
3. Data errors: the link to RB-03.
4. Paste your own output: one test at a time, with the default columns.

### 3.6 Map a training job (`parallelism`, Collectives, Parallelism view)

1. TP 8 × DP 4 on 4 servers: the grid and the table.
2. The DP dimension, with a GPU selected: its group (the same GPU on each server, through one leaf).
3. Play this DP group: a ring at 100 GB/s.
4. Play a TP group: 900 GB/s on NVLink.
5. A bad plan, TP 16 × DP 2: the TP row shows "one leaf, with PXN".
   Lesson: keep TP in the NVLink domain.
6. A failed GPU: its groups, and why one lost GPU stops the job.

## 4. Data, state, and URL

- `src/guides/guides.ts` holds the guides as data:
  `Guide = { id; title; goal; steps: GuideStep[] }`;
  `GuideStep = { title; look; lesson?; hash; target?; action?; check? }`.
  - `hash`: the view of the step, in the canonical form of a link (the form that the address bar shows).
  - `target`: the test id of the part to highlight.
  - `action`: `'reader-good' | 'reader-slow' | 'reader-errors' | 'reader-clear'`.
  - `check`: `{ testid, text }`: the text that the part must show (for each number in the step text).
- The app state gets `guide: { id: string; step: number } | null`; the URL gets `guide=<id>.<step>`.
  A bad id or step gives no guide.
- `src/state/guide.ts` (a new file, so that there is no import cycle with `url.ts`):
  - `openGuide(s, id, step)`: the state of the hash of the step, with the guide;
  - `closeGuide(s)`: no guide, the same view;
  - `stepShown(s)`: true when the view of the state is the view of the step.
- The page actions run in the card (the reader text is page state: not in the URL).
  The sample generator of `nccl-tests` output moves from `tests/support/ncclSample.ts` to `src/collectives/ncclSample.ts`.
- The screen: `src/ui/GuideList.tsx` (the dialog), `src/ui/GuideCard.tsx` (the card and the highlight), the Guides button in `HeaderTools.tsx`, and the line in the help dialog.

## 5. Tests

- Unit:
  - each step hash is canonical (decode, then encode, gives the same hash), so a misspelt value cannot hide;
  - each guide has 4 to 8 steps, and each step has a title and a "Look at" text;
  - the URL of a guide round-trips; a bad value gives no guide;
  - `openGuide`, `closeGuide`, and `stepShown`.
- Browser:
  - for each guide, one test walks all steps: "Step k of n", the target is visible, the `check` text shows, and there are no console errors;
  - "Show this step again" and Close.

## 6. Docs and delivery

- `README.md` gets a "Guides" section, with "Add a guide": copy the hash from the address bar, add a `check` for each number in the text, and run the tests.
- One pull request on branch `explorer-guides`, to `main` (#36, with milestones 10 to 12, is merged).

## 7. Out of scope

- Interactive steps that wait for an action of the user (a later version can add them for some steps).
- Guides for other hardware (H100, NVL72) and for the NCCL algorithms (NVLS, Tree, AlltoAll).
- A first-visit pop-up.
