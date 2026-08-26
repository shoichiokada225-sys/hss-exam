#!/usr/bin/env python3
"""
Comprehensive validation script for data/questions.json

Checks that the question pool is consistent with the exam rules declared in
config.js (Word/honshiken questions are always asked in full, plus
`excelRandomCount` questions drawn at random from the Excel pool).

Usage:  python validate_questions.py
Exit code: 0 = PASS, 1 = FAIL
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

# Windows consoles default to cp932 and would raise UnicodeEncodeError on
# Vietnamese/Indonesian text. Force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

ROOT = Path(__file__).resolve().parent
QUESTIONS_PATH = ROOT / "data" / "questions.json"
CONFIG_PATH = ROOT / "config.js"

VALID_CATEGORIES = {
    "繁殖・分娩", "子豚・育成", "衛生・防疫", "飼料・栄養",
    "飼養環境・施設", "肉豚・出荷・肉", "経営理念・行動規範",
}

# Language blocks that every question is expected to carry. Each block holds
# only `question` and `options`; index.html getQ() falls back to the Japanese
# `answer` / `explanation` for every language, so those are not translated.
LANGUAGES = ["en", "vi", "ind", "es"]
REQUIRED_LANG_FIELDS = ["question", "options"]

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


def is_ascii_only(text):
    """True if the string carries no non-ASCII characters (i.e. no diacritics)."""
    return all(ord(c) < 128 for c in text)


def get_vi_prose(q, idx):
    """Vietnamese prose fields — these must always carry tone marks."""
    vi = q.get("vi", {})
    fields = []
    if isinstance(vi, dict):
        for field in ("question", "answer", "explanation"):
            if isinstance(vi.get(field), str):
                fields.append((f"Q{idx+1} vi.{field}", vi[field]))
    return fields


def get_vi_options(q, idx):
    """Vietnamese option strings — may legitimately be numbers or Latin terms."""
    vi = q.get("vi", {})
    if not isinstance(vi, dict):
        return []
    return [
        (f"Q{idx+1} vi.options[{i}]", opt)
        for i, opt in enumerate(vi.get("options", []))
        if isinstance(opt, str)
    ]


def read_config_number(source, key, default):
    """Pull a numeric setting out of config.js without executing it."""
    m = re.search(rf"\b{key}\s*:\s*(\d+)", source)
    return int(m.group(1)) if m else default


def is_word_question(q):
    """Mirrors index.html startQuiz(): source starting with 'honshiken' is fixed."""
    return str(q.get("source", "")).startswith("honshiken")


# ── Load config.js ─────────────────────────────────────────────────────────────
try:
    config_src = CONFIG_PATH.read_text(encoding="utf-8")
except OSError as e:
    print(f"[FAIL] Cannot read config.js: {e}")
    sys.exit(1)

QUESTIONS_PER_TEST = read_config_number(config_src, "questionsPerTest", 60)
EXCEL_RANDOM_COUNT = read_config_number(config_src, "excelRandomCount", 50)

# ── Load JSON ──────────────────────────────────────────────────────────────────
try:
    with open(QUESTIONS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    print("[PASS] JSON syntax: valid")
except json.JSONDecodeError as e:
    print(f"[FAIL] JSON syntax error: {e}")
    sys.exit(1)
except (OSError, UnicodeDecodeError) as e:
    print(f"[FAIL] Cannot read questions.json: {e}")
    sys.exit(1)

if not isinstance(data, list) or not data:
    print("[FAIL] questions.json must be a non-empty array")
    sys.exit(1)

# ── Check 1: Pool is large enough for the configured exam rule ────────────────
word_pool = [q for q in data if is_word_question(q)]
excel_pool = [q for q in data if not is_word_question(q)]
print(
    f"[INFO] Pool: {len(data)} questions "
    f"(Word/honshiken {len(word_pool)} / Excel {len(excel_pool)})"
)

if len(excel_pool) < EXCEL_RANDOM_COUNT:
    fail(
        f"Excel pool too small: {len(excel_pool)} available but "
        f"config.excelRandomCount = {EXCEL_RANDOM_COUNT}"
    )
    print(f"[FAIL] Excel pool: {len(excel_pool)} < {EXCEL_RANDOM_COUNT}")
else:
    print(f"[PASS] Excel pool covers excelRandomCount ({EXCEL_RANDOM_COUNT})")

served = len(word_pool) + EXCEL_RANDOM_COUNT
if served != QUESTIONS_PER_TEST:
    fail(
        f"Exam length mismatch: Word {len(word_pool)} + excelRandomCount "
        f"{EXCEL_RANDOM_COUNT} = {served}, but config.questionsPerTest = "
        f"{QUESTIONS_PER_TEST}"
    )
    print(f"[FAIL] Exam length: serves {served}, config expects {QUESTIONS_PER_TEST}")
else:
    print(f"[PASS] Exam length: {served} questions per test, matches config")

# ── Check 2 & 7: Required fields and non-empty strings ────────────────────────
required_top_fields = ["question", "answer", "options", "category", "explanation"] + LANGUAGES

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
    for lang in LANGUAGES:
        if lang not in q:
            continue
        lq = q[lang]
        if not isinstance(lq, dict):
            fail(f"{label}.{lang}: expected dict, got {type(lq).__name__}")
            field_errors += 1
            continue
        for field in REQUIRED_LANG_FIELDS:
            if field not in lq:
                fail(f"{label}.{lang}: missing field '{field}'")
                field_errors += 1
        for field in ["question", "answer", "explanation"]:
            if field in lq:
                if not check_non_empty(lq[field], f"{label}.{lang}.{field}"):
                    field_errors += 1
        if "options" in lq:
            ja_len = len(q["options"]) if isinstance(q.get("options"), list) else 4
            if not isinstance(lq["options"], list) or len(lq["options"]) != ja_len:
                # index.html renders q[lang].options[origIdx], so a length
                # mismatch silently shows the wrong translation.
                fail(f"{label}.{lang}.options: expected list of {ja_len} (same as ja), got len={len(lq.get('options', []))}")
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
    for lang in LANGUAGES:
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

# ── Check 5b: No duplicate `source` ids ───────────────────────────────────────
source_counts = Counter(str(q.get("source", "")) for q in data)
dup_sources = [s for s, n in source_counts.items() if s and n > 1]
if not dup_sources:
    print("[PASS] No duplicate source ids")
else:
    for s in dup_sources:
        fail(f"duplicate source id '{s}' appears {source_counts[s]} times")
    print(f"[FAIL] Duplicate source ids: {len(dup_sources)}")

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
            warn(
                f"Answer position {pos} appears {count}/{total} times ({pct:.1f}%) "
                "in the source data (index.html re-shuffles options at runtime, "
                "so this does not leak the answer to examinees)"
            )

# Check if ALL answers are at the same position
if len(position_counts) == 1:
    only_pos = list(position_counts.keys())[0]
    fail(f"All answers are at position {only_pos} — options NOT shuffled")
    print(f"[FAIL] Options shuffle: all answers at position {only_pos}")
else:
    print(f"[PASS] Options shuffled: answers distributed across {len(position_counts)} positions")

# ── Check 8: Vietnamese text keeps its diacritics ─────────────────────────────
# Vietnamese stripped of tone marks changes meaning, so a purely ASCII field is
# a sign the translation is missing or was flattened.
missing_diacritics = []
for idx, q in enumerate(data):
    for label, text in get_vi_prose(q, idx):
        if text.strip() and is_ascii_only(text):
            missing_diacritics.append(f"{label}: no diacritics found: {repr(text[:40])}")

if not missing_diacritics:
    print("[PASS] Vietnamese prose: diacritics present")
else:
    for e in missing_diacritics:
        fail(e)
    print(f"[FAIL] Vietnamese diacritics: {len(missing_diacritics)} field(s) look flattened to ASCII")

# ── Check 8b: Spanish question text carries Spanish orthography ───────────────
# A Spanish question with no accented chars / inverted marks at all is a sign the
# translation is missing or machine-flattened. Only questions are checked strictly;
# options may legitimately be ASCII (numbers, units, Latin terms).
_ES_MARKS = set("áéíóúñü¿¡ÁÉÍÓÚÑÜ")
es_missing = []
for idx, q in enumerate(data):
    es_q = (q.get("es") or {}).get("question", "")
    if es_q.strip() and not any(c in _ES_MARKS for c in es_q):
        es_missing.append(f"Q{idx+1} es.question: no Spanish orthography marks: {repr(es_q[:40])}")
if not es_missing:
    print("[PASS] Spanish questions: orthography marks present")
else:
    # 警告扱い（短文で正当にマーク無しのスペイン語もあり得るため、FAILにはしない）
    for e in es_missing:
        warn(e)

# Options are only warned about: numbers ("0,33"), units ("100%") and Latin
# technical terms ("Vitamin C", "AI") are legitimately ASCII.
for idx, q in enumerate(data):
    for label, text in get_vi_options(q, idx):
        if text.strip() and is_ascii_only(text) and any(c.isalpha() for c in text):
            warn(f"{label}: ASCII-only Vietnamese option: {repr(text[:40])}")

# ── Check 10: Category distribution ───────────────────────────────────────────
cat_dist = Counter(q.get("category", "") for q in data)
target = len(data) / len(VALID_CATEGORIES)
low_bound, high_bound = max(1, round(target * 0.5)), round(target * 2.0)
print(f"\n[INFO] Category distribution (target ~{target:.0f} per category):")
for cat in sorted(VALID_CATEGORIES):
    count = cat_dist.get(cat, 0)
    bar = "#" * count
    flag = ""
    if count < low_bound:
        warn(f"Category '{cat}' has only {count} questions (target ~{target:.0f})")
        flag = " <-- LOW"
    elif count > high_bound:
        warn(f"Category '{cat}' has {count} questions (target ~{target:.0f})")
        flag = " <-- HIGH"
    print(f"  {cat:12s}: {count:3d}  {bar}{flag}")

uneven = {c: n for c, n in cat_dist.items() if n < low_bound or n > high_bound}
if not uneven:
    print("[PASS] Category distribution: roughly even")
else:
    print(f"[WARN] Category distribution: {len(uneven)} category/ies outside [{low_bound}, {high_bound}]")

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
