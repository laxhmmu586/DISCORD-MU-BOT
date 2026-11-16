# MUFC 2.1.8

Closing a window no longer intercepts Electron's close event or waits for a renderer update handshake. The former close-to-install path could hold the window open for 11 seconds, then exit without installing when Settings was open or the user had just interacted. Core installation now runs only through the existing idle-login handshake; closing always exits normally, and a staged update retries at the next idle login. The verified download is preserved.

The 2.1.7 window layout and signed updater are retained. Manifest signatures, hash checks, Authenticode pins and busy-work deferral are unchanged.

Validation: 19 targeted tests passed. Isolated native Electron acceptance staged a Core while a Settings dialog was open, with no employee session or installer execution: close was not prevented and completed in 3ms. The local installed 2.1.6 client was recovered with its already-downloaded, signature/hash-verified 2.1.7 installer (exit code 0).
