# 生成启动器内置的原版素材清单（src-tauri/resources/vanilla/manifest.json）：
#   manifest.json —— 原版游戏全部文件的 sha256（校验 3D Entities 下的 nmo、一键恢复原版时用）
#
# 启动器不再单独内嵌一份 nmo 包：恢复原版素材时直接从内置的完整游戏包
# （src-tauri/resources/game/ballance-original.zip，由 scripts/fetch-game.mjs 下载）里取。
# 所以这里只生成清单，不打包。
#
# 用法：
#   1. 下载 https://dl.ballance.top/game/download 并解压到一个空目录（解压出来就是游戏根）
#   2. powershell -ExecutionPolicy Bypass -File tools/gen-vanilla-assets.ps1 -SourceDir D:\tmp\vanilla-game
#
# 换了原版包才需要重跑。清单必须和内置游戏包是同一份，换包时三件事一起做：
#   1. 把新包传到下载站（ballance-resource-hub/docs/vanilla-game.md）；
#   2. 改 scripts/fetch-game.mjs 的 PIN（version / size / sha256，取自 GET /game/info）；
#   3. 跑 `pnpm fetch:game --force`，再跑 `cargo test --lib vanilla` 确认包与清单一致。

param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot '..\src-tauri\resources\vanilla' }
$SourceDir = (Resolve-Path $SourceDir).Path
if (-not (Test-Path (Join-Path $SourceDir 'Bin\Player.exe'))) {
  throw "不是原版游戏目录（缺 Bin\Player.exe）：$SourceDir"
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

"manifest.json      {0} 个文件, {1:N0} KB" -f $files.Count, ((Get-Item (Join-Path $OutDir 'manifest.json')).Length / 1KB)
"别忘了：新包上传到下载站后，把 /game/info 的 version / size / sha256 填进 scripts/fetch-game.mjs 的 PIN"
