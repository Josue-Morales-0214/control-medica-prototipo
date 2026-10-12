$ErrorActionPreference = "Stop"

$source = "c:\Users\josued.morales\Desktop\CONTROL MEDICA\InventarioMedicamentos"
$tempDir = Join-Path $env:TEMP "control_medica_export"
$zipPath = "c:\Users\josued.morales\Desktop\CONTROL_MEDICA_limpio.zip"

Write-Host "Preparando carpeta temporal..."
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$excludeDirs = @("node_modules", "venv", ".git", ".firebase", "__pycache__", "dist", "dev-dist", "scratch", "artifacts")
$excludeFiles = @(".env", ".env.staging", ".env.production", ".env.local", "leaks.txt", "*.log", "firebase_cache.json", "*ersUSUARIO*", "*.xlsx", "*.xls")

Write-Host "Copiando archivos excluyendo datos sensibles y dependencias..."
# Robocopy returns exit codes 0-7 for successful copy operations
robocopy $source $tempDir /E /XD $excludeDirs /XF $excludeFiles
$roboExit = $LASTEXITCODE
if ($roboExit -ge 8) {
    throw "Error en robocopy con codigo $roboExit"
}

# Crear plantilla .env.example en frontend
$envExample = @"
VITE_FIREBASE_API_KEY=tu_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
"@
Set-Content -Path (Join-Path $tempDir "frontend\.env.example") -Value $envExample

Write-Host "Comprimiendo archivo ZIP..."
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

Write-Host "Limpiando directorio temporal..."
Remove-Item -Recurse -Force $tempDir

$zipInfo = Get-Item $zipPath
Write-Host "=========================================="
Write-Host "ZIP generado con exito:"
Write-Host "Ubicacion: $($zipInfo.FullName)"
Write-Host "Tamano: $([math]::Round($zipInfo.Length / 1MB, 2)) MB"
Write-Host "=========================================="
