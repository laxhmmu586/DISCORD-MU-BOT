# MUFC 2.1.9

After a verified Core download, an unauthenticated native dialog names the new version and offers **立即安装** / **稍后**. Install now requests an explicit renderer handshake without the automatic 30-second idle requirement. It permits the desktop Settings dialog, while unsaved fields, pending business requests, work pages, auth dialogs, frames and operation locks continue to block installation. Later defers the prompt for that release until the next launch; an on-page Install now button can reopen it. Core installation never intercepts a normal window close.

Installation failures appear in native dialogs. The renderer always releases its inert state on completion/failure, with a fallback timer armed before awaiting native IPC. The signed helper requests Windows elevation, records success/failure in `core-install-status.json` and reopens MUFC in a normal visible window. Signature, checksum, pinned certificate and publication checks remain in place. The helper's PowerShell syntax is verified without executing an installer in automated tests.

Maximized windows remove the separate caption row and put the three window buttons at the right edge of the existing navigation. Restore returns the draggable caption strip; F11 hides all caption controls. The dashboard main/hero height now subtracts the caption height, removing the extra document scrollbar without hiding legitimate scrolling on long pages.

Validation: 26 focused tests, covering explicit approval, Later/retry, signed-out Settings, busy/dirty deferral, failure recovery, helper elevation/signature checks and PowerShell parsing; five packaged pages at 1000x700 and 1500x980, including no dashboard height overflow and maximized/fullscreen/restore behavior; actual packaged Electron startup with login/Settings and no persistent employee session; signed installer checked against the pinned certificate.

For clients whose old close/idle installation path is already stuck, run the signed 2.1.9 installer directly once. The new dialog and Install now button are Core code and cannot be added to an older installed Core by a UI hotfix.
