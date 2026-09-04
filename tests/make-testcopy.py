# -*- coding: utf-8 -*-
"""E2Eテスト用のコピーを作る（本体は書き換えない）。

本番のデモモードは進行状態をlocalStorageへ保存しない仕様のため、
「中断→再開でマークが保持されるか」を実際のコードパスで検証できない。
そこでデモでも保存・復元するように2箇所だけ書き換えたコピーを作り、
tests/e2e-review-flag.mjs の B/C パートはそのコピーに対して実行する。

使い方:
  python tests/make-testcopy.py <出力先ディレクトリ>
"""
import io, os, shutil, sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SRC, "..", "hss-exam-testcopy")

if os.path.isdir(DST):
    shutil.rmtree(DST)
os.makedirs(DST)
for name in ["index.html", "config.js", "manifest.json", "sw.js"]:
    shutil.copy(os.path.join(SRC, name), os.path.join(DST, name))
for name in ["data", "icons"]:
    shutil.copytree(os.path.join(SRC, name), os.path.join(DST, name))

p = os.path.join(DST, "index.html")
s = io.open(p, encoding="utf-8").read()

# 1) デモでも進行を保存する
a = '  if(isDemo()) return;   //'
assert a in s, "saveProgress のデモ除外が見つからない"
s = s.replace(a, '  if(false) return;   //', 1)

# 2) デモの進行も復元し、復元時は保存されたモードを使う
b = '  if(p.mode === "demo"){ clearProgress(); return; }'
assert b in s, "tryResume のデモ除外が見つからない"
s = s.replace(b, '  examMode = (p.mode === "demo") ? "demo" : "exam";', 1)
c = '  examMode = "exam";\n  var file = isDemo()'
assert c in s, "tryResume のモード固定が見つからない"
s = s.replace(c, '  var file = isDemo()', 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("testcopy created:", os.path.abspath(DST))
