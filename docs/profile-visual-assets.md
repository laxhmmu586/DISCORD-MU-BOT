# Profile visual assets

The Profile page uses `has/public/assets/profile-ce777-night-v10.webp` as its airport background. It is a generated illustration, not an aircraft identification or engineering reference. On desktop, the image layer keeps the bitmap's native 2060:763 aspect ratio. Its fade is applied to that exact layer, so a wider banner cannot expose an opaque vertical image edge. The bitmap must not be stretched to the full banner's arbitrary dimensions. Mobile uses a covering image with the same aspect-preserving crop behavior.

The page base is `#000A18`, sampled from the supplied reference. Panels use a blue glass gradient, fine blue borders, restrained inset highlights and darker row separators. Profile and Admin share the same versioned stylesheet.

The user supplied the reference mockup. The topbar keeps the text-only MUFC wordmark, following the user's later correction. Existing `profile-tail-night-v1.webp` remains the sidebar artwork. Preview portraits are fixture data only; production continues to load each employee's saved photo.

## Background generation

Mode: built-in image generation, reference-guided reconstruction. Final source: `exec-b7f12208-9188-48ec-8dd3-633016fb400a.png`, converted to WebP at quality 91 without changing dimensions. Input: the airport region of the user-supplied mockup.

Final prompt:

> Create a clean high resolution photographic reconstruction of this exact airport background. Match the aircraft camera angle and overall silhouette extremely closely: rear quarter starboard view of a China Eastern Boeing 777-300ER level parked on a wet airport apron, nose right and slightly away, tail left. Retain airport terminal, control tower, amber lighting and wet reflections, deep blue night. Remove all UI text, icons, buttons and rounded card border in the reference. Do NOT invent a new camera angle or different plane pose. Physically accurate aircraft anatomy is essential. Fix the overlong horizontal stabilizer on left so it is compact and physically proportionate to a real Boeing 777-300ER; both horizontal stabilizers must be approximately equal size in 3D and foreshortened correctly in this view. Main wings root in the middle of fuselage above the GE90 engines, not at tail. Keep real 777 tail proportions. Background only, no labels, no floating UI. Landscape image 2.7:1.

## Functional scope

Only Personal Information is available. Read & Sign is disabled. Authorized administrators have an Admin entry above Profile; employee administration is no longer in the account dropdown. Original Login ID is a separate administrator-controlled sign-in email after Discord ID. An explicitly mapped legacy password identity can link to its employee record without changing the contact email. Google identities still require first-login confirmation, and unmapped `@mu.com` accounts retain their existing external-account flow.

Only `lake@mu.com` and `nextweek1216@gmail.com` may change Original Login ID. Other administrators see a read-only field and cannot clear mappings through save/import or remove an employee with an existing mapping. The database transaction enforces the same rule even for direct API requests. Other employee fields remain editable under the existing administrator permissions.
