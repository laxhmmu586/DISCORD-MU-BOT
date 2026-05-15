const {

  parseIncrementalLog,

  passengers

} = require('./flightParser');

const {

  parsePDLog,

  pdData

} = require('./pdParser');

const {

  getCombinedLogs

} = require('./googleDrive');

// ===============================
// Cache State
// ===============================
let lastUpdated = null;

let refreshRunning = false;

// ===============================
// Refresh Cache
// ===============================
async function refreshCache() {

  // Prevent overlap
  if (refreshRunning) {

    console.log(
      'Cache refresh skipped (already running)'
    );

    return;
  }

  refreshRunning = true;

  try {

    console.log(
      'Refreshing cache...'
    );

    // ===========================
    // Download Combined Logs
    // ===========================
    const log =
      await getCombinedLogs();

    if (!log) {

      console.log(
        'No logs loaded'
      );

      refreshRunning = false;

      return;
    }

    // ===========================
    // Parse FB Logs
    // ===========================
    parseIncrementalLog(log);

    // ===========================
    // Parse PD Logs
    // ===========================
    parsePDLog(log);

    // ===========================
    // Update Timestamp
    // ===========================
    lastUpdated =
      new Date();

    console.log(
      'Cache refreshed'
    );

    console.log(
      'Passengers:',
      Object.keys(passengers).length
    );

    console.log(
      'PD Counts:',
      {

        first:
          pdData.first.length,

        business:
          pdData.business.length,

        platinum:
          pdData.platinum.length,

        gold:
          pdData.gold.length,

        silver:
          pdData.silver.length
      }
    );

  } catch (err) {

    console.error(
      'Cache Refresh Error:',
      err
    );

  } finally {

    refreshRunning = false;
  }
}

// ===============================
// Start Auto Refresh
// ===============================
function startCache() {

  console.log(
    'Starting cache system...'
  );

  // First load immediately
  refreshCache();

  // Refresh every 30 seconds
  setInterval(

    refreshCache,

    30 * 1000
  );
}

// ===============================
// Get Status
// ===============================
function getCacheStatus() {

  return {

    lastUpdated,

    passengers:
      Object.keys(passengers).length,

    pd: {

      first:
        pdData.first.length,

      business:
        pdData.business.length,

      platinum:
        pdData.platinum.length,

      gold:
        pdData.gold.length,

      silver:
        pdData.silver.length
    }
  };
}

// ===============================
// Exports
// ===============================
module.exports = {

  startCache,

  refreshCache,

  getCacheStatus
};