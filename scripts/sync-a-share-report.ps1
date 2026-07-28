param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$ReportPath
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$docsRoot = Join-Path $repoRoot 'docs'
$destinationDir = Join-Path $docsRoot 'a-share-briefings'
$name = [System.IO.Path]::GetFileNameWithoutExtension($ReportPath)
$extension = [System.IO.Path]::GetExtension($ReportPath)

if ($extension -ne '.md' -or $name -notmatch '^(?<date>\d{4}-\d{2}-\d{2})_') {
    throw 'Report filename must start with YYYY-MM-DD_ and use the .md extension.'
}

$date = $Matches.date
$destination = Join-Path $destinationDir "$date.md"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$newLine = [Environment]::NewLine

Copy-Item -LiteralPath $ReportPath -Destination $destination -Force

$reports = Get-ChildItem -LiteralPath $destinationDir -Filter '????-??-??.md' |
    Sort-Object Name -Descending |
    ForEach-Object { "- [$($_.BaseName)](/a-share-briefings/$($_.BaseName))" }

$archivePath = Join-Path $destinationDir 'index.md'
$archiveText = [System.IO.File]::ReadAllText($archivePath, [System.Text.Encoding]::UTF8)
$archiveListPattern = '(?m)^- \[\d{4}-\d{2}-\d{2}\]\(/a-share-briefings/\d{4}-\d{2}-\d{2}\)\s*$'
$firstArchiveItem = [regex]::Match($archiveText, $archiveListPattern)

if ($firstArchiveItem.Success) {
    $archiveHeader = $archiveText.Substring(0, $firstArchiveItem.Index).TrimEnd()
} else {
    $archiveHeader = $archiveText.TrimEnd()
}

$updatedArchive = $archiveHeader + $newLine + $newLine + ($reports -join $newLine) + $newLine
[System.IO.File]::WriteAllText($archivePath, $updatedArchive, $utf8NoBom)

$homePath = Join-Path $docsRoot 'index.md'
$homeText = [System.IO.File]::ReadAllText($homePath, [System.Text.Encoding]::UTF8)
$latestPattern = '(?m)^- \[\d{4}-\d{2}-\d{2} .+\]\(/a-share-briefings/\d{4}-\d{2}-\d{2}\)\s*$'
$latestItem = [regex]::Match($homeText, $latestPattern)

if (-not $latestItem.Success) {
    throw 'Could not find the latest briefing link in docs/index.md.'
}

$updatedLatestItem = [regex]::Replace($latestItem.Value, '\d{4}-\d{2}-\d{2}', $date)
$updatedHome = $homeText.Substring(0, $latestItem.Index) +
    $updatedLatestItem +
    $homeText.Substring($latestItem.Index + $latestItem.Length)
[System.IO.File]::WriteAllText($homePath, $updatedHome, $utf8NoBom)

Write-Output "Published source copied to $destination"
