$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$archive = Join-Path $root 'dist\AppMixer.streamDeckProfile'
if (Test-Path $archive) { Write-Output "Keeping existing NEW profile package: $archive"; return }
$id = [guid]::NewGuid().ToString().ToUpperInvariant()
$page = [guid]::NewGuid().ToString().ToLowerInvariant()
$common = [guid]::NewGuid().ToString().ToLowerInvariant()
$staging = Join-Path $root "dist\profile-staging\$id.sdProfile"
$pageDir = Join-Path $staging "Profiles\$($page.ToUpperInvariant())"
New-Item -ItemType Directory -Path $pageDir -Force | Out-Null
$commonDir = Join-Path $staging "Profiles\$($common.ToUpperInvariant())"
New-Item -ItemType Directory -Path $commonDir -Force | Out-Null
$metadata = @{
    Device = @{ Model = '20GBD9901'; UUID = '' }
    Name = 'App Mixer - Windows'
    Pages = @{ Current = $page; Default = $common; Pages = @($page) }
    Version = '3.0'
}
$keys = @{}
$dials = @{}
function New-MixerAction($uuid, $name, $settings) {
    @{
        ActionID = [guid]::NewGuid().ToString(); UUID = $uuid; Name = $name
        Plugin = @{ Name = 'App Mixer'; UUID = 'local.tux.appmixer'; Version = '0.1.8.0' }
        LinkedTitle = $true; Settings = $settings; State = 0
        States = @(@{ ShowTitle = $false }); Resources = $null
    }
}
for ($row = 0; $row -lt 2; $row++) {
    for ($column = 0; $column -lt 4; $column++) {
        $keys["$column,$row"] = New-MixerAction 'local.tux.appmixer.app' 'Приложение (слот)' @{ slot = $row * 4 + $column }
    }
}
for ($column = 0; $column -lt 4; $column++) {
    $dials["$column,0"] = New-MixerAction 'local.tux.appmixer.dial' 'Канал микшера' @{}
}
$content = @{ Controllers = @(@{ Type = 'Keypad'; Actions = $keys }, @{ Type = 'Encoder'; Actions = $dials }); Icon = ''; Name = 'Windows Mixer' }
$metadata | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $staging 'manifest.json') -Encoding utf8NoBOM
$content | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $pageDir 'manifest.json') -Encoding utf8NoBOM
@{ Controllers = @(@{ Type = 'Keypad'; Actions = $null }, @{ Type = 'Encoder'; Actions = $null }); Icon = ''; Name = '' } |
    ConvertTo-Json -Depth 10 | Set-Content (Join-Path $commonDir 'manifest.json') -Encoding utf8NoBOM
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Only our new profile goes into this archive, never any existing user profile.
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
try {
    # Include explicit directories as in Stream Deck's exported bundles.
    $zip.CreateEntry("$id.sdProfile/") | Out-Null
    foreach ($directory in (Get-ChildItem $staging -Recurse -Directory)) {
        $entry = [IO.Path]::GetRelativePath((Split-Path $staging -Parent), $directory.FullName).Replace('\', '/') + '/'
        $zip.CreateEntry($entry) | Out-Null
    }
    foreach ($file in (Get-ChildItem $staging -Recurse -File)) {
        $entry = [IO.Path]::GetRelativePath((Split-Path $staging -Parent), $file.FullName).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entry) | Out-Null
    }
} finally { $zip.Dispose() }
Write-Output "Created NEW profile package: $archive (UUID $id)"
