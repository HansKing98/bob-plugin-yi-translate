import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def update_appcast(message, release_file=None):
    with open(ROOT / "src/info.json", "r", encoding="utf-8") as f:
        info = json.load(f)
    version = info["version"]
    release_file = Path(release_file) if release_file else ROOT / f"release/bob-plugin-yi-translate_v{version}.bobplugin"
    assert release_file.is_file(), "Release file not exist"
    with open(release_file, "rb") as f:
        c = f.read()
        file_hash = hashlib.sha256(c).hexdigest()
    version_info = {
        "version": version,
        "desc": message,
        "sha256": file_hash,
        "url": f"https://github.com/hansking98/bob-plugin-yi-translate/releases/download/v{version}/bob-plugin-yi-translate_v{version}.bobplugin",
        "minBobVersion": info["minBobVersion"],
        "timestamp": int(time.time() * 1000),
    }
    appcast_file = ROOT / "appcast.json"
    if appcast_file.is_file():
        with open(appcast_file, "r", encoding="utf-8") as f:
            appcast = json.load(f)
    else:
        appcast = dict(identifier="com.hans.bob-plugin-yi-translate", versions=[])
    previous = next((entry for entry in appcast["versions"] if entry["version"] == version), None)
    if previous and previous.get("sha256") == file_hash and previous.get("timestamp"):
        version_info["timestamp"] = previous["timestamp"]
    appcast["versions"] = [version_info] + [entry for entry in appcast["versions"] if entry["version"] != version]
    with open(appcast_file, "w", encoding="utf-8") as f:
        json.dump(appcast, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"v{version}")


if __name__ == "__main__":
    message = sys.argv[1]
    update_appcast(message)
