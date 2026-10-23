# HAS access on corporate networks

The screenshots show the static page loading but its API request failing. This is consistent with a blocked API hostname, DNS/TLS filtering or CORS failure; it does not establish the exact corporate policy. Both HAS pages now use `/has-network` on their own website origin, including the account header, configuration, writes and PDF downloads. A fixed-upstream Firebase function forwards authenticated requests to `api.mufcapp.net`; the existing API still validates tokens and permissions.

HAS uses sequential three-second polling on this transport instead of a long-lived stream, because corporate proxies can buffer streams and Firebase Hosting has a 60-second request limit. Normal direct/local API overrides retain streaming. Failed refreshes preserve the current form; server validation is still required for every action. Dashboard retries initial loading every 30 seconds; the checklist provides a retry button.

## Deployment required

Deploy the function and Hosting together. A Hosting-only deploy is insufficient.

From `public/functions`, run `npm ci`. From `public`, run:

```
firebase deploy --only functions:has-network,hosting --project china-eastern
```

The Firebase project must have billing enabled (Blaze), permission to deploy second-generation functions and permission for public invocation. No backend secrets are copied into the proxy. The deployment operator must confirm these prerequisites before rollout. The PR does not deploy production.

After deployment, verify signed-in context, both account roles, dashboard filters, schedule saving, checklist actions and PDF download. Block browser requests to `https://api.mufcapp.net/**` and confirm these continue through `https://www.mufcapp.net/has-network/**`. Verify two clients see gate/checklist updates within a polling cycle. Test the company computer as well: this change cannot fix a policy that also blocks the main website, Firebase authentication or Google sign-in infrastructure.

Firebase reference: https://firebase.google.com/docs/hosting/functions
