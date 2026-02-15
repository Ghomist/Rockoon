# Load Build configuration
. .\config.ps1

# Set proxy if configured
if ($Env:BMLP_PROXY) {
    Write-Host "Using proxy: $($Env:BMLP_PROXY)"
    $Env:HTTP_PROXY = $Env:BMLP_PROXY
    $Env:HTTPS_PROXY = $Env:BMLP_PROXY
}

# Check if SDK is already downloaded
$sdkConfigPath = Join-Path $Env:BMLP_TARGET_DIR "lib\cmake\BML\BMLConfig.cmake"
$sdkLibPath = Join-Path $Env:BMLP_TARGET_DIR "lib\BMLPlus.lib"
$sdkDllPath = Join-Path $Env:BMLP_TARGET_DIR "bin\BMLPlus.dll"
$sdkIncludePath = Join-Path $Env:BMLP_TARGET_DIR "include\BML"

$sdkExists = (Test-Path $sdkConfigPath) -and
             (Test-Path $sdkLibPath) -and
             (Test-Path $sdkDllPath) -and
             (Test-Path $sdkIncludePath)

if ($sdkExists) {
    Write-Host "BMLPlus SDK already exists at $($Env:BMLP_TARGET_DIR)"
    Write-Host "Current version: $($Env:BMLP_VERSION)"
} else {
    Write-Host "Downloading BMLPlus SDK version $($Env:BMLP_VERSION)..."
    Write-Host "URL: $($Env:BMLP_SDK_URL)"

    # Create target directory
    if (-not (Test-Path $Env:BMLP_TARGET_DIR)) {
        New-Item -ItemType Directory -Path $Env:BMLP_TARGET_DIR | Out-Null
    }

    # Download SDK
    try {
        Invoke-WebRequest -Uri $Env:BMLP_SDK_URL -OutFile "BMLPlus-SDK.zip"
        Write-Host "Download completed"
    } catch {
        Write-Host "Failed to download BMLPlus SDK: $_"
        exit 1
    }

    # Extract SDK
    Write-Host "Extracting SDK..."
    try {
        Expand-Archive -Path "BMLPlus-SDK.zip" -DestinationPath $Env:BMLP_TARGET_DIR -Force
        Write-Host "Extraction completed"
    } catch {
        Write-Host "Failed to extract BMLPlus SDK: $_"
        exit 1
    }

    # Cleanup
    Remove-Item "BMLPlus-SDK.zip" -ErrorAction SilentlyContinue

    Write-Host "BMLPlus SDK downloaded and extracted successfully to $($Env:BMLP_TARGET_DIR)"
}

# Make VS project
Write-Host "Configuring CMake..."
cmake . -B build -A Win32
if ($LASTEXITCODE -ne 0) {
    Write-Host "CMake configuration failed"
    exit 1
}

# Build
Write-Host "Building..."
cmake --build build --config Release
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed"
    exit 1
}

# Copy to tauri
Write-Host "Copying to tauri resources..."
$source = "build\Release\RockoonIO.bmodp"
$destination = "..\src-tauri\resources\builtin-mods\"

# Create destination directory if it doesn't exist
if (-not (Test-Path $destination)) {
    Write-Host "Creating directory: $destination"
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
}

Copy-Item -Path $source -Destination $destination -Recurse -Force

Write-Host "Build completed successfully"
