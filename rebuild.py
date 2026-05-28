import concurrent.futures
import io
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

PORTUGAL_COUNTRY_ID = 620
DATA_DIR = Path("data")

API_BASE = "https://api.aredl.net/v2/api/aredl"
POINTERCRATE_BASE = "https://pointercrate.com/api/v1"
USER_AGENT = "Mozilla/5.0"
REQUEST_TIMEOUT_S = 20

PROFILE_FETCH_WORKERS = 8
POINTERCRATE_FETCH_WORKERS = 8
VERBOSE_OUTPUT = False

CLAN_TAG_REGEX = re.compile(r"^\[.*?\]\s*")
USERNAME_ALIASES = {
    "gamer_bernax": "BernaX",
    "manugrk": "Manu",
    "zhexya": "Hexya",
    "karma": "Karma",
    "Karmatas": "Karma",
    "taiago": "Taiago",
    "lunarspark": "LunarSpark",
    "zpifoxo": "Pifoxo",
    "pifoxo": "Pifoxo",
}
EXCLUDED_USERS = {"reivax", "malandrogaming"}


EXCLUDED_USERS = {"reivax", "malandrogaming"}

TRUSTED_LOCAL_USERS = {"truejumpy", "pifoxo", "lock"}


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error = None

    for attempt in range(1, 5):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as response:
                with io.TextIOWrapper(response, encoding="utf-8") as text:
                    return json.load(text)
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code == 429 and attempt < 4:
                retry_after = error.headers.get("Retry-After")
                sleep_for = float(retry_after) if retry_after else (0.75 * attempt)
                time.sleep(sleep_for)
                continue
            raise
        except urllib.error.URLError as error:
            last_error = error
            if attempt < 4:
                time.sleep(0.5 * attempt)
                continue
            raise

    raise last_error


def slugify(name: str) -> str:
    return str(name).strip().replace(" ", "_")


def normalize_username(profile: dict) -> str:
    username = profile.get("global_name") or profile.get("username") or "Unknown"
    if isinstance(username, str) and username and username.islower():
        return username.title()
    return username


def clean_username(name: str) -> str:
    cleaned = CLAN_TAG_REGEX.sub("", str(name).strip()).strip()
    return USERNAME_ALIASES.get(cleaned.lower(), cleaned)


def is_excluded_username(name: str) -> bool:
    return clean_username(name).strip().lower() in EXCLUDED_USERS


def is_excluded_username(name: str) -> bool:
    return clean_username(name).strip().lower() in EXCLUDED_USERS


def normalize_level_name(name: str) -> str:
    return str(name).strip().lower()


def base_level_name(name: str) -> str:
    value = str(name).strip()
    if value.endswith(")") and "(" in value:
        value = value[: value.rfind("(")].strip()
    return value


def normalize_identity_value(value: str) -> str:
    return str(value or "").strip().lower()


def extract_identity_tokens(value) -> set[str]:
    tokens = set()
    if value is None:
        return tokens

    if isinstance(value, str):
        token = normalize_identity_value(value)
        if token:
            tokens.add(token)
        return tokens

    if isinstance(value, dict):
        for key in ("global_name", "name", "username"):
            token = normalize_identity_value(value.get(key))
            if token:
                tokens.add(token)
        return tokens

    if isinstance(value, list):
        for item in value:
            tokens.update(extract_identity_tokens(item))
        return tokens

    return tokens


def collect_aredl_identity_tokens(level_api_data: dict) -> set[str]:
    tokens = set()
    tokens.update(extract_identity_tokens(level_api_data.get("publisher")))
    tokens.update(extract_identity_tokens(level_api_data.get("creators")))
    return tokens


def collect_pointercrate_identity_tokens(demon_data: dict) -> set[str]:
    tokens = set()
    tokens.update(extract_identity_tokens(demon_data.get("publisher")))
    tokens.update(extract_identity_tokens(demon_data.get("creator")))
    tokens.update(extract_identity_tokens(demon_data.get("creators")))
    tokens.update(extract_identity_tokens(demon_data.get("author")))
    return tokens


def gather_players(country_data: dict) -> dict:
    players = {}

    for record in country_data.get("records", []) or []:
        submitted_by = record.get("submitted_by") or {}
        pid = submitted_by.get("id")
        if pid is not None:
            players[pid] = submitted_by

    for record in country_data.get("published", []) or []:
        publisher = record.get("publisher") or {}
        pid = publisher.get("id")
        if pid is not None:
            players[pid] = publisher

    return players


def fetch_profile(pid: int):
    return fetch_json(f"{API_BASE}/profile/{pid}")


def fetch_pointercrate_players():
    return fetch_json(f"{POINTERCRATE_BASE}/players/?nation=PT")


def fetch_pointercrate_player(pid: int):
    return fetch_json(f"{POINTERCRATE_BASE}/players/{pid}")["data"]


def add_records_from_profile(profile: dict, all_levels: dict) -> None:
    username = normalize_username(profile)
    if is_excluded_username(username):
        return

    for rec in profile.get("records", []) or []:
        level_info = rec.get("level") or {}
        level_id = level_info.get("level_id")
        if level_id is None:
            continue

        level_entry = all_levels.get(level_id)
        if not level_entry:
            level_entry = {
                "id": level_id,
                "name": str(level_info.get("name", "")).strip(),
                "position": level_info.get("position", 999999),
                "legacy": level_info.get("legacy", False),
                "records": [],
            }
            all_levels[level_id] = level_entry

        level_entry["records"].append(
            {
                "user": username,
                "link": rec.get("video_url", ""),
                "percent": 100,
                "hz": 360,
            }
        )


def collect_pointercrate_records() -> dict:
    try:
        pt_players = fetch_pointercrate_players()
    except Exception as error:
        print(f"Error fetching Pointercrate PT players: {error}")
        return {}

    print(f"Pointercrate PT players: {len(pt_players)}")

    records_by_level = {}
    fetch_failures = 0

    with concurrent.futures.ThreadPoolExecutor(
        max_workers=POINTERCRATE_FETCH_WORKERS
    ) as executor:
        futures = {executor.submit(fetch_pointercrate_player, player["id"]): player for player in pt_players}
        for future in concurrent.futures.as_completed(futures):
            try:
                details = future.result()
            except Exception as error:
                player = futures[future]
                fetch_failures += 1
                if VERBOSE_OUTPUT:
                    print(f"Failed to fetch Pointercrate player {player.get('id')}: {error}")
                continue

            player_name = details.get("name", "Unknown")
            for record in details.get("records", []) or []:
                if record.get("status") != "approved":
                    continue

                demon = record.get("demon") or {}
                level_name = normalize_level_name(base_level_name(demon.get("name", "")))
                if not level_name:
                    continue

                if is_excluded_username(player_name):
                    continue

                records_by_level.setdefault(level_name, []).append(
                    {
                        "user": player_name,
                        "link": record.get("video", ""),
                        "percent": record.get("progress", 100),
                        "hz": 360,
                        "identity_tokens": sorted(collect_pointercrate_identity_tokens(demon)),
                    }
                )

    total_records = sum(len(records) for records in records_by_level.values())
    print(f"Pointercrate approved records: {total_records} across {len(records_by_level)} levels")
    if fetch_failures:
        print(f"Pointercrate player fetch failures: {fetch_failures}")
    return records_by_level


def dedupe_and_clean_records(records: list[dict]) -> list[dict]:
    deduped = {}

    for record in records:
        cleaned_user = clean_username(record.get("user", ""))
        if not cleaned_user or cleaned_user.lower() in EXCLUDED_USERS:
            continue

        key = cleaned_user.lower()
        cleaned_record = {
            "user": cleaned_user,
            "link": record.get("link", ""),
            "percent": record.get("percent", 100),
            "hz": record.get("hz", 360),
        }

        existing = deduped.get(key)
        if existing is None:
            deduped[key] = cleaned_record
            continue

        existing_percent = int(existing.get("percent", 0) or 0)
        new_percent = int(cleaned_record.get("percent", 0) or 0)
        existing_link = str(existing.get("link", ""))
        new_link = str(cleaned_record.get("link", ""))

        if new_percent > existing_percent:
            deduped[key] = cleaned_record
        elif new_percent == existing_percent and not existing_link and new_link:
            deduped[key] = cleaned_record

    return list(deduped.values())


def report_duplicate_summary(raw_records_by_level: dict[str, list[dict]]) -> None:
    level_dups = 0
    global_user_variations = {}

    for level_name, records in raw_records_by_level.items():
        seen = set()
        for record in records:
            raw_user = str(record.get("user", "")).strip()
            if not raw_user:
                continue

            lower_user = raw_user.lower()
            if lower_user in seen:
                level_dups += 1
            seen.add(lower_user)

            global_user_variations.setdefault(lower_user, set()).add(raw_user)

    variations_found = 0
    for lower_user, forms in global_user_variations.items():
        if len(forms) > 1:
            variations_found += 1

    print(f"Duplicate summary: intra-level={level_dups}, global-name-variations={variations_found}")


def load_level_indexes(data_dir: Path) -> tuple[dict[int, str], dict[str, list[str]]]:
    id_to_stem = {}
    name_to_stems = {}

    for path in data_dir.iterdir():
        if path.suffix.lower() != ".json" or path.name.startswith("_"):
            continue

        stem = path.stem
        data = {}
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

        level_id = data.get("id")
        if isinstance(level_id, int):
            id_to_stem[level_id] = stem

        level_name = str(data.get("name", "")).strip().lower()
        if not level_name:
            level_name = stem.replace("_", " ").strip().lower()

        name_to_stems.setdefault(level_name, []).append(stem)

    return id_to_stem, name_to_stems


def build_author_variant_stem(level_name: str, author: str) -> str:
    safe_author = str(author or "unknown").strip().lower()
    return slugify(f"{level_name}_({safe_author})")


def load_local_level(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def load_existing_list(data_dir: Path) -> list[str]:
    list_path = data_dir / "_list.json"
    if not list_path.exists():
        return []

    try:
        with list_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [str(x) for x in data if isinstance(x, str)]
    except Exception:
        pass

    return []


def list_all_level_stems(data_dir: Path) -> list[str]:
    stems = []
    for path in data_dir.iterdir():
        if path.suffix.lower() != ".json" or path.name.startswith("_"):
            continue
        stems.append(path.stem)
    return stems


def fetch_level_metadata(level_id: int, level_name: str) -> dict:
    try:
        level_api_data = fetch_json(f"{API_BASE}/levels/{level_id}")
        author = level_api_data.get("publisher", {}).get("global_name", "Unknown")

        creators_raw = level_api_data.get("creators", []) or []
        creators = []
        for creator in creators_raw:
            if isinstance(creator, str):
                text = creator.strip()
            elif isinstance(creator, dict):
                text = str(
                    creator.get("global_name")
                    or creator.get("name")
                    or creator.get("username")
                    or ""
                ).strip()
            else:
                text = ""
            if text:
                creators.append(text)

        verifications = level_api_data.get("verifications", []) or []
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
            "creators": creators,
            "verifier": verifier,
            "verification": verification_url,
            "percentToQualify": 100,
            "password": "Free to Copy",
        }
    except Exception as error:
        print(f"Error fetching level metadata {level_name}: {error}")
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


def build_aredl_duplicate_context(levels: list[dict]) -> dict:
    grouped = {}
    for level in levels:
        level_name = str(level.get("name", "")).strip()
        if not level_name:
            continue
        key = normalize_level_name(base_level_name(level_name))
        grouped.setdefault(key, []).append(level)

    duplicate_context = {}
    for key, variants in grouped.items():
        if len(variants) <= 1:
            continue

        tokens_by_id = {}
        for variant in variants:
            level_id = variant.get("id")
            if not isinstance(level_id, int):
                continue
            try:
                api_data = fetch_json(f"{API_BASE}/levels/{level_id}")
                tokens_by_id[level_id] = collect_aredl_identity_tokens(api_data)
            except Exception as error:
                print(f"Could not fetch duplicate context for level {level_id}: {error}")
                tokens_by_id[level_id] = set()

        duplicate_context[key] = {"tokens_by_id": tokens_by_id}

    return duplicate_context


def resolve_pointercrate_records_for_level(
    level_name: str,
    level_id: int,
    pointercrate_records_by_level: dict,
    duplicate_context: dict,
) -> list[dict]:
    base_key = normalize_level_name(base_level_name(level_name))
    candidates = list(pointercrate_records_by_level.get(base_key, []))
    if not candidates:
        return []

    context = duplicate_context.get(base_key)
    if not context:
        return candidates

    target_tokens = context.get("tokens_by_id", {}).get(level_id, set())
    if not target_tokens:
        return []

    matched = []
    for record in candidates:
        pointer_tokens = set(record.get("identity_tokens", []))
        if pointer_tokens and (pointer_tokens & target_tokens):
            matched.append(record)

    return matched


def main() -> None:
    print("Rebuild started")
    try:
        pt_data = fetch_json(f"{API_BASE}/country/{PORTUGAL_COUNTRY_ID}")
    except Exception as error:
        print(f"Error fetching PT country data: {error}")
        return

    players = gather_players(pt_data)
    print(f"AREDL PT players: {len(players)}")

    all_levels = {}

    player_ids = list(players.keys())
    profile_fetch_failures = 0
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=PROFILE_FETCH_WORKERS
    ) as executor:
        futures = {executor.submit(fetch_profile, pid): pid for pid in player_ids}
        for future in concurrent.futures.as_completed(futures):
            pid = futures[future]
            try:
                profile = future.result()
            except Exception as error:
                profile_fetch_failures += 1
                if VERBOSE_OUTPUT:
                    print(f"Failed to fetch profile {pid}: {error}")
                continue

            add_records_from_profile(profile, all_levels)

    total_completions = sum(len(level["records"]) for level in all_levels.values())
    print(f"AREDL completions: {total_completions} across {len(all_levels)} levels")
    if profile_fetch_failures:
        print(f"AREDL profile fetch failures: {profile_fetch_failures}")

    pointercrate_records_by_level = collect_pointercrate_records()

    def sort_key(level: dict):
        is_legacy = bool(level.get("legacy"))
        pos = level.get("position")
        pos = pos if isinstance(pos, int) else 999999
        return (is_legacy, pos)

    sorted_levels = sorted(all_levels.values(), key=sort_key)
    duplicate_context = build_aredl_duplicate_context(sorted_levels)

    id_to_filename, name_to_filenames = load_level_indexes(DATA_DIR)

    aredl_rank_by_name = {}
    raw_records_by_level = {}

    id_name_mismatches = 0
    new_levels_created = 0

    for level in sorted_levels:
        level_name = str(level.get("name", "")).strip()
        if not level_name:
            continue

        level_id = level.get("id")
        filename_base = id_to_filename.get(level_id)
        level_metadata = None

        if filename_base:
            by_id_path = DATA_DIR / f"{filename_base}.json"
            by_id_json = load_local_level(by_id_path)
            by_id_name = str(by_id_json.get("name", "")).strip()
            if by_id_name and normalize_level_name(base_level_name(by_id_name)) != normalize_level_name(base_level_name(level_name)):
                id_name_mismatches += 1
                if VERBOSE_OUTPUT:
                    print(
                        f"ID/name mismatch for {filename_base}: local='{by_id_name}' vs AREDL='{level_name}'. Ignoring ID mapping."
                    )
                filename_base = None

        if not filename_base:
            candidates = name_to_filenames.get(level_name.lower(), [])
            if len(candidates) == 1:
                filename_base = candidates[0]
            elif len(candidates) > 1:
                level_metadata = fetch_level_metadata(level_id, level_name)
                author_variant = build_author_variant_stem(
                    level_name, level_metadata.get("author", "unknown")
                )
                match = next(
                    (candidate for candidate in candidates if candidate.lower() == author_variant.lower()),
                    None,
                )
                filename_base = match or author_variant
            else:
                filename_base = slugify(level_name) or str(level_id or "Unknown")

        filepath = DATA_DIR / f"{filename_base}.json"
        if filename_base not in aredl_rank_by_name:
            aredl_rank_by_name[filename_base] = len(aredl_rank_by_name)

        level_json = load_local_level(filepath)
        if not level_json:
            new_levels_created += 1
            if VERBOSE_OUTPUT:
                print(f"Fetching metadata for new level: {level_name} ({level_id})")
            if level_metadata is None:
                level_metadata = fetch_level_metadata(level_id, level_name)
            level_json = level_metadata

        if isinstance(level_id, int):
            id_to_filename[level_id] = filename_base
        name_to_filenames.setdefault(level_name.lower(), [])
        if filename_base not in name_to_filenames[level_name.lower()]:
            name_to_filenames[level_name.lower()].append(filename_base)

        existing_records = list(level_json.get("records", []) or [])
        existing_hz_by_user = {
            clean_username(str(record.get("user", ""))).lower(): record.get("hz", 360)
            for record in existing_records
            if isinstance(record, dict)
            and record.get("user")
            and not is_excluded_username(record.get("user", ""))
        }

        combined_records = [
            record
            for record in existing_records
            if not is_excluded_username(record.get("user", ""))
        ]
        combined_records.extend(level.get("records", []) or [])
        combined_records.extend(
            resolve_pointercrate_records_for_level(
                level_name,
                level_id,
                pointercrate_records_by_level,
                duplicate_context,
            )
        )

        raw_records_by_level[level_name] = combined_records

        final_records = []
        for record in combined_records:
            user = clean_username(str(record.get("user", "")))
            if not user or user.lower() in EXCLUDED_USERS:
                continue

            final_records.append(
                {
                    "user": user,
                    "link": record.get("link", ""),
                    "percent": record.get("percent", 100),
                    "hz": existing_hz_by_user.get(user.lower(), record.get("hz", 360)),
                }
            )

        final_records = dedupe_and_clean_records(final_records)
        final_records.sort(
            key=lambda record: (
                -int(record.get("percent", 0) or 0),
                str(record.get("user", "")).lower(),
            )
        )

        level_json["records"] = final_records

        filepath.parent.mkdir(parents=True, exist_ok=True)
        with filepath.open("w", encoding="utf-8") as f:
            json.dump(level_json, f, indent=4, ensure_ascii=False)

    report_duplicate_summary(raw_records_by_level)
    print(f"Rebuild summary: new-level-files={new_levels_created}, id-name-mismatches={id_name_mismatches}")

    current_list = load_existing_list(DATA_DIR)
    all_level_stems = set(list_all_level_stems(DATA_DIR))

    final_list_names = []
    seen = set()

    for name in current_list:
        if name in all_level_stems and name not in seen:
            final_list_names.append(name)
            seen.add(name)

    def insert_by_aredl_rank(level_stem: str) -> None:
        rank = aredl_rank_by_name.get(level_stem)
        if rank is None:
            return

        insert_at = len(final_list_names)
        for idx, existing_name in enumerate(final_list_names):
            existing_rank = aredl_rank_by_name.get(existing_name)
            if existing_rank is not None and existing_rank > rank:
                insert_at = idx
                break

        final_list_names.insert(insert_at, level_stem)
        seen.add(level_stem)

    ranked_missing = [
        name
        for name in all_level_stems
        if name not in seen and name in aredl_rank_by_name
    ]
    ranked_missing.sort(key=lambda name: aredl_rank_by_name[name])
    for name in ranked_missing:
        insert_by_aredl_rank(name)

    for name in sorted(all_level_stems):
        if name not in seen:
            final_list_names.append(name)
            seen.add(name)

    with (DATA_DIR / "_list.json").open("w", encoding="utf-8") as f:
        json.dump(final_list_names, f, indent=4, ensure_ascii=False)

    bundled_data = []
    for name in final_list_names:
        try:
            with (DATA_DIR / f"{name}.json").open("r", encoding="utf-8") as level_file:
                bundled_data.append(json.load(level_file))
        except Exception:
            pass

    with (DATA_DIR / "_list_bundled.json").open("w", encoding="utf-8") as f:
        json.dump(bundled_data, f, separators=(",", ":"), ensure_ascii=False)

    print(
        f"\nDone! Rebuilt _list.json and _list_bundled.json with {len(final_list_names)} levels"
    )


if __name__ == "__main__":
    main()
