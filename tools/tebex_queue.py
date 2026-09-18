"""Find and re-key Tebex orders stranded by a Minecraft name change.

Tebex queues a purchase against the name the basket was created for. The plugin
holds those commands as "due" until that player logs in - so a player who
renames before collecting is never matched again and the commands sit due
forever. Nothing on the store side can prevent it: by then the payment is
through, and Mojang has already recycled the old name.

What makes it recoverable is that Tebex stores the account's *id* next to the
name. `GET /queue` returns `player.uuid` - the Mojang UUID for Java, the XUID
for a Geyser gamertag - and that never changes. Resolving it back through Mojang
gives the name the player answers to today, which is all the server needs to run
the commands by hand.

    TEBEX_SECRET=... python tools/tebex_queue.py            # list, flag renames
    python tools/tebex_queue.py --player pyexe              # commands to run
    python tools/tebex_queue.py --done 41,42                # clear once run

The secret is a *game server* key from https://creator.tebex.io/game-servers -
not the public store token the website uses. It comes from TEBEX_SECRET, or from
a `secret:` line in `local.env` beside the database block, which is gitignored.

Read-only unless `--done` is passed. That one deletes commands from the queue and
cannot be undone, so it only ever runs against ids you name.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(os.path.dirname(HERE), "local.env")

PLUGIN_API = "https://plugin.tebex.io"
# Profile by UUID. Unlike the name lookup this never 404s on a rename - the
# account outlives every name it has held, which is the whole point here.
MOJANG_PROFILE = "https://sessionserver.mojang.com/session/minecraft/profile/%s"


def secret():
    """The game server secret, from the environment or `local.env`."""
    found = os.environ.get("TEBEX_SECRET")
    if found:
        return found.strip()
    try:
        with open(ENV_FILE, encoding="utf-8") as handle:
            for line in handle:
                match = re.match(r"\s*secret\s*:\s*['\"]?([^'\"\s]+)", line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    sys.exit(
        "No Tebex secret. Set TEBEX_SECRET, or add a `secret: ...` line to "
        "local.env. Get the key from https://creator.tebex.io/game-servers "
        "(Edit on the relevant server)."
    )


def api(path, method="GET", body=None):
    """Call the plugin API. Exits with Tebex's own message on a refusal."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        PLUGIN_API + path,
        data=data,
        method=method,
        headers={
            "X-Tebex-Secret": secret(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:400]
        sys.exit("%s %s -> %s %s\n%s" % (method, path, err.code, err.reason, detail))


def current_name(uuid):
    """The name this account holds now, or None if Mojang doesn't know it.

    None is not proof of anything. A Bedrock player's id is an XUID, which Mojang
    has never heard of, and the lookup is rate limited besides - so an unresolved
    id is reported as unresolved rather than treated as a rename.
    """
    try:
        with urllib.request.urlopen(MOJANG_PROFILE % uuid, timeout=15) as response:
            return json.load(response).get("name")
    except (urllib.error.URLError, ValueError):
        return None


def due_players():
    """Every player with commands waiting, annotated with their current name."""
    body = api("/queue")
    players = []
    for player in body.get("players", []):
        uuid = player.get("uuid") or ""
        players.append({
            "id": player.get("id"),
            "queued_name": player.get("name"),
            "uuid": uuid,
            "current_name": current_name(uuid) if uuid else None,
        })
    return body.get("meta", {}), players


def renamed(player):
    """Whether the queue is waiting on a name this player no longer answers to."""
    now = player["current_name"]
    return bool(now) and now.lower() != (player["queued_name"] or "").lower()


def expand(command, player):
    """Fill a queued command's placeholders with who the player is *today*.

    `{name}` is the trap: Tebex substitutes the name stored on the order, which
    for a stranded purchase is a name that no longer resolves, so the command
    fails even when it finally runs. `{id}` is the account id and is safe either
    way - the docs say to use it in preference for exactly this reason.
    """
    name = player["current_name"] or player["queued_name"] or ""
    return (command
            .replace("{name}", name)
            .replace("{username}", name)
            .replace("{id}", player["uuid"] or ""))


def find(players, needle):
    """Match a player by current name, queued name, or id - whichever is known."""
    needle = needle.lower().lstrip(".")
    for player in players:
        candidates = [
            (player["current_name"] or "").lower(),
            (player["queued_name"] or "").lower().lstrip("."),
            (player["uuid"] or "").lower().replace("-", ""),
        ]
        if needle in candidates:
            return player
    return None


def report(meta, players):
    """List the queue, putting the stranded orders where they can't be missed."""
    if not players:
        print("Nothing due. The queue is empty.")
        return
    print("%d player(s) with commands due (next check in %ss)\n"
          % (len(players), meta.get("next_check", "?")))
    for player in players:
        flag = "  <- RENAMED" if renamed(player) else ""
        print("  id=%-6s queued as %-18s uuid=%-34s now %s%s"
              % (player["id"], player["queued_name"], player["uuid"],
                 player["current_name"] or "(unresolved)", flag))

    stuck = [p for p in players if renamed(p)]
    if stuck:
        print("\n%d order(s) will never deliver on their own - the queue is "
              "waiting for a login under a name the player has given up:" % len(stuck))
        for player in stuck:
            print("    %s is now %s   ->  --player %s"
                  % (player["queued_name"], player["current_name"], player["current_name"]))


def show(player):
    """Print the commands for one player, ready to paste into the console."""
    print("queued as %s, now %s (uuid %s)\n"
          % (player["queued_name"], player["current_name"] or "(unresolved)", player["uuid"]))

    online = api("/queue/online-commands/%s" % player["id"]).get("commands", [])
    # Offline commands come back for the whole server, not per player, so they
    # have to be filtered down to this one.
    offline = [c for c in api("/queue/offline-commands").get("commands", [])
               if (c.get("player") or {}).get("id") == player["id"]]

    for label, commands in (("online", online), ("offline", offline)):
        if not commands:
            continue
        print("%s commands (%d):" % (label, len(commands)))
        for command in commands:
            print("  # id=%s payment=%s package=%s"
                  % (command.get("id"), command.get("payment"), command.get("package")))
            print("  %s" % expand(command.get("command", ""), player))
        print()

    ids = [c.get("id") for c in online + offline]
    if ids:
        print("Run those on the server, then clear them so they don't fire again "
              "if the old name is ever reclaimed:")
        print("  python tools/tebex_queue.py --done %s"
              % ",".join(str(i) for i in ids))
    else:
        print("No commands due for this player.")


def done(raw):
    """Delete commands from the queue. Irreversible, so it confirms first."""
    ids = [int(part) for part in re.split(r"[,\s]+", raw) if part]
    print("Deleting command id(s) %s from the Tebex queue. This cannot be undone,"
          % ", ".join(str(i) for i in ids))
    print("and Tebex will not re-issue them - only do this once the commands have")
    print("actually run on the server.")
    if input("Type 'delete' to confirm: ").strip().lower() != "delete":
        sys.exit("Cancelled. Nothing was deleted.")
    api("/queue", method="DELETE", body={"ids": ids})
    print("Deleted %d command(s)." % len(ids))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--player", metavar="NAME|UUID",
                        help="show the due commands for one player, with "
                             "placeholders filled in for their current name")
    parser.add_argument("--done", metavar="IDS",
                        help="comma-separated command ids to delete once run")
    args = parser.parse_args()

    if args.done:
        done(args.done)
        return

    meta, players = due_players()
    if not args.player:
        report(meta, players)
        return

    player = find(players, args.player)
    if not player:
        sys.exit("No due commands for %r. Run without --player to see the queue."
                 % args.player)
    show(player)


if __name__ == "__main__":
    main()
