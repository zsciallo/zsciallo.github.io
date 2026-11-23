"""Plain-assert checks for harvest.classify. Run: python tools/wiki/test_harvest.py"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harvest import SPEC_TERMS, classify, load_terms  # noqa: E402

for terms in (load_terms(), [__import__("re").compile(t, 2) for t in SPEC_TERMS]):
    c = lambda s: classify(s, terms)  # noqa: E731
    assert c("Merge run 20261110-join-source: join-source analytics") == ("merge", None)
    assert c("Merge unit U2: Waiting state UI: MATCH FOUND bar") == ("merge", None)
    assert c("Merge orch/20261110-arena-dynamic-U3: Alchemist and Bomber Arena classes") == ("merge", None)
    assert c("Merge branch 'release/chromabithia' into orch/20261119-cb-fast") == (None, "merge-noise")
    assert c("Merge orch/20261110-arena-dynamic (U1) into U3") == (None, "merge-noise")
    assert c("fix(GC): gems from dungeon kills only") == (None, "fix")
    assert c("test(GB): round 2 bench hint") == (None, "test")
    assert c("chore: bump jar") == (None, "chore")
    assert c("feat(arena): stash dupe guard") == (None, "deny-list")
    assert c("feat: close the crate exploit") == (None, "deny-list")
    assert c("Release Q: parties, Gambler's Blade, Arena 2v2v2") == ("release", None)
    assert c("Add ChromaticDaily login streak") == ("plain", None)
    assert c("ChromaticHelp: new vote page") == ("plain", None)
    assert c("feat(fly): v2 fly bank") == ("feat", None)
    assert c("tune: Heartwood respawns halved") == ("tune", None)
    assert c("feat: deploy the hub to staging") == (None, "internal-word")
    assert c("Revert \"feat: x\"") == (None, "revert")
print("test_harvest: OK")
