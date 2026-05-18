import os
import json
import urllib.request
import urllib.error
import time
import re

DATA_DIR = "data"
HEADERS = {"User-Agent": "Mozilla/5.0"}
IGNORED_FILES = {"_editors.json", "_list.json", "_list_bundled.json", "_submissions.json"}

REQUEST_TIMEOUT_S = 20
REQUEST_DELAY_S = float(os.environ.get("POINTERCRATE_DELAY_S", "0.25"))
MAX_RETRIES = 4

def normalize_name(name):
    return re.sub(r"\[.*?\]\s*", "", name).lower().strip()


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    last_err = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = e
            # Handle rate limiting.
            if e.code == 429 and attempt < MAX_RETRIES:
                retry_after = e.headers.get("Retry-After")
                sleep_for = float(retry_after) if retry_after else (0.75 * attempt)
                time.sleep(sleep_for)
                continue
            raise
        except urllib.error.URLError as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(0.5 * attempt)
                continue
            raise

    raise last_err

def get_pt_players():
    return fetch_json("https://pointercrate.com/api/v1/players/?nation=PT")

def get_player(player_id):
    return fetch_json(f"https://pointercrate.com/api/v1/players/{player_id}")["data"]

def load_local_levels(path):
    local_levels = {}
    level_data_map = {}

    for entry in os.scandir(path):
        if not entry.is_file() or not entry.name.endswith(".json"):
            continue
        if entry.name in IGNORED_FILES:
            continue

        try:
            with open(entry.path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Error loading {entry.path}: {e}")
            continue

        name = data.get("name", "").strip().lower()
        if not name:
            continue

        local_levels[name] = entry.path
        level_data_map[entry.path] = data

    return local_levels, level_data_map

def main():
    local_levels, level_data_map = load_local_levels(DATA_DIR)

    print(f"Loaded {len(level_data_map)} local levels.")
    
    print("Fetching PT players...")
    players = get_pt_players()
    print(f"Found {len(players)} PT players.")

    changed_files = set()
    existing_users = {}
    existing_links = {}

    for filepath, level_data in level_data_map.items():
        records = level_data.get("records", [])
        existing_users[filepath] = {normalize_name(record.get("user", "")) for record in records if record.get("user")}
        existing_links[filepath] = {record.get("link") for record in records if record.get("link")}

    for p in players:
        print(f"Fetching records for {p['name']}...")
        time.sleep(REQUEST_DELAY_S)
        details = get_player(p["id"])
        records = details.get("records", [])
        
        for r in records:
            if r["status"] != "approved":
                continue
            d_name = r["demon"]["name"].lower()
            
            if d_name in local_levels:
                filepath = local_levels[d_name]
                level_data = level_data_map[filepath]
                existing_records = level_data.get("records", [])

                player_name = details["name"]
                norm_player = normalize_name(player_name)
                video_link = r.get("video")

                if norm_player not in existing_users[filepath] and (
                    not video_link or video_link not in existing_links[filepath]
                ):
                    existing_records.append({
                        "user": player_name,
                        "link": video_link,
                        "percent": r["progress"],
                        "hz": 360,
                    })
                    level_data["records"] = existing_records
                    existing_users[filepath].add(norm_player)
                    if video_link:
                        existing_links[filepath].add(video_link)
                    changed_files.add(filepath)
                    print(f"  Added {player_name} ({r['progress']}%) to {d_name}")

    changes = 0
    for filepath in changed_files:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(level_data_map[filepath], f, indent=4, ensure_ascii=False)
        changes += 1

    print(f"Done! Updated {changes} level files with Pointercrate records.")

if __name__ == "__main__":
    main()
