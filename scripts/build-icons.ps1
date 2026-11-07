$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$folder = Join-Path $root 'dist\local.tux.appmixer.sdPlugin\images'
foreach ($size in @(144, 288)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#101723'))
    $scale = $size / 144.0
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#4cc9f0'), [single](7 * $scale))
    $brush = [Drawing.SolidBrush]::new([Drawing.Color]::White)
    try {
        for ($i = 0; $i -lt 3; $i++) {
            $x = (36 + 36 * $i) * $scale
            $graphics.DrawLine($pen, [single]$x, [single](30 * $scale), [single]$x, [single](114 * $scale))
            $y = @(48,83,39)[$i] * $scale
            $graphics.FillRectangle($brush, [single]($x - 11 * $scale), [single]$y, [single](22 * $scale), [single](14 * $scale))
        }
        $name = if ($size -eq 144) { 'mixer.png' } else { 'mixer@2x.png' }
        $bitmap.Save((Join-Path $folder $name), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $brush.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
