# Home Screen notification count

On browsers supporting the Badging API, MUFC sets the installed app's icon count
from the same items as the notification bell: actionable HAS requests, unsigned
documents, Schedule actions/unread results, and unread HR reminders. Opening the
notification panel alone does not complete these items.

The foreground count is updated after a complete inbox load. Failed/partial
loads preserve the previous icon count. Marking a reminder read, signing a
document, or completing an action updates the count through the existing inbox
refresh events. Explicit logout awaits clearing the badge before navigating.

The push worker persists the last count in its own CacheStorage entry and adds
new pushed items while the app is closed. The authenticated outbox supplies
recipient, item, and event identifiers, preventing duplicate increments and
cross-account reuse. Existing workers ignore the additional metadata and still
display the notification normally.

Background counts reflect notifications delivered to that installation; opening
the app's inbox reconciles them with current server state. Changes made on
another device are reconciled on the next inbox refresh, rather than through
silent pushes. Schedule announcement pushes add a background indicator, but are
not durable unread items in the existing bell and disappear from the count on
the next complete inbox refresh.

Deploy both the backend and the frontend (`node has/build.cjs`). Badging is
optional and failures do not block notification delivery or inbox use. iPhone
Home Screen display and permission behavior still require testing on a physical
device with notification/badge permission enabled.

Validation: `node --test test/appBadge.test.js test/pushMessage.test.js test/approvalPush.test.js test/mobilePushClient.test.js test/notificationCenter.test.js test/scheduleAnnouncementPush.test.js`.
The browser fixture `node test/appBadge.browser.cjs` requires Playwright and Edge;
it uses real service-worker messaging and CacheStorage with mocked OS badge calls.
