'use strict';

// Hosted employee pages must use the same local SDK and session as bundled pages.
// Remote script execution remains blocked by the desktop security policy.
function desktopHtml(html, version = 'bundled', initialHash = '') {
  html = String(html).replace(/(<script\b[^>]*\bsrc\s*=\s*["'])https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth)-compat\.js(["'][^>]*>)/gi,
    '$1/assets/firebase/firebase-$2-compat.js$3');
  html = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])https:\/\/(?:china-eastern\.web\.app|www\.mufcapp\.net)\/__\/firebase\/init\.js(["'][^>]*>)/gi,
    '$1/__/firebase/init.js$2');
  if (html.includes('data-mufc-desktop-bootstrap')) return html;
  const safe = value => JSON.stringify(value).replaceAll('<', '\\u003c');
  const bootstrap = '<style data-mufc-desktop-bootstrap>#irr-button,#test-nav-link,#mobile-test-nav-link,#report-baggage-mode,#bag-report-button{display:none!important}</style>'
    + '<script>window.MU_API_BASE=location.origin;window.mufcUIVersion=' + safe(version) + ';window.mufcDesktopInitialHash=' + safe(initialHash) + '||location.hash;</script>'
    + '<script src="/flight-session.js"></script>'
    + ['desktop-session','desktop-update','desktop-window','desktop-ui','desktop-navigation','desktop-recovery'].map(name => '<script defer src="/' + name + '.js"></script>').join('')
    + '<link rel="stylesheet" href="/desktop-navigation.css"><link rel="stylesheet" href="/desktop-background.css">';
  return html.replace(/<head\b[^>]*>/i, head => head + bootstrap);
}
module.exports = { desktopHtml };
