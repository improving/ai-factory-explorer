# IB01 — Verify the environment

## Objective

Install and verify every tool this module needs.
Understand what each tool does before you touch a simulated fabric.

## Concepts learned

- What each package (`ibsim-utils`, `opensm`, `infiniband-diags`, `rdma-core`,
  `libibmad`/`libibumad`) provides.
- Why this all runs in a plain Linux container, on any host OS, with no kernel IB stack involved.
  See [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-where-ibsim-fits-the-whole-point-of-this-module).

## Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine (Linux), running.
  Verify with `docker info`.
- This checkout of `13-ibsim-real-fabric/`.

## Topology

None yet — this lab only builds and inspects the toolchain.

## Exact commands

Build the image (a plain `ubuntu:24.04` with the IB tooling installed —
see [`setup/Dockerfile`](../setup/Dockerfile)):

```bash
cd 13-ibsim-real-fabric
./setup/install.sh
```

Verify everything:

```bash
./setup/verify.sh
```

Which internally runs (and you can run yourself against the image name `ibsim-lab:latest`):

```bash
docker run --rm ibsim-lab:latest bash -c "which ibsim ibsim-run ibnetdiscover opensm ibroute ibtracert iblinkinfo ibstat ibstatus ibportstate ibqueryerrors ibping"
docker run --rm ibsim-lab:latest ibsim --help
docker run --rm ibsim-lab:latest bash -c "ibnetdiscover --help 2>&1 | head -5"
docker run --rm ibsim-lab:latest opensm --version
docker run --rm ibsim-lab:latest bash -c "ldconfig -p | grep -E 'ibmad|ibumad'"
```

## Expected output

*Example output.
Exact package build numbers may differ slightly by Ubuntu point release.
The binary names and general shape will not change.*

```
### which: binaries on PATH
/usr/bin/ibsim
/usr/bin/ibsim-run
/usr/sbin/ibnetdiscover
/usr/sbin/opensm
/usr/sbin/ibroute
/usr/sbin/ibtracert
/usr/sbin/iblinkinfo
/usr/sbin/ibstat
/usr/sbin/ibstatus
/usr/sbin/ibportstate
/usr/sbin/ibqueryerrors
/usr/sbin/ibping

### ibsim --help
Usage: ibsim [-f outfile -d(ebug) -p(arse_debug) -s(tart) -v(erbose) -I(gnore_duplicate) -N nodes -S switches -P ports -L linearcap -M mcastcap -r(emote_mode) -l(isten_to_port) <port> -n(o-console)] <netfile>
ibsim 0.10

### ibnetdiscover --help (first 5 lines)
Usage: ibnetdiscover [options] [topology-file]
Options:
  --full, -f              show full information (ports' speed and width, vlcap)

### opensm --version
-------------------------------------------------
OpenSM 3.3.23
Command Line Arguments:

### ldconfig -p | grep -E 'ibmad|ibumad'
	libibumad.so.3 (libc6,AArch64) => /lib/aarch64-linux-gnu/libibumad.so.3
	libibmad.so.5 (libc6,AArch64) => /lib/aarch64-linux-gnu/libibmad.so.5
```

(On an x86_64 host, the last two lines say `x86-64` instead of `AArch64`,
and the path is `/lib/x86_64-linux-gnu/...`.
These are the same libraries, with a different architecture triplet.)

## What each component does

| Package | Binaries you use | What it is |
|---|---|---|
| `ibsim-utils` | `ibsim`, `ibsim-run` | The fabric simulator itself, and a helper script that wraps the `LD_PRELOAD` command |
| `opensm` | `opensm` | The Subnet Manager. It must run for a fabric to work, real or simulated |
| `infiniband-diags` | `ibnetdiscover`, `ibroute`, `ibtracert`, `iblinkinfo`, `ibstat`, `ibstatus`, `ibportstate`, `ibqueryerrors`, `ibping`, ... | The diagnostic toolbox every lab after this one uses |
| `rdma-core` | (libraries, not binaries you call directly) | Provides `libibverbs` and the runtime that `infiniband-diags` and `opensm` link against |
| `libibmad5` / `libibumad3` | (shared libraries) | `libibmad`: MAD construction and parsing. `libibumad`: the userspace-to-kernel UMAD transport that `ibsim`'s `libumad2sim.so` intercepts |

## What happened?

1. `docker build` layered a plain Ubuntu 24.04 image with these packages.
   `apt` resolved and installed them from the `universe`/`main` archive.
   Nothing here is specific to InfiniBand in the container runtime; it is an ordinary package install.
2. `which` found each binary on `$PATH`.
   This proves the packages shipped executables, not only documentation.
3. `ibsim --help`, `ibnetdiscover --help`, and `opensm --version` all ran and exited.
   This proves each binary links correctly and does not crash on startup (a real risk with `libibmad`/`libibumad` ABI mismatches if you mix package sources).
4. `ldconfig -p` read the shared-library cache and found `libibumad`/`libibmad` registered.
   In IB02, `LD_PRELOAD=libumad2sim.so` sits in front of these libraries.

## Verification checklist

- [ ] `docker info` succeeds (daemon reachable)
- [ ] `ibsim-lab:latest` image built without errors
- [ ] All 12 binaries found by `which`
- [ ] `ibsim --help`, `ibnetdiscover --help`, `opensm --version` all produce output
- [ ] `ldconfig -p` shows both `libibumad.so.3` and `libibmad.so.5`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker: command not found` | Docker not installed | Install Docker Desktop / Docker Engine, see `setup/install.sh`'s error message |
| `Cannot connect to the Docker daemon` | Daemon not running | Start Docker Desktop, or `sudo systemctl start docker` on Linux |
| `E: Unable to locate package ibsim` | You (or an AI assistant!) typed `ibsim` instead of `ibsim-utils` as the apt package name | Use `ibsim-utils`. The binary is `ibsim`, the package is not |
| `which` finds nothing for a binary | The build did not run, or ran against a stale image tag | Re-run `./setup/install.sh`. Confirm `docker images ibsim-lab` shows a recent `CREATED` time |

## Cleanup

Nothing to clean up yet.
No container was started; only an image was built.
To remove the image, run: `docker rmi ibsim-lab:latest`.

## Optional challenge

Build the from-source path instead (see the bottom of `setup/install.sh`'s output) inside a throwaway container.
Diff the `ibsim --help` banner's version string against the packaged one.
Check whether they show the same `ibsim 0.10`.
They should, unless upstream released a newer version since this module was written.
Check `git log -1` in your clone against this module's authoring date.

## Interview questions

*(asked again, consolidated, after IB04)*

1. **Beginner:** What is the difference between the `ibsim` package name and the `ibsim-utils` apt package name,
   and why does that confuse people?
2. **Intermediate:** Why does a successful `opensm --version` tell you nothing about whether OpenSM can manage a fabric yet?
3. **Senior SRE:** If `ibnetdiscover --help` works but `ibnetdiscover` (no args,
   against a real or simulated fabric) hangs, what is the first thing you would check,
   and why would `--help` not catch it?
