# Regenerates public/icons/icon{16,48,128}.png from assets/icon-source.jpg
# by center-cropping to a square and downscaling with high-quality
# interpolation. Run from anywhere with: powershell -File scripts/resize-icon.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "assets\icon-source.jpg"
$outDir = Join-Path $root "public\icons"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)
$side = [Math]::Min($src.Width, $src.Height)
$cropX = [int](($src.Width - $side) / 2)
$cropY = [int](($src.Height - $side) / 2)
$cropRect = New-Object System.Drawing.Rectangle(0, 0, $side, $side)
$square = New-Object System.Drawing.Bitmap($side, $side)
$g = [System.Drawing.Graphics]::FromImage($square)
$g.DrawImage($src, $cropRect, $cropX, $cropY, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$src.Dispose()

function Resize-Icon($size, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gfx.DrawImage($square, 0, 0, $size, $size)
    $gfx.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Wrote $outPath ($size x $size)"
}

Resize-Icon 16 (Join-Path $outDir "icon16.png")
Resize-Icon 48 (Join-Path $outDir "icon48.png")
Resize-Icon 128 (Join-Path $outDir "icon128.png")

$square.Dispose()
