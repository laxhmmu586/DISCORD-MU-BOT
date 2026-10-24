// MU583 / MU586 BRIEFING SHEET — 完整 Google Apps Script
// 先更新配套的服务器 /send 接口，然后用此文件替换原脚本。
// 保留原来的触发器函数名、频道、Drive 备份和 PDF 版式。

const SPREADSHEET_ID = "1-BnQrtRj6-uTgoC89uj8zQ1dZTcSh96QFRH-_Tf4JEQ";
const API_URL = "https://api.mufcapp.net/send";
const PDF_FOLDER_ID = "1NX1WCsYZqNvdz57J8oGb7h1yQWyt_O1S";

const ARRIVAL_SHEET_NAME = "ARRIVAL";
const ARRIVAL_FLIGHT_NUMBER = "MU583";
const ARRIVAL_CHANNEL_ID = "1252032351131799654";
const DEPARTURE_SHEET_NAME = "DEPARTURE";
const DEPARTURE_FLIGHT_NUMBER = "MU586";
const DEPARTURE_CHANNEL_ID = "1252032370920656907";
const ARRIVAL_PDF_RANGE = "A1:R67";
const DEPARTURE_PDF_RANGE = "A1:R67";
// 本方案自己的大小上限，与配套服务器一致。
const MAX_PDF_BYTES = 8 * 1024 * 1024;

// 洛杉矶夏令时 08:49 / 冬令时 07:49 = 全年 UTC 15:49。
// 安装后每分钟检查；15 分钟补偿窗口应对 Google 调度延迟。
// 每个航班每天只自动尝试一次，避免网络超时造成重复发送。
function installBriefingPDFTrigger() {
  const handler = "scheduledBriefingPDFs";
  // 先创建成功，再删除同名旧触发器；重复安装不会保留多个检查器。
  const oldTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
  oldTriggers.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  Logger.log("Installed: daily UTC 15:49; Los Angeles PDT 08:49 / PST 07:49.");
}

function scheduledBriefingPDFs() {
  const now = new Date();
  const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMinute = 15 * 60 + 49;
  if (utcMinute < targetMinute || utcMinute >= targetMinute + 15) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const date = Utilities.formatDate(now, "UTC", "yyyy-MM-dd");
    const properties = PropertiesService.getScriptProperties();
    const jobs = [
      { key: "BRIEFING_PDF_MU583", send: sendArrivalPDFtoDiscord },
      { key: "BRIEFING_PDF_MU586", send: sendDeparturePDFtoDiscord }
    ];
    const failures = [];
    jobs.forEach(function (job) {
      // 发送前记录尝试日期；失败后请查频道并手动重发，不自动重试。
      if (properties.getProperty(job.key + "_ATTEMPT_DATE") === date) return;
      properties.setProperty(job.key + "_ATTEMPT_DATE", date);
      properties.setProperty(job.key + "_STATUS", "sending");
      try {
        job.send();
        properties.setProperty(job.key + "_STATUS", "sent");
      } catch (error) {
        properties.setProperty(job.key + "_STATUS", "failed: " + String(error).slice(0, 300));
        failures.push(job.key + ": " + String(error));
      }
    });
    if (failures.length) throw new Error(failures.join("\n"));
  } finally {
    lock.releaseLock();
  }
}

function removeBriefingPDFTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "scheduledBriefingPDFs") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  Logger.log("Briefing PDF schedule removed.");
}

function sendArrivalPDFtoDiscord() {
  return sendBriefingPDF(ARRIVAL_SHEET_NAME, ARRIVAL_FLIGHT_NUMBER,
    ARRIVAL_CHANNEL_ID, "ARRIVAL", ARRIVAL_PDF_RANGE);
}

function sendDeparturePDFtoDiscord() {
  Utilities.sleep(3000);
  return sendBriefingPDF(DEPARTURE_SHEET_NAME, DEPARTURE_FLIGHT_NUMBER,
    DEPARTURE_CHANNEL_ID, "DEPARTURE", DEPARTURE_PDF_RANGE);
}

function sendBriefingPDF(sheetName, flightNumber, channelId, type, pdfRange) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);
    const pdfName = getBriefingPDFName(ss, flightNumber, type);
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    const pdfFile = createBriefingPDF(ss, sheet, pdfName, pdfRange);

    // 发送实际 PDF 字节；消息正文不再附加 Drive 链接。
    sendToDiscordAPI(channelId, "📄 " + pdfName, pdfFile.getBlob());
    Logger.log("Successfully sent PDF attachment: " + pdfFile.getName());
    return pdfFile;
  } catch (error) {
    Logger.log("sendBriefingPDF ERROR: " + (error.stack || error));
    throw error;
  }
}

function getBriefingPDFName(ss, flightNumber, type) {
  const timezone = ss.getSpreadsheetTimeZone() || "America/Los_Angeles";
  const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  return today + " " + flightNumber + " " + type + " BRIEFING SHEET";
}

function createBriefingPDF(ss, sheet, pdfName, pdfRange) {
  if (!ss || !sheet || !pdfName || !pdfRange) {
    throw new Error("Missing PDF parameters. Run sendArrivalPDFtoDiscord() " +
      "or sendDeparturePDFtoDiscord(), not createBriefingPDF() directly.");
  }
  // Letter，横向，整张缩放到一页，保留原来的范围和页边距。
  const query = {
    format: "pdf", gid: sheet.getSheetId(), range: pdfRange,
    size: "letter", portrait: false, scale: 4,
    sheetnames: false, printtitle: false, pagenum: "UNDEFINED",
    gridlines: false, fzr: false,
    horizontal_alignment: "CENTER", vertical_alignment: "TOP",
    top_margin: "0.10", bottom_margin: "0.10",
    left_margin: "0.10", right_margin: "0.10"
  };
  const exportUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() +
    "/export?" + Object.keys(query).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
    }).join("&");
  const response = UrlFetchApp.fetch(exportUrl, {
    method: "get",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error("PDF export failed. HTTP " + response.getResponseCode() +
      ": " + response.getContentText().slice(0, 500));
  }
  const blob = response.getBlob().setName(pdfName + ".pdf");
  validatePDFBytes(blob.getBytes());
  blob.setContentType("application/pdf");
  const folder = DriveApp.getFolderById(PDF_FOLDER_ID);
  // 先成功保存新文件，再清理同名旧文件，避免保存失败时丢失旧备份。
  const pdfFile = folder.createFile(blob);
  deleteExistingPDF(folder, pdfName + ".pdf", pdfFile.getId());
  // 附件发送不依赖公开链接，因此不再设置 Anyone with Link。
  Logger.log("PDF saved: " + pdfFile.getName());
  return pdfFile;
}

function validatePDFBytes(bytes) {
  if (!bytes || bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 ||
      bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
    throw new Error("Export result is not a PDF (%PDF- header missing).");
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("PDF exceeds this integration's 8 MiB limit.");
  }
}

function deleteExistingPDF(folder, fileName, keepFileId) {
  try {
    const files = folder.getFilesByName(fileName);
    while (files.hasNext()) {
      const file = files.next();
      if (file.getId() !== keepFileId) file.setTrashed(true);
    }
  } catch (error) {
    Logger.log("Old PDF cleanup warning: " + error);
  }
}

function sendToDiscordAPI(channelId, message, pdfBlob) {
  if (!channelId) throw new Error("Discord Channel ID is missing.");
  if (!message) throw new Error("Message is missing.");
  const payload = { channelId: String(channelId), message: String(message) };
  if (pdfBlob) {
    const bytes = pdfBlob.getBytes();
    validatePDFBytes(bytes);
    payload.file = {
      name: pdfBlob.getName(),
      contentType: "application/pdf",
      base64: Utilities.base64Encode(bytes)
    };
  }
  // 不自动重试发送：网络超时后服务器可能已发送，重试可能重复发帖。
  const response = UrlFetchApp.fetch(API_URL, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const responseText = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("API send failed. HTTP " + status + ": " + responseText.slice(0, 500));
  }
  let result;
  try { result = JSON.parse(responseText); }
  catch (error) { throw new Error("API returned invalid JSON."); }
  // 旧接口即使失败也可能返回 HTTP 200，因此还要检查 JSON。
  if (!result || result.success !== true || result.error || result.skipped) {
    throw new Error("API did not confirm delivery: " + responseText.slice(0, 500));
  }
  if (pdfBlob && result.attachmentCount !== 1) {
    throw new Error("Server did not confirm a PDF attachment. " +
      "Update the /send route first. Do not resend until you check the channel.");
  }
  Logger.log("Discord message sent: " + (result.messageId || "OK"));
  return result;
}

// 仅在需要实际发送测试消息时手动运行。
function testDiscordAPI() {
  return sendToDiscordAPI(ARRIVAL_CHANNEL_ID, "✅ MU Briefing Sheet API Test");
}
function testArrivalPDF() { return sendArrivalPDFtoDiscord(); }
function testDeparturePDF() { return sendDeparturePDFtoDiscord(); }

// 以下两个测试仅生成 Drive 文件，不发送 Discord。
function testArrivalPDFOnly() {
  return testBriefingPDFOnly(ARRIVAL_SHEET_NAME, ARRIVAL_FLIGHT_NUMBER,
    "ARRIVAL", ARRIVAL_PDF_RANGE);
}
function testDeparturePDFOnly() {
  return testBriefingPDFOnly(DEPARTURE_SHEET_NAME, DEPARTURE_FLIGHT_NUMBER,
    "DEPARTURE", DEPARTURE_PDF_RANGE);
}
function testBriefingPDFOnly(sheetName, flightNumber, type, pdfRange) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  SpreadsheetApp.flush();
  Utilities.sleep(2000);
  const file = createBriefingPDF(ss, sheet,
    getBriefingPDFName(ss, flightNumber, type), pdfRange);
  Logger.log("PDF-only test saved: " + file.getName());
  return file;
}
