# HAS gate entry and Driver readiness

Gate entry uses three independently scrollable digits with keyboard support. Confirm and Clear stay inside the blue gate sign. Existing server-owned two-hour gate locks, reload persistence, manual clearing and checklist resets remain in use. The expanded Current account card includes the saved employee name, EID and PBB credentials.

Questions appear above their reference images, with answer buttons below. Completed question groups no longer show Review answers. A NO answer still blocks readiness and returns the user to an unresolved question. Driver no longer displays the duplicate flight/peer summary.

Answer saves advance the local question cursor even when a newer SSE revision arrives before the POST response. A revision conflict receives one retry only when the same checklist generation and phase remain active and the original answer has not changed. Other failures remain visible beside the answer buttons.

After Driver checks, Waiting for spotter displays a red hand with expanding, fading rings. Spotter readiness and a saved Spotter signature enable Ready to Go, with a gently rocking green check. Start Jet Bridge Movement saves Driver readiness before requesting movement; a failed readiness save prevents the movement request. Reduced-motion preferences disable both status animations.

Validation: the local Edge verifier passes at 320, 390 and 1440 pixels, including stale POST/SSE ordering, revision conflict retry, NO recovery, gate controls and expiry, animation changes, reduced motion, readiness withdrawal, independent signing, movement, docking and automatic submission with simulated Drive. The 64 focused HAS, employee and existing PBB tests pass. These checks use fictional accounts and do not verify production deployment or live Drive delivery.
