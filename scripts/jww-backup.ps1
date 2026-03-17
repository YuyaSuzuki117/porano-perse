<#
.SYNOPSIS
    JWWファイル自動バックアップスクリプト

.DESCRIPTION
    C:\JWW 配下の .jww ファイルの変更を監視し、
    保存されるたびにタイムスタンプ付きでバックアップを作成する。
    30日以上経過したバックアップは自動削除される。

.EXAMPLE
    powershell -File jww-backup.ps1

.NOTES
    停止: Ctrl+C
    バックアップ先: C:\JWW\backup\YYYY-MM-DD\
#>

param(
    [string]$WatchPath = "C:\JWW",
    [string]$BackupRoot = "C:\JWW\backup",
    [int]$RetentionDays = 30
)

# コンソール出力をUTF-8に設定
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " JWW ファイル自動バックアップ" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "監視対象: $WatchPath" -ForegroundColor Yellow
Write-Host "バックアップ先: $BackupRoot" -ForegroundColor Yellow
Write-Host "保持期間: ${RetentionDays}日" -ForegroundColor Yellow
Write-Host ""
Write-Host "監視中... (Ctrl+C で停止)" -ForegroundColor Green
Write-Host ""

# バックアップルートフォルダを作成
if (-not (Test-Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    Write-Host "[INFO] バックアップフォルダを作成: $BackupRoot" -ForegroundColor Gray
}

# FileSystemWatcher を作成
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WatchPath
$watcher.Filter = "*.jww"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $false
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

# バックアップ実行関数
function Invoke-Backup {
    param([string]$FilePath)

    # ファイルが存在するか確認
    if (-not (Test-Path $FilePath)) {
        return
    }

    # バックアップフォルダ（日付別）
    $dateFolder = Get-Date -Format "yyyy-MM-dd"
    $backupDir = Join-Path $BackupRoot $dateFolder

    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }

    # 元ファイルの相対パスを保持（サブフォルダ構造を維持）
    $relativePath = $FilePath.Substring($WatchPath.Length).TrimStart('\')
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($relativePath)
    $extension = [System.IO.Path]::GetExtension($relativePath)
    $subDir = [System.IO.Path]::GetDirectoryName($relativePath)

    # タイムスタンプ付きファイル名
    $timestamp = Get-Date -Format "HHmmss"
    $backupFileName = "${fileName}_${timestamp}${extension}"

    # サブフォルダがある場合はバックアップ先にも作成
    $targetDir = $backupDir
    if ($subDir) {
        $targetDir = Join-Path $backupDir $subDir
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
    }

    $backupPath = Join-Path $targetDir $backupFileName

    try {
        Copy-Item -Path $FilePath -Destination $backupPath -Force
        $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $fileSize = (Get-Item $FilePath).Length
        $fileSizeKB = [math]::Round($fileSize / 1024, 1)
        Write-Host "[$now] バックアップ完了: $relativePath -> $backupFileName (${fileSizeKB}KB)" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] バックアップ失敗: $FilePath - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 古いバックアップを削除する関数
function Remove-OldBackups {
    $cutoffDate = (Get-Date).AddDays(-$RetentionDays)

    Get-ChildItem -Path $BackupRoot -Directory | ForEach-Object {
        # フォルダ名がYYYY-MM-DD形式であることを確認
        $folderDate = $null
        if ([DateTime]::TryParseExact($_.Name, "yyyy-MM-dd", $null, [System.Globalization.DateTimeStyles]::None, [ref]$folderDate)) {
            if ($folderDate -lt $cutoffDate) {
                try {
                    Remove-Item -Path $_.FullName -Recurse -Force
                    Write-Host "[CLEANUP] 古いバックアップを削除: $($_.Name)" -ForegroundColor DarkYellow
                }
                catch {
                    Write-Host "[ERROR] 削除失敗: $($_.FullName) - $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    }
}

# 起動時に古いバックアップをクリーンアップ
Remove-OldBackups

# 重複イベント防止用の辞書（ファイルパス → 最終処理時刻）
$script:lastEventTime = @{}
$debounceSeconds = 2

# メインループ（ポーリング方式で安定動作）
try {
    $watcher.EnableRaisingEvents = $true

    # 1日1回のクリーンアップ用タイマー
    $lastCleanup = Get-Date

    while ($true) {
        # WaitForChanged で変更を待つ（タイムアウト1秒）
        $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Created, 1000)

        if (-not $result.TimedOut) {
            $fullPath = Join-Path $WatchPath $result.Name

            # デバウンス: 同じファイルの連続イベントを抑制
            $now = Get-Date
            if ($script:lastEventTime.ContainsKey($fullPath)) {
                $elapsed = ($now - $script:lastEventTime[$fullPath]).TotalSeconds
                if ($elapsed -lt $debounceSeconds) {
                    continue
                }
            }
            $script:lastEventTime[$fullPath] = $now

            # 少し待ってからバックアップ（書込み完了を待つ）
            Start-Sleep -Milliseconds 500
            Invoke-Backup -FilePath $fullPath
        }

        # 1日1回の古いバックアップクリーンアップ
        if (((Get-Date) - $lastCleanup).TotalHours -ge 24) {
            Remove-OldBackups
            $lastCleanup = Get-Date
        }
    }
}
finally {
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    Write-Host ""
    Write-Host "監視を終了しました。" -ForegroundColor Yellow
}
