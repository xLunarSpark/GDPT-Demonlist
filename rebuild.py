import concurrent.futures
import io
import json
import urllib.request
from pathlib import Path

PORTUGAL_COUNTRY_ID = 620
DATA_DIR = Path("data")

API_BASE = "https://api.aredl.net/v2/api/aredl"
USER_AGENT = "Mozilla/5.0"
REQUEST_TIMEOUT_S = 20

PROFILE_FETCH_WORKERS = 8


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as response:
        with io.TextIOWrapper(response, encoding="utf-8") as text:
            return json.load(text)


def slugify(name: str) -> str:
    return str(name).strip().replace(" ", "_")


def normalize_username(profile: dict) -> str:
    username = profile.get("global_name") or profile.get("username") or "Unknown"
    if isinstance(username, str) and username and username.islower():
        return username.title()
    return username


def gather_players(country_data: dict) -> dict:
    players = {}

    for r in country_data.get("records", []) or []:
        p = r.get("submitted_by") or {}
        pid = p.get("id")
        if pid is not None:
            players[pid] = p

    for r in country_data.get("published", []) or []:
        p = r.get("publisher") or {}
        pid = p.get("id")
        if pid is not None:
            players[pid] = p

    return players


def fetch_profile(pid: int):
    return fetch_json(f"{API_BASE}/profile/{pid}")


def add_records_from_profile(profile: dict, all_levels: dict) -> None:
    username = normalize_username(profile)

    for rec in profile.get("records", []) or []:
        lvl_info = rec.get("level") or {}
        lvl_id = lvl_info.get("level_id")
        if lvl_id is None:
            continue

        level_entry = all_levels.get(lvl_id)
        if not level_entry:
            level_entry = {
                "id": lvl_id,
                "name": str(lvl_info.get("name", "")).strip(),
                "position": lvl_info.get("position", 999999),
                "legacy": lvl_info.get("legacy", False),
                "records": [],
            }
            all_levels[lvl_id] = level_entry
        else:
            #keep metadata reasonably up to date if we get better info later
            if not level_entry.get("name") and lvl_info.get("name"):
                level_entry["name"] = str(lvl_info.get("name")).strip()

            pos = lvl_info.get("position")
            if pos is not None and (
                level_entry.get("position") is None
                or level_entry.get("position") == 999999
            ):
                level_entry["position"] = pos

            if bool(lvl_info.get("legacy")) and not bool(level_entry.get("legacy")):
                level_entry["legacy"] = True

        level_entry["records"].append(
            {
                "user": username,
                "link": rec.get("video_url", ""),
                "percent": 100,
                "hz": 360,  # defaulted
            }
        )


def load_name_to_filename_map(data_dir: Path) -> dict:
    mapping = {}

    for path in data_dir.iterdir():
        if path.suffix.lower() != ".json" or path.name.startswith("_"):
            continue

        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            name = str(data.get("name", "")).strip().lower()
            if name:
                mapping[name] = path.stem
                continue
        except Exception:
            pass

        mapping[path.stem.replace("_", " ").strip().lower()] = path.stem

    return mapping


def load_local_level(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def fetch_level_metadata(level_id: int, level_name: str) -> dict:
    try:
        lvl_api_data = fetch_json(f"{API_BASE}/levels/{level_id}")
        author = lvl_api_data.get("publisher", {}).get("global_name", "Unknown")

        verifications = lvl_api_data.get("verifications", []) or []
        verifier = "Unknown"
        verification_url = ""
        if verifications:
            verifier = (
                verifications[0]
                .get("submitted_by", {})
                .get("global_name", "Unknown")
            )
            verification_url = verifications[0].get("video_url", "")

        return {
            "id": level_id,
            "name": level_name,
            "author": author,
            "creators": [],
            "verifier": verifier,
            "verification": verification_url,
            "percentToQualify": 100,
            "password": "Free to Copy",
        }
    except Exception as e:
        print(f"Error fetching level metadata {level_name}: {e}")
        return {
            "id": level_id,
            "name": level_name,
            "author": "Unknown",
            "creators": [],
            "verifier": "Unknown",
            "verification": "",
            "percentToQualify": 100,
            "password": "Free to Copy",
        }


def main() -> None:
    print("Fetching data")
    try:
        pt_data = fetch_json(f"{API_BASE}/country/{PORTUGAL_COUNTRY_ID}")
    except Exception as e:
        print(f"Error fetching PT country data: {e}")
        return

    players = gather_players(pt_data)
    print(f"Found {len(players)} players. Fetching data...")

    all_levels = {}

    player_ids = list(players.keys())
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=PROFILE_FETCH_WORKERS
    ) as executor:
        futures = {executor.submit(fetch_profile, pid): pid for pid in player_ids}
        for future in concurrent.futures.as_completed(futures):
            pid = futures[future]
            try:
                profile = future.result()
            except Exception as e:
                print(f"Failed to fetch profile {pid}: {e}")
                continue

            add_records_from_profile(profile, all_levels)

    total_completions = sum(len(level["records"]) for level in all_levels.values())
    print(
        f"Found {total_completions} total completions across {len(all_levels)} unique levels!"
    )

    def sort_key(level: dict):
        is_legacy = bool(level.get("legacy"))
        pos = level.get("position")
        pos = pos if isinstance(pos, int) else 999999
        return (is_legacy, pos)

    sorted_levels = sorted(all_levels.values(), key=sort_key)

    name_to_filename = load_name_to_filename_map(DATA_DIR)

    new_list_names = []

    for lvl in sorted_levels:
        lvl_name = str(lvl.get("name", "")).strip()
        if not lvl_name:
            continue

        filename_base = name_to_filename.get(lvl_name.lower())
        if not filename_base:
            filename_base = slugify(lvl_name) or str(lvl.get("id", "Unknown"))

        filepath = DATA_DIR / f"{filename_base}.json"
        new_list_names.append(filename_base)

        level_json = load_local_level(filepath)
        if not level_json:
            print(f"Fetching metadata for new level: {lvl_name} ({lvl.get('id')})")
            level_json = fetch_level_metadata(lvl.get("id"), lvl_name)

        existing_hz_by_user = {
            str(r.get("user", "")).lower(): r.get("hz", 360)
            for r in (level_json.get("records", []) or [])
            if isinstance(r, dict) and r.get("user")
        }

        final_records = []
        for new_r in lvl.get("records", []) or []:
            user = str(new_r.get("user", ""))
            final_records.append(
                {
                    "user": user,
                    "link": new_r.get("link", ""),
                    "percent": new_r.get("percent", 100),
                    "hz": existing_hz_by_user.get(
                        user.lower(),
                        new_r.get("hz", 360),
                    ),
                }
            )

        # deterministic output is easier to review
        final_records.sort(
            key=lambda r: (
                -int(r.get("percent", 0) or 0),
                str(r.get("user", "")).lower(),
            )
        )

        level_json["records"] = final_records

        filepath.parent.mkdir(parents=True, exist_ok=True)
        with filepath.open("w", encoding="utf-8") as f:
            json.dump(level_json, f, indent=4, ensure_ascii=False)

    with (DATA_DIR / "_list.json").open("w", encoding="utf-8") as f:
        json.dump(new_list_names, f, indent=4, ensure_ascii=False)

    # Compile _list_bundled.json
    bundled_data = []
    for name in new_list_names:
        try:
            with (DATA_DIR / f"{name}.json").open("r", encoding="utf-8") as lf:
                bundled_data.append(json.load(lf))
        except Exception:
            pass

    with (DATA_DIR / "_list_bundled.json").open("w", encoding="utf-8") as f:
        json.dump(bundled_data, f, separators=(",", ":"), ensure_ascii=False)

    print(
        f"\nDone! Rebuilt _list.json and _list_bundled.json with {len(new_list_names)} levels"
    )


if __name__ == "__main__":
    main()
