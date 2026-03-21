import os
import json
from collections import defaultdict

def check_duplicates():
    path = 'data'
    level_dups = 0

    global_user_variations = defaultdict(set)

    print("Checking for duplicates within individual level files...")
    
    for file in os.listdir(path):
        if not file.endswith('.json') or file in ('_editors.json', '_list.json'):
            continue
            
        filepath = os.path.join(path, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    continue
                data = json.loads(content)
                
            records = data.get('records', [])
            seen = set()
            for r in records:
                raw_user = r['user']
                lower_user = raw_user.strip().lower()
                
                if lower_user in seen:
                    print(f" -> [{file}] Duplicate record found for: '{raw_user}'")
                    level_dups += 1
                seen.add(lower_user)
                
                global_user_variations[lower_user].add(raw_user)
                
        except Exception as e:
            print(f"Error reading {file}: {e}")

    if level_dups == 0:
        print(" -> No duplicates found within individual level files.\n")
    else:
        print(f" -> Total intra-level duplicates: {level_dups}\n")

    print("Checking for global name styling variations (capitalization/spacing mismatches)...")
    variations_found = 0
    for lower_user, forms in global_user_variations.items():
        if len(forms) > 1:
            print(f" -> Variation found for '{lower_user}': {list(forms)}")
            variations_found += 1

    if variations_found == 0:
        print(" -> No global variations found.")
    else:
        print(f" -> Total global variations: {variations_found}")

if __name__ == '__main__':
    check_duplicates()
