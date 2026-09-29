param([ValidateSet("mondai","kaito","both")][string]$Kind = "mondai")
$ErrorActionPreference = "Stop"

# HSS筆記試験PDFのメール下書きを Outlook で開く（送信は社長）
#   powershell -NoProfile -ExecutionPolicy Bypass -File open_mail_draft.ps1            # 問題のみ
#   powershell -NoProfile -ExecutionPolicy Bypass -File open_mail_draft.ps1 -Kind kaito  # 解答のみ
#   powershell -NoProfile -ExecutionPolicy Bypass -File open_mail_draft.ps1 -Kind both   # 2通を別々に開く

$dir    = "C:\Users\so\hss-exam\print"
$fMon   = Join-Path $dir "HSS筆記試験_24問_問題.pdf"
$fKai   = Join-Path $dir "HSS筆記試験_24問_解答.pdf"

function New-Draft($subject, $bodyHtml, $files) {
  foreach ($f in $files) {
    if (-not (Test-Path $f)) { throw ("添付ファイルが見つかりません: " + $f) }
  }
  $ol   = New-Object -ComObject Outlook.Application
  $mail = $ol.CreateItem(0)
  $mail.Subject  = $subject
  $mail.HTMLBody = $bodyHtml
  foreach ($f in $files) { [void]$mail.Attachments.Add($f) }
  $mail.Display()   # 保存も送信もしない。宛先は手入力
  Write-Output ("DRAFT_OPENED: " + $subject)
}

$style = "font-family:'Yu Gothic UI',Meiryo,sans-serif;font-size:14px;color:#23303C;line-height:1.8"

if ($Kind -eq "mondai" -or $Kind -eq "both") {
  $body = @"
<div style="$style">
<p>お世話になっております。<br>
HSS筆記試験の問題用紙（印刷用PDF）をお送りします。</p>
<ul>
<li>全24問／四肢択一（A4・4ページ）</li>
<li>氏名・農場・実施日の記入欄つき</li>
<li>解答方法：選択肢の番号（&#9312;〜&#9315;）を〇で囲む</li>
</ul>
<p>両面印刷で2枚に収まります。<br>
正答表は採点者用として別便でお送りします。</p>
</div>
"@
  New-Draft "HSS筆記試験　問題用紙（24問・印刷用）" $body @($fMon)
}

if ($Kind -eq "kaito" -or $Kind -eq "both") {
  $body = @"
<div style="$style">
<p>お世話になっております。<br>
HSS筆記試験（24問）の<b>正答表</b>をお送りします。</p>
<p style="color:#B00020"><b>※採点者用です。受験者へは配布しないでください。</b></p>
<p>問番号・正答番号・正解の選択肢・分類の一覧（A4・2ページ）です。</p>
</div>
"@
  New-Draft "【採点者用】HSS筆記試験　正答表（24問）" $body @($fKai)
}
