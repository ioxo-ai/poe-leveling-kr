#!/usr/bin/env python3
"""Validate gems.js quest/vendor rewards against poedb scraped data."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent

# ── Load poedb data ──────────────────────────────────────────────────────────
with open(ROOT / "poedb_rewards.json", encoding="utf-8") as f:
    poedb = json.load(f)

# ── Parse gems.js ────────────────────────────────────────────────────────────
gems_js_text = (ROOT / "js" / "gems.js").read_text(encoding="utf-8")

# Extract gems array (id -> name mapping)
gem_id_to_name = {}
gem_name_to_id = {}
for m in re.finditer(r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)"', gems_js_text):
    gid, gname = m.group(1), m.group(2)
    gem_id_to_name[gid] = gname
    gem_name_to_id[gname] = gid

# Build poedb engName -> gemId mapping
def eng_to_gemid(eng_name):
    """Convert poedb English name (e.g. 'Ground_Slam') to gems.js gemId (e.g. 'ground_slam')."""
    # Known renames
    renames = {
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
    if eng_name in renames:
        return renames[eng_name]
    return eng_name.lower()


def find_matching_bracket(text, start):
    """Find the matching closing bracket for an opening bracket at start."""
    depth = 1
    pos = start
    in_string = False
    while depth > 0 and pos < len(text):
        ch = text[pos]
        if ch == '"' and (pos == 0 or text[pos-1] != '\\'):
            in_string = not in_string
        elif not in_string:
            if ch == '[':
                depth += 1
            elif ch == ']':
                depth -= 1
        pos += 1
    return pos - 1


def parse_rewards_section(section_name):
    """Parse questRewards or vendorRewards from gems.js text."""
    pattern = rf'{section_name}:\s*\['
    match = re.search(pattern, gems_js_text)
    if not match:
        return []

    section_start = match.end()
    section_end = find_matching_bracket(gems_js_text, section_start)
    section_text = gems_js_text[section_start:section_end]

    quests = []
    # Find each quest object by matching "{ act:" and finding balanced braces
    quest_header = re.compile(r'\{\s*act:\s*(\d+),\s*questName:\s*"([^"]+)"')
    for qm in quest_header.finditer(section_text):
        act = int(qm.group(1))
        quest_name = qm.group(2)

        # Find the "rewards: [" after this match
        rest = section_text[qm.start():]
        rewards_match = re.search(r'rewards:\s*\[', rest)
        if not rewards_match:
            continue
        rewards_start = qm.start() + rewards_match.end()
        rewards_end = find_matching_bracket(section_text, rewards_start)
        rewards_text = section_text[rewards_start:rewards_end]

        gems = {}
        gem_pattern = re.compile(
            r'\{\s*gemId:\s*"([^"]+)",\s*classes:\s*\[([^\]]*)\]\s*\}'
        )
        for gm in gem_pattern.finditer(rewards_text):
            gem_id = gm.group(1)
            classes_str = gm.group(2)
            classes = sorted([c.strip().strip('"') for c in classes_str.split(',') if c.strip().strip('"')])
            gems[gem_id] = classes

        quests.append({
            "act": act,
            "questName": quest_name,
            "gems": gems
        })
    return quests


def build_poedb_quest_map(poedb_quests):
    """Build {questEngName: {gemId: sorted_classes}} from poedb data."""
    result = {}
    for q in poedb_quests:
        quest_key = q["questEngName"]
        gems = {}
        for gem_eng, classes in q["gems"]:
            gid = eng_to_gemid(gem_eng)
            gems[gid] = sorted(classes)
        result[quest_key] = {
            "questName": q["questName"],
            "act": q["act"],
            "gems": gems
        }
    return result


# Build quest name mapping (gems.js quest name -> poedb quest eng name)
# We match by English quest name derived from poedb
QUEST_NAME_MAP = {
    # gems.js questName -> poedb questEngName
    "눈 앞의 적": "Enemy_at_the_Gate",
    "로아 알 깔트리기": "Breaking_Some_Eggs",
    "로아 알 깨트리기": "Breaking_Some_Eggs",
    "감금된 덱치": "The_Caged_Brute",
    "감금된 덩치": "The_Caged_Brute",
    "사이렌의 마침곡": "The_Sirens_Cadence",
    "자비로운 임무": "Mercy_Mission",
    "검은 침락자": "Intruders_in_Black",
    "검은 침략자": "Intruders_in_Black",
    "날카로운 눈 넓은 시야": "Sharp_and_Cruel",
    "예리하고 잔인한": "Sharp_and_Cruel",
    "문제의 근원": "The_Root_of_the_Problem",
    "떠나보낸 연인": "Lost_in_Love",
    "오른손 절단": "Sever_the_Right_Hand",
    "오른팔 잘라내기": "Sever_the_Right_Hand",
    "운명의 시련": "A_Fixture_of_Fate",
    "운명의 흔적": "A_Fixture_of_Fate",
    "봉인 해제": "Breaking_the_Seal",
    "영원한 악몽": "The_Eternal_Nightmare",
}

# poedb eng name -> correct Korean name
POEDB_QUEST_NAMES = {}
for q in poedb["questRewards"] + poedb["vendorRewards"]:
    POEDB_QUEST_NAMES[q["questEngName"]] = q["questName"]


def compare_rewards(section_name, gems_js_quests, poedb_quests_raw):
    """Compare a rewards section and print diff."""
    poedb_map = build_poedb_quest_map(poedb_quests_raw)

    print(f"\n{'='*70}")
    print(f"  {section_name}")
    print(f"{'='*70}")

    issues = 0

    # Track which poedb quests were matched
    matched_poedb = set()

    for jsq in gems_js_quests:
        js_name = jsq["questName"]
        act = jsq["act"]
        eng_key = QUEST_NAME_MAP.get(js_name)

        if not eng_key:
            print(f"\n[!] gems.js quest '{js_name}' (Act {act}): NO MAPPING to poedb quest")
            issues += 1
            continue

        correct_kr_name = POEDB_QUEST_NAMES.get(eng_key, "???")

        # Check quest name
        if js_name != correct_kr_name:
            print(f"\n[QUEST NAME] Act {act}: '{js_name}' → should be '{correct_kr_name}' ({eng_key})")
            issues += 1

        if eng_key not in poedb_map:
            print(f"\n[!] poedb has no {section_name} data for '{eng_key}' ({correct_kr_name})")
            issues += 1
            continue

        matched_poedb.add(eng_key)
        poedb_data = poedb_map[eng_key]
        poedb_gems = poedb_data["gems"]
        js_gems = jsq["gems"]

        # Gems only in poedb (missing from gems.js)
        # Filter out gems that don't exist in gems.js gem list at all (new/renamed gems)
        poedb_only = set(poedb_gems.keys()) - set(js_gems.keys())
        # Separate into "known" (in gems array) and "unknown" (not in gems array)
        known_missing = sorted([g for g in poedb_only if g in gem_id_to_name])
        unknown_missing = sorted([g for g in poedb_only if g not in gem_id_to_name])

        if known_missing:
            print(f"\n[MISSING GEMS] Act {act} '{correct_kr_name}' - in poedb but not gems.js:")
            for g in known_missing:
                print(f"  + {g} ({gem_id_to_name.get(g, '?')}) → {poedb_gems[g]}")
            issues += len(known_missing)

        if unknown_missing:
            print(f"\n[UNKNOWN GEMS] Act {act} '{correct_kr_name}' - in poedb, not in gems[] array:")
            for g in unknown_missing:
                print(f"  ? {g} → {poedb_gems[g]}")

        # Gems only in gems.js (extra, not in poedb)
        js_only = sorted(set(js_gems.keys()) - set(poedb_gems.keys()))
        if js_only:
            print(f"\n[EXTRA GEMS] Act {act} '{correct_kr_name}' - in gems.js but not poedb:")
            for g in js_only:
                print(f"  - {g} ({gem_id_to_name.get(g, '?')}) → {js_gems[g]}")
            issues += len(js_only)

        # Class differences for matching gems
        common = sorted(set(js_gems.keys()) & set(poedb_gems.keys()))
        for g in common:
            js_cls = sorted(js_gems[g])
            poedb_cls = sorted(poedb_gems[g])
            if js_cls != poedb_cls:
                added = sorted(set(poedb_cls) - set(js_cls))
                removed = sorted(set(js_cls) - set(poedb_cls))
                parts = []
                if added:
                    parts.append(f"+{added}")
                if removed:
                    parts.append(f"-{removed}")
                print(f"\n[CLASS DIFF] Act {act} '{correct_kr_name}' → {g} ({gem_id_to_name.get(g, '?')})")
                print(f"  gems.js:  {js_cls}")
                print(f"  poedb:    {poedb_cls}")
                print(f"  diff:     {', '.join(parts)}")
                issues += 1

    # Check for poedb quests not in gems.js
    for eng_key, pdata in poedb_map.items():
        if eng_key not in matched_poedb and pdata["gems"]:
            kr_name = pdata["questName"]
            act = pdata["act"]
            print(f"\n[MISSING QUEST] Act {act} '{kr_name}' ({eng_key}) exists in poedb but not in gems.js")
            print(f"  Has {len(pdata['gems'])} gems")
            issues += 1

    print(f"\n--- {issues} issue(s) found in {section_name} ---")
    return issues


# ── Main ─────────────────────────────────────────────────────────────────────
js_quest_rewards = parse_rewards_section("questRewards")
js_vendor_rewards = parse_rewards_section("vendorRewards")

print(f"Loaded {len(js_quest_rewards)} questRewards from gems.js")
print(f"Loaded {len(js_vendor_rewards)} vendorRewards from gems.js")
print(f"Loaded {len(poedb['questRewards'])} questRewards from poedb")
print(f"Loaded {len(poedb['vendorRewards'])} vendorRewards from poedb")
print(f"Known gem IDs in gems[]: {len(gem_id_to_name)}")

total = 0
total += compare_rewards("questRewards", js_quest_rewards, poedb["questRewards"])
total += compare_rewards("vendorRewards", js_vendor_rewards, poedb["vendorRewards"])

print(f"\n{'='*70}")
print(f"  TOTAL: {total} issue(s)")
print(f"{'='*70}")

sys.exit(0 if total == 0 else 1)
