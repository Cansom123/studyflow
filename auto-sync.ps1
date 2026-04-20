# Auto-sync: watches for file changes and pushes to GitHub automatically
$repoPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repoPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite

$debounceTimer = $null

$action = {
    $path = $Event.SourceEventArgs.FullPath
    # Ignore git internals and temp files
    if ($path -match '\\\.git\\' -or $path -match '~$' -or $path -match '\.tmp$') { return }

    if ($debounceTimer) { $debounceTimer.Stop(); $debounceTimer.Dispose() }
    $script:debounceTimer = New-Object System.Timers.Timer
    $script:debounceTimer.Interval = 5000
    $script:debounceTimer.AutoReset = $false
    $script:debounceTimer.Add_Elapsed({
        Set-Location $repoPath
        $status = git status --porcelain
        if ($status) {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
            git add .
            git commit -m "Auto-sync $timestamp"
            git push origin main
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pushed changes" -ForegroundColor Green
        }
    })
    $script:debounceTimer.Start()
}

Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null
Register-ObjectEvent $watcher "Created" -Action $action | Out-Null

Write-Host "Watching for changes in: $repoPath" -ForegroundColor Cyan
Write-Host "Changes will auto-push to GitHub after 5 seconds of inactivity." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

while ($true) { Start-Sleep -Seconds 1 }
