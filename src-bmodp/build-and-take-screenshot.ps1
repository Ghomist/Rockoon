# Usage: .\build-and-take-screenshot.ps1 [-GameLocation "C:\Path\To\Ballance"] [-StartupMap "C:\Path\To\Map.nmo"]

param(
	[string]$GameLocation,
	[string]$StartupMap
)

function Select-GameLocation {
	Add-Type -AssemblyName System.Windows.Forms

	$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
	$dialog.Description = "Select Ballance installation folder"
	$dialog.ShowNewFolderButton = $false

	if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
		return $dialog.SelectedPath
	}

	throw "No game location selected."
}

function Select-StartupMap([string]$InitialDirectory) {
	Add-Type -AssemblyName System.Windows.Forms

	$dialog = New-Object System.Windows.Forms.OpenFileDialog
	$dialog.Title = "Select startup map (.nmo)"
	$dialog.Filter = "NMO files (*.nmo)|*.nmo|All files (*.*)|*.*"
	$dialog.Multiselect = $false

	if (Test-Path $InitialDirectory) {
		$dialog.InitialDirectory = $InitialDirectory
	}

	if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
		return $dialog.FileName
	}

	throw "No startup map selected."
}

$cur_path = $PSScriptRoot

try {
	./build.ps1

	if (-not $GameLocation) {
		$GameLocation = Select-GameLocation
	}

	$modLoaderDir = Join-Path $GameLocation "ModLoader"
	$modsDir = Join-Path $modLoaderDir "Mods"
	$mapsDir = Join-Path $modLoaderDir "Maps"
	$binDir = Join-Path $GameLocation "Bin"
	$playerExe = Join-Path $binDir "Player.exe"

	if (-not (Test-Path $playerExe)) {
		throw "Invalid game location: Player.exe was not found at '$playerExe'."
	}

	if (-not (Test-Path $modsDir)) {
		New-Item -Path $modsDir -ItemType Directory -Force | Out-Null
	}

	if (-not $StartupMap) {
		$StartupMap = Select-StartupMap -InitialDirectory $mapsDir
	}

	if (-not (Test-Path $StartupMap)) {
		throw "Startup map does not exist: '$StartupMap'."
	}

	Copy-Item .\build\Release\RockoonIO.bmodp (Join-Path $modsDir "RockoonIO.bmodp") -Force

	Set-Location $binDir
	$env:ROCKOON_SCREENSHOT_DIR = Join-Path $modLoaderDir "RockoonScreenshots"
	$env:ROCKOON_STARTUP = $StartupMap
	./Player.exe
}
finally {
	Set-Location $cur_path
}