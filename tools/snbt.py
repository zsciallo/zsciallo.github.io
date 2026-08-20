"""Minimal SNBT reader.

DonutAuctionHouse stores an item's components as a map of component id to its
SNBT string, so every interesting field (names, enchants, lore, shulker
contents) arrives as text that still has to be parsed. This is deliberately
lenient: unknown syntax degrades to a bare string rather than raising, because
a single odd component must not cost us the whole listing.
"""

WS = " \t\r\n"
NUM_SUFFIX = "bslfdBSLFD"


class _Reader:
    def __init__(self, text):
        self.s = text
        self.i = 0

    def skip(self):
        while self.i < len(self.s) and self.s[self.i] in WS:
            self.i += 1

    def peek(self):
        return self.s[self.i] if self.i < len(self.s) else ""

    def value(self):
        self.skip()
        c = self.peek()
        if c == "{":
            return self.compound()
        if c == "[":
            return self.array()
        if c in "\"'":
            return self.quoted()
        return self.bare()

    def compound(self):
        self.i += 1  # {
        out = {}
        while True:
            self.skip()
            if self.peek() in ("}", ""):
                self.i += 1
                return out
            key = self.quoted() if self.peek() in "\"'" else self.bare_key()
            self.skip()
            if self.peek() == ":":
                self.i += 1
            out[key] = self.value()
            self.skip()
            if self.peek() == ",":
                self.i += 1

    def array(self):
        self.i += 1  # [
        # Typed arrays ([I;1,2,3], [B;...], [L;...]) carry a prefix we drop.
        save = self.i
        self.skip()
        if self.i + 1 < len(self.s) and self.s[self.i] in "IBLibl" and self.s[self.i + 1] == ";":
            self.i += 2
        else:
            self.i = save
        out = []
        while True:
            self.skip()
            if self.peek() in ("]", ""):
                self.i += 1
                return out
            out.append(self.value())
            self.skip()
            if self.peek() == ",":
                self.i += 1

    def quoted(self):
        q = self.s[self.i]
        self.i += 1
        buf = []
        while self.i < len(self.s):
            c = self.s[self.i]
            if c == "\\" and self.i + 1 < len(self.s):
                buf.append(self.s[self.i + 1])
                self.i += 2
                continue
            if c == q:
                self.i += 1
                break
            buf.append(c)
            self.i += 1
        return "".join(buf)

    def bare_key(self):
        start = self.i
        while self.i < len(self.s) and self.s[self.i] not in ":,{}[]" + WS:
            self.i += 1
        return self.s[start:self.i]

    def bare(self):
        start = self.i
        while self.i < len(self.s) and self.s[self.i] not in ",{}[]" + WS:
            self.i += 1
        raw = self.s[start:self.i]
        return _scalar(raw)


def _scalar(raw):
    if raw in ("true", "false"):
        return raw == "true"
    body = raw[:-1] if raw and raw[-1] in NUM_SUFFIX else raw
    # `0b` / `1b` is how SNBT writes booleans; keep them as ints so callers can
    # treat them numerically, which is all we ever do with them.
    try:
        return int(body)
    except ValueError:
        pass
    try:
        return float(body)
    except ValueError:
        return raw


def parse(text):
    if not isinstance(text, str):
        return text
    try:
        return _Reader(text).value()
    except Exception:
        return text
