Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$entrypoint = Join-Path $PSScriptRoot 'dist\index.js'

& $nodePath $entrypoint
exit $LASTEXITCODE
