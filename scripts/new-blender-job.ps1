param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("chair", "table")]
    [string]$Category,

    [Parameter(Mandatory = $true)]
    [string]$JobName,

    [Parameter(Mandatory = $true)]
    [string]$AssetSlug
)

$ErrorActionPreference = "Stop"

$workspace = "C:\Users\LENOVO\Desktop\Blender_Codex"
$categoryFolder = switch ($Category) {
    "chair" { "10_案件_椅子" }
    "table" { "20_案件_テーブル" }
}

$jobRoot = Join-Path $workspace $categoryFolder
$jobPath = Join-Path $jobRoot $JobName
$referencesPath = Join-Path $jobPath "references"
$outputPath = Join-Path $jobPath "output"
$scriptName = "generate_{0}_scene.py" -f $AssetSlug
$scriptPath = Join-Path $jobPath $scriptName
$guidePath = Join-Path $jobPath "使い方.txt"

if (Test-Path $jobPath) {
    throw "既に存在します: $jobPath"
}

New-Item -ItemType Directory -Force -Path $referencesPath | Out-Null
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$scriptTemplate = @"
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"
REFERENCE_DIR = SCRIPT_DIR / "references"


def main() -> None:
    print("TODO: implement scene generation")
    print(f"references: {REFERENCE_DIR}")
    print(f"output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
"@

$guideTemplate = @"
$JobName

Files
- $scriptName : Blender scene generation script
- references/ : place reference images here
- output/ : save renders and .blend files here

How to run
pwsh -File ..\..\01_共通資料\scripts\run-blender-background.ps1 -PythonScript ".\$scriptName"

Notes
- Put the main reference image in references\
- Update this file when the workflow changes
"@

Set-Content -Path $scriptPath -Value $scriptTemplate -Encoding UTF8
Set-Content -Path $guidePath -Value $guideTemplate -Encoding UTF8

Write-Output "Created: $jobPath"
Write-Output "Script: $scriptPath"
