# -*- coding: utf-8 -*-
"""貼付データの正解列と、問題バンクの answer が一致するかの検算"""
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bank = {q["question"]: q for q in json.load(open(os.path.join(ROOT, "data", "questions.json"), encoding="utf-8"))}
titles = [l.strip() for l in open("set_37-60.txt", encoding="utf-8") if l.strip()]
expected = [l.strip() for l in open("expected_answers.txt", encoding="utf-8") if l.strip()]
ng = 0
for i, (t, e) in enumerate(zip(titles, expected), 1):
    a = bank[t]["answer"]
    if a != e:
        ng += 1
        print(f"NG 問{i}: bank={a} / 貼付={e}")
print(f"照合 {len(titles)}問  NG={ng}")
