<#
.SYNOPSIS
    JWW 案件フォルダテンプレート作成スクリプト

.DESCRIPTION
    内装仕上げ案件用のフォルダ構造を C:\JWW\案件\ 配下に作成する。
    図枠テンプレート（A3）が存在する場合、各図面フォルダにコピーする。

.PARAMETER ProjectName
    案件名（フォルダ名として使用される）

.EXAMPLE
    .\jww-project-init.ps1 -ProjectName "代官山カフェ"

.EXAMPLE
    .\jww-project-init.ps1 "渋谷バー改装"
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ProjectName,

    [string]$BaseDir = "C:\JWW\案件",
    [string]$TemplateDir = "C:\JWW\図枠"
)

# コンソール出力をUTF-8に設定
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# フォルダ構造定義
# isDraw: $true の場合、図枠テンプレートをコピーする（図面フォルダ）
$folders = @(
    @{ Name = "01_現況図";   IsDraw = $true  }
    @{ Name = "02_平面図";   IsDraw = $true  }
    @{ Name = "03_展開図";   IsDraw = $true  }
    @{ Name = "04_天井伏図"; IsDraw = $true  }
    @{ Name = "05_詳細図";   IsDraw = $true  }
    @{ Name = "06_家具図";   IsDraw = $true  }
    @{ Name = "07_DXF";      IsDraw = $false }
    @{ Name = "08_PDF";      IsDraw = $false }
    @{ Name = "09_参考資料"; IsDraw = $false }
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " JWW 案件フォルダ作成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 案件フォルダのパス
$projectDir = Join-Path $BaseDir $ProjectName

# 既存チェック
if (Test-Path $projectDir) {
    Write-Host "[WARNING] 案件フォルダが既に存在します: $projectDir" -ForegroundColor Yellow
    $response = Read-Host "上書きしますか？ (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "中止しました。" -ForegroundColor Red
        exit 0
    }
}

# ベースディレクトリ作成
if (-not (Test-Path $BaseDir)) {
    New-Item -ItemType Directory -Path $BaseDir -Force | Out-Null
    Write-Host "[INFO] ベースフォルダを作成: $BaseDir" -ForegroundColor Gray
}

# 案件フォルダ作成
New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
Write-Host "案件名: $ProjectName" -ForegroundColor White
Write-Host "場所:   $projectDir" -ForegroundColor White
Write-Host ""

# 図枠テンプレートファイルを検索
$templateFiles = @()
if (Test-Path $TemplateDir) {
    # .jww ファイルを検索（A3を優先、なければすべて）
    $allTemplates = Get-ChildItem -Path $TemplateDir -Filter "*.jww" -File
    $a3Templates = $allTemplates | Where-Object { $_.Name -match "A3|a3|Ａ３" }

    if ($a3Templates) {
        $templateFiles = $a3Templates
    }
    elseif ($allTemplates) {
        $templateFiles = $allTemplates
    }

    if ($templateFiles.Count -gt 0) {
        Write-Host "[INFO] 図枠テンプレート: $($templateFiles.Count) ファイル検出" -ForegroundColor Gray
        foreach ($t in $templateFiles) {
            Write-Host "       - $($t.Name)" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "[INFO] 図枠テンプレート (.jww) が見つかりません: $TemplateDir" -ForegroundColor DarkYellow
        Write-Host "       図面フォルダにテンプレートはコピーされません" -ForegroundColor DarkYellow
    }
}
else {
    Write-Host "[INFO] 図枠フォルダが存在しません: $TemplateDir" -ForegroundColor DarkYellow
    Write-Host "       図面フォルダにテンプレートはコピーされません" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "フォルダ構造:" -ForegroundColor White

# 各フォルダを作成
$copiedCount = 0
foreach ($folder in $folders) {
    $folderPath = Join-Path $projectDir $folder.Name
    New-Item -ItemType Directory -Path $folderPath -Force | Out-Null

    $icon = if ($folder.IsDraw) { "[図]" } else { "[他]" }
    Write-Host "  $icon $($folder.Name)" -ForegroundColor White

    # 図面フォルダに図枠テンプレートをコピー
    if ($folder.IsDraw -and $templateFiles.Count -gt 0) {
        foreach ($template in $templateFiles) {
            $destPath = Join-Path $folderPath $template.Name
            Copy-Item -Path $template.FullName -Destination $destPath -Force
            $copiedCount++
            Write-Host "       -> $($template.Name) をコピー" -ForegroundColor DarkGreen
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 完了" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "作成フォルダ: $($folders.Count) フォルダ" -ForegroundColor White
if ($copiedCount -gt 0) {
    Write-Host "コピーした図枠: ${copiedCount} ファイル" -ForegroundColor White
}
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor Yellow
Write-Host "  1. JW_CADで $projectDir を開く" -ForegroundColor White
Write-Host "  2. 01_現況図 から作業を開始" -ForegroundColor White
Write-Host "  3. DXF出力は 07_DXF に保存" -ForegroundColor White
Write-Host "  4. PDF出力は 08_PDF に保存" -ForegroundColor White
