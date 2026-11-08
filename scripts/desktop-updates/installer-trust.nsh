!macro customInstall
  InitPluginsDir
  File /oname=$PLUGINSDIR\MUFC-Release.cer "${PROJECT_DIR}\MUFC-Release.cer"
  File /oname=$PLUGINSDIR\trust-certificate.ps1 "${PROJECT_DIR}\trust-certificate.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\trust-certificate.ps1" -CertificateFile "$PLUGINSDIR\MUFC-Release.cer" -ExpectedThumbprint 877C05BF6EA092C78B8C5A3F081BF25855EFB390 -Machine'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "MUFC certificate verification failed. Installation cannot continue.$\r$\n$1"
    Abort
  ${EndIf}
!macroend
