param(
    [Parameter(Mandatory = $true)]
    [string]$PythonScript,
    [string]$BlendFile
    ,
    [switch]$FactoryStartup
)

$ErrorActionPreference = "Stop"

$blender = "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
if (-not (Test-Path $blender)) {
    throw "Blender が見つかりません: $blender"
}

$arguments = @("--background")
if ($FactoryStartup) {
    $arguments += "--factory-startup"
}
if ($BlendFile) {
    $arguments += $BlendFile
}
$arguments += @("--python", $PythonScript)

& $blender @arguments
