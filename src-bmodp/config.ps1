# BMLPlus SDK Configuration
# Update this file when you need to upgrade the SDK version

$Env:BMLP_VERSION = "v0.3.10"
$Env:BMLP_REPO = "doyaGu/BallanceModLoaderPlus"
$Env:BMLP_SDK_ARCHIVE = "BMLPlus-SDK-$($Env:BMLP_VERSION)-Release.zip"
$Env:BMLP_SDK_URL = "https://github.com/$($Env:BMLP_REPO)/releases/download/$($Env:BMLP_VERSION)/$($Env:BMLP_SDK_ARCHIVE)"
$Env:BMLP_TARGET_DIR = "3rd-party\BMLPlus"

# Set proxy if needed (leave empty to disable)
# Example: $Env:BMLP_PROXY = "http://127.0.0.1:7890"
$Env:BMLP_PROXY = ""
