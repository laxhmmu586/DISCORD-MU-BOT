# Search failed quick fix

If the page shows `Search failed`, your frontend is likely calling the wrong API host.

## Set API host in browser (no code deploy needed)
Open browser DevTools console on your Firebase page and run:

```js
localStorage.setItem('mu_api_base', 'https://api.mufcapp.net');
location.reload();
```

To clear it:

```js
localStorage.removeItem('mu_api_base');
location.reload();
```

## Permanent config (recommended)
Before loading `index.html`, define:

```html
<script>
  window.MU_API_BASE = 'https://api.mufcapp.net';
</script>
```

The app now resolves API base in this order:
1. `window.MU_API_BASE`
2. `https://api.mufcapp.net`

Old `localStorage.mu_api_base` values are ignored so stale browser settings cannot break production SY search.
