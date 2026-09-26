# Deploys the backend stack with SAM using the `aws login` session of the "euphatics" profile.
param([string]$Profile = "euphatics", [string]$Region = "ap-south-1", [string]$Stack = "euphatics", [string]$AlertEmail = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Find-Tool([string]$Name, [string]$Fallback) {
  $found = Get-Command $Name -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  if ($Fallback -and (Test-Path $Fallback)) { return $Fallback }
  throw "$Name was not found. Install it or add it to PATH (see docs/DEPLOYMENT.md)."
}

$aws = Find-Tool "aws" "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$sam = Find-Tool "sam" "C:\Program Files\Amazon\AWSSAMCLI\bin\sam.cmd"
# Stop early with a clear message if the `aws login` session has expired (it lasts several hours)
$ErrorActionPreference = "Continue"  # PowerShell 5.1 would turn the CLI's stderr into a terminating error
& $aws sts get-caller-identity --profile $Profile --query Account --output text 2>$null | Out-Null
$sessionOk = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"
if (-not $sessionOk) { Write-Output "AWS session expired or missing. Run:  aws login --profile $Profile  then deploy again."; exit 1 }
# SAM reads plain env credentials; export short-lived ones from the aws login session
& $aws configure export-credentials --profile $Profile --format powershell | ForEach-Object { Invoke-Expression $_ }
$env:AWS_REGION = $Region; $env:AWS_DEFAULT_REGION = $Region; $env:SAM_CLI_TELEMETRY = "0"
Copy-Item "$root\config\brand.json" "$root\backend\src\euphatics\brand.json" -Force
if (-not (Test-Path "$root\backend\layer\python\reportlab")) {
  # Set EUPHATICS_PYTHON to use a specific interpreter (for example a virtual environment)
  $python = if ($env:EUPHATICS_PYTHON) { $env:EUPHATICS_PYTHON } else { Find-Tool "python" "$env:USERPROFILE\.euphatics\venv\Scripts\python.exe" }
  & $python "$root\backend\scripts\build_layer.py"
  if ($LASTEXITCODE -ne 0) { throw "building the Lambda layer failed ($LASTEXITCODE)" }
}
Push-Location "$root\backend"
try {
  $samArgs = @("deploy", "--template-file", "template.yaml", "--stack-name", $Stack, "--region", $Region,
    "--capabilities", "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND", "--resolve-s3",
    "--no-confirm-changeset", "--no-fail-on-empty-changeset")
  # SAM keeps each parameter's previous value unless it is passed, so a new default in template.yaml would never
  # reach the running stack. Pass the model defaults explicitly (AlertEmail only when given, so it isn't cleared).
  $overrides = @()
  if ($AlertEmail) { $overrides += "AlertEmail=$AlertEmail" }
  $tpl = Get-Content "$root\backend\template.yaml" -Raw
  foreach ($name in "ModelIdWeb", "ModelRegionWeb", "ModelIdExplain", "ModelRegionExplain") {
    if ($tpl -match "(?m)^  ${name}:\s*\r?\n\s+Type:[^\r\n]*\r?\n\s+Default:\s*([^\s#]+)") { $overrides += "$name=$($Matches[1])" }
    else { throw "No default for $name in template.yaml" }
  }
  $samArgs += @("--parameter-overrides") + $overrides
  & $sam @samArgs
  if ($LASTEXITCODE -ne 0) { throw "sam deploy failed ($LASTEXITCODE)" }
  & $aws cloudformation describe-stacks --stack-name $Stack --region $Region --profile $Profile `
    --query "Stacks[0].Outputs" --output json | Set-Content -Encoding utf8 "$root\backend\stack-outputs.json"
} finally { Pop-Location }
