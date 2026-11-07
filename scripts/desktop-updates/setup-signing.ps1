param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $target){throw 'Use a new signing directory outside the repository.'}
New-Item -ItemType Directory -Path $target | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $target /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Cannot protect signing directory.'}
$cert=New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=MUFC Internal Release Signing' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(3)
Export-Certificate -Cert $cert -FilePath (Join-Path $target 'MUFC-Release.cer') | Out-Null
# No automatic trust-store writes. Enroll the public certificate separately on
# each managed computer after verifying the displayed certificate fingerprint.
@{thumbprint=$cert.Thumbprint;subject=$cert.Subject;expires=$cert.NotAfter.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'certificate.json') -Encoding utf8
Write-Output "Created non-exportable signing certificate: $($cert.Thumbprint)"
