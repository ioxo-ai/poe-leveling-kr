#!/usr/bin/env python3
"""Scrape poedb.tw/kr/Quest and regenerate js/gems.js.

Updates three sections in gems.js:
  - gems[]: adds any missing gem entries discovered from poedb
  - questRewards: per-class format, page order
  - vendorRewards: per-class format with npc/cost, page order

Usage:
    python scrape_poedb.py
"""

import re
import sys
import time
import requests
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent

# == Configuration ============================================================

POEDB_BASE = "https://poedb.tw"
QUEST_URL = f"{POEDB_BASE}/kr/Quest"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}
FETCH_DELAY = 1  # seconds between HTTP requests

# poedb table column order (columns 1-7 after quest column)
CLASS_COLUMNS = ["marauder", "witch", "scion", "ranger", "duelist", "shadow", "templar"]

# Korean class name -> English ID (for deep-fetch pages)
KR_CLASS_MAP = {
    "머라우더": "marauder",
    "위치": "witch",
    "사이온": "scion",
    "레인저": "ranger",
    "듀얼리스트": "duelist",
    "쉐도우": "shadow",
    "템플러": "templar",
}

# poedb English gem name -> gems.js ID (for names that don't simply lowercase)
RENAMES = {
    "Old_Arctic_Armour": "arctic_armour",
    "Old_Phase_Run": "phase_run",
    "Power_Charge_On_Critical_Support": "power_charge_on_critical_support",
    "Cast_On_Critical_Strike_Support": "cast_on_critical_strike_support",
    "Cast_on_Melee_Kill_Support": "cast_on_melee_kill_support",
    "Cast_on_Death_Support": "cast_on_death_support",
    "Cast_when_Damage_Taken_Support": "cast_when_damage_taken_support",
    "Cast_when_Stunned_Support": "cast_when_stunned_support",
    "Cast_while_Channelling_Support": "cast_while_channelling_support",
    "Mark_On_Hit_Support": "mark_on_hit_support",
    "High-Impact_Mine_Support": "high-impact_mine_support",
}

# poedb gem CSS class -> gems.js color
GEM_COLOR_MAP = {
    "gem_red": "str",
    "gem_green": "dex",
    "gem_blue": "int",
}

# Quest English name -> (NPC Korean name, cost currency)
NPC_COST_MAP = {
    "Enemy_at_the_Gate": ("네사", "wisdom"),
    "Mercy_Mission": ("네사", "wisdom"),
    "Breaking_Some_Eggs": ("네사", "wisdom"),
    "The_Caged_Brute": ("네사", "transmutation"),
    "The_Sirens_Cadence": ("네사", "transmutation"),
    "Intruders_in_Black": ("예나", "alteration"),
    "Sharp_and_Cruel": ("예나", "alteration"),
    "The_Root_of_the_Problem": ("예나", "alteration"),
    "Lost_in_Love": ("클라리사", "alteration"),
    "Sever_the_Right_Hand": ("클라리사", "chance"),
    "A_Fixture_of_Fate": ("시오사", "chance"),
    "The_Eternal_Nightmare": ("페타루스와 바냐", "alchemy"),
    "Breaking_the_Seal": ("페타루스와 바냐", "chance"),
}

# == Gem registry (populated during scraping) =================================

# eng_name -> {"kr_name": str, "css_class": str}
gem_registry = {}


def register_gem(a_tag):
    """Register gem metadata from an <a class='gem_*'> element."""
    href = a_tag.get("href", "")
    if "/kr/" not in href:
        return
    eng_name = extract_eng_name(href)
    if eng_name in gem_registry:
        return
    kr_name = a_tag.get_text(strip=True)
    classes = a_tag.get("class", [])
    css_class = next((c for c in classes if c.startswith("gem_")), "gem_green")
    gem_registry[eng_name] = {"kr_name": kr_name, "css_class": css_class}


# == Helper functions =========================================================


def fetch(url):
    """Fetch a URL and return BeautifulSoup parsed HTML."""
    print(f"  Fetching {url} ...", end=" ", flush=True)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    print(f"OK ({len(resp.text):,} bytes)")
    return BeautifulSoup(resp.text, "lxml")


def extract_eng_name(href):
    """'/kr/Ground_Slam' -> 'Ground_Slam'"""
    return href.rsplit("/", 1)[-1]


def eng_to_gemid(eng_name):
    """Convert poedb English gem name to gems.js gem ID."""
    if eng_name in RENAMES:
        return RENAMES[eng_name]
    return eng_name.lower()


def extract_act(cell):
    """Extract act number from quest cell text (e.g. 'Act1', 'Act 3')."""
    text = cell.get_text()
    m = re.search(r"Act\s*(\d+)", text)
    return int(m.group(1)) if m else None


def extract_quest_info(cell):
    """Extract (Korean name, English name) from a quest cell's link.

    Handles both class='questitem' (Table 2) and class='WorldAreas' (Table 1).
    """
    link = cell.find("a", class_="questitem")
    if not link:
        link = cell.find("a", class_="WorldAreas")
    if not link:
        return None, None
    return link.get_text(strip=True), extract_eng_name(link["href"])


def extract_gems_from_cell(cell):
    """Extract list of gem English names from a table cell.

    Also registers each gem's metadata in gem_registry.
    """
    gems = []
    for a in cell.find_all("a", class_=re.compile(r"^gem_")):
        href = a.get("href", "")
        if "/kr/" in href:
            register_gem(a)
            gems.append(extract_eng_name(href))
    return gems


def collect_tables(soup, start_id, stop_id=None):
    """Collect top-level <table> elements after start_id until stop_id is reached."""
    start = soup.find(id=start_id)
    if not start:
        sys.exit(f"ERROR: #{start_id} not found on page")
    tables = []
    seen = set()
    for el in start.find_all_next():
        if stop_id and el.get("id") == stop_id:
            break
        if el.name == "table" and id(el) not in seen:
            if not any(el in t.descendants for t in tables):
                tables.append(el)
                seen.add(id(el))
    return tables


# == Parse QuestReward ========================================================


def parse_quest_rewards(soup):
    """Parse #QuestReward tables.

    Returns:
        quest_rewards: [{act, questName, questEngName, perClass, _pos}, ...]
        item_only_rows: [{act, questName, questEngName, _pos}, ...]
    """
    tables = collect_tables(soup, "QuestReward", "QuestVendorRewards")
    print(f"  Found {len(tables)} table(s) under #QuestReward")

    quest_rewards = []
    item_only_rows = []
    pos = 0

    for table in tables:
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"], recursive=False)
            if not cells or cells[0].name == "th":
                continue

            num_cells = len(cells)
            has_colspan = any(c.get("colspan") for c in cells[1:]) if num_cells > 1 else False

            if num_cells >= 8 and not has_colspan:
                quest_kr, quest_eng = extract_quest_info(cells[0])
                if not quest_kr:
                    continue
                act = extract_act(cells[0])
                if act is None:
                    act = 1

                per_class = {}
                for i, cls in enumerate(CLASS_COLUMNS):
                    gems = extract_gems_from_cell(cells[i + 1])
                    if gems:
                        per_class[cls] = gems

                quest_rewards.append({
                    "act": act,
                    "questName": quest_kr,
                    "questEngName": quest_eng,
                    "perClass": per_class,
                    "_pos": pos,
                })
                pos += 1

            elif has_colspan or num_cells == 2:
                quest_kr, quest_eng = extract_quest_info(cells[0])
                if quest_kr:
                    act = extract_act(cells[0])
                    item_only_rows.append({
                        "act": act,
                        "questName": quest_kr,
                        "questEngName": quest_eng,
                        "_pos": pos,
                    })
                    pos += 1

    return quest_rewards, item_only_rows


# == Parse QuestVendorRewards =================================================


def parse_vendor_rewards(soup, act_map):
    """Parse #QuestVendorRewards table."""
    tables = collect_tables(soup, "QuestVendorRewards")
    if not tables:
        sys.exit("ERROR: No table found under #QuestVendorRewards")
    table = tables[0]

    results = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if not cells or cells[0].name == "th":
            continue
        if len(cells) < 8:
            continue

        quest_kr, quest_eng = extract_quest_info(cells[0])
        if not quest_kr:
            continue

        act = act_map.get(quest_eng)
        if act is None:
            print(f"  WARNING: No act number for vendor quest '{quest_kr}' ({quest_eng})")

        per_class = {}
        for i, cls in enumerate(CLASS_COLUMNS):
            gems = extract_gems_from_cell(cells[i + 1])
            if gems:
                per_class[cls] = gems

        results.append({
            "act": act,
            "questName": quest_kr,
            "questEngName": quest_eng,
            "perClass": per_class,
        })

    return results


# == Deep-fetch individual quest pages ========================================


def deep_fetch_quest(quest_eng):
    """Fetch /kr/{quest_eng} page and extract per-class gem rewards."""
    url = f"{POEDB_BASE}/kr/{quest_eng}"
    soup = fetch(url)
    time.sleep(FETCH_DELAY)

    per_class = {}
    for table in soup.find_all("table"):
        found_any = False
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) < 2:
                continue
            cell_text = cells[0].get_text(strip=True)
            cls_id = KR_CLASS_MAP.get(cell_text)
            if cls_id:
                found_any = True
                gems = extract_gems_from_cell(cells[1])
                if gems:
                    per_class[cls_id] = gems
        if found_any and per_class:
            break

    return per_class


# == gems[] management ========================================================

GEM_ENTRY_RE = re.compile(
    r'\{\s*id:\s*"(?P<id>[^"]+)",\s*name:\s*"(?P<name>[^"]+)",'
    r'\s*type:\s*"(?P<type>[^"]+)",\s*color:\s*"(?P<color>[^"]+)",'
    r'\s*icon:\s*"(?P<icon>[^"]+)"\s*\}'
)


def parse_existing_gems(text):
    """Parse gems[] entries from gems.js into a list of dicts."""
    gems_start, gems_end = find_section_bounds(text, "gems")
    section = text[gems_start:gems_end]
    entries = []
    for m in GEM_ENTRY_RE.finditer(section):
        entries.append({
            "id": m.group("id"),
            "name": m.group("name"),
            "type": m.group("type"),
            "color": m.group("color"),
            "icon": m.group("icon"),
        })
    return entries


def build_missing_gems(existing_gems):
    """Find gems in gem_registry that are missing from existing gems[].

    Returns list of new gem entry dicts.
    """
    existing_ids = {g["id"] for g in existing_gems}
    new_entries = []

    for eng_name, info in sorted(gem_registry.items()):
        gid = eng_to_gemid(eng_name)
        if gid in existing_ids:
            continue

        color = GEM_COLOR_MAP.get(info["css_class"], "dex")
        gtype = "support" if "_Support" in eng_name else "skill"
        icon = f"{eng_name}.png"

        new_entries.append({
            "id": gid,
            "name": info["kr_name"],
            "type": gtype,
            "color": color,
            "icon": icon,
        })
        existing_ids.add(gid)  # prevent duplicates from RENAMES

    return new_entries


def generate_gems_js(all_gems):
    """Generate the gems[] section for gems.js."""
    all_gems.sort(key=lambda g: g["id"])
    lines = ["  gems: ["]
    for g in all_gems:
        lines.append(
            f'    {{ id: "{g["id"]}", name: "{g["name"]}", '
            f'type: "{g["type"]}", color: "{g["color"]}", '
            f'icon: "{g["icon"]}" }},'
        )
    lines.append("  ],")
    return "\n".join(lines)


# == Generate reward JS sections ==============================================


def generate_quest_rewards_js(quest_rewards, gem_id_set):
    """Generate questRewards JS section in perClass format."""
    lines = ["  questRewards: ["]

    for q in quest_rewards:
        class_lines = []
        for cls in CLASS_COLUMNS:
            raw_gems = q["perClass"].get(cls, [])
            gem_ids = [eng_to_gemid(e) for e in raw_gems if eng_to_gemid(e) in gem_id_set]
            if gem_ids:
                gems_str = ", ".join(f'"{g}"' for g in gem_ids)
                class_lines.append(f"      {cls}: [{gems_str}]")

        if not class_lines:
            continue

        act = q.get("act") or 0
        extras = ""
        if q.get("maxSelect"):
            extras = f', maxSelect: {q["maxSelect"]}'

        lines.append(f'    {{ act: {act}, questName: "{q["questName"]}"{extras}, rewards: {{')
        lines.append(",\n".join(class_lines) + ",")
        lines.append("    }},")

    lines.append("  ],")
    return "\n".join(lines)


def generate_vendor_rewards_js(vendor_rewards, gem_id_set):
    """Generate vendorRewards JS section in perClass format with npc/cost."""
    lines = ["  vendorRewards: ["]

    for q in vendor_rewards:
        class_lines = []
        for cls in CLASS_COLUMNS:
            raw_gems = q["perClass"].get(cls, [])
            gem_ids = [eng_to_gemid(e) for e in raw_gems if eng_to_gemid(e) in gem_id_set]
            if gem_ids:
                gems_str = ", ".join(f'"{g}"' for g in gem_ids)
                class_lines.append(f"      {cls}: [{gems_str}]")

        if not class_lines:
            continue

        act = q.get("act") or 0
        eng = q["questEngName"]
        npc, cost = NPC_COST_MAP.get(eng, ("???", "???"))
        if npc == "???":
            print(f"  WARNING: Unknown NPC/cost for '{q['questName']}' ({eng})")

        lines.append(f'    {{ act: {act}, questName: "{q["questName"]}", npc: "{npc}", cost: "{cost}", rewards: {{')
        lines.append(",\n".join(class_lines) + ",")
        lines.append("    }},")

    lines.append("  ],")
    return "\n".join(lines)


# == Replace sections in gems.js ==============================================


def find_section_bounds(text, section_name):
    """Find start/end positions of a named array section using bracket matching."""
    marker = f"  {section_name}: ["
    start = text.index(marker)

    depth = 0
    pos = start + len(f"  {section_name}: ")
    while pos < len(text):
        ch = text[pos]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                break
        pos += 1

    end = pos + 1  # include the ']'
    if end < len(text) and text[end] == ",":
        end += 1
    return start, end


def replace_all_sections(gems_js_text, gems_section, quest_section, vendor_section):
    """Replace gems[], questRewards, and vendorRewards sections in gems.js."""
    # Find all three section bounds (order matters: gems before quest before vendor)
    g_start, g_end = find_section_bounds(gems_js_text, "gems")
    q_start, q_end = find_section_bounds(gems_js_text, "questRewards")
    v_start, v_end = find_section_bounds(gems_js_text, "vendorRewards")

    return (
        gems_js_text[:g_start]
        + gems_section + "\n"
        + gems_js_text[g_end:q_start].lstrip("\n")
        + quest_section + "\n"
        + gems_js_text[q_end:v_start].lstrip("\n")
        + vendor_section + "\n"
        + gems_js_text[v_end:]
    )


# == Main =====================================================================


def main():
    print("=== scrape_poedb.py: Scraping poedb.tw Quest page ===\n")

    # Step 1: Fetch main Quest page
    soup = fetch(QUEST_URL)
    time.sleep(FETCH_DELAY)

    # Step 2: Parse QuestReward tables (also populates gem_registry)
    print("\nParsing #QuestReward...")
    quest_rewards, item_only_rows = parse_quest_rewards(soup)
    print(f"  {len(quest_rewards)} gem quests, {len(item_only_rows)} item-only rows")

    # Build act map (quest eng name -> act) for vendor rewards
    act_map = {}
    for q in quest_rewards:
        act_map[q["questEngName"]] = q["act"]
    for row in item_only_rows:
        if row["act"]:
            act_map[row["questEngName"]] = row["act"]

    # Step 3: Parse VendorRewards table (also populates gem_registry)
    print("\nParsing #QuestVendorRewards...")
    vendor_rewards = parse_vendor_rewards(soup, act_map)
    print(f"  {len(vendor_rewards)} vendor quests")

    # Step 4: Deep-fetch quests that have item-only rows but appear in vendor rewards
    vendor_eng_names = {v["questEngName"] for v in vendor_rewards}
    already_have_gems = {q["questEngName"] for q in quest_rewards}
    deep_fetch_list = [
        row for row in item_only_rows
        if row["questEngName"] in vendor_eng_names
        and row["questEngName"] not in already_have_gems
    ]

    if deep_fetch_list:
        print(f"\nDeep-fetching {len(deep_fetch_list)} quest(s) for per-class data:")
        for row in deep_fetch_list:
            print(f"  -> {row['questName']} ({row['questEngName']})")
            per_class = deep_fetch_quest(row["questEngName"])
            if per_class:
                quest_rewards.append({
                    "act": row["act"],
                    "questName": row["questName"],
                    "questEngName": row["questEngName"],
                    "perClass": per_class,
                    "_pos": row["_pos"],
                })
                total = sum(len(v) for v in per_class.values())
                print(f"    Got {total} gems across {len(per_class)} classes")
            else:
                print("    WARNING: No per-class data found!")

        quest_rewards.sort(key=lambda x: x["_pos"])

    print(f"\nGem registry: {len(gem_registry)} unique gem names collected from poedb")

    # Step 5: Load existing gems.js
    gems_js_text = (ROOT / "js" / "gems.js").read_text(encoding="utf-8")
    existing_gems = parse_existing_gems(gems_js_text)
    print(f"Existing gems[]: {len(existing_gems)} entries")

    # Step 6: Add missing gems to gems[]
    new_gems = build_missing_gems(existing_gems)
    if new_gems:
        print(f"Adding {len(new_gems)} new gem(s) to gems[]:")
        for g in new_gems:
            print(f"  + {g['id']} ({g['name']}, {g['type']}, {g['color']})")
    all_gems = existing_gems + new_gems
    gem_id_set = {g["id"] for g in all_gems}

    # Preserve maxSelect from existing gems.js
    for m in re.finditer(r'questName:\s*"([^"]+)",\s*maxSelect:\s*(\d+)', gems_js_text):
        for q in quest_rewards:
            if q["questName"] == m.group(1):
                q["maxSelect"] = int(m.group(2))

    # Step 7: Generate all JS sections
    print("\nGenerating gems[]...")
    gems_js = generate_gems_js(all_gems)

    print("Generating questRewards (perClass)...")
    quest_js = generate_quest_rewards_js(quest_rewards, gem_id_set)

    print("Generating vendorRewards (perClass)...")
    vendor_js = generate_vendor_rewards_js(vendor_rewards, gem_id_set)

    # Step 8: Replace all sections in gems.js
    print("\nReplacing sections in gems.js...")
    new_text = replace_all_sections(gems_js_text, gems_js, quest_js, vendor_js)

    output_path = ROOT / "js" / "gems.js"
    output_path.write_text(new_text, encoding="utf-8")

    # -- Stats --
    q_count = sum(1 for line in quest_js.split("\n") if "act:" in line)
    v_count = sum(1 for line in vendor_js.split("\n") if "act:" in line)

    print(f"\n{'='*60}")
    print(f"  gems[]        : {len(all_gems):>3} entries ({len(new_gems)} new)")
    print(f"  questRewards  : {q_count:>3} quests")
    print(f"  vendorRewards : {v_count:>3} quests")
    print(f"{'='*60}")

    print(f"\nWritten to {output_path}")


if __name__ == "__main__":
    main()
