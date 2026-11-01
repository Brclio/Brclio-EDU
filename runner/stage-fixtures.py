#!/usr/bin/env python3
"""Copy audited public fixtures into the image build context without fetching URLs."""
import json
from pathlib import Path
import shutil

repository = Path(__file__).resolve().parents[1]
public = repository / "public"
destination = Path(__file__).resolve().parent / "fixtures"
index = json.loads((public / "content/fixture-map.json").read_text(encoding="utf-8"))
staged = {}
for url, entry in index.items():
    name = entry.get("path", "")
    if not isinstance(name, str) or not name.startswith("/content/"):
        raise SystemExit("Invalid fixture path")
    source = (public / name.removeprefix("/")).resolve()
    if public.resolve() not in source.parents or not source.is_file() or source.stat().st_size > 8 * 1024 * 1024:
        raise SystemExit("Fixture file missing, unsafe, or larger than 8 MiB")
    target = destination / name.removeprefix("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    staged[url] = {key: entry[key] for key in ("path", "contentType", "source", "reconstructed", "adapted", "recovered", "raw") if key in entry}
destination.mkdir(exist_ok=True)
(destination / "fixture-map.json").write_text(json.dumps(staged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"urls":len(staged),"bytes":sum(file.stat().st_size for file in destination.rglob("*") if file.is_file())}))
