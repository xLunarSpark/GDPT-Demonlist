import os
import json
import re

DATA_DIR = "data"
IGNORED_FILES = {"_editors.json", "_list.json", "_list_bundled.json", "_submissions.json"}
CLAN_TAG_REGEX = re.compile(r"^\[.*?\]\s*")


def iter_level_files(path):
    for entry in os.scandir(path):
        if not entry.is_file() or not entry.name.endswith(".json"):
            continue
        if entry.name in IGNORED_FILES:
            continue
        yield entry.path


def clean():
    changes = 0

    aliases = {
        "gamer_bernax": "BernaX",
        "manugrk": "Manu",
        "zhexya": "Hexya",
        "karma": "Karma",
        "taiago": "Taiago",
        "lunarspark": "LunarSpark",
    }

    for filepath in iter_level_files(DATA_DIR):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            records = data.get("records", [])
            if not records:
                continue

            new_records = {}
            modified = False

            for r in records:
                original_user = r.get("user", "").strip()
                if not original_user:
                    continue

                cleaned = CLAN_TAG_REGEX.sub("", original_user).strip()
                lower_clean = cleaned.lower()
                if lower_clean in aliases:
                    cleaned = aliases[lower_clean]

                if cleaned != original_user:
                    modified = True
                    r["user"] = cleaned

                key = cleaned.lower()
                if key not in new_records:
                    new_records[key] = r
                else:
                    modified = True
                    if r.get("percent", 0) > new_records[key].get("percent", 0):
                        new_records[key] = r

            if modified:
                data["records"] = list(new_records.values())
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4, ensure_ascii=False)
                changes += 1

        except Exception as e:
            print(f"Failed to process {filepath}: {e}")

    print(f"Cleaned clan tags & duplicates in {changes} level files.")


if __name__ == "__main__":
    clean()
