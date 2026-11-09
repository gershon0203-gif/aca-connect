; Custom NSIS script for ACA Connect installer
; Kills any running "ACA Connect.exe" process before install/uninstall
; to prevent "Failed to uninstall old application files" errors.

!macro customInit
  ; Kill any running ACA Connect process before install
  nsExec::ExecToLog 'taskkill /F /IM "ACA Connect.exe" /T >NUL 2>&1 || true'
!macroend

!macro customCheckAppRunning
  ; Check if ACA Connect is running before uninstall
  nsExec::ExecToLog 'tasklist /FI "IMAGENAME eq ACA Connect.exe" >NUL 2>&1 | findstr /I "ACA Connect.exe" >NUL 2>&1'
  Pop $0
  ${If} $0 == 0
    ; Process is running, kill it
    nsExec::ExecToLog 'taskkill /F /IM "ACA Connect.exe" /T >NUL 2>&1 || true'
    Pop $1
  ${EndIf}
!macroend
