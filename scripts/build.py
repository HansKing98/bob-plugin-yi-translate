"""Build a deterministic Bob plugin archive and update its appcast entry."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from update_appcast import update_appcast

ROOT = Path(__file__).resolve().parent.parent
FILES = ("api.js", "config.js", "file.js", "icon.png", "info.json", "main.js", "utils.js", "yichat.js")


def build(message):
    info = json.loads((ROOT / "src/info.json").read_text(encoding="utf-8"))
    output = ROOT / "release" / f"bob-plugin-yi-translate_v{info['version']}.bobplugin"
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name in FILES:
            entry = ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, (ROOT / "src" / name).read_bytes())
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(FILES)
        assert json.loads(archive.read("info.json")) == info
    update_appcast(message, output)
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message", help="Release notes for the appcast")
    build(parser.parse_args().message)
