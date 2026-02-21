#!/usr/bin/env python3
"""Generate corrected questRewards and vendorRewards sections from poedb data.

Reads poedb_rewards.json (ground truth) and gems.js (for gem ID list),
then outputs a corrected gems.js with accurate reward data.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent

# ── Load poedb data ──────────────────────────────────────────────────────────
with open(ROOT / "poedb_rewards.json", encoding="utf-8") as f:
    poedb = json.load(f)

# ── Parse gems.js to get gem IDs ─────────────────────────────────────────────
gems_js_text = (ROOT / "js" / "gems.js").read_text(encoding="utf-8")

gem_id_set = set()
for m in re.finditer(r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)"', gems_js_text):
    gem_id_set.add(m.group(1))

# ── Eng name → gemId mapping ─────────────────────────────────────────────────
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

def eng_to_gemid(eng_name):
    if eng_name in RENAMES:
        return RENAMES[eng_name]
    return eng_name.lower()

# ── NPC mapping for vendor rewards ───────────────────────────────────────────
NPC_MAP = {
    "Enemy_at_the_Gate": "네사",
    "Mercy_Mission": "네사",
    "Breaking_Some_Eggs": "네사",
    "The_Caged_Brute": "네사",
    "The_Sirens_Cadence": "네사",
    "Intruders_in_Black": "예나",
    "Sharp_and_Cruel": "예나",
    "The_Root_of_the_Problem": "예나",
    "Lost_in_Love": "클라리사",
    "Sever_the_Right_Hand": "클라리사",
    "A_Fixture_of_Fate": "시오사",
    "The_Eternal_Nightmare": "페타루스와 바냐",
    "Breaking_the_Seal": "페타루스와 바냐",
}

# ── Build gem entries from poedb quest data ──────────────────────────────────
def build_gem_entries(poedb_gems):
    """Convert poedb gems list to sorted (gemId, classes) pairs, skipping unknown gems."""
    entries = []
    for gem_eng, classes in poedb_gems:
        gid = eng_to_gemid(gem_eng)
        if gid not in gem_id_set:
            continue  # Skip gems not in gems[] array
        sorted_cls = sorted(classes)
        entries.append((gid, sorted_cls))
    entries.sort(key=lambda x: x[0])
    return entries


def format_classes(classes):
    """Format class list as JS array string."""
    return "[" + ", ".join(f'"{c}"' for c in classes) + "]"


# ── Generate questRewards ────────────────────────────────────────────────────
def generate_quest_rewards():
    lines = ["  questRewards: ["]
    for q in poedb["questRewards"]:
        entries = build_gem_entries(q["gems"])
        if not entries:
            continue
        lines.append(f'    {{ act: {q["act"]}, questName: "{q["questName"]}", rewards: [')
        for gid, cls in entries:
            lines.append(f'      {{ gemId: "{gid}", classes: {format_classes(cls)} }},')
        lines.append("    ]},")
    lines.append("  ],")
    return "\n".join(lines)


# ── Generate vendorRewards ───────────────────────────────────────────────────
def generate_vendor_rewards():
    lines = ["  vendorRewards: ["]
    for q in poedb["vendorRewards"]:
        entries = build_gem_entries(q["gems"])
        if not entries:
            continue
        npc = NPC_MAP.get(q["questEngName"], "???")
        lines.append(f'    {{ act: {q["act"]}, questName: "{q["questName"]}", npc: "{npc}", rewards: [')
        for gid, cls in entries:
            lines.append(f'      {{ gemId: "{gid}", classes: {format_classes(cls)} }},')
        lines.append("    ]},")
    lines.append("  ],")
    return "\n".join(lines)


# ── Replace sections in gems.js ──────────────────────────────────────────────
quest_section = generate_quest_rewards()
vendor_section = generate_vendor_rewards()

# Find and replace questRewards section
quest_start = gems_js_text.index("  questRewards: [")
# Find the matching end: "  ]," after questRewards block
# We need to find the closing "]," that matches the questRewards array
depth = 0
pos = quest_start + len("  questRewards: ")
while pos < len(gems_js_text):
    ch = gems_js_text[pos]
    if ch == '[':
        depth += 1
    elif ch == ']':
        depth -= 1
        if depth == 0:
            break
    pos += 1
# pos is now at the closing ']'
quest_end = pos + 1  # include the ']'
# Also include the comma after
if gems_js_text[quest_end] == ',':
    quest_end += 1

vendor_start = gems_js_text.index("  vendorRewards: [")
depth = 0
pos = vendor_start + len("  vendorRewards: ")
while pos < len(gems_js_text):
    ch = gems_js_text[pos]
    if ch == '[':
        depth += 1
    elif ch == ']':
        depth -= 1
        if depth == 0:
            break
    pos += 1
vendor_end = pos + 1
if gems_js_text[vendor_end] == ',':
    vendor_end += 1

# Build new text
new_text = (
    gems_js_text[:quest_start]
    + quest_section + "\n"
    + gems_js_text[quest_end:vendor_start].lstrip('\n')
    + vendor_section + "\n"
    + gems_js_text[vendor_end:]
)

# Write output
output_path = ROOT / "js" / "gems.js"
output_path.write_text(new_text, encoding="utf-8")

# Stats
quest_gem_count = sum(len(build_gem_entries(q["gems"])) for q in poedb["questRewards"])
vendor_gem_count = sum(len(build_gem_entries(q["gems"])) for q in poedb["vendorRewards"])
print(f"Generated {len(poedb['questRewards'])} questReward quests ({quest_gem_count} gem entries)")
print(f"Generated {len(poedb['vendorRewards'])} vendorReward quests ({vendor_gem_count} gem entries)")
print(f"Written to {output_path}")
