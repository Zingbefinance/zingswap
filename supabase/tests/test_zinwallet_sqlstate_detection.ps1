$ErrorActionPreference = 'Stop'

$runnerPath = Join-Path $PSScriptRoot 'run_zinwallet_refund_concurrency.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $runnerPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  throw "Could not parse runner script: $($parseErrors[0].Message)"
}
$functionAst = $ast.Find({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Get-ExpectedPostgresSqlState'
}, $true)
if (-not $functionAst) { throw 'SQLSTATE detection function was not found.' }
Invoke-Expression $functionAst.Extent.Text

$cases = @(
  @{ Name = 'English serialization'; Error = "ERROR: 40001: could not serialize access due to read/write dependencies`nDETAIL: Reason code"; Expected = '40001' },
  @{ Name = 'French serialization'; Error = "ERREUR: 40001: n'a pas pu sérialiser un accès à cause des dépendances`nDÉTAIL : reason"; Expected = '40001' },
  @{ Name = 'Mojibaked French serialization'; Error = 'ERREUR:  40001: n''a pas pu s├®rialiser un acc├¿s' ; Expected = '40001' },
  @{ Name = 'English check violation'; Error = 'ERROR: 23514: check constraint violated'; Expected = '23514' },
  @{ Name = 'French check violation'; Error = 'ERREUR: 23514: contrainte de vérification violée'; Expected = '23514' },
  @{ Name = 'No SQLSTATE'; Error = 'ERROR: operation failed without a verbose code'; Expected = $null },
  @{ Name = 'Distinct SQLSTATEs'; Error = "ERROR: 40001: serialization failure`nERREUR: 23514: constraint failure"; Expected = $null }
)

foreach ($case in $cases) {
  $actual = Get-ExpectedPostgresSqlState $case.Error
  if ($actual -cne $case.Expected) {
    throw "$($case.Name): expected '$($case.Expected)', got '$actual'."
  }
  Write-Host "PASS: $($case.Name)"
}

Write-Host "Passed $($cases.Count) SQLSTATE detection regression cases."
