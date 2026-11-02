'use strict';
// iPad Home Screen apps may identify as desktop Safari. Their registration
// carries ios-pwa; legacy phone registrations retain a mobile user agent.
function isMobileDevice(device) {
  return ['ios-pwa','android-web'].includes(device.platform) || /Android|iPhone|iPad|iPod|Windows Phone/i.test(device.user_agent || device.userAgent || '');
}
module.exports={isMobileDevice};
