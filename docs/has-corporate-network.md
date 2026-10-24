# HAS API connection

HAS pages connect directly to https://api.mufcapp.net on all hosting domains, including china-eastern.web.app and www.mufcapp.net. The Cloudflare Worker and its route deployment configuration have been removed. Firebase remains static Hosting; no proxy or paid function is required. Explicit MU_API_BASE overrides remain available for local integration tests.

SSE keeps shared state current; interrupted or stalled streams fall back to polling. Dashboard refreshes every 30 seconds. The existing backend continues to authenticate Firebase tokens and enforce account permissions.

Business Managers (including legacy Manager titles) can view Dashboard for their linked Main Account only. Additional accounts and OPS operational access do not expand Dashboard access. Foreign filters return 403; existing global viewers retain their permissions.

Deploy the updated backend and Firebase Hosting assets together. If the old mufc-has-network Worker route was previously installed in Cloudflare, remove that route and Worker from the Cloudflare dashboard; deleting repository configuration does not change already deployed Cloudflare resources.

Completed HAS checklists no longer upload to Google Drive for any account. Signed PDFs are kept in the existing local database and downloaded from the completion screen or Dashboard. Dashboard PDF access follows the same Main Account restriction; demo@hm.com retains all-account statistics and downloads. Existing LAX/MU Discord PDF notifications are preserved.
