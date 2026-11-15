# Opens one PowerShell window per part of The Crew of Ithaca.
# Run from the repo root with:  npm start
# Close the old terminals first, or the ports (4000, 5173, 8081) will already be in use.
$root = $PSScriptRoot

function Open-Window($title, $folder, $command) {
  Start-Process powershell -ArgumentList '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$folder'; $command"
}

Open-Window 'Ithaca - backend'  "$root\backend"  'npm start'
Open-Window 'Ithaca - frontend' "$root\frontend" 'npm run dev'

# Captain Odysseus + Chert, only once captain-agent/.env.local exists
if (Test-Path "$root\captain-agent\.env.local") {
  Open-Window 'Ithaca - Captain agent' "$root\captain-agent" 'npm start'
  Start-Sleep -Seconds 5   # let the agent start before chert dev looks for it
  Open-Window 'Ithaca - Chert dev' "$root\captain-agent" 'npx --yes @trychert/facetime@0.1.0-beta.21 dev'
} else {
  Write-Host 'Skipping Captain Odysseus: no captain-agent\.env.local yet.'
}

Write-Host 'Opened the game windows. Game: https://localhost:5173'
