<#
.SYNOPSIS
  Publish a validated stock-pool dashboard HTML to the publication repository.

.DESCRIPTION
  Transforms an upstream "自选股盯盘看板-YYYY-MM-DD.html" into the published
  schema at docs/public/stock-pool-dashboard/YYYY-MM-DD/index.html, refreshes
  date navigation on every existing page, rebuilds the archive index, and
  regenerates the build-time dashboard-dates module.

  All operations are idempotent. Re-running with the same source produces no
  diff. The script never executes git add/commit/push or network operations.

.PARAMETER SourcePath
  Absolute path to the upstream HTML file. Must match 自选股盯盘看板-YYYY-MM-DD.html.

.PARAMETER DryRun
  Compute and report planned changes without writing any files.

.PARAMETER Force
  Allow overwriting an existing published page whose source content differs.
  Use only for manually confirmed historical revisions.

.OUTPUTS
  A JSON object with status, date, target, changedFiles, revised, dryRun, allDates.

.EXAMPLE
  .\publish-stock-dashboard.ps1 -SourcePath "G:\dev-doodles\stock-pools-monitor\outputs\自选股盯盘看板-2026-07-31.html"
#>

# Arguments are parsed manually after helper definitions (see "Parse arguments"
# section below). This works around a PowerShell 5.1 parameter-binding bug that
# occurs when a string argument contains CJK characters and the script body is
# non-trivial. The user-facing interface is unchanged:
#   .\publish-stock-dashboard.ps1 -SourcePath <path> [-DryRun] [-Force]

$ErrorActionPreference = 'Stop'

# ── Paths ──
$repoRoot   = Split-Path -Parent $PSScriptRoot
$docsRoot   = Join-Path $repoRoot 'docs'
$dashDir    = Join-Path $docsRoot 'public\stock-pool-dashboard'
$indexMd    = Join-Path $docsRoot 'stock-pool-dashboard\index.md'
$datesTs    = Join-Path $docsRoot '.vitepress\dashboard-dates.ts'
$nodeScript = Join-Path $PSScriptRoot 'transform-dashboard-html.mjs'
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)
$eol        = "`r`n"

# ── Helpers ──

function Write-Json($obj) {
    [Console]::Out.WriteLine((ConvertTo-Json $obj -Depth 6 -Compress))
}

function Fail(
    [string]$Message,
    [string]$Date = '',
    [string]$Target = ''
) {
    Write-Json @{
        status      = 'failed'
        error       = $Message
        date        = $Date
        target      = $Target
        changedFiles = @()
        dryRun      = $DryRun
    }
    exit 1
}

function Invoke-Node(
    [string]$Mode,
    [hashtable]$Params
) {
    <#
      Calls the Node helper and returns @{ ok=$true; output=$path } on success,
      @{ ok=$false; error=$msg } on failure.
    #>
    $nodeArgs = @($nodeScript, $Mode)
    foreach ($key in $Params.Keys) {
        $nodeArgs += @($key, $Params[$key])
    }

    $exitCode = 0
    # Relax EAP around the native call: with 'Stop', node writing to stderr
    # raises a terminating NativeCommandError that prevents $LASTEXITCODE from
    # being read. 'Continue' lets us merge stderr via 2>&1 and inspect the exit
    # code cleanly. Native-command stderr is wrapped as ErrorRecord objects whose
    # Exception.Message holds the raw line; stdout arrives as plain strings.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $outputLines = @()
    try {
        $outputLines = & node @nodeArgs 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEAP
    }

    $stderrContent = ''
    foreach ($line in $outputLines) {
        if ($line -is [System.Management.Automation.ErrorRecord]) {
            $stderrContent += $line.Exception.Message + "`n"
        }
    }

    if ($exitCode -ne 0) {
        $msg = $stderrContent.Trim()
        try {
            $parsed = $msg | ConvertFrom-Json
            $msg = $parsed.error
        } catch {
            # keep raw stderr
        }
        return @{ ok = $false; error = $msg }
    }
    return @{ ok = $true }
}

function Build-IndexMd([string[]]$Dates) {
    $lines = @(
        '---',
        'title: 股票池盯盘看板',
        'description: 按交易日归档的股票池行情与板块表现快照。',
        'pageClass: zr-archive-page zr-dashboard-archive',
        '---',
        '',
        '# 股票池盯盘看板',
        '',
        '按交易日归档的股票池行情与板块表现快照。'
    )
    foreach ($d in $Dates) {
        $lines += "- <a href=`"./$d/`" target=`"_self`">$d</a>"
    }
    return ($lines -join $eol) + $eol
}

function Build-DatesTs([string[]]$Dates) {
    $lines = @('export const dashboardDates: string[] = [')
    foreach ($d in $Dates) {
        $lines += "  '$d',"
    }
    $lines += ']'
    return ($lines -join $eol) + $eol
}

function Get-RelPath([string]$AbsPath) {
    $full = [System.IO.Path]::GetFullPath($AbsPath).TrimEnd('\')
    $root = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
    if ($full.Length -gt $root.Length -and $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($root.Length + 1).Replace('\', '/')
    }
    return $AbsPath
}

function Read-FileText([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return [System.IO.File]::ReadAllText($Path, $utf8NoBom)
}

function Write-IfChanged([string]$Path, [string]$NewContent) {
    $existing = Read-FileText $Path
    if ($null -ne $existing -and $existing -eq $NewContent) { return $false }
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $NewContent, $utf8NoBom)
    return $true
}

# ── Parse arguments ──
# Manual parsing (workaround for PowerShell 5.1 CJK parameter-binding bug).
# Interface: -SourcePath <path> [-DryRun] [-Force]

$SourcePath = $null
$DryRun     = $false
$Force      = $false

for ($argIdx = 0; $argIdx -lt $args.Length; $argIdx++) {
    switch ($args[$argIdx]) {
        '-SourcePath' {
            $argIdx++
            if ($argIdx -ge $args.Length) {
                Write-Json @{ status = 'failed'; error = '-SourcePath requires a value'; changedFiles = @(); dryRun = $false }
                exit 1
            }
            $SourcePath = [string]$args[$argIdx]
            break
        }
        '-DryRun'  { $DryRun = $true; break }
        '-Force'   { $Force = $true; break }
        default {
            Write-Json @{ status = 'failed'; error = "Unknown argument: $($args[$argIdx])"; changedFiles = @(); dryRun = $false }
            exit 1
        }
    }
}

if (-not $SourcePath) {
    Write-Json @{ status = 'failed'; error = '-SourcePath is required'; changedFiles = @(); dryRun = $false }
    exit 1
}

# ── 1. Validate SourcePath ──

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    Fail "SourcePath does not exist or is not a file: $SourcePath"
}

$filename = [System.IO.Path]::GetFileName($SourcePath)
if ($filename -notmatch '^自选股盯盘看板-(\d{4}-\d{2}-\d{2})\.html$') {
    Fail "Filename must match '自选股盯盘看板-YYYY-MM-DD.html', got: $filename"
}
$date = $Matches[1]

# ── 2. Find and validate log ──

$sourceDir     = [System.IO.Path]::GetDirectoryName($SourcePath)
$upstreamRoot   = [System.IO.Path]::GetDirectoryName($sourceDir)
$logPath       = Join-Path $upstreamRoot "logs\$date.json"

if (-not (Test-Path -LiteralPath $logPath -PathType Leaf)) {
    Fail "Log file not found at sibling logs directory: $logPath" $date
}

try {
    $log = [System.IO.File]::ReadAllText($logPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
} catch {
    Fail "Log file is not valid JSON: $logPath — $($_.Exception.Message)" $date
}

# ── 3. Validate log fields ──

if ($log.tradeDate -ne $date) {
    Fail "log.tradeDate ('$($log.tradeDate)') does not match filename date ('$date')" $date
}

$validation = $log.validation
if ($null -eq $validation -or $validation.publish -ne $true) {
    Fail "log.validation.publish is not true" $date
}

$problems = @($validation.problems)
if ($problems.Count -gt 0) {
    Fail "log.validation.problems is not empty: $($problems -join '; ')" $date
}

# ── 4. Validate outputPath matches SourcePath ──

$resolvedSource    = [System.IO.Path]::GetFullPath($SourcePath)
$resolvedLogOutput = [System.IO.Path]::GetFullPath($log.outputPath)
if (-not [string]::Equals($resolvedSource, $resolvedLogOutput, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "log.outputPath ('$resolvedLogOutput') does not match SourcePath ('$resolvedSource')" $date
}

# ── 5. Determine all dates (desc, unique) ──

$existingDates = @()
if (Test-Path $dashDir) {
    $existingDates = Get-ChildItem -LiteralPath $dashDir -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
        ForEach-Object { $_.Name }
}
$allDates = (@($existingDates) + $date) | Sort-Object -Unique -Descending
$datesParam = $allDates -join ','

# ── 6. Transform source via Node helper ──

$targetDir  = Join-Path $dashDir $date
$targetFile = Join-Path $targetDir 'index.html'
$tempFile   = [System.IO.Path]::GetTempFileName()

$transformResult = Invoke-Node 'transform' @{
    '--source' = $SourcePath
    '--output' = $tempFile
    '--date'   = $date
    '--dates'  = $datesParam
}

if (-not $transformResult.ok) {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    Fail "HTML transform failed: $($transformResult.error)" $date (Get-RelPath $targetFile)
}

# ── 7. Determine action for target ──

$newContent   = [System.IO.File]::ReadAllText($tempFile, $utf8NoBom)
$existingCont = Read-FileText $targetFile
$shouldWrite  = $false
$isRevised    = $false

if ($null -eq $existingCont) {
    # Target doesn't exist → publish
    $shouldWrite = $true
} elseif ($existingCont -eq $newContent) {
    # Identical → noop for target
    $shouldWrite = $false
} else {
    # Different content
    if (-not $Force) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        Fail "Target already exists with different content. Use -Force to revise: $targetFile" $date (Get-RelPath $targetFile)
    }
    $shouldWrite = $true
    $isRevised = $true
}

# tempFile no longer needed; newContent was already read above.
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

# ── 8. Phase 1 (planning): build plannedChanges without writing ──
# Every candidate is compared byte-for-byte against on-disk content.
# Any nav-refresh failure aborts before any repo file is touched.

# plannedChanges: array of @{ path = <abs>; newContent = <string> }
$plannedChanges = @()
if ($shouldWrite) {
    $plannedChanges += @{ path = $targetFile; newContent = $newContent }
}

# Plan nav refresh for every other existing page. Failures are NOT ignored.
foreach ($d in $allDates) {
    if ($d -eq $date) { continue }
    $pageFile = Join-Path $dashDir "$d\index.html"
    if (-not (Test-Path -LiteralPath $pageFile -PathType Leaf)) { continue }

    $navTemp = [System.IO.Path]::GetTempFileName()
    $navResult = Invoke-Node 'refresh-nav' @{
        '--file'   = $pageFile
        '--output' = $navTemp
        '--date'   = $d
        '--dates'  = $datesParam
    }

    if (-not $navResult.ok) {
        Remove-Item $navTemp -Force -ErrorAction SilentlyContinue
        Fail "Nav refresh failed for $d : $($navResult.error)" $date (Get-RelPath $targetFile)
    }

    $newNav = [System.IO.File]::ReadAllText($navTemp, $utf8NoBom)
    Remove-Item $navTemp -Force -ErrorAction SilentlyContinue

    $existingNav = [System.IO.File]::ReadAllText($pageFile, $utf8NoBom)
    if ($existingNav -ne $newNav) {
        $plannedChanges += @{ path = $pageFile; newContent = $newNav }
    }
}

# Plan index.md
$newIndex = Build-IndexMd $allDates
if ((Read-FileText $indexMd) -ne $newIndex) {
    $plannedChanges += @{ path = $indexMd; newContent = $newIndex }
}

# Plan dashboard-dates.ts
$newDatesTs = Build-DatesTs $allDates
if ((Read-FileText $datesTs) -ne $newDatesTs) {
    $plannedChanges += @{ path = $datesTs; newContent = $newDatesTs }
}

# changedFiles = relative paths of truly-changed files (deduped)
$changedFiles = @($plannedChanges | ForEach-Object { Get-RelPath $_.path } | Sort-Object -Unique)

# ── 9. DryRun: report planned changes without writing ──

if ($DryRun) {
    Write-Json @{
        status       = 'dry-run'
        date         = $date
        target       = (Get-RelPath $targetFile)
        changedFiles = $changedFiles
        revised      = $isRevised
        dryRun       = $true
        allDates     = $allDates
    }
    exit 0
}

# ── 10. Phase 2 (write): apply plannedChanges ──
# On exception, roll back every file touched this run to its original state.
#
# Rollback-integrity contract:
#   - For each planned write, register the rollback entry in $written BEFORE any
#     disk-mutating op (New-Item directory or WriteAllText). This guarantees that
#     even a partial WriteAllText failure (rare but possible: disk full, ACL
#     change mid-write, antivirus intercept) leaves a recoverable record.
#   - Capture originalContent (null = file did not exist) and dirExisted (was
#     the immediate parent directory already present before this run?).
#   - ALSO walk up from the immediate parent, collecting every directory that
#     does NOT yet exist, stopping at the first existing ancestor. New-Item -Force
#     would create all of these; createdDirectories records them so rollback can
#     remove the whole chain (deepest first) rather than only the leaf parent.
#   - On rollback, only delete directories in createdDirectories, in deepest-to-
#     shallowest order, and only when currently empty. Pre-existing ancestors
#     (which are never in createdDirectories) are never removed.

$written = @()  # array of @{ path; originalContent; dirExisted; createdDirectories }

try {
    foreach ($change in $plannedChanges) {
        # 1) Capture rollback metadata BEFORE any disk-mutating op.
        $origContent = Read-FileText $change.path
        $dir         = Split-Path -Parent $change.path
        # Walk up from $dir collecting every directory that does NOT yet exist,
        # stopping at the first existing ancestor. Insert at index 0 so the
        # list is ordered shallowest -> deepest (rollback iterates deepest first).
        $createdDirectories = New-Object System.Collections.Generic.List[string]
        $cursor = $dir
        while (-not [string]::IsNullOrEmpty($cursor) -and -not (Test-Path -LiteralPath $cursor -PathType Container)) {
            $createdDirectories.Insert(0, $cursor)
            $parent = Split-Path -Parent $cursor
            if ([string]::IsNullOrEmpty($parent) -or $parent -eq $cursor) { break }
            $cursor = $parent
        }
        $dirExisted = ($createdDirectories.Count -eq 0)
        # 2) Register the rollback entry first so a partial WriteAllText can
        #    still be reverted.
        $written += @{
            path               = $change.path
            originalContent    = $origContent
            dirExisted         = $dirExisted
            createdDirectories = $createdDirectories
        }
        # 3) Only now create the directory (if needed) and write the file.
        if (-not $dirExisted) {
            New-Item -Path $dir -ItemType Directory -Force | Out-Null
        }
        [System.IO.File]::WriteAllText($change.path, $change.newContent, $utf8NoBom)
    }
} catch {
    $originalError = $_.Exception.Message
    # Best-effort rollback in reverse order.
    for ($i = $written.Count - 1; $i -ge 0; $i--) {
        $w = $written[$i]
        try {
            if ($null -eq $w.originalContent) {
                # File did not exist before this run — delete any partial
                # artifact that WriteAllText may have left behind.
                Remove-Item -LiteralPath $w.path -Force -ErrorAction SilentlyContinue
            } else {
                # Restore original byte content (covers both overwrite and
                # create-then-fail-next-write cases).
                [System.IO.File]::WriteAllText($w.path, $w.originalContent, $utf8NoBom)
            }
            # Remove directories created by THIS run for THIS entry, deepest
            # first so empty children are removed before their parents are
            # checked. Only delete if currently empty; never touch a
            # pre-existing ancestor (those are never in createdDirectories).
            $dirs = @($w.createdDirectories)
            for ($j = $dirs.Count - 1; $j -ge 0; $j--) {
                $d = $dirs[$j]
                if (Test-Path -LiteralPath $d -PathType Container) {
                    $remaining = @(Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue)
                    if ($remaining.Count -eq 0) {
                        Remove-Item -LiteralPath $d -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } catch {
            # Best-effort; continue rolling back remaining files.
        }
    }
    Write-Json @{
        status       = 'failed'
        error        = "Write phase failed; rolled back $($written.Count) file(s): $originalError"
        date         = $date
        target       = (Get-RelPath $targetFile)
        changedFiles = @()
        revised      = $isRevised
        dryRun       = $false
        allDates     = $allDates
    }
    exit 1
}

# ── 11. Determine final status ──

if ($changedFiles.Count -eq 0) {
    $status = 'noop'
} elseif ($isRevised) {
    $status = 'revised'
} else {
    $status = 'published'
}

Write-Json @{
    status       = $status
    date         = $date
    target       = (Get-RelPath $targetFile)
    changedFiles = $changedFiles
    revised      = $isRevised
    dryRun       = $false
    allDates     = $allDates
}
