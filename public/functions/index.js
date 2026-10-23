const { onRequest } = require('firebase-functions/v2/https');
const { proxy } = require('./proxy');

exports.hasNetwork = onRequest({ region: 'us-central1', timeoutSeconds: 60, maxInstances: 10, invoker: 'public' }, proxy);
