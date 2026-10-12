$content = Get-Content "c:\Users\josued.morales\Desktop\CONTROL MEDICA\InventarioMedicamentos\frontend\src\pages\Historial.jsx" -Raw
$opens = ([regex]::Matches($content, '<div')).Count
$closes = ([regex]::Matches($content, '</div>')).Count
Write-Host "Opening divs: $opens"
Write-Host "Closing divs: $closes"
Write-Host "Diff (open - close): $($opens - $closes)"
