"""Tests for idempotent source extraction."""

from __future__ import annotations

import hashlib
from pathlib import Path

import yaml

from pipeline.extract import run_extract


def test_extract_is_idempotent(tmp_path: Path) -> None:
    """Re-running extract when files and sha256 match downloads nothing and changes nothing."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    sample = raw_dir / "sample.txt"
    payload = b"protomacro-test-dataset"
    sample.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()

    manifest_path = tmp_path / "sources.yml"
    manifest_data = {
        "sources": {
            "sample": {
                "name": "Sample",
                "url": "https://example.invalid/sample.txt",
                "filename": "sample.txt",
                "sha256": digest,
                "retrieved_at": "2026-11-15T00:00:00+00:00",
                "citation": "Test",
                "license": "CC0",
            }
        }
    }
    manifest_path.write_text(yaml.safe_dump(manifest_data, sort_keys=False), encoding="utf-8")
    before_manifest = manifest_path.read_text(encoding="utf-8")
    before_mtime = sample.stat().st_mtime_ns

    res1 = run_extract(manifest_path=manifest_path, raw_dir=raw_dir)
    res2 = run_extract(manifest_path=manifest_path, raw_dir=raw_dir)

    assert res1 == {"downloaded": [], "skipped": ["sample"]}
    assert res2 == {"downloaded": [], "skipped": ["sample"]}
    assert manifest_path.read_text(encoding="utf-8") == before_manifest
    assert sample.stat().st_mtime_ns == before_mtime
