param([Parameter(Mandatory=$true)][string]$CertificateFile,[Parameter(Mandatory=$true)][string]$ExpectedThumbprint,[switch]$Machine)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2 ([IO.Path]::GetFullPath($CertificateFile))
if($cert.Thumbprint -cne $ExpectedThumbprint -or $cert.Subject -ne 'CN=MUFC Internal Release Signing' -or $cert.HasPrivateKey){throw 'Certificate does not match the reviewed MUFC public certificate.'}
if($cert.NotAfter -lt (Get-Date)){throw 'Expired certificate.'}
if(-not ($cert.EnhancedKeyUsageList | Where-Object ObjectId -EQ '1.3.6.1.5.5.7.3.3')){throw 'Code-signing certificate required.'}
$scope=if($Machine){@()}else{@('-user')}
& certutil.exe @scope -f -addstore Root ([IO.Path]::GetFullPath($CertificateFile)) | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to enroll MUFC current-user root trust.'}
& certutil.exe @scope -f -addstore TrustedPublisher ([IO.Path]::GetFullPath($CertificateFile)) | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to enroll MUFC current-user publisher trust.'}
Write-Output ('Trusted the reviewed MUFC certificate for '+$(if($Machine){'this computer.'}else{'the current Windows user.'}))
