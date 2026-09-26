# Builds the frontend and publishes it to the S3 bucket behind CloudFront.
param([string]$Profile = "euphatics", [string]$Region = "ap-south-1", [string]$Stack = "euphatics-web")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$found = Get-Command "aws" -ErrorAction SilentlyContinue
$aws = if ($found) { $found.Source } else { "C:\Program Files\Amazon\AWSCLIV2\aws.exe" }
if (-not (Test-Path $aws)) { Write-Output "The AWS CLI was not found. Install it or add it to PATH (see docs/DEPLOYMENT.md)."; exit 1 }
# Stop early with a clear message if the `aws login` session has expired (it lasts several hours)
$ErrorActionPreference = "Continue"  # PowerShell 5.1 would turn the CLI's stderr into a terminating error
& $aws sts get-caller-identity --profile $Profile --query Account --output text 2>$null | Out-Null
$sessionOk = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"
if (-not $sessionOk) { Write-Output "AWS session expired or missing. Run:  aws login --profile $Profile  then deploy again."; exit 1 }
$out = & $aws cloudformation describe-stacks --stack-name $Stack --region $Region --profile $Profile --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
$bucket = ($out | Where-Object OutputKey -eq "WebBucketName").OutputValue
$dist = ($out | Where-Object OutputKey -eq "DistributionId").OutputValue
if (-not $bucket -or -not $dist) { Write-Output "Couldn't read the $Stack stack outputs; nothing was published."; exit 1 }
Push-Location "$root\frontend"
try { npm run build; if ($LASTEXITCODE -ne 0) { throw "build failed" } } finally { Pop-Location }
& $aws s3 sync "$root\frontend\dist" "s3://$bucket" --delete --profile $Profile --region $Region --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
& $aws s3 cp "$root\frontend\dist\index.html" "s3://$bucket/index.html" --profile $Profile --region $Region --cache-control "no-cache" --content-type "text/html"
& $aws cloudfront create-invalidation --distribution-id $dist --paths "/index.html" "/manifest.webmanifest" --profile $Profile --query "Invalidation.Id" --output text
Write-Host "Published to $(($out | Where-Object OutputKey -eq 'WebUrl').OutputValue)"
