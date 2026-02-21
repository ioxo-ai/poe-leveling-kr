"""Match gems.js entries to local PNG icons from yt-parser/icons and copy them."""
import json
import re
import shutil
from pathlib import Path

ICONS_DIR = Path(r"C:\Users\lemon\OneDrive\Documents\Projects\yt-parser\icons")
GEMS_JS = Path(r"C:\Users\lemon\OneDrive\Documents\Projects\poe-leveling-kr\js\gems.js")
MAP_JSON = ICONS_DIR / "gem_icons_map.json"
OUT_DIR = Path(r"C:\Users\lemon\OneDrive\Documents\Projects\poe-leveling-kr\img\gems")

# 1. Load gem_icons_map.json: cdn_path -> name
with open(MAP_JSON, encoding="utf-8") as f:
    icon_map = json.load(f)

cdn_to_name = {}
for entry in icon_map:
    # icon: "https://cdn.poedb.tw/image/Art/2DItems/Gems/MoltenStrike.webp"
    cdn_path = entry["icon"].replace("https://cdn.poedb.tw/image/", "")
    cdn_to_name[cdn_path] = entry["name"]  # e.g. "Molten_Strike"

# 2. Build a set of available PNGs (case-insensitive lookup)
available_pngs = {}
for f in ICONS_DIR.glob("*.png"):
    available_pngs[f.stem.lower()] = f  # key: lowercase name, value: full path

# 3. Parse gems.js to extract gem entries
gems_text = GEMS_JS.read_text(encoding="utf-8")
# Match patterns like: { id: "xxx", ..., icon: "Art/2DItems/Gems/..." }
gem_pattern = re.compile(
    r'\{\s*id:\s*"([^"]+)".*?icon:\s*"([^"]+)"',
    re.DOTALL
)

gems = gem_pattern.findall(gems_text)
print(f"Found {len(gems)} gems in gems.js")
print(f"Found {len(cdn_to_name)} entries in gem_icons_map.json")
print(f"Found {len(available_pngs)} PNG icons available")

# 4. Match each gem to a PNG
matched = {}
unmatched = []

for gem_id, icon_path in gems:
    # Try direct mapping via gem_icons_map.json
    name = cdn_to_name.get(icon_path)
    if name and name.lower() in available_pngs:
        matched[gem_id] = (icon_path, name, available_pngs[name.lower()])
        continue

    # Fallback: try to derive name from gem_id
    # e.g. "molten_strike" -> "Molten_Strike"
    id_based_name = gem_id.replace("-", "_")
    # Remove _support suffix for lookup
    id_clean = id_based_name.replace("_support", "")

    # Try with _Support suffix too
    for candidate in [id_based_name, id_clean, id_based_name + "_support",
                      id_clean.title().replace("_", "_")]:
        if candidate.lower() in available_pngs:
            matched[gem_id] = (icon_path, candidate, available_pngs[candidate.lower()])
            break
    else:
        # Try title case version: molten_strike -> Molten_Strike
        title_name = "_".join(w.capitalize() for w in gem_id.split("_"))
        if title_name.lower() in available_pngs:
            matched[gem_id] = (icon_path, title_name, available_pngs[title_name.lower()])
        else:
            # Try without _support
            title_clean = "_".join(w.capitalize() for w in id_clean.split("_"))
            if title_clean.lower() in available_pngs:
                matched[gem_id] = (icon_path, title_clean, available_pngs[title_clean.lower()])
            else:
                unmatched.append((gem_id, icon_path))

print(f"\nMatched: {len(matched)}")
print(f"Unmatched: {len(unmatched)}")

if unmatched:
    print("\n--- UNMATCHED GEMS ---")
    for gem_id, icon_path in sorted(unmatched):
        print(f"  {gem_id:45s} {icon_path}")

# 5. Copy matched PNGs to output directory
OUT_DIR.mkdir(parents=True, exist_ok=True)
icon_mapping = {}  # gem_id -> new filename

for gem_id, (old_icon, name, src_path) in matched.items():
    # Use the PNG filename as-is (preserving the name from yt-parser/icons)
    dst = OUT_DIR / src_path.name
    if not dst.exists():
        shutil.copy2(src_path, dst)
    icon_mapping[gem_id] = src_path.stem  # filename without extension

# Save mapping for later use
with open(OUT_DIR.parent / "gem_icon_mapping.json", "w", encoding="utf-8") as f:
    json.dump(icon_mapping, f, indent=2, ensure_ascii=False)

print(f"\nCopied {len(set(p.name for _, (_, _, p) in matched.items()))} unique PNG files to {OUT_DIR}")
print(f"Mapping saved to {OUT_DIR.parent / 'gem_icon_mapping.json'}")
