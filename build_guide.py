#!/usr/bin/env python3
"""Parse Cyclon's spreadsheet CSV data and generate js/guide.js with zone notes aligned to data.js steps."""

import json, csv, io, re

# Reverse map: English zone name → Korean zone name
EN_TO_KR = {
    # Act 1
    "Twilight Strand": "황혼의 해안",
    "Coast": "해안 지대",
    "Submerged Passage": "물에 잠긴 길",
    "Mud Flats": "갯벌",
    "Tidal Island": "물결 섬",
    "Ledge": "바위 턱",
    "Flooded Depths": "물에 잠긴 심연",
    "Climb": "고개",
    "Lower Prison": "수용소 하층",
    "Upper Prison": "수용소 상층",
    "Prisoner's Gate": "죄수의 문",
    "Ship Graveyard": "배들의 묘지",
    "Ship Graveyard Cave": "배들의 묘지 동굴",
    "Cavern of Wrath": "진노의 암굴",
    "Cavern of Anger": "분노의 암굴",
    # Act 2
    "Southern Forest": "남쪽 숲",
    "Old Fields": "버려진 경작지",
    "Den": "굴",
    "Crossroads": "갈림길",
    "Chamber of Sins": "죄악의 방 1층",
    "Chamber of Sins 2": "죄악의 방 2층",
    "Riverways": "강변길",
    "Western Forest": "서쪽 숲",
    "Weaver's Chamber": "거미의 방",
    "Broken Bridge": "부서진 다리",
    "Wetlands": "습지대",
    "Fellshrine Ruins": "몰락한 성소 유적",
    "Felshrine Ruins": "몰락한 성소 유적",
    "Vaal Ruins": "바알 유적",
    "Northern Forest": "북쪽 숲",
    "Caverns": "동굴",
    "Ancient Pyramid": "고대 피라미드",
    "Crypt": "지하실",
    # Act 3
    "City of Sarn": "사안 도시",
    "Slums": "빈민가",
    "Crematorium": "화장터",
    "Sewers": "하수도",
    "Marketplace": "장터",
    "Catacombs": "지하 묘지",
    "Battlefront": "전쟁터",
    "Docks": "항구",
    "Solaris Temple 1": "솔라리스 사원 1층",
    "Solaris Temple 2": "솔라리스 사원 2층",
    "Ebony Baracks": "칠흑의 군단 주둔지",
    "Lunaris Temple 1": "루나리스 사원 1층",
    "Lunaris Temple 2": "루나리스 사원 2층",
    "Imperial Garden": "황실 정원",
    "Library": "도서관",
    "Sceptre of God 1": "신의 셉터",
    "Sceptre of God 2": "신의 셉터 상층",
    # Act 4
    "Aqueduct": "수로",
    "Dried Lake": "말라붙은 호수",
    "Mines": "광산 1층",
    "Mines 2": "광산 2층",
    "Crystal Veins": "수정 광맥",
    "Daresso's Dream": "다레소의 꿈",
    "Grand Arena": "대 투기장",
    "Kaom's Dream": "카옴의 꿈",
    "Kaom's Stronghold": "카옴의 요새",
    "Belly of the Beast 1": "짐승의 소굴 1층",
    "Belly of the Beast 2": "짐승의 소굴 2층",
    "Harvest": "수확소",
    "Ascent": "오르막길",
    # Act 5
    "Slave Pens": "노예 감호소",
    "Control Blocks": "관리 구역",
    "Oriath Square": "오리아스 광장",
    "Courthouse": "템플러의 법정",
    "Chamber of Innocence": "결백의 방",
    "Torched Courts": "타오르는 법정",
    "Ruined Square": "멸망한 광장",
    "Ossuary": "납골당",
    "Reliquary": "성유물 보관실",
    "Cathedral Rooftop": "대성당 옥상",
    # Act 6
    "Karui Fortress": "카루이 요새",
    "Ridge": "산등성이",
    "Shavronne's Tower": "샤브론의 탑",
    "Shavrones Tower": "샤브론의 탑",
    "Beacon": "등대",
    "Wetlannds": "습지대",
    "Southen Forest": "남쪽 숲",
    "Chamber of Sins 1": "죄악의 방 1층",
    "Brine King's Reef": "염수왕의 암초",
    # Act 7
    "Maligaro's Sanctum": "말리가로의 지성소",
    "Ashen Fields": "잿빛 들판",
    "Dread Thicket": "공포의 잡목림",
    "Causeway": "둑길",
    "Vaal City": "바알 도시",
    "Temple of Decay 1": "부패의 사원 1층",
    "Temple of Decay 2": "부패의 사원 2층",
    # Act 8
    "Toxic Conduit": "독성 도관",
    "Doedress Cespool": "도이드리의 정화조",
    "Quay": "부두",
    "Grain Gate": "곡물의 문",
    "Underbelly": "황실 들판",  # approximate
    "Solaris Concourse": "솔라리스 중앙 광장",
    "Solaris Temple 1 (A8)": "솔라리스 사원 1층",
    "Bath House": "목욕탕",
    "High Gardens": "고층 정원",
    "Lunaris concourse": "루나리스 중앙 광장",
    "Lunaris Concourse": "루나리스 중앙 광장",
    "Lunaris Temple 1 (A8)": "루나리스 사원 1층",
    "Lunaris Temple 2 (A8)": "루나리스 사원 2층",
    "Harbour Bridge": "항구 다리",
    # Act 9
    "Blood Auquaduct": "피의 수로",
    "Blood Aqueduct": "피의 수로",
    "Descent": "비탈",
    "Vastiri Desert": "바스티리 사막",
    "Oasis": "오아시스",
    "Foothills": "구릉",
    "Boiling Lake": "끓어오르는 호수",
    "Tunnel": "터널",
    "Quarry": "채석장",
    "Refinery": "제련소",
    "Belly of the Beast": "짐승의 소굴",
    "Rotting Core": "썩어가는 중심부",
    # Act 10
    "Ravaged Square": "파괴된 광장",
    "Torched Courts (A10)": "타오르는 법정",
    "Desecrated Chambers": "무너진 방",
    "Desecrated chambers": "무너진 방",
    "Canals": "운하",
    "Feeding Through": "먹이통",
}

def parse_csv(csv_text):
    """Parse CSV text into list of rows."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    return rows

def extract_guide_rows(rows):
    """Extract zone guide entries from spreadsheet rows (skip header/NPC rows)."""
    entries = []
    in_data = False
    for row in rows:
        if not row or len(row) < 5:
            continue
        zone = row[0].strip()
        # Skip header rows and NPC info rows
        if zone in ('', 'Zone', 'Town NPCs') or row[1].strip() == 'Function':
            if zone == 'Zone':
                in_data = True
            continue
        if not in_data:
            continue
        todo = row[1].strip() if len(row) > 1 else ''
        notes = row[2].strip() if len(row) > 2 else ''
        layout = row[3].strip() if len(row) > 3 else ''
        video = row[4].strip() if len(row) > 4 else ''
        # Skip video-only header rows
        if zone.endswith('Video:') and not todo and not notes and not layout:
            continue
        entries.append({
            'zone': zone,
            'todo': todo,
            'notes': notes,
            'layout': layout,
            'video': video,
        })
    return entries

def find_kr_zone(en_zone):
    """Find Korean zone name from English zone name."""
    # Direct match
    if en_zone in EN_TO_KR:
        return EN_TO_KR[en_zone]
    # Try without "The " prefix
    stripped = en_zone.lstrip("The ").strip()
    if stripped in EN_TO_KR:
        return EN_TO_KR[stripped]
    # Try fuzzy
    en_lower = en_zone.lower().replace('the ', '').strip()
    for k, v in EN_TO_KR.items():
        if k.lower().replace('the ', '').strip() == en_lower:
            return v
    return None

def main():
    with open('cyclon_campaign_guide.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    all_guides = {}
    for act_num in range(1, 11):
        key = f'Act {act_num}'
        if key not in data:
            continue
        rows = parse_csv(data[key])
        entries = extract_guide_rows(rows)

        guide_entries = []
        for e in entries:
            # Only keep entries that have notes or layout
            notes = e['notes']
            layout = e['layout']
            video = e['video']
            if not notes and not layout and not video:
                continue
            kr_zone = find_kr_zone(e['zone'])
            guide_entries.append({
                'zone_en': e['zone'],
                'zone_kr': kr_zone,
                'todo': e['todo'],
                'notes': notes,
                'layout': layout,
                'video': video,
            })

        all_guides[f'act{act_num}'] = guide_entries

    # Generate JS file
    lines = [
        '// Zone guide notes from Cyclon\'s Advanced Campaign Guide',
        '// https://docs.google.com/spreadsheets/d/1VIX2Bdw1RnQCzApBWUSb0vH682087GDUymfQNMXe0_Q',
        'const GUIDE_NOTES = {',
    ]

    for act_key in sorted(all_guides.keys(), key=lambda x: int(x.replace('act', ''))):
        entries = all_guides[act_key]
        lines.append(f'  {act_key}: [')
        for e in entries:
            parts = []
            parts.append(f'zone: {json.dumps(e["zone_en"])}')
            if e['zone_kr']:
                parts.append(f'kr: {json.dumps(e["zone_kr"])}')
            if e['todo']:
                parts.append(f'todo: {json.dumps(e["todo"])}')
            if e['notes']:
                parts.append(f'notes: {json.dumps(e["notes"])}')
            if e['layout']:
                parts.append(f'layout: {json.dumps(e["layout"])}')
            if e['video']:
                parts.append(f'video: {json.dumps(e["video"])}')
            lines.append(f'    {{ {", ".join(parts)} }},')
        lines.append('  ],')

    lines.append('};')
    lines.append('')

    with open('js/guide.js', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    # Print summary
    for act_key in sorted(all_guides.keys(), key=lambda x: int(x.replace('act', ''))):
        entries = all_guides[act_key]
        unmatched = [e for e in entries if not e['zone_kr']]
        print(f'{act_key}: {len(entries)} entries, {len(unmatched)} unmatched zones')
        for e in unmatched:
            print(f'  UNMATCHED: "{e["zone_en"]}" - {e["todo"]}')

if __name__ == '__main__':
    main()
