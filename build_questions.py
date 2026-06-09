# -*- coding: utf-8 -*-
"""HSS exam: rebuild data/questions.json from the 2 reference files ONLY.
 - XLSX: HSS養豚テスト_セットA_100問 (岡田チェック終わり)  -> 72 Q
 - DOCX: ＨＳＳ筆記試験一般問題（本試験）                    -> 10 Q
Old 60-question pool is backed up first. Japanese-only (app falls back to JP).
"""
import json, re, os, sys, glob, shutil
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r"C:\Users\so\hss-exam"
DATA = os.path.join(ROOT, "data", "questions.json")
refs = json.load(open(os.path.join(ROOT, "refs_extracted.json"), encoding="utf-8"))

# ---------- 0. backup current pool ----------
old = json.load(open(DATA, encoding="utf-8"))
bak = os.path.join(ROOT, "data", "questions_backup_旧60問_2026-06-09.json")
with open(bak, "w", encoding="utf-8") as f:
    json.dump(old, f, ensure_ascii=False, indent=2)
print(f"[backup] {len(old)} 問 -> {os.path.basename(bak)}")

# ---------- category classifier (keyword based) ----------
def classify(q, ans):
    t = (q or "") + " " + (ans or "")
    rules = [
        ("飼料・栄養", ["飼料", "FCR", "飼料要求率", "CP", "粗タンパク", "栄養素", "ビタミン", "食下量", "食べて", "食べる量"]),
        ("繁殖・分娩", ["分娩", "種付", "妊娠", "発情", "交配", "哺乳", "里子", "圧死", "射乳", "候補豚", "初産", "BCS", "ボディコンディション", "P2", "背脂肪", "人工授精", "AI", "胎子", "繁殖", "母豚", "未経産", "離乳母豚"]),
        ("子豚・育成", ["離乳", "去勢", "断尾", "鉄剤", "耳刻", "初乳", "保温", "子豚", "新生", "貧血", "出生体重"]),
        ("衛生・防疫", ["消毒", "5S", "整頓", "しつけ", "MD", "Minimal", "ワクチン", "オールイン", "抗菌薬", "感染症", "病原体", "衛生"]),
        ("肉豚・出荷・肉", ["肉豚", "枝肉", "正肉", "出荷", "増体", "豚肉", "正肉", "部位", "豚肉"]),
        ("飼養環境・施設", ["豚舎", "スノコ", "スラット", "ふん尿", "糞尿", "暑さ", "汗腺", "三大基本要素", "環境"]),
    ]
    for cat, kws in rules:
        for kw in kws:
            if kw in t:
                return cat
    return "養豚一般"

def norm(s):
    return re.sub(r"\s+", "", (s or "").strip())

problems = []
questions = []

# ---------- 1. XLSX ----------
for x in refs["xlsx"]:
    q = (x["q"] or "").strip()
    ans = (x["ans"] or "").strip()
    opts = [o.strip() for o in x["opts"] if o and o.strip()]
    ref = x["ref"]
    # answer must equal one option
    if ans not in opts:
        # try normalized match
        m = [o for o in opts if norm(o) == norm(ans)]
        if m:
            ans = m[0]
        else:
            # fuzzy: pick the most similar option (正答列が言い換えのケース)
            import difflib
            best = max(opts, key=lambda o: difflib.SequenceMatcher(None, norm(o), norm(ans)).ratio())
            ratio = difflib.SequenceMatcher(None, norm(best), norm(ans)).ratio()
            print(f"  [fuzzy] XLSX No.{x['no']}: 正答列='{ans}' -> 選択肢'{best}' (類似度{ratio:.2f})")
            if ratio < 0.5:
                problems.append(("XLSX", x["no"], "answer not in options (low sim)", ans, opts))
            ans = best
    if len(opts) < 2:
        problems.append(("XLSX", x["no"], "too few options", ans, opts))
    expl = f"参考ページ: {ref}" if ref not in (None, "") else ""
    questions.append({
        "question": q,
        "options": opts,
        "answer": ans,
        "explanation": expl,
        "category": classify(q, ans),
        "source": f"setA-{x['no']}",
    })

# ---------- 2. DOCX (本試験) ----------
NUM = {"１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9","０":"0"}
def z2h(s):
    return "".join(NUM.get(c, c) for c in s)

for block in refs["docx"]:
    lines = [l.strip() for l in block.splitlines() if l.strip()]
    # question: first line, drop 第N問： prefix
    qline = re.sub(r"^第[0-9０-９]+問[:：]?\s*", "", lines[0]).strip()
    # find answer line (contains 【正解】)
    ai = next((i for i, l in enumerate(lines) if "正解" in l), None)
    if ai is None:
        problems.append(("DOCX", lines[0][:20], "no 正解 line", None, None)); continue
    opts = [l for l in lines[1:ai]]
    aline = lines[ai]
    mnum = re.search(r"正解】?\s*([0-9０-９]+)", aline)
    if not mnum:
        problems.append(("DOCX", lines[0][:20], "cannot parse 正解 num", None, opts)); continue
    n = int(z2h(mnum.group(1)))
    if not (1 <= n <= len(opts)):
        problems.append(("DOCX", lines[0][:20], f"正解 idx {n} out of range", None, opts)); continue
    answer = opts[n-1]
    # explanation
    mex = re.search(r"解説】?\*{0,2}\s*(.*)$", aline)
    expl = (mex.group(1).strip() if mex else "").replace("**", "").strip()
    questions.append({
        "question": qline,
        "options": opts,
        "answer": answer,
        "explanation": expl,
        "category": "経営理念・行動規範",
        "source": f"honshiken-{lines[0][:4]}",
    })

# ---------- 3. report + write ----------
print(f"[build] XLSX {len(refs['xlsx'])} + DOCX {len(refs['docx'])} = {len(questions)} 問")
from collections import Counter
for c, n in Counter(x["category"] for x in questions).most_common():
    print(f"   {c}: {n}")

if problems:
    print("\n[!] PROBLEMS:")
    for p in problems:
        print("  ", p)
else:
    print("\n[OK] 全問: answer は options に整合")

# strip the helper 'source' key before writing (keep schema clean)? keep it - harmless extra field
with open(DATA, "w", encoding="utf-8") as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)
print(f"\n[write] {DATA}  ({len(questions)} 問)")
