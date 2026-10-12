Add-Type -AssemblyName System.Drawing

$src = "C:\Users\josued.morales\.gemini\antigravity-ide\brain\22929e69-1eba-4b7f-b566-eb18165c7827\.user_uploaded\media_1787631449518.png"
$rawBmp = [System.Drawing.Bitmap]::FromFile($src)

# 1. Bounding box of the shield
$minX = $rawBmp.Width; $minY = $rawBmp.Height; $maxX = 0; $maxY = 0

for ($y = 0; $y -lt $rawBmp.Height; $y++) {
    for ($x = 0; $x -lt $rawBmp.Width; $x++) {
        $p = $rawBmp.GetPixel($x, $y)
        if ($p.A -gt 20 -and -not ($p.R -gt 240 -and $p.G -gt 240 -and $p.B -gt 240)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$cropW = [int]($maxX - $minX + 1)
$cropH = [int]($maxY - $minY + 1)

# 2. Function to create a rounded squircle badge (app icon style)
function CreateAppIcon([int]$sz) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Draw rounded rectangle (Squircle)
    $radius = [int][Math]::Floor($sz * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [int]($radius * 2)
    $w = [int]($sz - 2)
    $h = [int]($sz - 2)
    
    $path.AddArc(1, 1, $d, $d, 180, 90)
    $path.AddArc($w - $d + 1, 1, $d, $d, 270, 90)
    $path.AddArc($w - $d + 1, $h - $d + 1, $d, $d, 0, 90)
    $path.AddArc(1, $h - $d + 1, $d, $d, 90, 90)
    $path.CloseFigure()

    # Fill white background
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillPath($brush, $path)

    # Subtle modern border
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 2, 132, 199), [float]([Math]::Max(1.0, $sz * 0.015)))
    $g.DrawPath($pen, $path)

    # Draw the shield centered inside the squircle
    $pad = [int][Math]::Floor($sz * 0.08)
    $availW = [double]($sz - ($pad * 2))
    $availH = [double]($sz - ($pad * 2))

    $scale = [Math]::Min($availW / $cropW, $availH / $cropH)
    $drawW = [int][Math]::Floor($cropW * $scale)
    $drawH = [int][Math]::Floor($cropH * $scale)
    $drawX = [int][Math]::Floor(($sz - $drawW) / 2)
    $drawY = [int][Math]::Floor(($sz - $drawH) / 2)

    $srcR = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
    $dstR = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawW, $drawH)

    $g.DrawImage($rawBmp, $dstR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)

    $g.Dispose()
    $path.Dispose()
    $brush.Dispose()
    $pen.Dispose()
    return $bmp
}

$outDir = "C:\Users\josued.morales\Desktop\CONTROL MEDICA\InventarioMedicamentos\frontend\public"

$icon512 = CreateAppIcon 512
$icon512.Save("$outDir\pwa-512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon512.Save("$outDir\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)

$icon192 = CreateAppIcon 192
$icon192.Save("$outDir\pwa-192x192.png", [System.Drawing.Imaging.ImageFormat]::Png)

$icon64 = CreateAppIcon 64
$icon64.Save("$outDir\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$rawBmp.Dispose()
Write-Host "ALL ICONS GENERATED CLEANLY!"
