Add-Type -AssemblyName System.Drawing

$src = "C:\Users\josued.morales\.gemini\antigravity-ide\brain\22929e69-1eba-4b7f-b566-eb18165c7827\.user_uploaded\media_1787631449518.png"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

$minX = $bmp.Width
$minY = $bmp.Height
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $pixel = $bmp.GetPixel($x, $y)
        if ($pixel.A -gt 15 -and -not ($pixel.R -gt 240 -and $pixel.G -gt 240 -and $pixel.B -gt 240)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Original: $($bmp.Width) x $($bmp.Height)"
Write-Host "Crop Box: $minX, $minY to $maxX, $maxY"

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

# Create square cropped bitmap with transparent background
$maxDim = [Math]::Max($cropW, $cropH)
$sqBmp = New-Object System.Drawing.Bitmap($maxDim, $maxDim, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sqBmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$offsetX = [Math]::Floor(($maxDim - $cropW) / 2)
$offsetY = [Math]::Floor(($maxDim - $cropH) / 2)

$srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$destRect = New-Object System.Drawing.Rectangle($offsetX, $offsetY, $cropW, $cropH)

$g.DrawImage($bmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$bmp.Dispose()

# Save cropped high-res logo & favicon
$outDir = "C:\Users\josued.morales\Desktop\CONTROL MEDICA\InventarioMedicamentos\frontend\public"
$sqBmp.Save("$outDir\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sqBmp.Save("$outDir\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sqBmp.Save("$outDir\pwa-192x192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sqBmp.Save("$outDir\pwa-512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)

$sqBmp.Dispose()
Write-Host "Successfully generated tight-cropped logos in $outDir"
