$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $root 'dist\AppMixer.streamDeckProfile'))
function Read-JsonEntry($entry) {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
}
try {
    $rootEntry = @($zip.Entries | Where-Object { $_.FullName -match '^[^/]+/manifest.json$' })
    if ($rootEntry.Count -ne 1) { throw 'Expected exactly one new profile' }
    $manifest = Read-JsonEntry $rootEntry[0]
    if ($manifest.Name -ne 'App Mixer - Windows') { throw 'Unexpected profile name' }
    if ($manifest.Version -ne '3.0') { throw 'Controller-based profiles require storage version 3.0, not legacy 2.0' }
    if ($manifest.Pages.Default -eq $manifest.Pages.Current) { throw 'Common/default controller page must be separate from app page' }
    if (@($manifest.Pages.Pages).Count -ne 1) { throw 'One explicit page is required by Stream Deck importer' }
    if ($manifest.Pages.Current -ne $manifest.Pages.Pages[0]) { throw 'Current page must exist' }
    $pageId = $manifest.Pages.Current.ToUpperInvariant()
    $pageEntry = @($zip.Entries | Where-Object { $_.FullName -like "*/Profiles/$pageId/manifest.json" })
    if ($pageEntry.Count -ne 1) { throw 'Page contents missing' }
    $page = Read-JsonEntry $pageEntry[0]
    $keys = ($page.Controllers | Where-Object Type -eq 'Keypad').Actions.PSObject.Properties
    $dials = ($page.Controllers | Where-Object Type -eq 'Encoder').Actions.PSObject.Properties
    if (@($keys).Count -ne 8 -or @($dials).Count -ne 4) { throw 'Expected 8 keys and 4 encoders' }
    $actions = @($keys.Value) + @($dials.Value)
    if (@($actions.ActionID | Select-Object -Unique).Count -ne 12) { throw 'Action IDs must be unique' }
    if (@($actions | Where-Object { $_.UUID -notlike 'local.tux.appmixer.*' }).Count) { throw 'Unexpected third-party actions' }
    Write-Output 'PASS: new standalone profile, explicit page, 8 app keys, 4 dials, 12 unique actions.'
} finally { $zip.Dispose() }
