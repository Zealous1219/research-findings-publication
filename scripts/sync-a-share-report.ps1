param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$ReportPath
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationDir = Join-Path $repoRoot 'docs\a-share-briefings'
$name = [System.IO.Path]::GetFileNameWithoutExtension($ReportPath)

if ($name -notmatch '^(?<date>\d{4}-\d{2}-\d{2})_A股收盘简报$') {
    throw '报告文件名必须是 YYYY-MM-DD_A股收盘简报.md。'
}

$date = $Matches.date
$destination = Join-Path $destinationDir "$date.md"
Copy-Item -LiteralPath $ReportPath -Destination $destination -Force

$reports = Get-ChildItem -LiteralPath $destinationDir -Filter '????-??-??.md' |
    Sort-Object Name -Descending |
    ForEach-Object { "- [$($_.BaseName)](/a-share-briefings/$($_.BaseName))" }

$archive = @(
    '# A 股收盘简报',
    '',
    '按交易日归档的市场信息整理。报告以生成时的数据状态为准。',
    '',
    $reports
) -join [Environment]::NewLine

Set-Content -LiteralPath (Join-Path $destinationDir 'index.md') -Value $archive -Encoding utf8
Write-Output "Published source copied to $destination"
