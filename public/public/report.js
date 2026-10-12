      const reportForm = document.querySelector("#report-form");
      const reportSalesModeButton = document.querySelector("#report-sales-mode");
      const reportSalesDetailsModeButton = document.querySelector("#report-sales-details-mode");
      const reportVipModeButton = document.querySelector("#report-vip-mode");
      const reportSpmlModeButton = document.querySelector("#report-spml-mode");
      const reportPsmModeButton = document.querySelector("#report-psm-mode");
      const reportInadModeButton = document.querySelector("#report-inad-mode");
      const reportWchModeButton = document.querySelector("#report-wch-mode");
      const reportMissConnectionModeButton = document.querySelector("#report-miss-connection-mode");
      const reportBaggageModeButton = document.querySelector("#report-baggage-mode");
      const reportFromInput = document.querySelector("#report-from");
      const reportFromLabel = document.querySelector("#report-from-label");
      const reportToInput = document.querySelector("#report-to");
      const reportKeywordInput = document.querySelector("#report-keyword");
      const reportOutput = document.querySelector("#report-output");
      const reportDownloadButton = document.querySelector("#report-download");
      const reportPdfDownloadButton = document.querySelector("#report-pdf-download");
let activeReportMode = "sales";
const reportFlight = document.querySelector("#report-flight");
function matchesReportFlight(row) { return !reportFlight.value || String(row.flightNo || row.flight || "").trim().toUpperCase() === reportFlight.value; }
function isoToSyDate(value) { const date = new Date(value + "T12:00:00Z"); return String(date.getUTCDate()).padStart(2,"0") + ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][date.getUTCMonth()] + String(date.getUTCFullYear()).slice(-2); }
      function authorizationReportTable(rows) {
        if (!rows.length) return `<p class="panel-muted">No Authorization Report rows found.</p>`;
        const columns = [
          ["Flight Date", (row) => row.displayDate || row.flightDate || row.date],
          ["Flight #", (row) => row.flightNo],
          ["Passenger Name", (row) => row.passenger],
          ["BN", (row) => row.bn],
          ["Seat", (row) => row.seat],
          ["BAGS", (row) => row.bags],
          ["Detail", (row) => row.detail],
        ];
        const renderGroup = (title, groupRows) => {
          if (!groupRows.length) return "";
          const body = groupRows.map((row) => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row) || "-")}</td>`).join("")}<td><input class="report-remark-input" type="text" maxlength="1000" value="${escapeHtml(row.remark || "")}" data-authorization-remark="${escapeHtml(encodeURIComponent(row.key || ""))}" aria-label="Remark for ${escapeHtml(row.passenger || "passenger")}" placeholder="Enter remark" /></td></tr>`).join("");
          const columnWidths = [9, 7, 12, 4, 5, 20, 21, 22];
          const colgroup = `<colgroup>${columnWidths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`;
          return `<section class="authorization-report-group"><h3>${escapeHtml(title)}</h3><table class="data-table">${colgroup}<thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}<th>Remark</th></tr></thead><tbody>${body}</tbody></table></section>`;
        };
        const involuntaryUpgrades = rows.filter((row) => /^INVOLUNTARY UPGRADE$/i.test(String(row.type || "").trim()) || /^INVOLUNTARY UPGRADE\b/i.test(String(row.detail || "").trim()));
        const psmMsgRows = rows.filter((row) => !involuntaryUpgrades.includes(row));
        return renderGroup("Involuntary Upgrade", involuntaryUpgrades) + renderGroup("PSM / MSG", psmMsgRows);
      }

      function moneyText(value) {
        return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function salesDetailsTypeRank(type) {
        const key = String(type || "UNKNOWN").trim().toUpperCase();
        if (key === "UPG") return 0;
        return 10;
      }

      function salesDetailsTypeSort(a, b) {
        const aType = String(a?.type || "UNKNOWN").trim().toUpperCase();
        const bType = String(b?.type || "UNKNOWN").trim().toUpperCase();
        return (salesDetailsTypeRank(aType) - salesDetailsTypeRank(bType)) || aType.localeCompare(bType);
      }

      function renderSalesDetailsReport(rows = [], totals = []) {
        if (!rows.length && !totals.length) return `<p class="panel-muted">No sales detail rows found.</p>`;
        const groups = rows.reduce((map, row) => {
          const key = String(row.type || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
          if (!map.has(key)) map.set(key, { type: key, amount: 0, rows: [] });
          const group = map.get(key);
          group.amount += Number(row.value) || 0;
          group.rows.push(row);
          return map;
        }, new Map());
        const summaryItems = (totals.length ? totals : [...groups.values()]).map((row) => {
          const type = String(row.type || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
          const group = groups.get(type);
          return { type, amount: row.amount ?? group?.amount ?? 0, count: row.count ?? group?.rows?.length ?? 0 };
        });
        const summaryHtml = summaryItems.length
          ? `<h3 class="sales-details-section-title">Total Amount</h3><div class="sales-details-summary">${summaryItems.sort(salesDetailsTypeSort).map((row) => `<article class="sales-details-total-card"><span>${escapeHtml(row.type)}</span><strong>$${escapeHtml(moneyText(row.amount))}</strong><small>${escapeHtml(row.count)} item${Number(row.count) === 1 ? "" : "s"}</small></article>`).join("")}</div>`
          : `<h3 class="sales-details-section-title">Total Amount</h3><p class="panel-muted">No sales detail totals found.</p>`;
        const detailColumns = [
          { label: "Date", value: (row) => row.date },
          { label: "Flight", value: (row) => row.flightNo || "Not recorded" },
          { label: "EMD", value: (row) => row.emd },
          { label: "Value", value: (row) => `$${moneyText(row.value)}` },
          { label: "Report Date", value: (row) => row.reportDate },
        ];
        const groupsHtml = [...groups.values()].sort(salesDetailsTypeSort).map((group) => `<article class="sales-details-group">
          <div class="sales-details-group-head"><h3>${escapeHtml(group.type)}</h3><div class="sales-details-group-total">${escapeHtml(group.rows.length)} item${group.rows.length === 1 ? "" : "s"} • Total $${escapeHtml(moneyText(group.amount))}</div></div>
          ${rowsTable(group.rows, detailColumns, `No ${group.type} rows found.`)}
        </article>`).join("");
        return `${summaryHtml}<h3 class="sales-details-section-title">Details by Type</h3><div class="sales-details-groups">${groupsHtml}</div>`;
      }

      function setReportDefaults(forceToday = false) {
        if (!reportFromInput || !reportToInput) return;
        const now = new Date();
        const ymd = ymdFromDate(now);
        if (forceToday || !reportFromInput.value) reportFromInput.value = ymd;
        if (forceToday || !reportToInput.value) reportToInput.value = reportFromInput.value || ymd;
      }

      function setReportMode(mode, options = {}) {
        activeReportMode = ["vip", "spml", "psm", "inad", "wch", "missConnection", "baggage", "salesDetails"].includes(mode) ? mode : "sales";
        if (activeReportMode === "baggage") {
          if (options.forceToday) setReportDefaults(true);
        } else {
          setReportDefaults(options.forceToday);
        }
        if (reportFromInput) reportFromInput.required = activeReportMode !== "baggage";
        if (reportToInput) reportToInput.required = activeReportMode !== "baggage";
        if (activeReportMode === "baggage" && options.resetOutput) {
          if (reportFromInput) reportFromInput.value = "";
          if (reportToInput) reportToInput.value = "";
          if (reportKeywordInput) reportKeywordInput.value = "";
        }
        if (activeReportMode === "sales" && reportToInput) reportToInput.value = reportFromInput?.value || reportToInput.value;
        reportForm?.classList.toggle("is-sales-mode", activeReportMode === "sales");
        reportForm?.classList.toggle("is-vip-mode", activeReportMode === "vip");
        reportForm?.classList.toggle("is-sales-details-mode", activeReportMode === "salesDetails");
        reportForm?.classList.toggle("is-psm-mode", activeReportMode === "psm");
        reportForm?.classList.toggle("is-inad-mode", activeReportMode === "inad");
        reportForm?.classList.toggle("is-wch-mode", activeReportMode === "wch");
        reportForm?.classList.toggle("is-miss-connection-mode", activeReportMode === "missConnection");
        reportForm?.classList.toggle("is-baggage-mode", activeReportMode === "baggage");
        reportSalesModeButton?.classList.toggle("is-active", activeReportMode === "sales");
        reportSalesDetailsModeButton?.classList.toggle("is-active", activeReportMode === "salesDetails");
        reportVipModeButton?.classList.toggle("is-active", activeReportMode === "vip");
        reportSpmlModeButton?.classList.toggle("is-active", activeReportMode === "spml");
        reportPsmModeButton?.classList.toggle("is-active", activeReportMode === "psm");
        reportInadModeButton?.classList.toggle("is-active", activeReportMode === "inad");
        reportWchModeButton?.classList.toggle("is-active", activeReportMode === "wch");
        reportMissConnectionModeButton?.classList.toggle("is-active", activeReportMode === "missConnection");
        reportBaggageModeButton?.classList.toggle("is-active", activeReportMode === "baggage");
        if (reportFromLabel) reportFromLabel.textContent = activeReportMode === "sales" ? "Date" : "From";
        const reportKeywordLabel = reportForm?.querySelector(".report-keyword-field span");
        if (reportKeywordLabel) reportKeywordLabel.textContent = activeReportMode === "baggage" ? "Bag Tag" : "Search";
        if (reportKeywordInput) reportKeywordInput.placeholder = activeReportMode === "baggage" ? "Optional bag tag" : "Optional filter";
        const reportRunButton = reportForm?.querySelector(".report-run");
        if (reportRunButton) reportRunButton.textContent = activeReportMode === "sales" ? "Download" : "Search";
        if (reportDownloadButton) reportDownloadButton.hidden = activeReportMode === "sales" || activeReportMode === "baggage";
        if (reportPdfDownloadButton) reportPdfDownloadButton.hidden = activeReportMode !== "psm";
        if (reportOutput && options.resetOutput) {
          reportOutput.innerHTML = activeReportMode === "vip"
            ? `<p class="panel-muted">Loading VIP Report...</p>`
            : (activeReportMode === "spml"
              ? `<p class="panel-muted">Loading SPML Report...</p>`
            : (activeReportMode === "inad"
              ? `<p class="panel-muted">Loading INAD Report...</p>`
              : (activeReportMode === "missConnection"
                ? `<p class="panel-muted">Loading Misconnection Report...</p>`
              : (activeReportMode === "baggage"
                ? `<p class="panel-muted">Select a submit-date range, optionally enter a bag tag, then click Search.</p>`
                : (["spml", "psm", "wch"].includes(activeReportMode)
                  ? `<p class="panel-muted">Choose a flight date range, then search ${activeReportMode === "wch" ? "WCH Report" : (activeReportMode === "spml" ? "SPML Report" : "Authorization Report")}.</p>`
                  : (activeReportMode === "salesDetails"
                    ? `<p class="panel-muted">Choose a date range, then search Sales Details totals by Type.</p>`
                    : `<p class="panel-muted">Choose a date, then download Sales Report.</p>`))))));
        }
        if (activeReportMode === "baggage") renderBaggageTimelineReport();
        else if (["vip", "spml", "psm", "inad", "wch", "missConnection", "salesDetails"].includes(activeReportMode)) generateReport();
      }

      function normalizeTestBagTag(value) {
        return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
      }

      function titleCaseTestLabel(value) {
        const normalized = String(value || "");
        if (normalized.toLowerCase() === "status") return "Type";
        return normalized
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/\b\w/g, (chr) => chr.toUpperCase());
      }

      function reportDateRange(fromValue, toValue) {
        const from = new Date(`${fromValue}T00:00:00Z`);
        const to = new Date(`${toValue}T00:00:00Z`);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("Please select a valid date range.");
        if (from > to) throw new Error("From date cannot be after To date.");
        const dates = [];
        for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
          dates.push(ymdFromDate(cursor));
          if (dates.length > 62) throw new Error("Please select 62 days or less for one report.");
        }
        return dates;
      }

      function reportDownloadLink(row) {
        if (row.salesAvailable !== "Yes" || !row.flightNo || !row.flightDate) return "";
        return `${resolveApiBase()}/sales-report/download?flightNo=${encodeURIComponent(row.flightNo)}&flightDate=${encodeURIComponent(row.flightDate)}`;
      }

      function reportRowsToCsv(rows) {
        if (!rows.length) return "";
        const keys = [...rows.reduce((set, row) => {
          Object.keys(row).forEach((key) => set.add(key));
          return set;
        }, new Set())];
        const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        return [keys.map(esc).join(","), ...rows.map((row) => keys.map((key) => esc(row[key])).join(","))].join("\n");
      }

      function setReportCsv(rows, fileName) {
        if (!reportDownloadButton) return;
        reportDownloadButton.disabled = !rows.length;
        reportDownloadButton._csv = reportRowsToCsv(rows);
        reportDownloadButton._fileName = fileName;
      }

      function setAuthorizationReportPdf(rows, fileName) {
        if (!reportPdfDownloadButton) return;
        reportPdfDownloadButton.disabled = !rows.length;
        reportPdfDownloadButton._rows = rows;
        reportPdfDownloadButton._fileName = fileName;
      }

      function downloadCurrentReportCsv() {
        const csv = reportDownloadButton?._csv || "";
        if (!csv) return;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = reportDownloadButton._fileName || "report.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      function pdfText(value) {
        return String(value ?? "")
          .normalize("NFKD")
          .replace(/[^\x20-\x7e]/g, "?")
          .replace(/([\\()])/g, "\\$1");
      }

      function authorizationReportPdf(rows) {
        const title = "China Eastern Airlines LAX Authorization Report";
        const pageWidth = 792;
        const pageHeight = 612;
        const margin = 36;
        const tableTop = 482;
        const tableBottom = 68;
        const columns = [
          { label: "FLIGHT DATE", width: 70, value: (row) => row.displayDate || row.flightDate || row.date || "-" },
          { label: "FLIGHT", width: 48, value: (row) => row.flightNo || "-" },
          { label: "PASSENGER NAME", width: 126, value: (row) => row.passenger || "-" },
          { label: "BN", width: 32, value: (row) => row.bn || "-" },
          { label: "SEAT", width: 38, value: (row) => row.seat || "-" },
          { label: "BAGS", width: 82, value: (row) => row.bags || "-" },
          { label: "DETAIL", width: 154, value: (row) => row.detail || "-" },
          { label: "REMARK", width: 170, value: (row) => row._pdfRemark || "-" },
        ];
        const tableWidth = columns.reduce((total, column) => total + column.width, 0);
        const pages = [];
        const upgrades = rows.filter((row) => /^INVOLUNTARY UPGRADE$/i.test(String(row.type || "").trim()) || /^INVOLUNTARY UPGRADE\b/i.test(String(row.detail || "").trim()));
        const groups = [
          { label: "INVOLUNTARY UPGRADE", rows: upgrades },
          { label: "PSM / MSG", rows: rows.filter((row) => !upgrades.includes(row)) },
        ].filter((group) => group.rows.length);

        rows.forEach((row) => {
          const encodedKey = encodeURIComponent(row.key || "");
          const remarkInput = row.key ? reportOutput?.querySelector(`[data-authorization-remark="${encodedKey}"]`) : null;
          row._pdfRemark = remarkInput?.value ?? row.remark ?? "";
        });

        const cleanText = (value) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").trim();
        const wrapText = (value, width) => {
          const text = cleanText(value) || "-";
          const maxChars = Math.max(4, Math.floor((width - 10) / 4.15));
          const words = text.split(/\s+/);
          const output = [];
          let line = "";
          words.forEach((word) => {
            while (word.length > maxChars) {
              if (line) { output.push(line); line = ""; }
              output.push(word.slice(0, maxChars));
              word = word.slice(maxChars);
            }
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length > maxChars && line) {
              output.push(line);
              line = word;
            } else {
              line = candidate;
            }
          });
          if (line) output.push(line);
          return output.slice(0, 5);
        };
        const textCommand = (text, x, y, size = 7, font = "F1", color = "0.12 0.17 0.24") =>
          `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(text)}) Tj ET`;
        const fillRect = (x, y, width, height, color) => `q ${color} rg ${x} ${y} ${width} ${height} re f Q`;
        const strokeRect = (x, y, width, height, color = "0.82 0.86 0.91", lineWidth = 0.5) =>
          `q ${color} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S Q`;

        const newPage = () => {
          const commands = [
            fillRect(0, pageHeight - 82, pageWidth, 82, "0.035 0.15 0.29"),
            fillRect(0, pageHeight - 86, pageWidth, 4, "0.82 0.08 0.16"),
            textCommand(title, margin, 566, 13, "F2", "1 1 1"),
            textCommand(`REPORT PERIOD  ${reportFromInput?.value || "-"}  TO  ${reportToInput?.value || reportFromInput?.value || "-"}`, margin, 510, 7, "F2", "0.35 0.42 0.50"),
            fillRect(margin, 496, tableWidth, 1.5, "0.82 0.08 0.16"),
          ];
          let x = margin;
          commands.push(fillRect(margin, tableTop - 22, tableWidth, 22, "0.08 0.25 0.43"));
          columns.forEach((column) => {
            commands.push(textCommand(column.label, x + 5, tableTop - 14, 6.3, "F2", "1 1 1"));
            x += column.width;
          });
          const page = { commands, y: tableTop - 22, rowIndex: 0 };
          pages.push(page);
          return page;
        };

        let page = newPage();
        const addGroupHeading = (label) => {
          if (page.y - 25 < tableBottom) page = newPage();
          page.commands.push(fillRect(margin, page.y - 25, tableWidth, 25, "0.90 0.94 0.98"));
          page.commands.push(textCommand(label, margin + 8, page.y - 16, 8, "F2", "0.035 0.15 0.29"));
          page.y -= 25;
        };
        groups.forEach((group) => {
          addGroupHeading(group.label);
          group.rows.forEach((row) => {
            const cellLines = columns.map((column) => wrapText(column.value(row), column.width));
            const rowHeight = Math.max(25, 10 + Math.max(...cellLines.map((lines) => lines.length)) * 9);
            if (page.y - rowHeight < tableBottom) {
              page = newPage();
              addGroupHeading(`${group.label}  (CONTINUED)`);
            }
            const rowBottom = page.y - rowHeight;
            if (page.rowIndex % 2) page.commands.push(fillRect(margin, rowBottom, tableWidth, rowHeight, "0.965 0.975 0.985"));
            page.commands.push(strokeRect(margin, rowBottom, tableWidth, rowHeight));
            let x = margin;
            columns.forEach((column, columnIndex) => {
              if (columnIndex) page.commands.push(`q 0.86 0.89 0.93 RG 0.4 w ${x} ${rowBottom} m ${x} ${page.y} l S Q`);
              cellLines[columnIndex].forEach((line, lineIndex) => {
                page.commands.push(textCommand(line, x + 5, page.y - 14 - (lineIndex * 9), 6.8));
              });
              x += column.width;
            });
            page.y = rowBottom;
            page.rowIndex += 1;
          });
        });

        const signatureHeight = 50;
        if (page.y - signatureHeight < tableBottom) page = newPage();
        const signatureY = page.y - 39;
        page.commands.push(textCommand("STATION MANAGER APPROVAL", margin, signatureY + 25, 7, "F2", "0.35 0.42 0.50"));
        page.commands.push(`q 0.18 0.25 0.34 RG 0.8 w ${margin} ${signatureY} m ${margin + 260} ${signatureY} l S Q`);
        page.commands.push(textCommand("Station Manager Signature", margin, signatureY - 12, 7, "F1", "0.35 0.42 0.50"));
        page.commands.push(`q 0.18 0.25 0.34 RG 0.8 w ${margin + 310} ${signatureY} m ${margin + 470} ${signatureY} l S Q`);
        page.commands.push(textCommand("Date", margin + 310, signatureY - 12, 7, "F1", "0.35 0.42 0.50"));

        pages.forEach((currentPage, index) => {
          currentPage.commands.push(fillRect(0, 0, pageWidth, 34, "0.035 0.15 0.29"));
          currentPage.commands.push(textCommand("China Eastern Airlines  |  LAX Authorization Report", margin, 13, 6.5, "F1", "0.78 0.85 0.92"));
          currentPage.commands.push(textCommand(`PAGE ${index + 1} OF ${pages.length}`, pageWidth - margin - 58, 13, 6.5, "F2", "1 1 1"));
        });

        const objects = [
          "",
          "",
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        ];
        const pageIds = [];
        pages.forEach((currentPage) => {
          const pageId = objects.length + 1;
          const contentId = pageId + 1;
          const stream = currentPage.commands.join("\n");
          pageIds.push(pageId);
          objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
          objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        });
        objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
        objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

        let pdf = "%PDF-1.4\n";
        const offsets = [0];
        objects.forEach((object, index) => {
          offsets[index + 1] = pdf.length;
          pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xref = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        return pdf;
      }

      function downloadAuthorizationReportPdf() {
        const rows = reportPdfDownloadButton?._rows || [];
        if (!rows.length) return;
        const blob = new Blob([authorizationReportPdf([...rows])], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = reportPdfDownloadButton._fileName || "authorization-report.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      async function salesReportRows(sy, isoDate) {
        const row = { date: isoDate, flightNo: sy.flightNo || "", flightDate: sy.flightDate || "", salesAvailable: "No", fileName: "", downloadUrl: "" };
        if (!row.flightNo || !row.flightDate) return row;
        try {
          const meta = await apiJson(`/sales-report/meta?flightNo=${encodeURIComponent(row.flightNo)}&flightDate=${encodeURIComponent(row.flightDate)}`);
          if (meta?.available === true || meta?.found === true) {
            row.salesAvailable = "Yes";
            row.fileName = meta.fileName || "Sales Report";
            row.downloadUrl = reportDownloadLink(row);
          }
        } catch (error) {
          row.salesAvailable = "Error";
          row.fileName = error?.message || "Lookup failed";
        }
        return row;
      }

      async function storedReportRows(type, isoDate, keyword) {
        const endpoint = type === "vip" ? "/vip-report" : "/stored-report";
        const query = type === "vip" ? "" : `?type=${encodeURIComponent(type)}&date=${encodeURIComponent(isoDate)}`;
        const data = await apiJson(`${endpoint}${query}`);
        const needle = String(keyword || "").trim().toUpperCase();
        const rows = data?.rows || [];
        if (!needle) return rows;
        return rows.filter((row) => Object.values(row || {}).some((value) => String(value || "").toUpperCase().includes(needle)));
      }

      async function vipReportRows(keyword) {
        return storedReportRows("vip", "", keyword);
      }

      async function psmReportRows(from, to) {
        const data = await apiJson(`/psm-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        return data?.rows || [];
      }

      async function spmlReportRows(from, to) {
        const data = await apiJson(`/spml-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        return data?.rows || [];
      }

      async function inadReportRows() {
        const data = await apiJson("/inad-report");
        return data?.rows || [];
      }

      async function wchReportRows(from, to) {
        const data = await apiJson(`/wch-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        return data?.rows || [];
      }

      async function missConnectionReportRows() {
        const data = await apiJson('/miss-connection-report');
        return data?.rows || [];
      }

      async function salesDetailsReport(from, to) {
        return apiJson(`/sales-details-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      }

      function normalizeTimelineText(value) {
        return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
      }

      function baggageDisplayDate(value) {
        const raw = String(value || "").trim();
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? raw : ymdFromDate(date);
      }

      function baggageTimelineLabel(value) {
        const raw = String(value || "").trim();
        if (/created/i.test(raw)) return "Create";
        if (/rush/i.test(raw)) return "Rush";
        if (/location/i.test(raw)) return "Location";
        if (/shipping/i.test(raw)) return "Shipping";
        return raw || "Update";
      }

      function baggageTimelineNodes(row) {
        const sheetNodes = Array.isArray(row?.sheetNodes) ? row.sheetNodes : [];
        const history = Array.isArray(row?.history) ? row.history : [];
        const sourceNodes = history.length ? history : sheetNodes;
        const nodes = sourceNodes.map((item, index) => {
          const details = item?.details || {};
          const status = item?.type || item?.label || details.status || row.currentStatus || row.status || `Step ${index + 1}`;
          return {
            label: baggageTimelineLabel(status),
            at: item?.at || "",
            by: item?.by || "",
            details,
          };
        });
        if (!nodes.length) {
          nodes.push({
            label: baggageTimelineLabel(row.currentStatus || row.status || "Created"),
            at: row.lastUpdated || row.lastUpdatedAt || row.submittedAt || "",
            by: row.lastUpdatedBy || row.submittedBy || "",
            details: {
              flight: row.flight,
              date: row.date,
              location: row.location,
              comment: row.comment,
            },
          });
        }
        const currentKey = normalizeTimelineText(row.currentStatus || row.status);
        let currentIndex = -1;
        if (currentKey) {
          for (let index = nodes.length - 1; index >= 0; index -= 1) {
            const nodeKey = normalizeTimelineText(nodes[index]?.label);
            if (nodeKey && (nodeKey.includes(currentKey) || currentKey.includes(nodeKey))) {
              currentIndex = index;
              break;
            }
          }
        }
        if (currentIndex < 0) currentIndex = nodes.length - 1;
        return nodes.map((node, index) => ({ ...node, current: index === currentIndex }));
      }

      function baggageNodeDetailHtml(node, row) {
        const details = Object.entries(node?.details || {}).filter(([, value]) => String(value || "").trim());
        const detailHtml = details.length
          ? details.map(([key, value]) => `<br><b>${escapeHtml(titleCaseTestLabel(key))}:</b> ${escapeHtml(value)}`).join("")
          : "";
        const atTime = node?.at ? new Date(node.at) : null;
        const atText = atTime && !Number.isNaN(atTime.getTime()) ? atTime.toLocaleString() : (node?.at || "");
        return `<b>${escapeHtml(node?.label || row?.currentStatus || "Update")}</b>${atText ? ` • ${escapeHtml(atText)}` : ""}${node?.by ? ` • ${escapeHtml(node.by)}` : ""}${detailHtml}`;
      }

      function renderBaggageReportSearchForm() {
        return `<form class="baggage-report-search" data-baggage-report-search>
          <label class="report-field"><span>FROM</span><input data-baggage-report-from type="date" value="${escapeHtml(reportFromInput?.value || "")}" /></label>
          <label class="report-field"><span>TO</span><input data-baggage-report-to type="date" value="${escapeHtml(reportToInput?.value || "")}" /></label>
          <label class="report-field"><span>BAG TAG</span><input data-baggage-report-bagtag type="search" placeholder="MU123456" value="${escapeHtml(reportKeywordInput?.value || "")}" /></label>
          <button class="report-run" type="submit">Search</button>
        </form>`;
      }

      function renderBaggageTimelineRows(rows = []) {
        if (!rows.length) return `${renderBaggageReportSearchForm()}<p class="panel-muted">No baggage report rows found.</p>`;
        const header = `<div class="baggage-timeline-header"><span>Last Update</span><span>Submit Date</span><span>Bag Tag</span><span>Current Status</span><span>Tracking</span></div>`;
        return `${renderBaggageReportSearchForm()}<div class="baggage-timeline-list">${header}${rows.map((row, rowIndex) => {
          const nodes = baggageTimelineNodes(row);
          const track = nodes.map((node, nodeIndex) => `<span class="baggage-timeline-step"><button class="baggage-timeline-node ${node.current ? "is-current" : ""}" type="button" data-baggage-row="${rowIndex}" data-baggage-node="${nodeIndex}" aria-label="${escapeHtml(node.label || `Step ${nodeIndex + 1}`)}" title="${escapeHtml(node.label || `Step ${nodeIndex + 1}`)}"></button><span class="baggage-timeline-label">${escapeHtml(node.label || `Step ${nodeIndex + 1}`)}</span></span>${nodeIndex < nodes.length - 1 ? `<span class="baggage-timeline-segment" aria-hidden="true"></span>` : ""}`).join("");
          const flightClass = /MU583/i.test(row.flight || "") ? " is-flight-mu583" : (/MU586/i.test(row.flight || "") ? " is-flight-mu586" : "");
          return `<article class="baggage-timeline-row${flightClass}" data-baggage-row-card="${rowIndex}">
            <span class="baggage-timeline-value">${escapeHtml(baggageDisplayDate(row.lastUpdated || row.lastUpdatedAt) || "-")}</span>
            <span class="baggage-timeline-value">${escapeHtml(baggageDisplayDate(row.submitDate || row.submittedAt) || "-")}</span>
            <strong class="baggage-timeline-value">${escapeHtml(row.bagTag || "-")}<small class="baggage-flight-badge">${escapeHtml(row.flight || "Not recorded")}</small></strong>
            <span class="baggage-timeline-value">${escapeHtml(row.currentStatus || row.status || "-")}</span>
            <div class="baggage-timeline-track">${track}</div>
            <div class="baggage-node-detail" data-baggage-detail hidden></div>
          </article>`;
        }).join("")}</div>`;
      }

      async function renderBaggageTimelineReport(options = {}) {
        if (!reportOutput) return;
        reportOutput.innerHTML = `<p class="panel-muted">Loading Baggage Report...</p>`;
        setReportCsv([], "baggage-report.csv");
        try {
          const latestOnly = Boolean(options.latestOnly);
          const from = latestOnly ? "" : (reportFromInput?.value || "");
          const to = latestOnly ? "" : (reportToInput?.value || "");
          const bagTag = latestOnly ? "" : normalizeTestBagTag(reportKeywordInput?.value || "");
          if (!latestOnly && from && to) reportDateRange(from, to);
          const params = new URLSearchParams();
          if (from) params.set("from", from);
          if (to) params.set("to", to);
          if (bagTag) params.set("bagTag", bagTag);
          const data = await apiJson(`/test-baggage-report?${params.toString()}`);
          const rows = (data?.rows || []).filter(matchesReportFlight);
          reportOutput._baggageRows = rows;
          reportOutput.innerHTML = renderBaggageTimelineRows(rows);
        } catch (error) {
          reportOutput.innerHTML = `${renderBaggageReportSearchForm()}<p class="panel-muted status-fail">${escapeHtml(error?.message || "Baggage report lookup failed.")}</p>`;
        }
      }

      async function generateReport(event) {
        event?.preventDefault();
        if (!reportOutput) return;
        if (activeReportMode === "baggage") {
          await renderBaggageTimelineReport();
          return;
        }
        const type = ["vip", "spml", "psm", "inad", "wch", "missConnection", "salesDetails"].includes(activeReportMode) ? activeReportMode : "sales";
        const today = ymdFromDate(new Date());
        const from = reportFromInput?.value || today;
        const keyword = type === "vip" ? (reportKeywordInput?.value || "") : "";
        const to = reportToInput?.value || from;
        let dates;
        try {
          dates = type === "sales" ? [from] : [];
          if (type === "sales" && !from) throw new Error("Please select a valid date.");
          if (type === "spml" || type === "psm" || type === "wch" || type === "salesDetails") reportDateRange(from, to);
        } catch (error) {
          reportOutput.innerHTML = `<p class="panel-muted status-fail">${escapeHtml(error.message)}</p>`;
          setReportCsv([], "report.csv");
          setAuthorizationReportPdf([], "authorization-report.pdf");
          return;
        }
        reportOutput.innerHTML = type === "sales"
          ? `<p class="panel-muted">Checking Sales Report for ${escapeHtml(from)}...</p>`
          : (type === "salesDetails"
            ? `<p class="panel-muted">Loading Sales Details for ${escapeHtml(from)}${from === to ? "" : ` to ${escapeHtml(to)}`}...</p>`
            : (type === "spml"
              ? `<p class="panel-muted">Loading SPML Report for ${escapeHtml(from)}${from === to ? "" : ` to ${escapeHtml(to)}`}...</p>`
            : (type === "psm"
            ? `<p class="panel-muted">Loading Authorization Report for ${escapeHtml(from)}${from === to ? "" : ` to ${escapeHtml(to)}`}...</p>`
            : (type === "wch"
              ? `<p class="panel-muted">Loading WCH Report for ${escapeHtml(from)}${from === to ? "" : ` to ${escapeHtml(to)}`}...</p>`
              : (type === "inad" ? `<p class="panel-muted">Loading INAD Report...</p>` : (type === "missConnection" ? `<p class="panel-muted">Loading Misconnection Report...</p>` : `<p class="panel-muted">Loading VIP Report...</p>`))))));
        setReportCsv([], "report.csv");
        setAuthorizationReportPdf([], "authorization-report.pdf");
        const rows = [];
        const errors = [];
        if (type === "vip") {
          try {
            rows.push(...await vipReportRows(keyword));
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "spml") {
          try {
            const needle = String(reportKeywordInput?.value || "").trim().toUpperCase();
            rows.push(...(await spmlReportRows(from, to)).filter((row) => !needle || Object.values(row || {}).some((value) => String(value || "").toUpperCase().includes(needle))));
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "psm") {
          try {
            rows.push(...await psmReportRows(from, to));
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "inad") {
          try {
            rows.push(...await inadReportRows());
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "wch") {
          try {
            rows.push(...await wchReportRows(from, to));
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "missConnection") {
          try {
            const submissions = await missConnectionReportRows();
            rows.push(...submissions.map((row) => ({ date: row.date, flightNo: row.flightNo || "", name: row.name, seatNumber: row.seatNumber, ticketNumber: row.ticketNumber, phone: row.phone })));
          } catch (error) {
            errors.push(error.message);
          }
        } else if (type === "salesDetails") {
          try {
            const data = await salesDetailsReport(from, to);
            rows.push(...(data?.rows || []));
            rows._totals = data?.totals || [];
            if (data?.sync?.errors?.length) errors.push(`Sales Details sync warning: ${data.sync.errors.join(" | ")}`);
          } catch (error) {
            errors.push(error.message);
          }
        }
        for (const isoDate of dates) {
          try {
            const flights = reportFlight.value ? [reportFlight.value] : ["MU586", "MU9586", "MU578", "MU583", "MU577"];
            for (const flightNo of flights) rows.push(await salesReportRows({flightNo, flightDate:isoToSyDate(isoDate)}, isoDate));
          } catch (error) {
            errors.push(`${isoDate}: ${error.message}`);
          }
        }
        rows.splice(0, rows.length, ...rows.filter(matchesReportFlight));
        let tableHtml = "";
        if (type === "sales") {
          const downloadRows = rows.filter((row) => row.downloadUrl);
          tableHtml = rowsTable(rows, [
            { label: "Date", value: (row) => row.date },
            { label: "Flight", value: (row) => row.flightNo },
            { label: "Flight Date", value: (row) => row.flightDate },
            { label: "Available", value: (row) => row.salesAvailable },
            { label: "File", value: (row) => row.fileName },
          ], "No sales report rows.") + `<div class="report-actions-row">${downloadRows.map((row) => `<a class="report-link-button" href="${escapeHtml(row.downloadUrl)}" target="_blank" rel="noopener">Download Sales Report</a>`).join("")}</div>`;
        } else if (type === "salesDetails") {
          const totals = []; // Recalculate totals from the selected flight rows.
          tableHtml = renderSalesDetailsReport(rows, totals);
        } else if (type === "vip") {
          tableHtml = rowsTable(rows, [
            { label: "Flight Date", value: (row) => row.displayDate || row.flightDate || row.date },
            { label: "Flight", value: (row) => row.flightNo },
            { label: "Passenger", value: (row) => row.passenger },
            { label: "BN", value: (row) => row.bn },
            { label: "Seat", value: (row) => row.seat },
            { label: "Bags", value: (row) => row.bags },
          ], "No VIP passengers found.");
        } else if (type === "spml") {
          tableHtml = rowsTable(rows, [
            { label: "Date", value: (row) => row.date },
            { label: "Flight", value: (row) => row.flightNo },
            { label: "Passenger", value: (row) => row.passenger },
            { label: "BN", value: (row) => row.bn },
            { label: "Seat", value: (row) => row.seat },
            { label: "SPML", value: (row) => row.meal },
            { label: "Status", value: (row) => row.status || (row.confirmed ? "HK1" : "") },
          ], "No SPML passengers found.");
        } else if (type === "psm") {
          tableHtml = authorizationReportTable(rows);
        } else if (type === "inad") {
          tableHtml = rowsTable(rows, [
            { label: "Date", value: (row) => row.displayDate || row.date },
            { label: "Flight", value: (row) => row.flightNo },
            { label: "Flight Date", value: (row) => row.flightDate },
            { label: "Passenger", value: (row) => row.passenger },
            { label: "BN", value: (row) => row.bn },
            { label: "Seat", value: (row) => row.seat },
            { label: "Ticket", value: (row) => row.ticketNumber || "" },
            { label: "Service", value: (row) => row.service || "INAD" },
          ], "No INAD rows found.");
        } else if (type === "wch") {
          tableHtml = rowsTable(rows, [
            { label: "Date", value: (row) => row.displayDate || row.date },
            { label: "Flight", value: (row) => row.flightNo },
            { label: "Flight Date", value: (row) => row.flightDate },
            { label: "Passenger", value: (row) => row.passenger },
            { label: "BN", value: (row) => row.bn },
            { label: "Seat", value: (row) => row.seat },
            { label: "WCH Type", value: (row) => row.wheelchairType },
          ], "No WCH rows found.");
        } else if (type === "missConnection") {
          tableHtml = rowsTable(rows, [
            { label: "Date", value: (row) => row.date },
            { label: "Flight", value: (row) => row.flightNo || "Not recorded" },
            { label: "Passenger Name", value: (row) => row.name },
            { label: "Seat", value: (row) => row.seatNumber },
            { label: "Passport Number", value: (row) => row.ticketNumber },
            { label: "Mobile Number", value: (row) => row.phone },
          ], "No misconnection submissions found.");
        }
        const errorHtml = errors.length ? `<p class="panel-muted status-warn">${escapeHtml(errors.join(" | "))}</p>` : "";
        reportOutput.innerHTML = `${errorHtml}${tableHtml}`;
        const reportFileNames = {
          sales: `sales-report-${from}.csv`,
          salesDetails: `sales-details-${from}${from === to ? "" : `-to-${to}`}.csv`,
          vip: "vip-report.csv",
          spml: `spml-report-${from}${from === to ? "" : `-to-${to}`}.csv`,
          psm: `authorization-report-${from}${from === to ? "" : `-to-${to}`}.csv`,
          inad: "inad-report.csv",
          wch: `wch-report-${from}${from === to ? "" : `-to-${to}`}.csv`,
          missConnection: "miss-connection-report.csv",
        };
        setReportCsv(type === "sales" ? rows.filter((row) => row.downloadUrl) : rows, reportFileNames[type] || "report.csv");
        setAuthorizationReportPdf(
          type === "psm" ? rows : [],
          `authorization-report-${from}${from === to ? "" : `-to-${to}`}.pdf`,
        );
      }

      function seatNumber(value) {
        const match = String(value || "").match(/^(\d{1,2})([A-Z])$/i);
        return match ? { row: Number(match[1]), letter: match[2].toUpperCase() } : null;
      }
      reportOutput?.addEventListener("submit", async (event) => {
        const searchForm = event.target.closest("[data-baggage-report-search]");
        if (!searchForm) return;
        event.preventDefault();
        if (reportFromInput) reportFromInput.value = searchForm.querySelector("[data-baggage-report-from]")?.value || "";
        if (reportToInput) reportToInput.value = searchForm.querySelector("[data-baggage-report-to]")?.value || "";
        if (reportKeywordInput) reportKeywordInput.value = normalizeTestBagTag(searchForm.querySelector("[data-baggage-report-bagtag]")?.value || "");
        await renderBaggageTimelineReport();
      });

      reportOutput?.addEventListener("click", (event) => {
        const node = event.target.closest("[data-baggage-node]");
        const openDetail = reportOutput.querySelector("[data-baggage-detail]:not([hidden])");
        if (!node) {
          reportOutput.querySelectorAll(".baggage-timeline-node.is-selected").forEach((item) => item.classList.remove("is-selected"));
          if (openDetail) {
            openDetail.hidden = true;
            openDetail.innerHTML = "";
          }
          return;
        }
        const rowIndex = Number(node.dataset.baggageRow || 0);
        const nodeIndex = Number(node.dataset.baggageNode || 0);
        const row = (reportOutput._baggageRows || [])[rowIndex];
        if (!row) return;
        const card = node.closest("[data-baggage-row-card]");
        const detail = card?.querySelector("[data-baggage-detail]");
        const wasOpen = detail && !detail.hidden && node.classList.contains("is-selected");
        reportOutput.querySelectorAll(".baggage-timeline-node.is-selected").forEach((item) => item.classList.remove("is-selected"));
        reportOutput.querySelectorAll("[data-baggage-detail]:not([hidden])").forEach((item) => { item.hidden = true; item.innerHTML = ""; });
        if (wasOpen) return;
        node.classList.add("is-selected");
        const nodes = baggageTimelineNodes(row);
        if (detail) {
          detail.hidden = false;
          detail.innerHTML = baggageNodeDetailHtml(nodes[nodeIndex], row);
        }
      });

      const authorizationRemarkTimers = new WeakMap();
      reportOutput?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-authorization-remark]");
        if (!input) return;
        clearTimeout(authorizationRemarkTimers.get(input));
        input.classList.remove("is-save-error");
        input.classList.add("is-saving");
        authorizationRemarkTimers.set(input, setTimeout(async () => {
          try {
            await apiJson("/psm-report/remark", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                key: decodeURIComponent(input.dataset.authorizationRemark || ""),
                remark: input.value,
              }),
            });
            input.classList.remove("is-saving", "is-save-error");
            input.title = "Saved";
          } catch (error) {
            input.classList.remove("is-saving");
            input.classList.add("is-save-error");
            input.title = error?.message || "Remark save failed";
          }
        }, 600));
      });

      reportSalesModeButton?.addEventListener("click", () => setReportMode("sales", { forceToday: true, resetOutput: true }));
      reportSalesDetailsModeButton?.addEventListener("click", () => setReportMode("salesDetails", { forceToday: true, resetOutput: true }));
      reportVipModeButton?.addEventListener("click", () => setReportMode("vip", { forceToday: true, resetOutput: true }));
      reportSpmlModeButton?.addEventListener("click", () => setReportMode("spml", { forceToday: true, resetOutput: true }));
      reportPsmModeButton?.addEventListener("click", () => setReportMode("psm", { forceToday: true, resetOutput: true }));
      reportInadModeButton?.addEventListener("click", () => setReportMode("inad", { forceToday: true, resetOutput: true }));
      reportWchModeButton?.addEventListener("click", () => setReportMode("wch", { forceToday: true, resetOutput: true }));
      reportMissConnectionModeButton?.addEventListener("click", () => setReportMode("missConnection", { resetOutput: true }));
      reportBaggageModeButton?.addEventListener("click", () => { setReportMode("baggage", { resetOutput: true }); renderBaggageTimelineReport({ latestOnly: true }); });
      reportForm.addEventListener("submit", generateReport);
      reportDownloadButton.addEventListener("click", downloadCurrentReportCsv);
      reportPdfDownloadButton?.addEventListener("click", downloadAuthorizationReportPdf);

reportFlight.value = "";
reportFlight.addEventListener("change", () => generateReport());
requireServiceLogin(() => setReportMode(new URLSearchParams(location.search).get("mode") || "sales", {forceToday:true, resetOutput:true}));
