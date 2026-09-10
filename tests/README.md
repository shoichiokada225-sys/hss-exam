# tests

すべて puppeteer-core（`~/elearn-e2e-tmp/node_modules` にある。ESMはNODE_PATHを見ないので、そのディレクトリへコピーして実行するか `node_modules` を隣に置く）＋ローカルChromeで動く。

| ファイル | 内容 | 前提 |
|---|---|---|
| e2e-review-flag.mjs | 見直しマーク・中断再開（46件） | 8845=本体, 8846=make-testcopy.pyのコピー |
| e2e-exam-flow.mjs | 本試験フロー（正常/遅延/busy/停止→再送/verify不能/中断再開/デモ後の進行保持/localStorage例外/送信中ホーム非表示 32件） | 8846=testcopy（config.jsのwebhookUrlを `http://127.0.0.1:8850/exec`、passwordHashを`123`のハッシュに書き換え、sw.jsのCACHE_NAMEも別名に）＋ `node tests/mock-gas.mjs`(8850)。script.google.comへの送信は傍受して遮断する |
| gas-load-sim.mjs | 本番GASに対しクライアントの送信手順を忠実に再現する負荷試験 `node tests/gas-load-sim.mjs 100 180000` | IDは `test_conn_` 始まり＝GASの `purgeTestRows` で消える。実行後は必ず purgeTestRows |
| prod-smoke.mjs | 本番URLの実ブラウザ検査（SWキャッシュ件数・オフライン起動・デモ完走・5言語） | 本番へPOSTしない |

2026-09-10 実測（修正前クライアント）: 100人×180秒分散でサーバー記録100/100、クライアント✅99/⚠1、再試行37人（verify 6秒超が主因）。
