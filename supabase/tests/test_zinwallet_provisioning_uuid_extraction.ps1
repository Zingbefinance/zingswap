$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $PSScriptRoot 'run_zinwallet_provisioning_concurrency.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $runnerPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  throw "Could not parse concurrency runner: $($parseErrors[0].Message)"
}
$functionAst = $ast.Find({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Get-LastWalletUuidFromOutput'
}, $true)
if (-not $functionAst) { throw 'Wallet UUID extraction function was not found.' }
Invoke-Expression $functionAst.Extent.Text

$userId = '7703bd68-78dc-4b87-985e-9378a878c322'
$walletId = 'ae41b5f2-2f4a-4674-9411-1e25c5f04691'
$workerAOutput = @"
SET ROLE
$userId
{"role":"authenticated","sub":"$userId"}
$walletId
"@
$workerAOutput = $workerAOutput.Replace($walletId, "  <$walletId>  ")
$workerBOutput = "claims: {`"sub`":`"$userId`",`"role`":`"authenticated`"}; RPC returned <$walletId>"

$walletA = Get-LastWalletUuidFromOutput $workerAOutput
$walletB = Get-LastWalletUuidFromOutput $workerBOutput
if ($walletA -cne $walletId) { throw "Worker A extraction expected $walletId, got '$walletA'." }
if ($walletB -cne $walletId) { throw "Worker B extraction expected $walletId, got '$walletB'." }
if ($walletA -cne $walletB) { throw "Workers extracted different wallet IDs: A=$walletA B=$walletB" }
Write-Host 'PASS: UUID extraction skips user and claims UUIDs and selects the wallet result for both workers.'

$noUuid = Get-LastWalletUuidFromOutput 'SET ROLE; no UUID was returned.'
if ($null -ne $noUuid) { throw "Expected no UUID, got '$noUuid'." }
Write-Host 'PASS: output without a UUID remains unrecognized.'
