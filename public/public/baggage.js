let testBagSearchPending = false;
      const testOutput = document.querySelector("#test-output");
      const testSearchForm = document.querySelector("#test-search-form");
      const testBagSearchInput = document.querySelector("#test-bag-search");
function currentUserName() { return reviewerDisplayName(auth?.currentUser?.email); }
      function normalizeTestBagTag(value) {
        return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
      }

      function isValidTestBagTag(value) {
        return /^[A-Z0-9]{2}\d{6}$/.test(normalizeTestBagTag(value));
      }

      function titleCaseTestLabel(value) {
        const normalized = String(value || "");
        if (normalized.toLowerCase() === "status") return "Type";
        return normalized
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/\b\w/g, (chr) => chr.toUpperCase());
      }

      function testDetailRows(details = {}) {
        const rows = Object.entries(details || {}).filter(([, value]) => String(value || "").trim());
        if (!rows.length) return "";
        return `<div class="test-timeline-detail">${rows.map(([key, value]) => `<div><b>${escapeHtml(titleCaseTestLabel(key))}</b><span>${escapeHtml(value)}</span></div>`).join("")}</div>`;
      }

      function capitalizeTestType(value) {
        return String(value || "")
          .replace(/\b\w/g, (chr) => chr.toUpperCase());
      }

      function renderTestTimeline(history = []) {
        const rows = [...(history || [])].reverse();
        if (!rows.length) return `<p class="panel-muted">No updates yet.</p>`;
        return `<div class="test-timeline">${rows.map((item, index) => {
          const timestamp = item.at ? new Date(item.at) : null;
          const time = timestamp ? timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          const date = timestamp ? timestamp.toLocaleDateString() : "";
          const detailRows = testDetailRows(item.details || {});
          const rawType = String(item.type || "update").trim();
          const displayType = capitalizeTestType(/created/i.test(rawType) || /^update\b/i.test(rawType) ? rawType : `Update ${rawType}`);
          return `<div class="test-timeline-item ${index === 0 ? "is-latest" : ""}"><span class="test-timeline-time"><strong>${escapeHtml(time || date)}</strong>${time && date ? `<small>${escapeHtml(date)}</small>` : ""}</span><div><b>${escapeHtml(displayType)}${item.by ? ` by ${escapeHtml(item.by)}` : ""}</b>${detailRows || `<p>${escapeHtml(date || "Saved")}</p>`}</div></div>`;
        }).join("")}</div>`;
      }

      function beginTestTimelineDrag(event) {
        const timeline = event.currentTarget;
        timeline.classList.add("is-dragging");
        timeline.dataset.dragStartY = String(event.clientY);
        timeline.dataset.dragStartScrollTop = String(timeline.scrollTop);
        timeline.setPointerCapture?.(event.pointerId);
      }

      function moveTestTimelineDrag(event) {
        const timeline = event.currentTarget;
        if (!timeline.classList.contains("is-dragging")) return;
        const startY = Number(timeline.dataset.dragStartY || event.clientY);
        const startScrollTop = Number(timeline.dataset.dragStartScrollTop || timeline.scrollTop);
        timeline.scrollTop = startScrollTop - (event.clientY - startY);
      }

      function endTestTimelineDrag(event) {
        const timeline = event.currentTarget;
        timeline.classList.remove("is-dragging");
        timeline.releasePointerCapture?.(event.pointerId);
      }

      function wireTestTimelineDrag() {
        const timeline = testOutput?.querySelector(".test-timeline");
        if (!timeline || timeline.dataset.dragReady === "true") return;
        timeline.dataset.dragReady = "true";
        timeline.addEventListener("pointerdown", beginTestTimelineDrag);
        timeline.addEventListener("pointermove", moveTestTimelineDrag);
        timeline.addEventListener("pointerup", endTestTimelineDrag);
        timeline.addEventListener("pointercancel", endTestTimelineDrag);
      }

      function renderTestUpdateForm(record, mode = "rush", message = "") {
        const activeMode = ["rush", "location", "shipping", "exchange"].includes(mode) ? mode : "rush";
        const field = (label, name, value = "", attrs = "") => `<label class="test-field"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${attrs} /></label>`;
        const fields = activeMode === "rush"
          ? [
              field("Rush tag number", "rushTagNumber", record.rushTagNumber || "", "required"),
              field("Rush To where?", "rushToWhere", record.rushToWhere || "", "required"),
              field("AKE number?", "akeNumber", record.akeNumber || "", "required"),
              field("Option: world tracer file #", "worldTracerFileNumber", record.worldTracerFileNumber || ""),
              `<label class="test-field is-wide"><span>Comment</span><textarea name="comment">${escapeHtml(record.comment || "")}</textarea></label>`,
            ].join("")
          : activeMode === "location"
            ? field("Current location", "location", record.location || "", "required")
            : activeMode === "exchange"
              ? `<div class="test-exchange-summary is-wide"><b>Current tag</b><span class="test-exchange-flow"><span class="test-exchange-old">${escapeHtml(record.bagTag)}</span><span class="test-exchange-arrow" aria-hidden="true">→<span class="test-exchange-arrow-label">Exchange</span></span><span class="test-exchange-new">New tag</span></span></div>${field("New tag number", "newTagNumber", "", 'maxlength="8" pattern="[A-Z0-9]{2}[0-9]{6}" required')}`
              : [
                field("Tracking number", "trackingNumber", record.trackingNumber || "", "required"),
                field("Shipping fee", "shippingFee", record.shippingFee || "", "required"),
              ].join("");
        return `<form class="test-update-form" data-test-update-form data-bag-tag="${escapeHtml(record.bagTag)}" data-update-mode="${escapeHtml(activeMode)}">
          <div class="test-mode-actions" aria-label="Update type">
            <button type="button" data-test-update-mode="rush" class="${activeMode === "rush" ? "is-active" : ""}">Rush</button>
            <button type="button" data-test-update-mode="location" class="${activeMode === "location" ? "is-active" : ""}">Bag location update</button>
            <button type="button" data-test-update-mode="shipping" class="${activeMode === "shipping" ? "is-active" : ""}">Shipping</button>
            <button type="button" data-test-update-mode="exchange" class="${activeMode === "exchange" ? "is-active" : ""}">Exchange</button>
          </div>
          <div class="test-form-grid">${fields}<div class="test-form-actions"><button class="test-submit" type="submit">Update</button><button class="test-back-button" type="button" data-test-close-update>Close</button><span class="panel-muted">${escapeHtml(message)}</span></div></div>
        </form>`;
      }

      function renderTestRecord(record, mode = "", message = "") {
        if (!testOutput || !record) return;
        testOutput._record = record;
        const showUpdateForm = ["rush", "location", "shipping", "exchange"].includes(mode);
        testOutput.innerHTML = `<article class="test-report-card">
          <div class="test-report-head">
            <div class="test-report-title"><strong>${escapeHtml(record.bagTag)}</strong><span class="panel-muted">${escapeHtml(record.direction || "Baggage report")}</span></div>
          </div>
          ${message ? `<p class="panel-muted status-ok">${escapeHtml(message)}</p>` : ""}
          ${renderTestTimeline(record.history)}
          ${showUpdateForm ? `<div class="test-report-head test-update-head"><h3>Update</h3></div>${renderTestUpdateForm(record, mode)}` : `<div class="test-form-actions"><button class="test-add-button" type="button" data-test-show-update>Update</button></div>`}
        </article>`;
        wireTestTimelineDrag();
      }

      function testPlaneIcon(direction) {
        return `<span class="test-choice-icon" aria-hidden="true">${direction === "inbound" ? "🛬" : direction === "outbound" ? "🛫" : "⇄"}</span>`;
      }

      async function renderTestAddChoice(bagTag) {
        if (!testOutput) return;
        const exchangeButton = `<button class="test-choice-card" type="button" data-test-create-mode="exchange">${testPlaneIcon("exchange")}<span>Exchange</span></button>`;
        testOutput._record = null;
        testOutput.innerHTML = `<article class="test-report-card">
          <div class="test-report-head"><div class="test-report-title"><strong>${escapeHtml(bagTag)}</strong><span class="panel-muted">No matching bag found.</span></div></div>
          <div class="test-choice-grid" aria-label="Create type">
            <button class="test-choice-card" type="button" data-test-create-mode="inbound">${testPlaneIcon("inbound")}<span>Inbound</span></button>
            <button class="test-choice-card" type="button" data-test-create-mode="outbound">${testPlaneIcon("outbound")}<span>Outbound</span></button>
            ${exchangeButton}
          </div>
        </article>`;
        wireTestTimelineDrag();
      }

      function renderTestExchangeForm(newTag, rows = []) {
        const openRows = rows.filter((row) => !row.resolvedAt);
        const options = openRows.map((row) => `<option value="${escapeHtml(row.rowNumber)}">${escapeHtml(row.bagTag)} · ${escapeHtml(row.bagType || row.status || "On-hand")} · ${escapeHtml(row.location || "-")}</option>`).join("");
        testOutput.innerHTML = `<article class="test-report-card">
          <div class="test-report-head"><div class="test-report-title"><strong>${escapeHtml(newTag)}</strong><span class="panel-muted">Exchange with an existing Open On-hand bag.</span></div><div class="test-form-actions"><button class="test-back-button" type="button" data-test-back-choice>Back</button></div></div>
          <form class="test-create-form" data-test-exchange-form>
            <div class="test-form-grid">${flightInput}
              <label class="test-field"><span>New tag number</span><input name="newTagNumber" value="${escapeHtml(newTag)}" readonly /></label>
              <label class="test-field is-wide"><span>Select current Open On-hand</span><select name="onHandRowNumber" required ${openRows.length ? "" : "disabled"}><option value="">Select an On-hand tag</option>${options}</select></label>
              ${openRows.length ? "" : '<p class="panel-muted status-fail">There are no Open On-hand cases available to exchange.</p>'}
              <div class="test-form-actions"><button class="test-submit" type="submit" ${openRows.length ? "" : "disabled"}>Exchange</button><span class="panel-muted"></span></div>
            </div>
          </form>
        </article>`;
      }

      async function openTestExchangeForm(newTag) {
        testOutput.innerHTML = '<p class="panel-muted">Loading Open On-hand cases...</p>';
        const data = await apiJson('/cbs-unresolved-baggage');
        renderTestExchangeForm(newTag, data?.rows || []);
      }

      async function submitTestExchange(form) {
        const newTagNumber = normalizeTestBagTag(formValue(form, "newTagNumber"));
        const onHandRowNumber = formValue(form, "onHandRowNumber");
        if (!isValidTestBagTag(newTagNumber)) throw new Error("New tag must match MU123456, B6123456, or 3U515289 format.");
        if (!onHandRowNumber) throw new Error("Select an Open On-hand tag.");
        const data = await apiJson(`/cbs-unresolved-baggage/${encodeURIComponent(onHandRowNumber)}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action:"exchange", newTagNumber, updatedBy:currentUserName() }),
        });
        const exchange = data?.record?.exchangeHistory?.at(-1);
        const baggage = await apiJson(`/test-baggage/${encodeURIComponent(newTagNumber)}`);
        if (baggage?.record) return renderTestRecord(baggage.record, "", "Exchange completed.");
        testOutput.innerHTML = `<article class="test-report-card"><div class="test-report-head"><div class="test-report-title"><strong>${escapeHtml(newTagNumber)}</strong><span class="panel-muted">Exchange completed.</span></div></div><div class="test-exchange-summary"><b>Exchange</b><span class="test-exchange-flow"><span class="test-exchange-old">${escapeHtml(exchange?.oldTag || "-")}</span><span class="test-exchange-arrow" aria-hidden="true">→<span class="test-exchange-arrow-label">Exchange</span></span><span class="test-exchange-new">${escapeHtml(newTagNumber)}</span></span></div></article>`;
      }

      function renderTestBagEntry(mode, entry = {}, index = 0) {
        const today = ymdFromDate(new Date());
        const selected = (value, target) => value === target ? " selected" : "";
        const flights = mode === "outbound" ? ["MU586", "MU578"] : ["MU583", "MU577"];
        const flight = flights.includes(entry.flight) ? entry.flight : (mode === "outbound" ? "MU578" : "MU583");
        const flightInput = `<label class="test-field"><span>Flight</span><select name="flight" required>${flights.map(value => `<option value="${value}"${selected(flight, value)}>${value}</option>`).join("")}</select></label>`;
        const bagTagInput = `<label class="test-field"><span>Bag tag number</span><input name="bagTag" value="${escapeHtml(entry.bagTag || "")}" maxlength="8" pattern="[A-Z0-9]{2}[0-9]{6}" title="Use MU123456, B6123456, or 3U515289 format" autocomplete="off" required /></label>`;
        if (mode === "outbound") {
          const status = entry.status || "Not load bags";
          return `<fieldset class="test-create-entry" data-test-bag-entry>
            <legend><span>Outbound bag</span></legend>
            <div class="test-form-grid">${flightInput}
              <label class="test-field"><span>Date</span><input name="date" type="date" value="${escapeHtml(entry.date || today)}" required /></label>
              <label class="test-field"><span>Type</span><select name="status" data-test-outbound-status required><option value="Not load bags"${selected(status, "Not load bags")}>Not load bags</option><option value="Outbound rush"${selected(status, "Outbound rush")}>Outbound rush</option><option value="Gate bag"${selected(status, "Gate bag")}>Gate bag</option></select></label>
              <label class="test-field" data-test-outbound-location><span>Current location</span><input name="location" value="${escapeHtml(entry.location || "")}" list="test-location-options" /></label>
              <div class="test-outbound-bag-tags" data-test-outbound-bag-tags><div class="test-bag-tag-row">${bagTagInput}<button class="test-bag-tag-add" type="button" data-test-add-bag-tag aria-label="Add another bag tag">+</button></div></div>
              <label class="test-field" data-test-rush-field hidden><span>Rush tag number</span><input name="rushTagNumber" value="${escapeHtml(entry.rushTagNumber || "")}" /></label>
              <label class="test-field" data-test-rush-field hidden><span>Rush To where?</span><input name="rushToWhere" value="${escapeHtml(entry.rushToWhere || "")}" /></label>
              <label class="test-field" data-test-rush-field hidden><span>AKE number?</span><input name="akeNumber" value="${escapeHtml(entry.akeNumber || "")}" /></label>
              <label class="test-field" data-test-rush-field hidden><span>Option: world tracer file #</span><input name="worldTracerFileNumber" value="${escapeHtml(entry.worldTracerFileNumber || "")}" /></label>
              <label class="test-field is-wide"><span>Comment</span><input name="comment" value="${escapeHtml(entry.comment || "")}" list="test-outbound-comments" /></label>
            </div>
          </fieldset>`;
        }
        const bagType = entry.bagType || "Passenger bag";
        const location = entry.location || "Office";
        return `<fieldset class="test-create-entry" data-test-bag-entry>
          <legend><span>Inbound bag</span></legend>
          <div class="test-form-grid">${flightInput}${bagTagInput}
            <label class="test-field"><span>Date</span><input name="date" type="date" value="${escapeHtml(entry.date || today)}" required /></label>
            <label class="test-field"><span>Bag type</span><select name="bagType" required><option${selected(bagType, "Passenger bag")}>Passenger bag</option><option${selected(bagType, "Inbound rush")}>Inbound rush</option><option${selected(bagType, "Co-mail")}>Co-mail</option></select></label>
            <label class="test-field"><span>Current location</span><input name="location" value="${escapeHtml(location)}" list="test-location-options" required /></label>
          </div>
        </fieldset>`;
      }

      function collectCreateEntries(form) {
        const mode = form.dataset.createMode;
        if (mode === "outbound") {
          const entry = form.querySelector("[data-test-bag-entry]");
          const shared = {
            flight: formValue(entry, "flight"), date: formValue(entry, "date"), location: formValue(entry, "location"),
            status: formValue(entry, "status"), comment: formValue(entry, "comment"),
            rushTagNumber: formValue(entry, "rushTagNumber"), rushToWhere: formValue(entry, "rushToWhere"),
            akeNumber: formValue(entry, "akeNumber"), worldTracerFileNumber: formValue(entry, "worldTracerFileNumber"),
          };
          return [...entry.querySelectorAll('[data-test-outbound-bag-tags] input[name="bagTag"]')]
            .map((input) => ({ ...shared, bagTag: normalizeTestBagTag(input.value) }));
        }
        return [...form.querySelectorAll("[data-test-bag-entry]")].map((entry) => ({
          bagTag: normalizeTestBagTag(formValue(entry, "bagTag")),
          flight: formValue(entry, "flight"),
          date: formValue(entry, "date"),
          bagType: formValue(entry, "bagType"),
          location: formValue(entry, "location"),
          status: formValue(entry, "status"),
          comment: formValue(entry, "comment"),
          rushTagNumber: formValue(entry, "rushTagNumber"),
          rushToWhere: formValue(entry, "rushToWhere"),
          akeNumber: formValue(entry, "akeNumber"),
          worldTracerFileNumber: formValue(entry, "worldTracerFileNumber"),
        }));
      }

      function renderTestAddForm(bagTag, mode = "inbound", entries = null, message = "") {
        const activeMode = mode === "outbound" ? "outbound" : "inbound";
        const bag = entries?.length ? entries[0] : { bagTag };
        if (testOutput) testOutput._record = null;
        testOutput.innerHTML = `<article class="test-report-card">
          <div class="test-report-head"><div class="test-report-title"><strong>${escapeHtml(bagTag || "New bag")}</strong><span class="panel-muted">No matching bag found.</span></div><div class="test-form-actions"><button class="test-back-button" type="button" data-test-back-choice>Back</button></div></div>
          <datalist id="test-location-options"><option value="Office"></option><option value="Transfer"></option><option value="CBS"></option></datalist>
          <datalist id="test-outbound-comments">
            <option value="Expected"></option>
            <option value="Not Received"></option>
            <option value="Force loaded"></option>
            <option value="Gate Bag"></option>
            <option value="Bag Delete and Add back"></option>
            <option value="Passenger Showed Up, but baggage not received"></option>
          </datalist>
          <form class="test-create-form" id="test-create-form" data-test-create-form data-create-mode="${escapeHtml(activeMode)}">
            <div data-test-entry-list>${renderTestBagEntry(activeMode, bag, 0)}</div>
            <div class="test-form-actions"><button class="test-submit" type="submit">Submit</button><span class="panel-muted">${escapeHtml(message)}</span></div>
          </form>
        </article>`;
        testOutput.querySelectorAll("[data-test-bag-entry]").forEach((entry) => updateOutboundFields(entry));
      }

      async function searchTestBag(event) {
        event?.preventDefault();
        if (!testOutput || testBagSearchPending) return;
        const bagTag = normalizeTestBagTag(testBagSearchInput?.value);
        if (!isValidTestBagTag(bagTag)) {
          testOutput.innerHTML = `<p class="panel-muted status-fail">Bag tag must match MU123456, B6123456, or 3U515289 format.</p>`;
          return;
        }
        if (testBagSearchInput) testBagSearchInput.value = bagTag;
        testOutput.innerHTML = `<p class="panel-muted">Searching ${escapeHtml(bagTag)}...</p>`;
        const searchButton = testSearchForm?.querySelector('button[type="submit"]');
        testBagSearchPending = true;
        if (searchButton) searchButton.disabled = true;
        try {
          const data = await apiJson(`/test-baggage/${encodeURIComponent(bagTag)}`);
          if (data?.found && data.record) renderTestRecord(data.record);
          else await renderTestAddChoice(bagTag);
        } catch (error) {
          testOutput.innerHTML = `<p class="panel-muted status-fail">${escapeHtml(error?.message || "Baggage lookup failed.")}</p>`;
        } finally {
          testBagSearchPending = false;
          if (searchButton) searchButton.disabled = false;
        }
      }

      function updateOutboundFields(scope) {
        const status = scope?.querySelector("[data-test-outbound-status]")?.value || "";
        const rushMode = status === "Outbound rush";
        const locationField = scope?.querySelector("[data-test-outbound-location]");
        const locationInput = locationField?.querySelector("input");
        const needsLocation = status !== "Not load bags";
        if (locationField) locationField.hidden = !needsLocation;
        if (locationInput) {
          locationInput.disabled = !needsLocation;
          locationInput.required = needsLocation;
          if (!needsLocation) locationInput.value = "";
        }
        scope?.querySelectorAll("[data-test-rush-field]").forEach((field) => { field.hidden = !rushMode; });
        scope?.querySelectorAll("[data-test-rush-field] input").forEach((input) => { input.required = rushMode && input.name !== "worldTracerFileNumber"; });
      }

      function formValue(form, name) {
        return form?.elements?.[name]?.value || form?.querySelector?.(`[name="${name}"]`)?.value || "";
      }

      async function submitTestCreate(form) {
        const mode = form.dataset.createMode === "outbound" ? "outbound" : "inbound";
        const entries = collectCreateEntries(form);
        if (!entries.length) throw new Error("Please add at least one bag.");
        const saved = [];
        for (const entry of entries) {
          const bagTag = normalizeTestBagTag(entry.bagTag);
          if (!isValidTestBagTag(bagTag)) throw new Error("Each bag tag must match MU123456, B6123456, or 3U515289 format.");
          const isRush = mode === "outbound" && entry.status === "Outbound rush";
          const payload = {
            direction: mode,
            bagTag,
            flight: entry.flight,
            date: entry.date,
            bagType: mode === "inbound" ? entry.bagType : "",
            location: entry.location,
            status: mode === "outbound" ? entry.status : "Bag location update",
            comment: mode === "outbound" ? entry.comment : "",
            rushTagNumber: isRush ? entry.rushTagNumber : "",
            rushToWhere: isRush ? entry.rushToWhere : "",
            akeNumber: isRush ? entry.akeNumber : "",
            worldTracerFileNumber: isRush ? entry.worldTracerFileNumber : "",
            submittedBy: currentUserName(),
          };
          const data = await apiJson("/test-baggage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (data?.record) saved.push(data.record);
        }
        if (saved.length) renderTestRecord(saved[saved.length - 1], "", `Saved ${saved.length} bag${saved.length === 1 ? "" : "s"}.`);
      }

      async function submitTestUpdate(form) {
        const bagTag = form.dataset.bagTag;
        const mode = form.dataset.updateMode || "rush";
        if (mode === "exchange") {
          const newTagNumber = normalizeTestBagTag(formValue(form, "newTagNumber"));
          if (!isValidTestBagTag(newTagNumber)) throw new Error("New tag must match MU123456, B6123456, or 3U515289 format.");
          const unresolved = await apiJson('/cbs-unresolved-baggage');
          const onHand = (unresolved?.rows || []).find((row) => !row.resolvedAt && normalizeTestBagTag(row.bagTag) === normalizeTestBagTag(bagTag));
          if (!onHand) throw new Error("This bag does not have an Open On-hand case.");
          await apiJson(`/cbs-unresolved-baggage/${encodeURIComponent(onHand.rowNumber)}/update`, {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body:JSON.stringify({ action:"exchange", newTagNumber, updatedBy:currentUserName() }),
          });
          const baggage = await apiJson(`/test-baggage/${encodeURIComponent(newTagNumber)}`);
          if (baggage?.record) renderTestRecord(baggage.record, "", "Exchange completed.");
          return;
        }
        const payload = {
          type: mode,
          updatedBy: currentUserName(),
          rushTagNumber: formValue(form, "rushTagNumber"),
          rushToWhere: formValue(form, "rushToWhere"),
          akeNumber: formValue(form, "akeNumber"),
          worldTracerFileNumber: formValue(form, "worldTracerFileNumber"),
          comment: formValue(form, "comment"),
          location: formValue(form, "location"),
          trackingNumber: formValue(form, "trackingNumber"),
          shippingFee: formValue(form, "shippingFee"),
        };
        const data = await apiJson(`/test-baggage/${encodeURIComponent(bagTag)}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (data?.record) renderTestRecord(data.record, "", "Updated.");
      }
      testSearchForm?.addEventListener("submit", searchTestBag);
      testBagSearchInput?.addEventListener("input", () => {
        testBagSearchInput.value = normalizeTestBagTag(testBagSearchInput.value);
      });
      testOutput?.addEventListener("click", (event) => {
        const addBagTagButton = event.target.closest("[data-test-add-bag-tag]");
        if (addBagTagButton) {
          const list = addBagTagButton.closest("[data-test-outbound-bag-tags]");
          list.insertAdjacentHTML("beforeend", `<div class="test-bag-tag-row"><label class="test-field"><span>Bag tag number</span><input name="bagTag" maxlength="8" pattern="[A-Z0-9]{2}[0-9]{6}" title="Use MU123456, B6123456, or 3U515289 format" autocomplete="off" required autofocus /></label><button class="test-bag-tag-remove" type="button" data-test-remove-bag-tag aria-label="Remove bag tag">−</button></div>`);
          list.lastElementChild?.querySelector('input[name="bagTag"]')?.focus();
          return;
        }
        const removeBagTagButton = event.target.closest("[data-test-remove-bag-tag]");
        if (removeBagTagButton) {
          removeBagTagButton.closest(".test-bag-tag-row")?.remove();
          return;
        }
        const createModeButton = event.target.closest("[data-test-create-mode]");
        if (createModeButton) {
          if (createModeButton.dataset.testCreateMode === "exchange") {
            openTestExchangeForm(normalizeTestBagTag(testBagSearchInput?.value)).catch((error) => {
              testOutput.innerHTML = `<p class="panel-muted status-fail">${escapeHtml(error?.message || "Open On-hand lookup failed.")}</p>`;
            });
            return;
          }
          const form = testOutput.querySelector("[data-test-create-form]");
          const entries = form ? collectCreateEntries(form) : [{ bagTag: normalizeTestBagTag(testBagSearchInput?.value) }];
          renderTestAddForm(entries[0]?.bagTag || normalizeTestBagTag(testBagSearchInput?.value), createModeButton.dataset.testCreateMode, entries);
          return;
        }
        const backChoiceButton = event.target.closest("[data-test-back-choice]");
        if (backChoiceButton) {
          renderTestAddChoice(normalizeTestBagTag(testBagSearchInput?.value)).catch((error) => {
            testOutput.innerHTML = `<p class="panel-muted status-fail">${escapeHtml(error?.message || "Open On-hand lookup failed.")}</p>`;
          });
          return;
        }
        const closeUpdateButton = event.target.closest("[data-test-close-update]");
        if (closeUpdateButton) {
          const record = testOutput._record;
          if (record) renderTestRecord(record);
          return;
        }
        const showUpdateButton = event.target.closest("[data-test-show-update]");
        if (showUpdateButton) {
          const record = testOutput._record;
          if (record) renderTestRecord(record, "rush");
          return;
        }
        const updateModeButton = event.target.closest("[data-test-update-mode]");
        if (updateModeButton) {
          const form = updateModeButton.closest("[data-test-update-form]");
          const record = testOutput._record;
          if (!form || !record) return;
          renderTestRecord(record, updateModeButton.dataset.testUpdateMode);
        }
      });
      testOutput?.addEventListener("change", (event) => {
        const status = event.target.closest("[data-test-outbound-status]");
        if (status) updateOutboundFields(status.closest("[data-test-bag-entry]"));
      });
      testOutput?.addEventListener("submit", async (event) => {
        const createForm = event.target.closest("[data-test-create-form]");
        const updateForm = event.target.closest("[data-test-update-form]");
        const exchangeForm = event.target.closest("[data-test-exchange-form]");
        if (!createForm && !updateForm && !exchangeForm) return;
        event.preventDefault();
        const form = createForm || updateForm || exchangeForm;
        const statusEl = form.querySelector(".test-form-actions .panel-muted");
        if (statusEl) statusEl.textContent = exchangeForm ? "Exchanging..." : createForm ? "Saving..." : "Updating...";
        try {
          if (exchangeForm) await submitTestExchange(exchangeForm);
          else if (createForm) await submitTestCreate(createForm);
          else await submitTestUpdate(updateForm);
        } catch (error) {
          if (statusEl) statusEl.textContent = error?.message || "Save failed.";
        }
      });


requireServiceLogin();
