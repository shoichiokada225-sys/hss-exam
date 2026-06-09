#!/usr/bin/env python3
"""
Comprehensive validation script for questions.json
QA Tester: validate all 10 criteria
"""

import json
import sys
import unicodedata
from collections import Counter

VALID_CATEGORIES = {
    "繁殖関連", "子豚管理", "衛生管理", "飼養管理",
    "飼育段階", "豚の分類", "施設管理", "疾病管理"
}

LANGUAGES = ["ja", "en", "vi", "ind"]

failures = []
warnings = []

def fail(msg):
    failures.append(msg)

def warn(msg):
    warnings.append(msg)

def check_non_empty(value, label):
    if not isinstance(value, str) or not value.strip():
        fail(f"{label}: empty or non-string value: {repr(value)}")
        return False
    return True

def has_diacritics(text):
    """Returns True if text contains non-ASCII characters (diacritics etc.)"""
    return any(ord(c) > 127 for c in text)

def get_vi_fields(q, idx):
    """Collect all Vietnamese string fields from a question"""
    vi = q.get("vi", {})
    fields = []
    if isinstance(vi, dict):
        if "question" in vi:
            fields.append((f"Q{idx+1} vi.question", vi["question"]))
        if "answer" in vi:
            fields.append((f"Q{idx+1} vi.answer", vi["answer"]))
        if "explanation" in vi:
            fields.append((f"Q{idx+1} vi.explanation", vi["explanation"]))
        for i, opt in enumerate(vi.get("options", [])):
            fields.append((f"Q{idx+1} vi.options[{i}]", opt))
    return fields

# ── Load JSON ──────────────────────────────────────────────────────────────────
try:
    with open("C:/Users/so/hss-exam/data/questions.json", encoding="utf-8") as f:
        data = json.load(f)
    print("[PASS] JSON syntax: valid")
except json.JSONDecodeError as e:
    print(f"[FAIL] JSON syntax error: {e}")
    sys.exit(1)
except UnicodeDecodeError as e:
    print(f"[FAIL] Encoding error: {e}")
    sys.exit(1)

# ── Check 1: Exactly 80 questions ─────────────────────────────────────────────
if len(data) == 80:
    print(f"[PASS] Question count: {len(data)}")
else:
    fail(f"Question count: expected 80, got {len(data)}")
    print(f"[FAIL] Question count: {len(data)}")

# ── Check 2 & 7: Required fields and non-empty strings ────────────────────────
required_top_fields = ["question", "answer", "options", "category", "explanation", "en", "vi", "ind"]
required_lang_fields = ["question", "answer", "options", "explanation"]

field_errors = 0
for idx, q in enumerate(data):
    label = f"Q{idx+1}"

    # Top-level fields
    for field in required_top_fields:
        if field not in q:
            fail(f"{label}: missing field '{field}'")
            field_errors += 1

    # String fields non-empty (ja level)
    for field in ["question", "answer", "explanation", "category"]:
        if field in q:
            if not check_non_empty(q[field], f"{label}.{field}"):
                field_errors += 1

    # options array
    if "options" in q:
        if not isinstance(q["options"], list) or len(q["options"]) != 4:
            fail(f"{label}.options: expected list of 4, got {type(q['options']).__name__} len={len(q.get('options', []))}")
            field_errors += 1
        else:
            for i, opt in enumerate(q["options"]):
                if not check_non_empty(opt, f"{label}.options[{i}]"):
                    field_errors += 1

    # Per-language fields
    for lang in ["en", "vi", "ind"]:
        if lang not in q:
            continue
        lq = q[lang]
        if not isinstance(lq, dict):
            fail(f"{label}.{lang}: expected dict, got {type(lq).__name__}")
            field_errors += 1
            continue
        for field in required_lang_fields:
            if field not in lq:
                fail(f"{label}.{lang}: missing field '{field}'")
                field_errors += 1
        for field in ["question", "answer", "explanation"]:
            if field in lq:
                if not check_non_empty(lq[field], f"{label}.{lang}.{field}"):
                    field_errors += 1
        if "options" in lq:
            if not isinstance(lq["options"], list) or len(lq["options"]) != 4:
                fail(f"{label}.{lang}.options: expected list of 4, got len={len(lq.get('options', []))}")
                field_errors += 1
            else:
                for i, opt in enumerate(lq["options"]):
                    if not check_non_empty(opt, f"{label}.{lang}.options[{i}]"):
                        field_errors += 1

if field_errors == 0:
    print("[PASS] Required fields & non-empty strings: all OK")
else:
    print(f"[FAIL] Required fields & non-empty strings: {field_errors} error(s)")

# ── Check 3: answer matches one of options (all languages) ────────────────────
answer_match_errors = []
for idx, q in enumerate(data):
    label = f"Q{idx+1}"

    # Japanese (top-level)
    if "answer" in q and "options" in q and isinstance(q["options"], list):
        if q["answer"] not in q["options"]:
            answer_match_errors.append(f"{label} [ja]: answer not in options\n  answer: {repr(q['answer'])}\n  options: {q['options']}")

    # Other languages
    for lang in ["en", "vi", "ind"]:
        lq = q.get(lang, {})
        if isinstance(lq, dict) and "answer" in lq and "options" in lq and isinstance(lq["options"], list):
            if lq["answer"] not in lq["options"]:
                answer_match_errors.append(
                    f"{label} [{lang}]: answer not in options\n  answer: {repr(lq['answer'])}\n  options: {lq['options']}"
                )

if not answer_match_errors:
    print("[PASS] Answer matches options (all languages): all OK")
else:
    for e in answer_match_errors:
        fail(e)
    print(f"[FAIL] Answer matches options: {len(answer_match_errors)} error(s)")

# ── Check 4: Valid categories ──────────────────────────────────────────────────
cat_errors = []
for idx, q in enumerate(data):
    cat = q.get("category", "")
    if cat not in VALID_CATEGORIES:
        cat_errors.append(f"Q{idx+1}: invalid category '{cat}'")

if not cat_errors:
    print("[PASS] All categories valid")
else:
    for e in cat_errors:
        fail(e)
    print(f"[FAIL] Invalid categories: {len(cat_errors)} error(s)")

# ── Check 5: No duplicate questions (ja) ──────────────────────────────────────
questions_ja = [q.get("question", "") for q in data]
seen = set()
dups = []
for idx, qtext in enumerate(questions_ja):
    if qtext in seen:
        dups.append(f"Q{idx+1}: duplicate question text: {repr(qtext[:60])}...")
    seen.add(qtext)

if not dups:
    print("[PASS] No duplicate questions (ja)")
else:
    for d in dups:
        fail(d)
    print(f"[FAIL] Duplicate questions: {len(dups)} duplicate(s)")

# ── Check 6: Options are shuffled (correct answer not always at same position) ─
position_counts = Counter()
for q in data:
    if "answer" in q and "options" in q and isinstance(q["options"], list):
        try:
            pos = q["options"].index(q["answer"])
            position_counts[pos] += 1
        except ValueError:
            pass  # already caught above

total = sum(position_counts.values())
print(f"\n[INFO] Answer position distribution (ja): {dict(sorted(position_counts.items()))}")
if total > 0:
    for pos, count in sorted(position_counts.items()):
        pct = count / total * 100
        if pct > 60:
            warn(f"Answer position {pos} appears {count}/{total} times ({pct:.1f}%) — options may not be shuffled")

# Check if ALL answers are at the same position
if len(position_counts) == 1:
    only_pos = list(position_counts.keys())[0]
    fail(f"All answers are at position {only_pos} — options NOT shuffled")
    print(f"[FAIL] Options shuffle: all answers at position {only_pos}")
else:
    print(f"[PASS] Options shuffled: answers distributed across {len(position_counts)} positions")

# ── Check 8: Vietnamese text has no diacritics (ASCII-safe) ───────────────────
diacritic_errors = []
for idx, q in enumerate(data):
    for label, text in get_vi_fields(q, idx):
        if has_diacritics(text):
            bad_chars = [c for c in text if ord(c) > 127]
            diacritic_errors.append(
                f"{label}: non-ASCII chars found: {repr(''.join(set(bad_chars))[:30])}"
            )

if not diacritic_errors:
    print("[PASS] Vietnamese text: ASCII-safe (no diacritics)")
else:
    for e in diacritic_errors:
        fail(e)
    print(f"[FAIL] Vietnamese diacritics: {len(diacritic_errors)} field(s) with non-ASCII chars")

# ── Check 10: Category distribution ───────────────────────────────────────────
cat_dist = Counter(q.get("category", "") for q in data)
print(f"\n[INFO] Category distribution:")
for cat in sorted(VALID_CATEGORIES):
    count = cat_dist.get(cat, 0)
    bar = "#" * count
    flag = ""
    if count < 5:
        warn(f"Category '{cat}' has only {count} questions (very low)")
        flag = " <-- LOW"
    elif count > 20:
        warn(f"Category '{cat}' has {count} questions (very high)")
        flag = " <-- HIGH"
    print(f"  {cat:12s}: {count:3d}  {bar}{flag}")

# Ideal: 80/8 = 10 per category ±50% => [5, 15] is acceptable
uneven = {cat: cnt for cat, cnt in cat_dist.items() if cnt < 5 or cnt > 20}
if not uneven:
    print("[PASS] Category distribution: roughly even")
else:
    for cat, cnt in uneven.items():
        warn(f"Category '{cat}': {cnt} questions (target ~10)")
    print(f"[WARN] Category distribution: {len(uneven)} category/ies outside acceptable range")

# ── Summary ────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("VALIDATION SUMMARY")
print("=" * 60)

if failures:
    print(f"\nFAILURES ({len(failures)}):")
    for i, f in enumerate(failures, 1):
        print(f"  [{i}] {f}")
else:
    print("\nAll checks PASSED - no failures detected.")

if warnings:
    print(f"\nWARNINGS ({len(warnings)}):")
    for i, w in enumerate(warnings, 1):
        print(f"  [{i}] {w}")

print(f"\nResult: {'FAIL' if failures else 'PASS'} ({len(failures)} failures, {len(warnings)} warnings)")
sys.exit(1 if failures else 0)
