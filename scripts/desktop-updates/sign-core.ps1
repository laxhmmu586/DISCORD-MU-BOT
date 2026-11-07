param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$Thumbprint)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$cert=Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
if(-not $cert.HasPrivateKey){throw 'Release private key unavailable.'}
$result=Set-AuthenticodeSignature -LiteralPath ([IO.Path]::GetFullPath($File)) -Certificate $cert -HashAlgorithm SHA256
if($result.Status -ne 'Valid'){throw "Signing verification failed: $($result.Status)"}
Write-Output "$File signed and verified: $($cert.Thumbprint)"
