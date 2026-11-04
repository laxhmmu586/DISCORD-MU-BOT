(() => {
  const panel = document.querySelector("#flight-telex");
  const items = panel.querySelector("[data-telex-items]");
  const services = ["VIP", "INAD", "INCP", "WCHR", "WCHC", "AVIH", "PTEC", "UM"];
  const separate = new Set(["VIP", "INAD", "INCP"]);
  const recipients = "PVGKIMU, PVGKDMU, PVGTJMU";
  let storageKey = "";
  let renderKey = "";
  let checked = new Set();

  function today() {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles", day: "2-digit", month: "short", year: "2-digit"
    }).format(new Date()).replace(/\s/g, "").toUpperCase();
  }

  function showChecks() {
    for (const input of items.querySelectorAll("input")) input.checked = checked.has(input.value);
  }

  function restoreChecks() {
    try {
      checked = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
    } catch {
      // Keep confirmations for the current page when storage is unavailable.
    }
    showChecks();
  }

  window.renderFlightTelex = (sy, uid) => {
    const key = uid && sy?.flightNo && sy?.flightDate
      ? `mufc-telex:${uid}:${sy.flightNo}:${sy.flightDate}` : "";
    const found = new Set();
    if (key && sy.permissions?.canViewSpecialService !== false) {
      for (const list of [sy.seatMapRecords, sy.bnAudit, sy.wchList, sy.psmList]) {
        for (const row of list || []) {
          if (row.isOffloaded || row.passengerRecord?.isOffloaded) continue;
          const record = row.passengerRecord || {};
          const values = [row.code, row.codes, row.specialServices, row.psmLines,
            record.codes, record.specialServices].flat().filter(Boolean).join(" ").toUpperCase();
          for (const code of values.match(/\b(?:VIP|INAD|INCP|WCHR|WCHC|AVIH|PTEC|PETC|UM\d{0,2})\b/g) || []) {
            found.add(code === "PETC" ? "PTEC" : code.replace(/^UM\d+$/, "UM"));
          }
        }
      }
    }
    const detected = services.filter(code => found.has(code));
    if (key && sy.flightNo === "MU586" && sy.flightDate === today() && (sy.hasOutboundRush || sy.bagSheet?.rushBags?.hasData)) {
      detected.push("RUSH BAG");
    }

    const signature = JSON.stringify([key, detected]);
    if (signature === renderKey) return;
    renderKey = signature;
    if (key !== storageKey) {
      storageKey = key;
      checked = new Set();
      restoreChecks();
    }
    panel.hidden = detected.length === 0;
    items.replaceChildren(...detected.map(code => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = code;
      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = code;
      const instruction = document.createElement("small");
      instruction.textContent = separate.has(code) ? `Send a separate Telex to ${recipients}` : "Send Telex";
      const confirmation = document.createElement("span");
      confirmation.textContent = "Telex sent";
      text.append(name, instruction);
      label.append(input, text, confirmation);
      return label;
    }));
    showChecks();
  };

  items.addEventListener("change", event => {
    const input = event.target;
    if (!storageKey || input.type !== "checkbox") return;
    const sent = input.checked;
    restoreChecks();
    if (sent) checked.add(input.value);
    else checked.delete(input.value);
    input.checked = sent;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
    } catch {
      // The checklist still works for the current page if storage is unavailable.
    }
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey) restoreChecks();
  });
})();
