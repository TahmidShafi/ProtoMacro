"""Generate deterministic SVG charts for the ProtoMacro data quality report."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOCS_DIR = REPO_ROOT / "docs"

BG_COLOR = "#0f172a"
PANEL_COLOR = "#111c33"
TEXT_COLOR = "#e2e8f0"
MUTED_COLOR = "#94a3b8"
GRID_COLOR = "#1e293b"
MINT = "#10b981"
SKY = "#38bdf8"
AMBER = "#f59e0b"
SLATE = "#64748b"


def _configure_style() -> None:
    plt.rcParams.update(
        {
            "svg.hashsalt": "protomacro",
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "axes.edgecolor": GRID_COLOR,
            "axes.linewidth": 0.8,
            "figure.facecolor": BG_COLOR,
            "axes.facecolor": PANEL_COLOR,
            "text.color": TEXT_COLOR,
            "axes.labelcolor": TEXT_COLOR,
            "xtick.color": MUTED_COLOR,
            "ytick.color": TEXT_COLOR,
        }
    )


def _save_deterministic_svg(fig: plt.Figure, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        fig.savefig(
            f,
            format="svg",
            bbox_inches="tight",
            facecolor=BG_COLOR,
            metadata={"Creator": None, "Date": None},
        )
    plt.close(fig)


def generate_accuracy_chart(
    accuracy_stats: dict[str, tuple[float, float, int]],
    out_path: Path,
) -> None:
    """Render median and 90th-percentile abs % error per macro as an SVG."""
    _configure_style()
    macros = ["kcal", "protein", "carbs", "fat"]
    labels = [f"{m}\n(n={accuracy_stats[m][2]})" for m in macros]
    medians = [accuracy_stats[m][0] for m in macros]
    p90s = [accuracy_stats[m][1] for m in macros]

    x = list(range(len(macros)))
    width = 0.36

    fig, ax = plt.subplots(figsize=(8.2, 4.4))
    bars_med = ax.bar(
        [i - width / 2 for i in x],
        medians,
        width,
        label="Median Abs % Error",
        color=MINT,
        zorder=3,
    )
    bars_p90 = ax.bar(
        [i + width / 2 for i in x],
        p90s,
        width,
        label="90th Percentile Abs % Error",
        color=AMBER,
        zorder=3,
    )

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Absolute % Error vs. Source")
    ax.set_title(
        "Accuracy of Legacy Hand-Entered Values (Exact Matches, Source kcal ≥ 20)",
        fontsize=12,
        fontweight="bold",
        pad=14,
    )
    ax.grid(axis="y", color=GRID_COLOR, linestyle="--", linewidth=0.8, zorder=0)
    ax.set_ylim(0, max(p90s, default=10) * 1.18)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    for bar in bars_med:
        h = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            h + 2.5,
            f"{h:.1f}%",
            ha="center",
            va="bottom",
            fontsize=8.5,
            color=MINT,
            fontweight="bold",
        )
    for bar in bars_p90:
        h = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            h + 2.5,
            f"{h:.1f}%",
            ha="center",
            va="bottom",
            fontsize=8.5,
            color=AMBER,
            fontweight="bold",
        )

    ax.legend(
        frameon=True,
        facecolor=BG_COLOR,
        edgecolor=GRID_COLOR,
        loc="upper left",
    )
    _save_deterministic_svg(fig, out_path)


def generate_catalog_chart(
    dataset_counts: dict[str, int],
    flag_counts: dict[str, int],
    out_path: Path,
) -> None:
    """Render food counts by dataset and quality flag as a two-panel SVG."""
    _configure_style()
    fig, (ax1, ax2) = plt.subplots(
        1,
        2,
        figsize=(11.5, 4.8),
        gridspec_kw={"width_ratios": [1.0, 1.45]},
    )

    # Panel 1: By dataset
    ds_items = sorted(dataset_counts.items(), key=lambda kv: -kv[1])
    ds_labels = [k for k, _ in ds_items]
    ds_vals = [v for _, v in ds_items]
    ds_colors = [MINT if k == "fctb_2013" else SKY if "fdc" in k else SLATE for k in ds_labels]
    y1 = list(range(len(ds_labels)))
    bars1 = ax1.barh(y1, ds_vals, color=ds_colors, height=0.55, zorder=3)
    ax1.set_yticks(y1)
    ax1.set_yticklabels(ds_labels)
    ax1.invert_yaxis()
    ax1.set_xlabel("Foods")
    ax1.set_title(f"Catalog by Dataset (total={sum(ds_vals)})", fontsize=11, fontweight="bold", pad=10)
    ax1.grid(axis="x", color=GRID_COLOR, linestyle="--", linewidth=0.8, zorder=0)
    ax1.set_xlim(0, max(ds_vals, default=10) * 1.18)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)
    for bar in bars1:
        w = bar.get_width()
        ax1.text(w + 6, bar.get_y() + bar.get_height() / 2, str(int(w)), va="center", fontsize=9, fontweight="bold")

    # Panel 2: By quality flag
    fl_items = sorted(flag_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    fl_labels = [k for k, _ in fl_items]
    fl_vals = [v for _, v in fl_items]
    fl_colors = [AMBER if k in ("suspect_value", "atwater_mismatch", "proximates_over_100g") else SKY for k in fl_labels]
    y2 = list(range(len(fl_labels)))
    bars2 = ax2.barh(y2, fl_vals, color=fl_colors, height=0.62, zorder=3)
    ax2.set_yticks(y2)
    ax2.set_yticklabels(fl_labels, fontsize=8.5)
    ax2.invert_yaxis()
    ax2.set_xlabel("Flagged Rows")
    ax2.set_title("Foods by Quality Flag", fontsize=11, fontweight="bold", pad=10)
    ax2.grid(axis="x", color=GRID_COLOR, linestyle="--", linewidth=0.8, zorder=0)
    ax2.set_xlim(0, max(fl_vals, default=10) * 1.18)
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)
    for bar in bars2:
        w = bar.get_width()
        ax2.text(w + 4, bar.get_y() + bar.get_height() / 2, str(int(w)), va="center", fontsize=8.5, fontweight="bold")

    fig.tight_layout(w_pad=3.0)
    _save_deterministic_svg(fig, out_path)


def generate_report_charts(
    foods: list[dict[str, Any]],
    seed: list[dict[str, Any]],
    crosswalk_path: Path,
    mig_map: dict[str, str],
    docs_dir: Path = DEFAULT_DOCS_DIR,
) -> tuple[Path, Path]:
    """Compute stats from pipeline outputs and write both SVG charts to docs_dir."""
    by_id = {f["id"]: f for f in foods}
    with crosswalk_path.open("r", encoding="utf-8") as f:
        cw = list(csv.DictReader(f))

    macro_errs: dict[str, list[float]] = {"kcal": [], "protein": [], "carbs": [], "fat": []}
    for r in cw:
        if r["match_type"].strip() != "exact":
            continue
        idx = int(r["curated_index"])
        old = seed[idx]
        np = by_id[mig_map[f"local_{idx}"]]["per_100g"]
        if np["kcal"] < 20:
            continue
        for key, src_key in (("kcal", "kcal"), ("protein", "protein"), ("carbs", "carbs_total"), ("fat", "fat")):
            old_k = "calories" if key == "kcal" else key
            src_v = float(np[src_key])
            old_v = float(old[old_k])
            if src_v == 0:
                err = 0.0 if old_v == 0 else None
            else:
                err = abs(old_v - src_v) / src_v * 100.0
            if err is not None:
                macro_errs[key].append(err)

    def _stats(vals: list[float]) -> tuple[float, float, int]:
        if not vals:
            return 0.0, 0.0, 0
        s = sorted(vals)
        return s[len(s) // 2], s[min(len(s) - 1, int(0.9 * len(s)))], len(s)

    accuracy_stats = {m: _stats(macro_errs[m]) for m in ("kcal", "protein", "carbs", "fat")}
    dataset_counts = dict(Counter(f["source"]["dataset"] for f in foods))
    flag_counts = dict(Counter(fl for f in foods for fl in f["quality_flags"]))

    acc_path = docs_dir / "accuracy_of_hand_entered_values.svg"
    cat_path = docs_dir / "catalog_by_source.svg"
    generate_accuracy_chart(accuracy_stats, acc_path)
    generate_catalog_chart(dataset_counts, flag_counts, cat_path)
    return acc_path, cat_path


if __name__ == "__main__":
    foods_doc = json.loads((REPO_ROOT / "js" / "data" / "foods.json").read_text(encoding="utf-8"))
    seed_data = json.loads((REPO_ROOT / "pipeline" / "seeds" / "curated_v2.json").read_text(encoding="utf-8"))
    mig = json.loads((REPO_ROOT / "js" / "data" / "id_migration_v2_to_v3.json").read_text(encoding="utf-8"))
    generate_report_charts(
        foods_doc["foods"],
        seed_data,
        REPO_ROOT / "pipeline" / "mappings" / "curated_crosswalk.csv",
        mig,
    )
