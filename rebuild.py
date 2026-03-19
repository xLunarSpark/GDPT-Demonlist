import json
import os
import urllib.request

PORTUGAL_COUNTRY_ID = 620
DATA_DIR = "data"

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def slugify(name):
    return name.strip().replace(" ", "_")

def main():
    print("Fetching data")
    try:
        pt_data = fetch_json(f"https://api.aredl.net/v2/api/aredl/country/{PORTUGAL_COUNTRY_ID}")
    except Exception as e:
        print(f"Error fetching PT country data: {e}")
        return

    players = {}
    for r in pt_data.get("records", []):
        p = r["submitted_by"]
        if p["id"] not in players:
            players[p["id"]] = p

    for r in pt_data.get("published", []):
        p = r.get("publisher", {})
        if "id" in p and p["id"] not in players:
            players[p["id"]] = p 

    print(f"Found {len(players)} players. Fetching data...")
    
    all_levels = {}
    
    for pid, p in players.items():
        try:
            profile = fetch_json(f"https://api.aredl.net/v2/api/aredl/profile/{pid}")
            # Get username
            username = profile.get("global_name") or profile.get("username", "Unknown")
            if username.islower() and len(username) > 0:
                username = username.title()
                
            for rec in profile.get("records", []):
                lvl_info = rec["level"]
                lvl_id = lvl_info["level_id"]
                
                # Init this level correctly
                if lvl_id not in all_levels:
                    all_levels[lvl_id] = {
                        "id": lvl_id,
                        "name": lvl_info["name"].strip(),
                        "position": lvl_info.get("position", 999999), 
                        "legacy": lvl_info.get("legacy", False),
                        "records": []
                    }
                    
                all_levels[lvl_id]["records"].append({
                    "user": username,
                    "link": rec.get("video_url", ""),
                    "percent": 100,
                    "hz": 360 # Defaulted
                })
        except Exception as e:
            print(f"Failed to fetch profile {pid}: {e}")
            
    print(f"Found {sum(len(l['records']) for l in all_levels.values())} total completions across {len(all_levels)} unique levels!")

    # Sort levels. 
    def sort_key(x):
        is_legacy = x["legacy"]
        pos = x["position"] if x["position"] is not None else 999999
        return (is_legacy, pos)

    sorted_levels = sorted(all_levels.values(), key=sort_key)
    
    # Pre map
    name_to_filename = {}
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json") or filename.startswith("_"):
            continue
        filepath = os.path.join(DATA_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                name_to_filename[data.get("name", "").strip().lower()] = filename.replace(".json", "")
        except Exception:
            name_to_filename[filename.replace(".json", "").replace("_"," ").strip().lower()] = filename.replace(".json", "")

    new_list_names = []
    
    for lvl in sorted_levels:
        lvl_name = lvl["name"].strip()
        filename_base = name_to_filename.get(lvl_name.lower())
        if not filename_base:
            filename_base = slugify(lvl_name)
            
        filepath = os.path.join(DATA_DIR, f"{filename_base}.json")
        new_list_names.append(filename_base)
        
        level_json = {}
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    level_json = json.load(f)
            except Exception:
                pass
                
        if not level_json:
            print(f"Fetching metadata for new level: {lvl_name} ({lvl['id']})")
            try:
                lvl_api_data = fetch_json(f"https://api.aredl.net/v2/api/aredl/levels/{lvl['id']}")
                author = lvl_api_data.get("publisher", {}).get("global_name", "Unknown")
                verifications = lvl_api_data.get("verifications", [])
                verifier = "Unknown"
                verification_url = ""
                if verifications:
                    verifier = verifications[0].get("submitted_by", {}).get("global_name", "Unknown")
                    verification_url = verifications[0].get("video_url", "")
                    
                level_json = {
                    "id": lvl["id"],
                    "name": lvl_name,
                    "author": author,
                    "creators": [],
                    "verifier": verifier,
                    "verification": verification_url,
                    "percentToQualify": 100,
                    "password": "Free to Copy"
                }
            except Exception as e:
                print(f"Error fetching level metadata {lvl_name}: {e}")
                level_json = {
                    "id": lvl["id"],
                    "name": lvl_name,
                    "author": "Unknown",
                    "creators": [],
                    "verifier": "Unknown",
                    "verification": "",
                    "percentToQualify": 100,
                    "password": "Free to Copy"
                }
                
        existing_records = {r.get("user", "").lower(): r.get("hz", 360) for r in level_json.get("records", [])}
        
        final_records = []
        for new_r in lvl["records"]:
            new_r["hz"] = existing_records.get(new_r["user"].lower(), 360)
            final_records.append(new_r)
            
        level_json["records"] = final_records
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(level_json, f, indent=4)
            
    with open(os.path.join(DATA_DIR, "_list.json"), "w", encoding="utf-8") as f:
        json.dump(new_list_names, f, indent=4)
        
    print(f"\nDone! Rebuilt _list.json with {len(new_list_names)} levels")

if __name__ == '__main__':
    main()
