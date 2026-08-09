import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "site" / "scripts" / "build_site_data.py"
SPEC = importlib.util.spec_from_file_location("build_site_data", MODULE_PATH)
assert SPEC and SPEC.loader
BUILD_SITE_DATA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD_SITE_DATA)


class SiteDataBuilderTests(unittest.TestCase):
    def write_snapshot(self, root: Path, month: str, payload: dict) -> None:
        month_dir = root / month
        month_dir.mkdir(parents=True)
        (month_dir / "LongRiver.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )

    def test_builds_compact_station_data_and_fills_optional_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "data"
            output = root / "output"
            first = 1_593_561_600_000
            latest = first + 365 * BUILD_SITE_DATA.DAY_MS
            self.write_snapshot(
                source,
                "2026-01",
                {"/a": [{"rvnm": "甲河", "stcd": "12345678", "stnm": "甲站", "tm": first, "z": "2.1", "wptn": "4"}]},
            )
            self.write_snapshot(
                source,
                "2026-02",
                {"/a": [
                    {"rvnm": "甲河", "stcd": "12345678", "stnm": "甲站", "tm": latest, "z": "2.5", "q": "10", "oq": "3", "wptn": "5"},
                    {"rvnm": "甲河", "stcd": "12345678", "stnm": "甲站", "tm": latest, "z": "2.5", "q": "10"},
                ]},
            )
            result = BUILD_SITE_DATA.build(source, output, datetime(2026, 8, 1, tzinfo=timezone.utc))
            self.assertEqual(result["stationCount"], 1)
            self.assertEqual(result["stats"]["duplicate_observation"], 1)
            station = json.loads((output / "stations" / "12345678.json").read_text(encoding="utf-8"))
            self.assertEqual(station["observations"][-1], [latest, 2.5, 10.0, 3.0, "5"])
            self.assertEqual(json.loads((output / "manifest.json").read_text(encoding="utf-8"))["stationCount"], 1)

    def test_skips_invalid_rows_and_requires_valid_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "data"
            self.write_snapshot(source, "2026-01", {"/bad": [{"stcd": "1", "tm": 1}, {"stcd": "12345678", "tm": 4}]})
            with self.assertRaisesRegex(ValueError, "没有可用于网页"):
                BUILD_SITE_DATA.build(source, root / "output")


if __name__ == "__main__":
    unittest.main()
