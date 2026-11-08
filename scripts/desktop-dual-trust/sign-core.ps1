param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$Thumbprint)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force
$cert=Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
if(-not $cert.HasPrivateKey){throw 'Release private key unavailable.'}
$result=Set-AuthenticodeSignature -LiteralPath ([IO.Path]::GetFullPath($File)) -Certificate $cert -HashAlgorithm SHA256
if($result.SignerCertificate.Thumbprint -cne $Thumbprint -or $result.SignatureType -ne 'Authenticode' -or $result.Status -in @('HashMismatch','NotSigned','NotSupportedFileFormat','Incompatible')){throw "Signing failed: $($result.Status) $($result.StatusMessage)"}
if($result.Status -ne 'Valid'){
 $chain=New-Object Security.Cryptography.X509Certificates.X509Chain
 $chain.ChainPolicy.RevocationMode='NoCheck'
 $null=$chain.Build($result.SignerCertificate)
 $other=@($chain.ChainStatus|Where-Object {$_.Status -ne [Security.Cryptography.X509Certificates.X509ChainStatusFlags]::UntrustedRoot})
 if($result.Status -ne 'UnknownError' -or $other.Count -ne 0 -or $chain.ChainStatus.Count -eq 0){throw "Unexpected signing validation: $($result.Status) $($result.StatusMessage)"}
}
Write-Output "Signed with pinned MUFC certificate: $Thumbprint; status $($result.Status). Trust is enrolled with user consent during installation."
