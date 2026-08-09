"""Build the small, browser-facing data bundle for the LongRiver site.

The monthly JSON snapshots are the canonical input. CSV files are intentionally
not read here because older snapshots contain optional-field/header variants.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from longriver import SOURCE_URLS  # noqa: E402

DAY_MS = 86_400_000
MIN_TM = 1_593_561_600_000  # 2020-07-01 00:00:00 UTC
STANDARD_FIELDS = ("rvnm", "stnm", "z", "q", "oq", "wptn")
ACTIVE_SOURCE_URLS = tuple(url for url in SOURCE_URLS if not url.endswith("sssqw3.html"))


def _text(value: Any) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _number(value: Any) -> float | None:
    text = _text(value)
    if text is None:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _tm(value: Any) -> int | None:
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return None
    return timestamp if timestamp >= MIN_TM else None


def _iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def _load_snapshots(input_dir: Path, stats: Counter[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    files = sorted(input_dir.glob("????-??/LongRiver.json"))
    if not files:
        raise ValueError(f"未找到月度 LongRiver.json：{input_dir}")
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            stats["bad_json"] += 1
            continue
        groups = payload.values() if isinstance(payload, dict) else [payload]
        for group in groups:
            if not isinstance(group, list):
                stats["bad_group"] += 1
                continue
            for row in group:
                if not isinstance(row, dict):
                    stats["bad_row"] += 1
                    continue
                code = _text(row.get("stcd"))
                timestamp = _tm(row.get("tm"))
                if code is None or len(code) != 8 or not code.isdigit():
                    stats["bad_stcd"] += 1
                    continue
                if timestamp is None:
                    stats["bad_tm"] += 1
                    continue
                rows.append({
                    "rvnm": _text(row.get("rvnm")),
                    "stnm": _text(row.get("stnm")),
                    "stcd": code,
                    "tm": timestamp,
                    "z": _number(row.get("z")),
                    "q": _number(row.get("q")),
                    "oq": _number(row.get("oq")),
                    "wptn": _text(row.get("wptn")),
                })
    return rows


def _merge_rows(rows: list[dict[str, Any]], stats: Counter[str]) -> dict[tuple[str, int], dict[str, Any]]:
    merged: dict[tuple[str, int], dict[str, Any]] = {}
    for row in rows:
        key = (row["stcd"], row["tm"])
        existing = merged.get(key)
        if existing is None:
            merged[key] = row
            continue
        stats["duplicate_observation"] += 1
        for field in STANDARD_FIELDS:
            value = row.get(field)
            old = existing.get(field)
            if old is None and value is not None:
                existing[field] = value
            elif old is not None and value is not None and old != value:
                stats["conflicting_field"] += 1
    return merged


def build(input_dir: Path, output_dir: Path, now: datetime | None = None) -> dict[str, Any]:
    stats: Counter[str] = Counter()
    rows = _load_snapshots(input_dir, stats)
    merged = _merge_rows(rows, stats)
    if not merged:
        raise ValueError("没有可用于网页的有效观测记录")

    latest_tm = max(timestamp for _, timestamp in merged)
    cutoff = latest_tm - 365 * DAY_MS
    by_station: dict[str, list[dict[str, Any]]] = {}
    for (code, timestamp), row in merged.items():
        if timestamp >= cutoff:
            by_station.setdefault(code, []).append(row)
    for station_rows in by_station.values():
        station_rows.sort(key=lambda row: row["tm"])
    if not by_station:
        raise ValueError("最近一年没有有效站点记录")

    latest_by_station: dict[str, dict[str, Any]] = {}
    for row in merged.values():
        previous = latest_by_station.get(row["stcd"])
        if previous is None or row["tm"] > previous["tm"]:
            latest_by_station[row["stcd"]] = row
        elif row["tm"] == previous["tm"]:
            for field in ("rvnm", "stnm"):
                if previous.get(field) is None and row.get(field) is not None:
                    previous[field] = row[field]

    # A station is part of the current overview when it has appeared in the
    # latest 31-day window. Historical-only stations remain in the raw archive,
    # but are not presented as current sites.
    active_cutoff = latest_tm - 31 * DAY_MS
    active_codes = sorted(
        code for code, station_rows in by_station.items()
        if station_rows and station_rows[-1]["tm"] >= active_cutoff
    )
    if not active_codes:
        raise ValueError("最近一个月没有可展示的当前站点")

    output_dir.mkdir(parents=True, exist_ok=True)
    for old_file in output_dir.glob("*.json"):
        old_file.unlink()
    station_dir = output_dir / "stations"
    station_dir.mkdir(exist_ok=True)
    for old_file in station_dir.glob("*.json"):
        old_file.unlink()

    summaries: list[dict[str, Any]] = []
    for code in active_codes:
        station_rows = by_station[code]
        latest = latest_by_station[code]
        first_tm = station_rows[0]["tm"]
        last_tm = station_rows[-1]["tm"]
        summary = {
            "id": code,
            "river": latest.get("rvnm") or "未标注河流",
            "name": latest.get("stnm") or f"站点 {code}",
            "tm": last_tm,
            "observedAt": _iso(last_tm),
            "z": latest.get("z"),
            "q": latest.get("q"),
            "oq": latest.get("oq"),
            "wptn": latest.get("wptn"),
            "historyStart": first_tm,
            "historyEnd": last_tm,
            "recordCount": len(station_rows),
        }
        summaries.append(summary)
        payload = {
            "station": summary,
            "observations": [
                [row["tm"], row["z"], row["q"], row["oq"], row["wptn"]]
                for row in station_rows
            ],
        }
        (station_dir / f"{code}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    summaries.sort(key=lambda station: (station["river"], station["name"], station["id"]))
    coverage_start = min(station["historyStart"] for station in summaries)
    generated_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    manifest = {
        "generatedAt": generated_at.isoformat().replace("+00:00", "Z"),
        "latestObservedAt": _iso(latest_tm),
        "latestTm": latest_tm,
        "coverageStart": _iso(coverage_start),
        "coverageEnd": _iso(latest_tm),
        "stationCount": len(summaries),
        "riverCount": len({station["river"] for station in summaries}),
        "sources": list(ACTIVE_SOURCE_URLS),
        "stations": summaries,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    result = {
        "validRows": len(rows),
        "uniqueObservations": len(merged),
        "latestTm": latest_tm,
        "coverageStart": _iso(coverage_start),
        "coverageEnd": _iso(latest_tm),
        "stationCount": len(summaries),
        "riverCount": manifest["riverCount"],
        "stats": dict(stats),
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.input, args.output)


if __name__ == "__main__":
    main()
