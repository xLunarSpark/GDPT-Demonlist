import os
import json
from collections import defaultdict

DATA_DIR = "data"
IGNORED_FILES = {"_editors.json", "_list.json", "_list_bundled.json", "_submissions.json"}


def iter_level_files(path):
    for entry in os.scandir(path):
        if not entry.is_file() or not entry.name.endswith(".json"):
            continue
        if entry.name in IGNORED_FILES:
            continue
        yield entry.name, entry.path


def check_duplicates():
    level_dups = 0

    global_user_variations = defaultdict(set)

    print("Checking for duplicates within individual level files...")
    
    for filename, filepath in iter_level_files(DATA_DIR):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            records = data.get("records", [])
            seen = set()
            for r in records:
                raw_user = r.get("user", "").strip()
                if not raw_user:
                    continue
                lower_user = raw_user.lower()
                
                if lower_user in seen:
                    print(f" -> [{filename}] Duplicate record found for: '{raw_user}'")
                    level_dups += 1
                seen.add(lower_user)
                
                global_user_variations[lower_user].add(raw_user)

        except Exception as e:
            print(f"Error reading {filename}: {e}")

    if level_dups == 0:
        print(" -> No duplicates found within individual level files.\n")
    else:
        print(f" -> Total intra-level duplicates: {level_dups}\n")

    print("Checking for global name styling variations (capitalization/spacing mismatches)...")
    variations_found = 0
    for lower_user, forms in global_user_variations.items():
        if len(forms) > 1:
            print(f" -> Variation found for '{lower_user}': {sorted(forms)}")
            variations_found += 1

    if variations_found == 0:
        print(" -> No global variations found.")
    else:
        print(f" -> Total global variations: {variations_found}")

if __name__ == "__main__":
    check_duplicates()
