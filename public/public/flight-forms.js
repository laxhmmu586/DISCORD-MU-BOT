(() => {
  const copy = window.FlightFormCopy;
  const dialog = document.createElement("dialog");
  dialog.className = "checklist-dialog flight-forms";
  dialog.setAttribute("aria-labelledby", "flight-forms-title");
  dialog.innerHTML = `
    <aside class="cl-sidebar">
      <div class="cl-brand"><span aria-hidden="true">☷</span><strong>Forms</strong></div>
      <p class="cl-section-label">Templates</p>
      <nav aria-label="Form templates"><button type="button" id="briefing-charge-form" hidden>Charge Form</button></nav>
      <p class="cl-sidebar-note">Choose a form to edit, fill in, and print.</p>
    </aside>
    <div class="cl-main">
      <header class="cl-header">
        <div><p class="cl-section-label">Printable templates</p><h2 id="flight-forms-title">Release Form</h2></div>
        <button type="button" data-form-close aria-label="Close Forms">×</button>
      </header>
      <div class="cl-toolbar">
        <button type="button" data-form-edit aria-pressed="false">Edit wording</button>
        <label data-risk-language hidden>Language <select aria-label="Flight Risk language"><option value="zh">中文</option><option value="en">English</option></select></label>
        <label>Paper <select aria-label="Form paper size"><option>A4</option><option>Letter</option></select></label>
        <button type="button" class="cl-primary" data-form-print>Print</button>
      </div>
      <p class="cl-status" role="status"></p>
      <div class="cl-content flight-form-content"><div class="flight-form-preview"></div></div>
    </div>`;
  document.body.append(dialog);

  const nav = dialog.querySelector("nav");
  const content = dialog.querySelector(".flight-form-preview");
  const title = dialog.querySelector("h2");
  const edit = dialog.querySelector("[data-form-edit]");
  const status = dialog.querySelector("[role=status]");
  const riskLanguage = dialog.querySelector("[data-risk-language] select");
  const formAssets = "/assets/flight-forms/";
  const drafts = new Map();
  let context = {};
  let active;

  const field = (label, value = "") =>
    `<label><span data-wording>${label}</span><input aria-label="${label}" value="${value}"></label>`;
  const input = label => `<input aria-label="${label}">`;
  const text = value => `<p data-wording>${value}</p>`;
  const options = (labels, name = "", prefix = "") => labels.map(label =>
    `<label class="flight-form-option"><input type="${name ? "radio" : "checkbox"}" name="${name}" aria-label="${prefix}${label}"><span data-wording>${label}</span></label>`).join("");
  const releaseFlight = `<div class="release-flight"><span data-wording>FLIGHT No. / DATE</span>
    <div>${input("Flight No.")}<span aria-hidden="true">/</span>${input("Flight date")}</div></div>`;
  const checklistFields = (...items) => `<div class="flight-form-checklist-fields">${items.join("")}</div>`;
  const fields = (...items) => `<div class="flight-form-fields">${items.join("")}</div>`;
  const table = (headers, rows) => `<table><thead><tr>${headers.map(name =>
    `<th scope="col" data-wording>${name}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  const header = (heading, subtitle = "", detail = "") => `<header><img src="/has/assets/charge-form/china-eastern-logo.png" alt="China Eastern Airlines"><h1 data-wording>${heading}</h1>${subtitle ? text(subtitle) : ""}${detail ? `<div class="flight-form-header-detail">${detail}</div>` : ""}</header>`;

  const printCards = (kind, count, card) =>
    `<div class="flight-print-cards ${kind}">${Array.from({length: count}, () => `<section>${card}</section>`).join("")}</div>`;
  const arrivalCard = `
    <img src="${formAssets}arrival-qr.png" alt="Arrival Card QR code">
    <div><strong>Arrival Card</strong><p lang="zh">根据中国边防规定<br>落地前务必完成填写</p><p>Per China Immigration regulations, complete the form before arrival.</p></div>`;
  const loungeCard = `
    <h2 lang="zh">头等舱贵宾室指引</h2><strong>First Class Lounge</strong>
    <p lang="zh">过完安检 → 过桥 → 左手边电梯上 5 楼</p>
    <p>Pass TSA, cross the bridge, then take the elevator on the left to the 5th floor.</p>
    <p lang="zh">出电梯后在您的右前方</p>
    <p>After exiting the elevator, it will be ahead to your right.</p>`;
  const riskPages = `<div class="flight-risk-pages">
    <img data-risk-page="zh" src="${formAssets}flight-risk-zh.png" alt="乘机风险确认书">
    <img data-risk-page="en" src="${formAssets}flight-risk-en.png" alt="Flight Risk Acknowledgement Form" hidden>
  </div>`;

  const templates = [
    ["Release Form", () => `
      ${header("Waiver of Claim Against China Eastern Airlines", "Release and Waiver Form")}
      ${checklistFields(releaseFlight, field("Passenger name"), field("BN"), field("Seat No."))}
      <section class="waiver-section"><h2 data-wording>Declaration</h2>${text(copy.declaration)}</section>
      <section class="waiver-section"><h2 data-wording>Applicable Conditions</h2>${options(copy.conditions)}
      <div class="flight-form-option"><input type="checkbox" aria-label="Meal condition applies"><span><span data-wording>I acknowledge and agree that no</span> ${input("Meal")} <span data-wording>meal will be served for this flight.</span></span></div>
      <div class="flight-form-option"><input type="checkbox" aria-label="Other condition applies">${field("Other conditions")}</div></section>
      <section class="waiver-section waiver-signature"><h2 data-wording>Acknowledgement and Signature</h2>${fields(field("Signed by passenger"), field("Date"))}</section>`],
    ["Under 21", () => `
      ${header("不符合休息室入场条件旅客告知书", "Notice to Passengers Ineligible for Lounge Access", field("BN #"))}
      ${text("尊敬的旅客：\nDear Passenger:")}${copy.loungeIntro.map(text).join("")}
      ${options(["人民币200元东航电子代金券 / CNY 200 China Eastern E-voucher", "东航2000积分补偿 / 2000 China Eastern Miles"], "lounge-compensation")}
      <h2 data-wording>接收补偿会员信息 | Compensation Recipient Membership Information</h2>
      ${fields(field("东航会员卡号 / China Eastern Membership #"), field("会员姓名 / Name"))}
      ${copy.loungeNotes.map(text).join("")}
      ${fields(field("旅客签名 / Signature"), field("证件号码 / Passport #"), field("客票号 / Ticket #"), field("联系电话 / Phone #"))}
      ${text("*员工免优票不适用")}`],
    ["Gate Bag", () => `
      ${header("特殊服务交接单（GATE BAG）", "SPECIAL SERVICE INFORMATION LIST")}
      ${checklistFields(field("Route", "LAX PVG"), field("Flight No.", "MU586"), field("Date"))}
      ${table(["Tag number", "Seat number", "Description", "Pickup"], Array.from({length: 7}, (_, i) =>
        `<tr><td>${input("Tag number " + (i + 1))}</td><td>${input("Seat number " + (i + 1))}</td><td>${options(["STRL 婴儿推车", "CARSEAT 安全座椅", "Wheelchair 轮椅", "WALKER 步行器/拐杖", "Guitar 乐器"], "", `Bag ${i + 1} · `)}</td><td data-wording>飞机旁提取行李</td></tr>`))}`],
    ["STANDBY LIST", () => `
      ${header("STANDBY PAX LIST", "", field("Date"))}
      ${table(["#", "Name", "Ticket number", "Class", "Time", "Remarks"], Array.from({length: 15}, (_, i) =>
        `<tr><th scope="row">${i + 1}</th>${["Name", "Ticket number", "Class", "Time", "Remarks"].map(label =>
          `<td>${input(`${label} ${i + 1}`)}</td>`).join("")}</tr>`))}`],
    ["Flight Risk Acknowledgement", () => riskPages, {printOnly: true, bilingual: true}],
    ["INAD", () => `
      ${header("被拒绝入境旅客告知书", "Notice to Inadmissible Passenger")}
      ${checklistFields(field("旅客 / Passenger"), field("航班号 / Flight No."), field("返回日期 / Return date"))}
      ${text("我司将安排您乘坐上述航班返回中国，现收取以下钱款或机票，作为您乘坐本次航班的费用。如您暂时无法提供钱款或机票，我公司将保留要求您支付乘机费用的权利。")}
      ${text("China Eastern Airlines (MU) will arrange your return flight to China on the flight shown above. The following payment or ticket is collected to cover your flight. If you are temporarily unable to provide payment or a ticket, China Eastern Airlines reserves the right to seek reimbursement for the flight expenses.")}
      <section class="waiver-section"><h2 data-wording>钱款或机票 / Payment or ticket</h2>
        ${options(["钱款 / Payment"])}
        ${fields(field("金额 / Amount"), field("币种 / Currency"))}
        ${options(["机票 / Ticket"])}
        ${fields(field("机票票号 / Ticket number"), field("原航班号及日期 / Original flight no. and date"), field("航段 / Route"))}
        ${options(["无钱款、无机票 / Unable to provide payment or ticket"])}
      </section>
      ${fields(field("旅客签名 / Signature"), field("日期 / Date"))}`],
    ["Arrival Card", () => printCards("arrival-cards", 14, arrivalCard), {printOnly: true}],
    ["First Class Lounge", () => printCards("lounge-cards", 18, loungeCard), {printOnly: true}]
  ];

  const wordingKey = index => `mufc-form-wording:v1:${window.firebase?.auth().currentUser?.uid || "local"}:${templates[index][0]}`;

  function select(index) {
    active = index;
    const [name, render, settings = {}] = templates[index];
    edit.hidden = Boolean(settings.printOnly);
    riskLanguage.closest("label").hidden = !settings.bilingual;
    title.textContent = name;
    if (!drafts.has(index)) {
      const sheet = document.createElement("article");
      sheet.className = "flight-form-sheet";
      sheet.dataset.template = index;
      sheet.innerHTML = render();
      try {
        const wording = JSON.parse(localStorage.getItem(wordingKey(index)));
        const nodes = [...sheet.querySelectorAll("[data-wording]")];
        if (Array.isArray(wording) && index === 0 && wording.length === nodes.length + 1) {
          wording.splice(2, 2, "FLIGHT No. / DATE");
        }
        if (Array.isArray(wording) && index === 2 && wording.length === nodes.length - 1) {
          wording.splice(3, 1, "Flight No.", "Date");
        }
        if (Array.isArray(wording) && wording.length === nodes.length) {
          nodes.forEach((node, i) => { if (typeof wording[i] === "string" && node.textContent.replaceAll("\n", " ") !== wording[i] && wording[i] !== "尊敬的旅客： / Dear Passenger:") node.textContent = wording[i]; });
        }
      } catch {
        // The original wording is available when browser storage is unavailable.
      }
      drafts.set(index, sheet);
    }
    content.replaceChildren(drafts.get(index));
    updateRiskLanguage();
    content.parentElement.scrollTop = 0;
    status.textContent = "";
    for (const button of nav.querySelectorAll("[data-form-index]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.formIndex) === index));
    }
    setEditing(false);
  }

  function updateRiskLanguage() {
    for (const page of content.querySelectorAll("[data-risk-page]")) {
      page.hidden = page.dataset.riskPage !== riskLanguage.value;
    }
  }
  riskLanguage.onchange = updateRiskLanguage;

  function setEditing(enabled) {
    edit.setAttribute("aria-pressed", String(enabled));
    edit.textContent = enabled ? "Save wording" : "Edit wording";
    for (const node of content.querySelectorAll("[data-wording]")) {
      if (enabled) node.contentEditable = "plaintext-only";
      else node.removeAttribute("contenteditable");
    }
  }

  for (const [index, [name]] of templates.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.formIndex = index;
    button.textContent = name;
    button.onclick = () => select(index);
    nav.append(button);
  }

  const formButtons = [...nav.querySelectorAll("button")];
  const formKey = button => button.id || templates[Number(button.dataset.formIndex)][0];
  const orderKey = () => `mufc-form-order:v1:${window.firebase?.auth().currentUser?.uid || "local"}`;
  let draggedForm = null;

  function saveFormOrder() {
    try {
      localStorage.setItem(orderKey(), JSON.stringify([...nav.querySelectorAll("button")].map(formKey)));
    } catch {
      // Keep the current order when browser storage is unavailable.
    }
  }

  function restoreFormOrder() {
    let order = [];
    try {
      const saved = JSON.parse(localStorage.getItem(orderKey()));
      if (Array.isArray(saved)) order = saved;
    } catch {
      // Use the default order if the saved preference cannot be read.
    }
    const buttons = new Map(formButtons.map(button => [formKey(button), button]));
    const ordered = order.map(name => buttons.get(name)).filter(Boolean);
    nav.append(...new Set([...ordered, ...formButtons]));
  }

  function clearDropMarker() {
    nav.querySelector("[data-drop-side]")?.removeAttribute("data-drop-side");
  }

  for (const button of formButtons) {
    button.draggable = true;
    button.title = "Drag to reorder, or use Alt + Up / Down";
    button.addEventListener("keydown", event => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const visible = [...nav.querySelectorAll("button:not([hidden])")];
      const forward = event.key === "ArrowDown";
      const neighbor = visible[visible.indexOf(button) + (forward ? 1 : -1)];
      if (!neighbor) return;
      if (forward) neighbor.after(button);
      else neighbor.before(button);
      saveFormOrder();
      button.focus();
    });
  }

  nav.addEventListener("dragstart", event => {
    draggedForm = event.target.closest("button");
    if (!draggedForm) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedForm.textContent);
  });
  nav.addEventListener("dragover", event => {
    clearDropMarker();
    const target = event.target.closest("button");
    if (!draggedForm || !target || target === draggedForm) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = target.getBoundingClientRect();
    target.dataset.dropSide = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  });
  nav.addEventListener("drop", event => {
    const target = event.target.closest("button[data-drop-side]");
    if (!draggedForm || !target) return;
    event.preventDefault();
    if (target.dataset.dropSide === "before") target.before(draggedForm);
    else target.after(draggedForm);
    clearDropMarker();
    saveFormOrder();
  });
  nav.addEventListener("dragend", () => {
    draggedForm = null;
    clearDropMarker();
  });

  window.setFlightFormsContext = sy => {
    const next = {
      flightNo: /^[A-Z]{2}\d{1,4}$/.test(sy?.flightNo) ? sy.flightNo : "",
      flightDate: /^\d{2}[A-Z]{3}\d{2}$/.test(sy?.flightDate) ? sy.flightDate : ""
    };
    if (next.flightNo === context.flightNo && next.flightDate === context.flightDate) return;
    context = next;
    drafts.clear();
    if (dialog.open) select(0);
    const detail = {ready: Boolean(context.flightNo && context.flightDate), direction: "departure", flight: context.flightNo, date: context.flightDate};
    window.briefingToolContext = detail;
    window.dispatchEvent(new CustomEvent("briefing-direction", {detail}));
  };

  for (const opener of document.querySelectorAll("[data-open-flight-forms]")) {
    opener.onclick = () => {
      if (dialog.open) return;
      restoreFormOrder();
      select(active ?? 0);
      dialog.showModal();
    };
  }
  dialog.querySelector("[data-form-close]").onclick = () => dialog.close();
  edit.onclick = () => {
    const editing = edit.getAttribute("aria-pressed") === "true";
    setEditing(!editing);
    if (!editing) {
      status.textContent = "Click the outlined text to edit it.";
      content.querySelector("[data-wording]").focus();
      return;
    }
    try {
      const wording = [...content.querySelectorAll("[data-wording]")].map(node => node.innerText);
      localStorage.setItem(wordingKey(active), JSON.stringify(wording));
      status.textContent = "Wording saved in this browser.";
    } catch {
      status.textContent = "Wording updated for this session.";
    }
  };

  dialog.querySelector("[data-form-print]").onclick = () => {
    const original = content.firstElementChild;
    const sheet = original.cloneNode(true);
    const inputs = [...original.querySelectorAll("input")];
    sheet.querySelectorAll("input").forEach((input, index) => {
      const source = inputs[index];
      const output = document.createElement("span");
      const check = source.type === "checkbox" || source.type === "radio";
      output.className = check ? "flight-print-check" : "flight-print-value";
      output.textContent = check ? (source.checked ? "☑" : "☐") : source.value;
      input.replaceWith(output);
    });
    sheet.querySelectorAll("[contenteditable]").forEach(node => node.removeAttribute("contenteditable"));
    const frame = document.createElement("iframe");
    frame.className = "flight-print-frame";
    frame.title = "Print " + title.textContent;
    const paper = dialog.querySelector("[aria-label=\"Form paper size\"]").value === "Letter" ? "Letter" : "A4";
    const orientation = active === 3 ? "landscape" : "portrait";
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title.textContent}</title><link rel="stylesheet" href="/flight-forms.css?v=telex-square"><style>@page{size:${paper} ${orientation};margin:10mm}</style></head><body class="flight-form-print-document ${paper.toLowerCase()}">${sheet.outerHTML}</body></html>`;
    frame.onload = async () => {
      try {
        await Promise.all([...frame.contentDocument.images].filter(img => !img.hidden).map(img => img.decode()));
        await frame.contentDocument.fonts.ready;
        frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {once: true});
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        frame.remove();
        status.textContent = "Print preview could not open. Please retry.";
      }
    };
    document.body.append(frame);
  };
})();
