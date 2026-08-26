# Copy gas/Code.gs to the Windows clipboard for pasting into the Apps Script editor.
# Usage (from anywhere):
#   powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\hss-exam\gas\copy-to-clipboard.ps1"
# ASCII only on purpose: PS 5.1 mis-reads BOM-less UTF-8 files that contain Japanese.

$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "Code.gs"

if (-not (Test-Path $src)) {
    Write-Host "NG: Code.gs not found at $src"
    exit 1
}

$text = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)
Set-Clipboard -Value $text

$lines = ($text -split "`n").Count
$version = ""
if ($text -match 'var CODE_VERSION = "([^"]+)"') { $version = $matches[1] }

Write-Host "OK: copied Code.gs to clipboard"
Write-Host ("  lines        : {0}" -f $lines)
Write-Host ("  chars        : {0}" -f $text.Length)
Write-Host ("  CODE_VERSION : {0}" -f $version)
Write-Host ""
Write-Host "Next: open the Apps Script editor, select all (Ctrl+A) in Code.gs, paste (Ctrl+V),"
Write-Host "      save (Ctrl+S), then Deploy > Manage deployments > pencil > New version > Deploy."
