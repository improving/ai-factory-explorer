#!/usr/bin/env python3
"""Mechanical audit of the runbook catalog. Run from anywhere: python3 audit.py [--ledger]

Checks: front matter, the 11 runbook-template sections in order (Trigger .. Customer message,
per handbook/runbook-catalog.md) plus the two appendices, first-5-minutes <=3 commands, every
code span that looks like a command carries a tag, C/E/X tags resolve to the allowed sources,
GAP rows carry no command text, mitigation/repair tables have 6 columns and no empty cells,
layer order in the decision table, signature coverage vs the inventory.

The CLI gist and the triage guide are in handbook/. The NCCL env-var gist, the vendor-command
list ([X:nn] rows), and the issue inventory are optional: put them in runbooks/_sources/ to
enable the checks that need them; without them, those checks are skipped with a notice.
"""
import re, sys, pathlib, collections

RB = pathlib.Path(__file__).resolve().parent.parent
ROOT = RB.parent
SOURCES = RB / "_sources"


def optional(name):
    p = SOURCES / name
    return p.read_text() if p.exists() else None


GIST = (ROOT / "handbook/cli_utilities_layered_gist.md").read_text()
ENVG = optional("nccl_env_vars_gist.md")
EXT = optional("external-command-sources.md")
GUIDE_N = None
INV = optional("issue-inventory.md")
GUIDE = (ROOT / "handbook/b300-nvl72-forum-triage-guide.md").read_text()

HEADINGS = ["1. Trigger", "2. Impact and blast radius", "3. First 5 minutes", "4. Hardware variants",
            "5. Decision table", "6. Mitigation", "7. Repair", "8. Evidence to collect",
            "9. Return to service", "10. Escalation", "11. Customer message",
            "Appendix A — Gaps & open questions", "Appendix B — Source trace"]
TAG = re.compile(r"`\[(C:[^\]]+|E|R|X:\d+|GAP:G\d+)\]`|\[(X:\d+|GAP:G\d+|C:[^\]]+|E|R)\]")
SPAN = re.compile(r"`([^`]+)`")
CMD_HINT = re.compile(r"^(nvidia|dcgmi|ib|perf|ethtool|systemctl|journalctl|dmesg|ipmitool|lspci|lstopo|nvme|chronyc|"
                      r"kubectl|scontrol|sinfo|squeue|sacct|nv |ufm|vms|vastpy|supportbundle|fio|iostat|biolatency|mount|nfsstat|"
                      r"mdtest|elbencho|vperf|py-spy|ncclras|NCCL|mpirun|ulimit|df |grep|cat |ls |ip |curl|amtool|racadm|"
                      r"echo|modprobe|mknod|mkdir|rm |flint|doca|/opt|uname|dkms|ovs|devlink|gdscheck|minicom|bfb|cmsh|dpsctl|"
                      r"compute-sanitizer|nvcc|ldd|ldconfig|sysctl|rping|rdma|show_gids|nvbandwidth|nvloom|simpleP2P|setpci|"
                      r"CUDA_|OMPI|PMIX|UCX|lscpu|numactl|etcdctl|radm|rctl|rcollect|reboot|Reboot|dpkg|rpm|apt|sudo)")

PH = r"<[A-Za-z0-9_:./ -]{1,30}>"
GISTN = re.sub(PH, "<>", GIST.replace("\\|", "|"))
# Reviewed variants of gist commands (same tool and verb as a gist row; only filters/placeholders differ)
ACCEPTED_PREFIX = (
    "dmesg -T | grep -iE", "kubectl cordon", "kubectl uncordon", "kubectl drain", "scontrol update", "nv set",
    "kubectl describe backup", "fio --ioengine=libaio --direct=1", "vastpy-cli get views", "ufm_ha_cluster failover",
    "mpirun -n <n> nvloom", "nvidia-smi -q -d ROW_REMAPPER", "ncclras CONTROL PROFILER_MASK", "NCCL_DEBUG*",
    "NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET",
)

def gist_has(cmd):
    c = re.sub(PH, "<>", cmd.replace("\\|", "|")).strip()
    tok = c.split()[0] if c.split() else c
    if tok.startswith(("NCCL_", "CUDA_", "OMPI_", "PMIX_", "UCX_")):
        name = tok.split("=")[0]
        return name in GIST or ENVG is None or name in ENVG
    if c in GISTN or any(c.startswith(p) for p in ACCEPTED_PREFIX):
        return True
    return False

def main():
    global GUIDE_N
    GUIDE_N = re.sub(r"\s+", " ", (GUIDE + " " + GIST).replace("\\|", "|"))
    errs, ledger = [], collections.defaultdict(lambda: [None, set()])
    inv_sigs = set(int(x) for x in re.findall(r"^\| (\d+) \|", INV, re.M)) if INV else set()
    for name, src in (("nccl_env_vars_gist.md", ENVG), ("external-command-sources.md", EXT), ("issue-inventory.md", INV)):
        if src is None:
            print(f"NOTICE: _sources/{name} not found; the checks that need it are skipped")
    claimed = collections.defaultdict(list)
    for f in sorted(RB.glob("RB-*.md")):
        t = f.read_text(); name = f.name[:5]
        fm = re.match(r"---\n(.*?)\n---", t, re.S)
        if not fm: errs.append(f"{name}: no front matter"); continue
        sigs = re.search(r"signatures: \[([^\]]*)\]", fm.group(1))
        sigs = [int(x) for x in sigs.group(1).split(",")] if sigs else []
        for s in sigs: claimed[s].append(name)
        h2 = re.findall(r"^## (.+)$", t, re.M)
        pos = [next((i for i, x in enumerate(h2) if x.startswith(h)), -1) for h in HEADINGS]
        if -1 in pos or pos != sorted(pos): errs.append(f"{name}: headings missing/out of order {pos}")
        qt = re.search(r"## 3\. First 5 minutes\n(.*?)\n## ", t, re.S)
        n = len(re.findall(r"^\d+\. ", qt.group(1), re.M)) if qt else 0
        if n > 3 or n == 0: errs.append(f"{name}: first 5 minutes has {n} commands")
        if "Every action below needs a ticket ID" not in t: errs.append(f"{name}: ticket banner missing")
        rem = re.search(r"## 6\. Mitigation\n(.*?)\n## 8\. Evidence to collect", t, re.S).group(1)
        for line in rem.splitlines():
            if line.startswith("| A"):
                cells = [c.strip() for c in re.split(r"(?<!\\)\|", line)[1:-1]]
                if len(cells) != 6 or any(not c for c in cells): errs.append(f"{name}: bad remediation row {cells[:1]}")
                if "GAP:" in cells[1] and "(no command text" not in cells[2] and "no state change" not in cells[2]:
                    errs.append(f"{name}: GAP row has command text: {cells[0]}")
        # layer order in decision table
        dt = re.search(r"## 5\. Decision table\n(.*?)\n## 6\. Mitigation", t, re.S).group(1)
        first = dt.split("### Scenario")[0]
        layers = []
        for line in first.splitlines():
            m = re.match(r"\| \d+ \| L(\d)", line)
            if m: layers.append(int(m.group(1)))
        if layers != sorted(layers): errs.append(f"{name}: decision-tree layers not non-decreasing {layers}")
        # diagnostics layer order (rows like L1/L5 count as the highest layer in the cell)
        dg = re.search(r"### Read-only diagnostics.*?\n(.*?)\n### Differential", t, re.S).group(1)
        dl = []
        for line in dg.splitlines():
            m = re.match(r"\| ((?:L\d(?:/L?\d)*|Dell)) \|", line)
            if m and m.group(1) != "Dell":
                dl.append(max(int(x) for x in re.findall(r"\d", m.group(1))))
        if dl != sorted(dl): errs.append(f"{name}: read-only diagnostics layers not non-decreasing {dl}")
        # verbatim signature spans must exist in the guide
        sg = t.split("## 1. Trigger")[1].split("\n## ")[0]
        for line in sg.splitlines():
            m = re.match(r"\| (\d+) \| (.*?) \| ", line)
            if not m: continue
            for sp in SPAN.findall(m.group(2)):
                key = re.sub(r"\s+", " ", sp.replace("\\|", "|")).strip()
                if key not in GUIDE_N and key.rstrip(".") not in GUIDE_N and len(key) > 6:
                    errs.append(f"{name}: signature span not verbatim in guide: {key[:70]}")
        # tags
        sec = sub = None
        for line in t.split("## 1. Trigger")[1].splitlines():
            if line.startswith("## "): sec, sub = line[3:].split(" (")[0], None
            elif line.startswith("### "): sub = line[4:].split(" (")[0]
            if line.startswith("- "): continue
            if re.match(r"^\| (#|---|ID)", line) or "Signature (verbatim)" in line or "Symptom (no verbatim" in line: continue
            if sec in (None, "1. Trigger", "4. Hardware variants", "Appendix B — Source trace"): continue
            tags = [m.group(1) for m in re.finditer(r"\[((?:C:|X:|GAP:)[^\]]+|E|R)\]", line)]
            spans = [m.group(1) for m in SPAN.finditer(line) if not m.group(1).startswith("[") and CMD_HINT.match(m.group(1))]
            for c in spans:
                ok = [tg for tg in tags if _check(errs, name, c, tg, quiet=True)]
                if ok:
                    ledger[c][1].add((ok[0], name)); ledger[c][0] = ok[0]
                elif tags:
                    errs.append(f"{name}: tag(s) {tags} do not validate: {c[:70]}")
                elif sub != "Differential diagnosis" and sec in ("5. Decision table", "6. Mitigation", "7. Repair"):
                    if not (gist_has(c) or _in_ledger_like(c)): errs.append(f"{name}: untagged command in {sec}/{sub}: {c[:70]}")
                    else: errs.append(f"{name}: untagged (resolvable) command in {sec}/{sub}: {c[:70]}")
                elif not (gist_has(c) or _in_ledger_like(c)):
                    errs.append(f"{name}: untagged unresolvable command in {sec}: {c[:70]}")
    for s in sorted(inv_sigs):
        if s not in claimed and s != 102: errs.append(f"signature {s} unmapped (expected only 94/102 style exceptions)")
    for s, v in claimed.items():
        if len(v) > 1: errs.append(f"signature {s} claimed by {v}")
    for e in errs: print("FINDING:", e)
    print(f"\n{len(errs)} findings; {len(ledger)} distinct tagged commands")
    if "--ledger" in sys.argv:
        out = ["# Command ledger\n", "Generated by `audit.py --ledger`. `command | tag | used in`.\n", "| command | tag | used in |", "|---|---|---|"]
        agg = collections.defaultdict(lambda: [set(), set()])
        for c, (tg, uses) in ledger.items():
            for u in uses: agg[c][0].add(u[0]); agg[c][1].add(u[1])
        for c in sorted(agg):
            out.append(f"| `{c}` | {', '.join(sorted(agg[c][0]))} | {', '.join(sorted(agg[c][1]))} |")
        (RB / "_ledger/command-ledger.md").write_text("\n".join(out) + "\n")

def _in_ledger_like(c):
    tok = re.sub(r"<[^>]*>", "", c).split()[0]
    return (EXT is None or tok in EXT) or (ENVG is None or tok in ENVG)

def _check(errs, name, c, tg, quiet=False):
    if tg.startswith("C:prose-state") or tg.startswith("GAP:") or tg == "R":
        return True
    if tg.startswith("C:"):
        return gist_has(c)
    if tg == "E":
        v = re.sub(r"<[^>]*>", "", c).split("=")[0].split()[-1] if "=" in c else c
        return v in GIST or (v in ENVG if ENVG is not None else v.startswith("NCCL_"))
    if tg.startswith("X:"):
        return EXT is None or f"| X{tg[2:]} |" in EXT
    return False

if __name__ == "__main__":
    main()
