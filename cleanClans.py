import os
import json
import re

def clean():
    path = 'data'
    changes = 0

    aliases = {
        "gamer_bernax": "BernaX",
        "manugrk": "Manu",
        "zhexya": "Hexya",
        "[LCG] Karma": "Karma",
        "[WBT] Taiago": "Taiago",
        "[LCG] LunarSpark": "LunarSpark"
    }

    for file in os.listdir(path):
        if not file.endswith('.json') or file in ('_editors.json', '_list.json'):
            continue
            
        filepath = os.path.join(path, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    continue  # Skip empty files
                data = json.load(open(filepath, 'r', encoding='utf-8'))
                
            records = data.get('records', [])
            if not records:
                continue
                
            new_records = {} # Map from lowercase_name -> record dict
            modified = False
            
            for r in records:
                original_user = r['user']
                
                # Strip clan tag like [WBT] Taiago -> Taiago
                cleaned = re.sub(r'^\[.*?\]\s*', '', original_user).strip()
                
                # Check for aliases
                lower_clean = cleaned.lower()
                if lower_clean in aliases:
                    cleaned = aliases[lower_clean]
                    
                if cleaned != original_user:
                    modified = True
                    r['user'] = cleaned
                
                key = cleaned.lower()
                if key not in new_records:
                    new_records[key] = r
                else:
                    # Merge logic (duplicate found)
                    modified = True
                    # Let's keep the one with the higher percent, although usually they are 100
                    if r.get('percent', 0) > new_records[key].get('percent', 0):
                        new_records[key] = r
            
            if modified:
                data['records'] = list(new_records.values())
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                changes += 1
                
        except Exception as e:
            print(f"Failed to process {filepath}: {e}")

    print(f"Cleaned clan tags & duplicates in {changes} level files.")

if __name__ == '__main__':
    clean()