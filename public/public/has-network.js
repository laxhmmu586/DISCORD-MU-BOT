// HAS uses the website's origin so corporate browsers need no separate API connection.
// Explicit overrides remain available for local integration tests.
if (!window.MU_API_BASE && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  window.MU_API_BASE = '/has-network';
}
