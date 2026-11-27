import json, os, re

def update_dict(name, new_data):
    path = os.path.join(os.path.dirname(__file__), f'{name}.json')
    data = {}
    if os.path.exists(path):
        try:
            data = json.load(open(path, 'r', encoding='utf-8'))
        except Exception as e:
            print(f'Error reading {path}: {e}')
    data.update(new_data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Updated {name}.json: total {len(data)} entries')

print("Script template ready")
