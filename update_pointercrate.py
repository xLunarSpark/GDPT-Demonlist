import os
import json
import urllib.request
import time
import re

HEADERS = {'User-Agent': 'Mozilla/5.0'}

def normalize_name(name):
    return re.sub(r'\[.*?\]\s*', '', name).lower().strip()

def get_pt_players():
    req = urllib.request.Request('https://pointercrate.com/api/v1/players/?nation=PT', headers=HEADERS)
    res = urllib.request.urlopen(req).read()
    return json.loads(res.decode('utf-8'))

def get_player(player_id):
    req = urllib.request.Request(f'https://pointercrate.com/api/v1/players/{player_id}', headers=HEADERS)
    res = urllib.request.urlopen(req).read()
    return json.loads(res.decode('utf-8'))['data']

def main():
    local_levels = {}
    path = 'data'
    for file in os.listdir(path):
        if not file.endswith('.json') or file in ('_editors.json', '_list.json'):
            continue
        filepath = os.path.join(path, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                name = data.get('name', '').lower()
                if name:
                    local_levels[name] = filepath
        except Exception as e:
            print(f"Error loading {filepath}: {e}")

    print(f"Loaded {len(local_levels)} local levels.")
    
    # 2. Get PT players
    print("Fetching PT players...")
    players = get_pt_players()
    print(f"Found {len(players)} PT players.")

    changes = 0

    for p in players:
        print(f"Fetching records for {p['name']}...")
        time.sleep(0.5)
        details = get_player(p['id'])
        records = details.get('records', [])
        
        for r in records:
            if r['status'] != 'approved': continue
            d_name = r['demon']['name'].lower()
            
            if d_name in local_levels:
                filepath = local_levels[d_name]
                with open(filepath, 'r', encoding='utf-8') as f:
                    level_data = json.load(f)
                
                existing_records = level_data.get('records', [])
                
                player_name = details['name']
                norm_player = normalize_name(player_name)
                
                found = False
                for cr in existing_records:
                    if normalize_name(cr['user']) == norm_player:
                        found = True
                        break
                    # Also check if video link matches exactly (very strong signal)
                    if cr.get('link') and r.get('video') and cr['link'] == r['video']:
                        found = True
                        break
                
                if not found:
                    existing_records.append({
                        "user": player_name,
                        "link": r['video'],
                        "percent": r['progress'],
                        "hz": 360 
                    })
                    level_data['records'] = existing_records
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(level_data, f, indent=4)
                    print(f"  Added {player_name} ({r['progress']}%) to {d_name}")
                    changes += 1

    print(f"Done! {changes} records appended from Pointercrate.")

if __name__ == '__main__':
    main()