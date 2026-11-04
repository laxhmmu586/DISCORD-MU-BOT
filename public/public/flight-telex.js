(() => {
  const panel = document.querySelector("#flight-telex");
  const items = panel.querySelector("[data-telex-items]");
  const services = ["VIP", "INAD", "INCP", "WCHR", "WCHC", "AVIH", "PTEC", "UM"];
  const separate = new Set(["VIP", "INAD", "INCP"]);
  const recipients = "PVGKIMU, PVGKDMU, PVGTJMU";
  const status = panel.querySelector("[data-telex-status]");
  let scope;
  let revision = 0;
  let saving = false;
  let loaded = false;
  let nextRead = 0;
  let renderKey = "";
  let checked = new Set();

  function today() {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles", day: "2-digit", month: "short", year: "2-digit"
    }).format(new Date()).replace(/\s/g, "").toUpperCase();
  }

  function showChecks() {
    const inputs = [...items.querySelectorAll("input")];
    panel.classList.toggle("is-complete", loaded && !saving && inputs.length > 0 && inputs.every(input => checked.has(input.value)));
    for (const input of inputs) {
      input.checked = checked.has(input.value);
      input.disabled = !loaded || saving;
    }
  }

  window.refreshFlightTelex = async eventData => {
    if (!scope || panel.hidden || saving) return;
    if (eventData) {
      const event = JSON.parse(eventData);
      if (event.flightNo !== scope.flightNo || event.flightDate !== scope.flightDate) return;
    }
    const run = ++revision;
    nextRead = Date.now() + 15000;
    try {
      const data = await peopleApi("/flight-telex?" + new URLSearchParams({flightNo: scope.flightNo, flightDate: scope.flightDate}));
      if (run !== revision) return;
      checked = new Set(data.checked);
      loaded = true;
      status.textContent = "";
    } catch {
      if (run !== revision) return;
      status.textContent = "Unable to sync Telex checks.";
    }
    showChecks();
  };

  window.renderFlightTelex = (sy, uid) => {
    const key = uid && sy?.flightNo && sy?.flightDate ? `${uid}:${sy.flightNo}:${sy.flightDate}` : "";
    const previousKey = scope?.key;
    if (key !== previousKey) {
      ++revision;
      scope = key ? {key, flightNo: sy.flightNo, flightDate: sy.flightDate} : undefined;
      checked = new Set();
      saving = loaded = false;
      nextRead = 0;
      status.textContent = "";
    }
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
    if (signature === renderKey) {
      if (Date.now() >= nextRead) window.refreshFlightTelex();
      return;
    }
    renderKey = signature;
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
      confirmation.className = "telex-done";
      confirmation.textContent = "Done";
      text.append(name, instruction);
      const control = document.createElement("span");
      control.className = "telex-control";
      control.append(input, confirmation);
      label.append(text, control);
      return label;
    }));
    showChecks();
    window.refreshFlightTelex();
  };

  items.addEventListener("change", async event => {
    const input = event.target;
    if (!scope || !loaded || saving || input.type !== "checkbox") return;
    const sent = input.checked;
    const run = ++revision;
    const previous = new Set(checked);
    if (sent) checked.add(input.value);
    else checked.delete(input.value);
    saving = true;
    showChecks();
    try {
      const data = await peopleApi("/flight-telex", {
        flightNo: scope.flightNo, flightDate: scope.flightDate, service: input.value, sent
      });
      if (run !== revision) return;
      checked = new Set(data.checked);
      status.textContent = "";
    } catch {
      if (run !== revision) return;
      checked = previous;
      status.textContent = "Telex check could not be saved. Try again.";
    } finally {
      if (run === revision) {
        saving = false;
        showChecks();
      }
    }
  });
})();
