"""Idempotent downloader for ProtoMacro food composition sources."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = Path(__file__).resolve().parent / "sources.yml"
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"


def compute_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Return lowercase hex SHA-256 digest of a file."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def _download_file(url: str, dest: Path) -> str:
    """Stream-download URL to dest via a temp file and return its SHA-256."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ProtoMacro-Pipeline/1.0 (+https://github.com/TahmidShafi/ProtoMacro)"},
    )
    h = hashlib.sha256()
    with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                while chunk := resp.read(1024 * 256):
                    tmp.write(chunk)
                    h.update(chunk)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise
    shutil.move(str(tmp_path), str(dest))
    return h.hexdigest()


def run_extract(
    manifest_path: Path = DEFAULT_MANIFEST,
    raw_dir: Path = DEFAULT_RAW_DIR,
    update_manifest: bool = False,
) -> dict[str, list[str]]:
    """Download all sources in sources.yml if missing or SHA-256 differs.

    Returns {'downloaded': [...keys], 'skipped': [...keys]}.
    """
    with manifest_path.open("r", encoding="utf-8") as f:
        manifest: dict[str, Any] = yaml.safe_load(f)

    sources: dict[str, dict[str, Any]] = manifest.get("sources", {})
    downloaded: list[str] = []
    skipped: list[str] = []
    manifest_dirty = False

    for key, entry in sources.items():
        dest = raw_dir / entry["filename"]
        expected_sha = entry.get("sha256")

        if dest.exists() and expected_sha:
            actual_sha = compute_sha256(dest)
            if actual_sha == expected_sha:
                skipped.append(key)
                continue
            if not update_manifest:
                raise ValueError(
                    f"SHA-256 mismatch for {dest}: expected {expected_sha}, got {actual_sha}. "
                    "Pass --update-manifest to refresh."
                )

        if dest.exists() and not expected_sha:
            actual_sha = compute_sha256(dest)
            entry["sha256"] = actual_sha
            entry["retrieved_at"] = datetime.now(timezone.utc).isoformat()
            manifest_dirty = True
            skipped.append(key)
            continue

        actual_sha = _download_file(entry["url"], dest)
        if expected_sha and actual_sha != expected_sha and not update_manifest:
            raise ValueError(
                f"Downloaded {key} SHA-256 mismatch: expected {expected_sha}, got {actual_sha}"
            )
        if not expected_sha or update_manifest:
            entry["sha256"] = actual_sha
            entry["retrieved_at"] = datetime.now(timezone.utc).isoformat()
            manifest_dirty = True
        downloaded.append(key)

    if manifest_dirty:
        with manifest_path.open("w", encoding="utf-8") as f:
            yaml.safe_dump(manifest, f, sort_keys=False, allow_unicode=True)

    return {"downloaded": downloaded, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download raw food composition datasets.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--update-manifest", action="store_true")
    args = parser.parse_args()

    result = run_extract(args.manifest, args.raw_dir, update_manifest=args.update_manifest)
    print(f"Downloaded: {result['downloaded']}")
    print(f"Skipped (up-to-date): {result['skipped']}")


if __name__ == "__main__":
    main()
