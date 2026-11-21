# Design notes

These documents record how the explorer was designed and where each value comes from.

| Document | What it covers |
|---|---|
| [design](design/2026-10-12-ai-factory-explorer-design.md) | The goal, the scope, the data model, the views, the tracer, the simulator, and the tests |
| [sourcing m2a](design/2026-10-12-ai-factory-explorer-m2a-sourcing.md) | DGX B300 SuperPOD, XDR InfiniBand, and Spectrum-X |
| [sourcing m2b](design/2026-10-12-ai-factory-explorer-m2b-sourcing.md) | The site design: Ethernet, storage, edge, facility, and the platform |
| [sourcing m2b-ii](design/2026-10-12-ai-factory-explorer-m2b2-sourcing.md) | The compute fabric and the NDR designs |
| [sourcing m2c](design/2026-10-13-ai-factory-explorer-m2c-sourcing.md) | Ownership, tooling, and the operational model |
| [sourcing m3](design/2026-10-13-ai-factory-explorer-m3-sourcing.md) | The path tracer |
| [sourcing m4](design/2026-10-14-ai-factory-explorer-m4-sourcing.md) | The failure simulator |
| [sourcing m10](design/2026-10-14-ai-factory-explorer-m10-sourcing.md) | Scheduling and the load model |
| [sourcing m11-m12](design/2026-10-14-ai-factory-explorer-m11-sourcing.md) | Collectives and parallelism |
| [collectives design](design/2026-10-14-collectives-mode-design.md) | The Collectives mode |
| [collectives m11-m12 design](design/2026-10-14-collectives-m11-m12-design.md) | The buffers, the busbw limit, and the nccl-tests reader |
| [guides design](design/2026-10-15-explorer-guides-design.md) | The guided tours |

The sourcing notes were written while the explorer lived in a larger training repository.
An inline reference such as `plan/requirements-map.md:29`, `modules/...`, or `sources/...` names
a document of that repository, and that document is not part of this one.
The vendor URLs, and the `handbook/`, `runbooks/`, and `handson/` references, resolve here.

The operator documents also use the codes of the training that they were written for:
`M0` to `M11` for a module, and `H00` to `H20` for a lab.
The Library rewrites each code to plain words (`content/vocabulary.ts`), so a reader of the app
never sees a code that points at a document outside this repository.
