param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Directory){throw 'Signing directory already exists; inspect instead of replacing keys.'}
New-Item -ItemType Directory -Path $Directory | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $Directory /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Signing-directory ACL failed.'}
$cert=New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=MUFC Internal Release Signing 2026 LAX' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(3)
Export-Certificate -Cert $cert -FilePath (Join-Path $Directory 'MUFC-Release.cer') | Out-Null
@{thumbprint=$cert.Thumbprint;subject=$cert.Subject;expires=$cert.NotAfter.ToUniversalTime().ToString('o');computer=$env:COMPUTERNAME} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Directory 'certificate.json') -Encoding utf8
Write-Output ('Created release certificate: '+$cert.Thumbprint)
