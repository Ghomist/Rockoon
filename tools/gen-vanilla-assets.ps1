# 生成启动器内置的原版素材（src-tauri/resources/vanilla/）：
#   manifest.json    —— 原版游戏全部文件的 sha256（启动时校验 3D Entities 的 nmo 用）
#   vanilla-core.zip —— 原版游戏去掉 Textures/ 与 Sounds/（材质、天空、音效走下载站）
#
# 用法：
#   1. 下载 https://dl.ballance.top/game/download 并解压到一个空目录（解压出来就是游戏根）
#   2. powershell -ExecutionPolicy Bypass -File tools/gen-vanilla-assets.ps1 -SourceDir D:\tmp\vanilla-game
#
# 换了原版包才需要重跑；跑完记得把两个产物一起提交。

param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [string]$OutDir = '',
  [string]$SevenZip = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot '..\src-tauri\resources\vanilla' }
$SourceDir = (Resolve-Path $SourceDir).Path
if (-not (Test-Path (Join-Path $SourceDir 'Bin\Player.exe'))) {
  throw "不是原版游戏目录（缺 Bin\Player.exe）：$SourceDir"
}
if (-not $SevenZip) {
  $candidates = @(
    'C:\Program Files\7-Zip\7z.exe',
    'C:\Program Files (x86)\7-Zip\7z.exe',
    'D:\7-Zip\7z.exe'
  )
  $SevenZip = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $SevenZip) { throw '找不到 7z.exe，用 -SevenZip 指定路径' }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ── 清单：全部文件的 sha256 ─────────────────────────────────
$root = $SourceDir.TrimEnd('\')
$files = [ordered]@{}
Get-ChildItem $root -Recurse -File | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
  $files[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower()
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  source      = 'https://dl.ballance.top/game/download'
  algorithm   = 'sha256'
  files       = $files
}
$json = $manifest | ConvertTo-Json -Depth 4
# 不能用 Set-Content -Encoding UTF8（PS 5.1 会带 BOM，Rust 侧 include_str! + serde 会炸）
[System.IO.File]::WriteAllText(
  (Join-Path $OutDir 'manifest.json'),
  $json,
  (New-Object System.Text.UTF8Encoding $false)
)

# ── 内置素材包：去掉 Textures/ 与 Sounds/ ──────────────────
$zip = Join-Path $OutDir 'vanilla-core.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Push-Location $root
try {
  & $SevenZip a -tzip -mx=9 $zip '*' '-xr!Textures' '-xr!Sounds' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7z 打包失败（exit $LASTEXITCODE）" }
}
finally {
  Pop-Location
}

"manifest.json      {0} 个文件, {1:N0} KB" -f $files.Count, ((Get-Item (Join-Path $OutDir 'manifest.json')).Length / 1KB)
"vanilla-core.zip   {0:N2} MB" -f ((Get-Item $zip).Length / 1MB)
