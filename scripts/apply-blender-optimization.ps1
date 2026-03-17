param(
    [ValidateSet("safe", "modeling", "preview")]
    [string]$Profile = "modeling"
)

$ErrorActionPreference = "Stop"

$blender = "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
$scriptPath = Join-Path $PSScriptRoot "apply-blender-optimization.py"

if (-not (Test-Path $blender)) {
    throw "Blender が見つかりません: $blender"
}

if (-not (Test-Path $scriptPath)) {
    throw "Python スクリプトが見つかりません: $scriptPath"
}

& $blender --background --python $scriptPath -- --profile $Profile
