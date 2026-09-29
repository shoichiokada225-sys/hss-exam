# -*- coding: utf-8 -*-
"""HSS筆記試験 印刷用PDF生成（問題用紙 + 解答用紙）
使い方: python build_print.py            # 既定リスト(37-60の24問)
        python build_print.py --all      # 問題バンク全79問
"""
import json, os, subprocess, sys, io, html

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
MARKS = ["①", "②", "③", "④", "⑤", "⑥"]

def load_bank():
    with open(os.path.join(ROOT, "data", "questions.json"), encoding="utf-8") as f:
        return json.load(f)

def pick(bank, titles):
    idx = {q["question"]: q for q in bank}
    out = []
    for t in titles:
        if t not in idx:
            raise SystemExit("問題バンクに無い問題: " + t)
        out.append(idx[t])
    return out

CSS = """
@page { size: A4; margin: 16mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Yu Gothic UI", "Yu Gothic", "Meiryo", sans-serif;
       font-size: 10.5pt; line-height: 1.55; color: #000; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2mm; letter-spacing: .04em; }
.sub { font-size: 9pt; color: #333; margin: 0 0 3mm; }
.namebox { border: 1.2pt solid #000; padding: 2.5mm 3mm; margin: 0 0 4mm;
           display: flex; gap: 8mm; font-size: 10pt; }
.namebox .f { flex: 1; border-bottom: .8pt solid #000; padding-bottom: 1mm; }
.note { border-left: 3pt solid #333; background: #f3f3f3; padding: 2.5mm 3mm;
        font-size: 9.5pt; margin: 0 0 5mm; }
.q { margin: 0 0 4.5mm; break-inside: avoid; page-break-inside: avoid; }
.qh { display: flex; gap: 2.5mm; align-items: baseline; }
.no { font-weight: 700; min-width: 10mm; }
.cat { font-size: 8pt; color: #555; border: .6pt solid #999; border-radius: 2mm;
       padding: 0 1.5mm; margin-left: 2mm; white-space: nowrap; }
.qt { font-weight: 600; }
ol.opts { list-style: none; margin: 1.5mm 0 0 12mm; padding: 0; }
ol.opts li { margin: 0 0 .8mm; text-indent: -6mm; padding-left: 6mm; }
.mk { font-weight: 700; margin-right: 1.5mm; }
table.ans { width: 100%; border-collapse: collapse; font-size: 10pt; }
table.ans th, table.ans td { border: .8pt solid #666; padding: 1.8mm 2mm; vertical-align: top; }
table.ans th { background: #eee; font-size: 9pt; }
table.ans tr { break-inside: avoid; page-break-inside: avoid; }
.c-no { width: 10mm; text-align: center; }
.c-mk { width: 10mm; text-align: center; font-weight: 700; }
.c-cat { width: 30mm; font-size: 9pt; color: #333; }
.foot { margin-top: 5mm; font-size: 8.5pt; color: #555; text-align: right; }
"""

def page(title, body):
    return ("<!doctype html><html lang='ja'><head><meta charset='utf-8'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
            f"<body>{body}</body></html>")

def build_questions(qs, label):
    b = [f"<h1>HSS筆記試験　問題用紙</h1><p class='sub'>全{len(qs)}問／四肢択一　{label}</p>"]
    b.append("<div class='namebox'><div class='f'>氏名：</div>"
             "<div class='f'>農場：</div><div class='f'>実施日：　　　年　　月　　日</div></div>")
    b.append("<div class='note'>各問について、最も適切なものを<b>1つだけ</b>選び、"
             "選択肢の番号（①〜④）を〇で囲んでください。</div>")
    for i, q in enumerate(qs, 1):
        opts = "".join(f"<li><span class='mk'>{MARKS[j]}</span>{html.escape(o)}</li>"
                       for j, o in enumerate(q["options"]))
        b.append(
            "<div class='q'><div class='qh'><span class='no'>問{n}</span>"
            "<span class='qt'>{t}<span class='cat'>{c}</span></span></div>"
            "<ol class='opts'>{o}</ol></div>".format(
                n=i, t=html.escape(q["question"]), c=html.escape(q.get("category", "")), o=opts))
    return page("HSS筆記試験 問題用紙", "".join(b))

def build_answers(qs, label):
    b = [f"<h1>HSS筆記試験　解答（正答表）</h1>"
         f"<p class='sub'>全{len(qs)}問　{label}　※採点者用・受験者へ配布しないこと</p>"]
    b.append("<table class='ans'><thead><tr><th class='c-no'>問</th><th class='c-mk'>正答</th>"
             "<th>正解の選択肢</th><th class='c-cat'>分類</th></tr></thead><tbody>")
    for i, q in enumerate(qs, 1):
        try:
            k = q["options"].index(q["answer"])
            mk = MARKS[k]
        except ValueError:
            mk = "－"
        b.append("<tr><td class='c-no'>{n}</td><td class='c-mk'>{m}</td><td>{a}</td>"
                 "<td class='c-cat'>{c}</td></tr>".format(
                     n=i, m=mk, a=html.escape(q["answer"]),
                     c=html.escape(q.get("category", ""))))
    b.append("</tbody></table>")
    return page("HSS筆記試験 解答", "".join(b))

def to_pdf(htmlpath, pdfpath):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + pdfpath, "file:///" + htmlpath.replace("\\", "/")],
                   check=True, capture_output=True)

def main():
    bank = load_bank()
    if "--all" in sys.argv:
        qs, label = bank, "問題バンク全問"
        stem = "HSS筆記試験_全問"
    else:
        with open(os.path.join(BASE, "set_37-60.txt"), encoding="utf-8") as f:
            titles = [l.strip() for l in f if l.strip()]
        qs, label = pick(bank, titles), "（出題番号 37〜60 相当）"
        stem = "HSS筆記試験_24問"
    for kind, htm in (("問題", build_questions(qs, label)), ("解答", build_answers(qs, label))):
        hp = os.path.join(BASE, f"{stem}_{kind}.html")
        pp = os.path.join(BASE, f"{stem}_{kind}.pdf")
        with io.open(hp, "w", encoding="utf-8") as f:
            f.write(htm)
        to_pdf(hp, pp)
        print("OK:", pp, os.path.getsize(pp), "bytes")

if __name__ == "__main__":
    main()
