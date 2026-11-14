"""Pure parsing and normalization helpers for the ProtoMacro food pipeline."""

from __future__ import annotations

import re
from typing import Any

ENERGY_RE = re.compile(r"\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)\s*([0-9]+(?:\.[0-9]+)?)?")

FOREIGN_BIBLIO_CODES = (
    "DK7",
    "UK6",
    "US25",
    "IND",
    "EAS",
    "AFR",
    "USDA",
    "McCance",
    "TH(",
    "TH ",
    "ADB",
    "BID",
)


def parse_fctb_energy(raw: Any) -> tuple[float, float | None]:
    """Parse FCTB energy formatted as '(kcal)kJ' into (kcal, kj)."""
    if raw is None:
        raise ValueError("Missing energy value")
    s = str(raw).strip()
    m = ENERGY_RE.search(s)
    if not m:
        raise ValueError(f"Unrecognized FCTB energy format: {raw!r}")
    kcal = float(m.group(1))
    kj = float(m.group(2)) if m.group(2) else None
    return kcal, kj


def parse_fctb_cell(raw: Any, *, bracket_flag: str = "bracketed_value") -> tuple[float | None, list[str]]:
    """Parse an FCTB nutrient cell, handling 'tr', '-', '[val]', and blanks."""
    flags: list[str] = []
    if raw is None:
        return None, flags
    if isinstance(raw, (int, float)):
        return float(raw), flags
    s = str(raw).strip()
    if s == "" or s == "-":
        return None, flags
    if s.lower() == "tr":
        return 0.0, ["trace_to_zero"]
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        flags.append(bracket_flag)
        if inner.lower() == "tr":
            flags.append("trace_to_zero")
            return 0.0, flags
        if inner in ("", "-"):
            return None, flags
        return float(inner), flags
    return float(s), flags


def infer_state(name: str, biblio: str = "") -> str:
    """Infer 'raw' | 'cooked' | 'prepared' from English food name and biblio."""
    low = name.lower()
    if "raw" in low or "unprepared" in low or ", dry" in low or "dried" in low:
        return "raw"
    if (
        "recipe calculation" in biblio.lower()
        or "*" in name
        or any(
            kw in low
            for kw in (
                "boiled",
                "cooked",
                "fried",
                "fry",
                "roasted",
                "broiled",
                "grilled",
                "baked",
                "steamed",
                "mash",
                "kabab",
                "khichuri",
                "pulao",
                "payesh",
                "ruti",
                "curry",
                "biryani",
                "halwa",
                "bhaji",
                "soup",
                "stew",
                "omelette",
            )
        )
    ):
        return "cooked"
    return "prepared"


def has_foreign_biblio(biblio: str | None) -> bool:
    """Return True if FCTB Source/BiblioID cites a borrowed/foreign database."""
    if not biblio:
        return False
    return any(tok in biblio for tok in FOREIGN_BIBLIO_CODES)


def slugify(text: str) -> str:
    """Deterministic ASCII slug for curated-only food IDs."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def tokenize_tags(*parts: str | None, extra: list[str] | None = None) -> list[str]:
    """Build sorted, deduplicated lowercase search tags from names/groups/curated tags."""
    tokens: set[str] = set()
    if extra:
        for t in extra:
            clean = str(t).strip().lower()
            if clean:
                tokens.add(clean)
    for part in parts:
        if not part:
            continue
        for tok in re.split(r"[^a-zA-Z0-9]+", str(part).lower()):
            if len(tok) >= 2 and tok not in {"and", "the", "with", "without", "for", "from", "all"}:
                tokens.add(tok)
    return sorted(tokens)
