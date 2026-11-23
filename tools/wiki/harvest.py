"""Harvest player-facing change candidates from the game repos' git history (read-only).

Usage: python tools/wiki/harvest.py [--since YYYY-MM-DD] [--out PATH]
Writes a TSV (date, repo, sha, kind, subject) sorted by date and prints counts per repo and per drop reason.
"""
import argparse
import collections
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path("F:/Work/minecraft")
OUT = ROOT / ".orch/runs/20261122-wiki/harvest.tsv"
DENY = pathlib.Path(__file__).with_name("deny.json")
REPOS = ["mc-server", "mc-kit", "chromatic-arena", "chromatic-dungeons", "chromatic-loot", "chromatic-crafting",
         "chromatic-help", "chromatic-auction-house", "chromatic-flight", "chromabound", "chromatic-crates",
         "chromatic-daily"]
# Starting terms from the run spec, used until U1's deny.json exists.
SPEC_TERMS = [r"\bodds\b", r"\bweight", r"\bpity\b", r"drop rate", r"\d+(\.\d+)?\s?%\s?chance", r"/caa\b",
              r"/chelp\b", r"/lp\b", r"/grant\b", r"\bpermission node", r"chromatic\.[a-z]+\.[a-z]+", r"\bgrim\b",
              r"anticheat", r"anti-dupe", r"\bdupe\b", r"\bexploit", r"\bseal\b", r"\bops?\.json", r"\brcon\b",
              r"\bpayout", r"\bprize pool"]
INTERNAL = re.compile(r"\b(deploy\w*|staging|gates?|harness|coverage|scenarios?|e2e|lanes?|worktrees?)\b", re.I)
DROP_PREFIXES = {"fix", "test", "chore", "docs", "refactor", "ci", "build"}
KEEP_PREFIXES = {"feat", "tune", "brand", "gameupdate"}
PREFIX = re.compile(r"^([A-Za-z]+)(\([^)]*\))?!?:")
MERGE = re.compile(r"^Merge (run|orch/|unit)\s?\S+(\s*\([^)]*\))?:\s")
RELEASE = re.compile(r"^Release [A-Z]\d*\b[^:]*:")


def load_terms():
    terms = json.loads(DENY.read_text(encoding="utf-8"))["terms"] if DENY.exists() else SPEC_TERMS
    return [re.compile(t, re.I) for t in terms]


def classify(subject, terms):
    """Return (kind, None) for a kept candidate or (None, drop_reason)."""
    if subject.startswith("Revert"):
        return None, "revert"
    if subject.lower().startswith("merge"):
        if not MERGE.match(subject):
            return None, "merge-noise"
        kind = "merge"
    elif RELEASE.match(subject):
        kind = "release"
    else:
        m = PREFIX.match(subject)
        p = m.group(1).lower() if m else None
        if p in DROP_PREFIXES:
            return None, p
        # "ChromaticHelp: ..." or "K4: ..." style labels are old unprefixed commits, not conventional types.
        kind = p if p in KEEP_PREFIXES else "plain"
    if any(t.search(subject) for t in terms):
        return None, "deny-list"
    if INTERNAL.search(subject):
        return None, "internal-word"
    return kind, None


def git(repo, *args):
    return subprocess.run(["git", "-C", str(ROOT / repo), *args], capture_output=True, text=True,
                          encoding="utf-8").stdout.strip()


def pick_ref(repo):
    for ref in ("origin/main", "main"):
        if git(repo, "rev-parse", "--verify", "-q", ref):
            return ref
    return git(repo, "branch", "--show-current")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="YYYY-MM-DD, only commits on or after this date")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    terms = load_terms()
    rows, kept, dropped = [], collections.Counter(), collections.Counter()
    for repo in REPOS:
        ref = pick_ref(repo)
        print(f"{repo}: {ref}")
        args = ["log", ref, "--format=%ad%x09%h%x09%s", "--date=short"] + ([f"--since={a.since}"] if a.since else [])
        for line in git(repo, *args).splitlines():
            date, sha, subject = line.split("\t", 2)
            kind, reason = classify(subject, terms)
            if kind:
                rows.append((date, repo, sha, kind, subject))
                kept[repo] += 1
            else:
                dropped[reason] += 1
    rows.sort()
    out = pathlib.Path(a.out)
    out.write_text("date\trepo\tsha\tkind\tsubject\n" + "".join("\t".join(r) + "\n" for r in rows), encoding="utf-8")
    print(f"\nkept {len(rows)} -> {out}")
    for repo, n in kept.most_common():
        print(f"  {repo}: {n}")
    print(f"dropped {sum(dropped.values())}")
    for reason, n in dropped.most_common():
        print(f"  {reason}: {n}")


if __name__ == "__main__":
    main()
