
"use strict";

(() => {
  const store = window.privateNotebookStorage;
  const $ = id => document.getElementById(id);
  const ENTRY_TYPES = ["income", "expense", "purchase", "payment", "debt", "reserve", "loss"];
  const LABELS = {
    income: "Ingreso / venta",
    expense: "Gasto",
    purchase: "Compra",
    payment: "Pago realizado",
    debt: "Deuda anotada",
    reserve: "Dinero reservado",
    loss: "Pérdida"
  };
  let activeNotebookId = null;
  let editingEntryId = null;
  let entriesCache = [];
  let remindersCache = [];

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function money(value) {
    return new Intl.NumberFormat("es-US", {
      style: "currency",
      currency: "USD"
    }).format(Number(value) || 0);
  }

  function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function message(text, isError = false) {
    const el = $("message");
    if (!el) {
      if (isError) console.error(text);
      return;
    }
    el.textContent = text;
    el.className = isError ? "message error" : "message";
    el.hidden = false;
  }

  function element(tag, text, className = "") {
    const el = document.createElement(tag);
    el.textContent = text == null ? "" : String(text);
    if (className) el.className = className;
    return el;
  }

  function addOption(select, value, text) {
    if (!select) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }

  function on(id, eventName, callback) {
    const el = $(id);
    if (el) el.addEventListener(eventName, callback);
    return el;
  }

  function monthOf(date) {
    return String(date || "").slice(0, 7);
  }

  function yearOf(date) {
    return String(date || "").slice(0, 4);
  }

  function calculate(items) {
    const result = {
      income: 0,
      cashIncome: 0,
      cardIncome: 0,
      otherIncome: 0,
      purchases: 0,
      expenses: 0,
      payments: 0,
      losses: 0,
      outflow: 0,
      reserves: 0,
      debts: 0,
      net: 0
    };

    for (const item of items) {
      const amount = Number(item.amount) || 0;
      switch (item.type) {
        case "income":
          result.income += amount;
          if (item.method === "cash") result.cashIncome += amount;
          else if (item.method === "card") result.cardIncome += amount;
          else result.otherIncome += amount;
          break;
        case "purchase":
          result.purchases += amount;
          result.outflow += amount;
          break;
        case "expense":
          result.expenses += amount;
          result.outflow += amount;
          break;
        case "payment":
          result.payments += amount;
          result.outflow += amount;
          break;
        case "loss":
          result.losses += amount;
          result.outflow += amount;
          break;
        case "reserve":
          result.reserves += amount;
          break;
        case "debt":
          result.debts += amount;
          break;
      }
    }

    result.net = result.income - result.outflow;
    for (const key of Object.keys(result)) {
      result[key] = roundMoney(result[key]);
    }
    return result;
  }

  function card(title, value, detail = "") {
    const box = element("article", "", "summary-card");
    box.append(element("span", title, "summary-label"));
    box.append(element("strong", value, "summary-value"));
    if (detail) box.append(element("small", detail));
    return box;
  }

  function renderTodayTotal() {
    const totalElement = $("todayMoneyTotal");
    if (!totalElement) return;

    // La cifra principal representa ingresos/ventas anotados hoy.
    // No incluye deudas ni reservas y no usa cifras ficticias.
    const date = today();
    const total = roundMoney(
      entriesCache
        .filter(entry => entry.date === date && entry.type === "income")
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
    );
    totalElement.textContent = money(total);
    totalElement.setAttribute("aria-live", "polite");
  }

  function renderHomeStatus() {
    const status = $("homeStatus");
    if (!status) return;

    const pending = remindersCache.filter(item => !item.done);
    const overdue = pending.filter(item => item.dueDate < today());
    const dueToday = pending.filter(item => item.dueDate === today());

    if (overdue.length) {
      status.textContent = overdue.length === 1
        ? "Tienes un recordatorio pendiente de días anteriores."
        : `Tienes ${overdue.length} recordatorios pendientes de días anteriores.`;
    } else if (dueToday.length) {
      status.textContent = dueToday.length === 1
        ? "Tienes un recordatorio para hoy."
        : `Tienes ${dueToday.length} recordatorios para hoy.`;
    } else if (pending.length) {
      status.textContent = "Tus recordatorios están organizados.";
    } else {
      status.textContent = "Todo tranquilo por ahora";
    }

    const detail = $("homeStatusDetail");
    if (detail) {
      detail.textContent = overdue.length
        ? "Revisa los pendientes y marca los que hayas completado."
        : dueToday.length
          ? "Puedes revisar tus pendientes en Mis recordatorios."
          : pending.length
            ? "Aquí aparecerán avisos importantes cuando los necesites."
            : "Aquí aparecerán tus avisos importantes cuando los necesites.";
    }
  }

  function renderSummary() {
    const monthSelect = $("summaryMonth");
    const yearSelect = $("summaryYear");
    const month = (monthSelect && monthSelect.value) || today().slice(0, 7);
    const year = (yearSelect && yearSelect.value) || today().slice(0, 4);
    const monthly = calculate(entriesCache.filter(e => monthOf(e.date) === month));
    const annual = calculate(entriesCache.filter(e => yearOf(e.date) === String(year)));
    const monthBox = $("summaryCards");
    const yearBox = $("yearSummary");

    if (monthBox) {
      monthBox.replaceChildren(
        card("Ingresos del mes", money(monthly.income)),
        card("Salidas registradas", money(monthly.outflow),
          "Compras, gastos, pagos y pérdidas anotadas"),
        card("Diferencia registrada", money(monthly.net),
          "Ingresos menos salidas anotadas"),
        card("Ventas en efectivo", money(monthly.cashIncome)),
        card("Ventas con tarjeta", money(monthly.cardIncome)),
        card("Otros ingresos", money(monthly.otherIncome)),
        card("Dinero reservado", money(monthly.reserves),
          "Se muestra aparte; no se resta automáticamente"),
        card("Deudas anotadas", money(monthly.debts),
          "No significa que se hayan cobrado o pagado")
      );
    }

    if (yearBox) {
      yearBox.replaceChildren(
        card("Ingresos del año", money(annual.income)),
        card("Salidas del año", money(annual.outflow)),
        card("Diferencia del año", money(annual.net)),
        card("Compras del año", money(annual.purchases)),
        card("Gastos del año", money(annual.expenses)),
        card("Pagos anotados", money(annual.payments)),
        card("Pérdidas anotadas", money(annual.losses)),
        card("Dinero reservado", money(annual.reserves))
      );
    }

    const disclaimer = $("summaryDisclaimer");
    if (disclaimer) {
      disclaimer.textContent =
        `Resumen de ${month} y ${year}. Refleja únicamente las anotaciones ` +
        "conservadas en esta libreta. No verifica que estén completas y no " +
        "es una declaración fiscal ni un informe contable certificado.";
    }
  }

  function renderEntries() {
    const list = $("entriesList");
    if (!list) return;
    list.replaceChildren();

    if (!entriesCache.length) {
      list.append(element("p", "Todavía no hay anotaciones en esta libreta."));
      return;
    }

    for (const entry of entriesCache.slice(0, 100)) {
      const row = element("article", "", "entry-row");
      const info = element("div", "", "entry-info");
      info.append(element("strong", LABELS[entry.type] || "Movimiento"));
      info.append(element("span",
        `${entry.date} · ${entry.category || "Sin categoría"}`));

      const method = {
        cash: "Efectivo",
        card: "Tarjeta",
        transfer: "Transferencia",
        other: "Otro método"
      }[entry.method] || "Otro método";

      info.append(element("small", method));
      if (entry.note) info.append(element("p", entry.note));

      const amount = element("strong", money(entry.amount), "entry-amount");
      const actions = element("div", "", "entry-actions");

      const edit = element("button", "Corregir", "secondary");
      edit.type = "button";
      edit.addEventListener("click", () => fillEntry(entry));

      const remove = element("button", "Borrar", "danger");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm("¿Quieres borrar esta anotación definitivamente?")) return;
        try {
          await store.deleteEntry(entry.id);
          await refresh();
          message("Anotación borrada. Los resúmenes se actualizaron.");
        } catch (error) {
          message(error.message || "No se pudo borrar la anotación.", true);
        }
      });

      actions.append(edit, remove);
      row.append(info, amount, actions);
      list.append(row);
    }

    if (entriesCache.length > 100) {
      list.append(element("p",
        "Se muestran las 100 anotaciones más recientes. La exportación incluye todos los registros de esta libreta."));
    }
  }

  function fillEntry(entry) {
    editingEntryId = entry.id;
    if ($("entryType")) $("entryType").value = entry.type;
    if ($("entryAmount")) $("entryAmount").value = entry.amount;
    if ($("entryDate")) $("entryDate").value = entry.date;
    if ($("entryCategory")) $("entryCategory").value = entry.category || "";
    if ($("entryMethod")) $("entryMethod").value = entry.method || "other";
    if ($("entryNote")) $("entryNote").value = entry.note || "";
    if ($("saveEntry")) $("saveEntry").textContent = "Guardar corrección";
    if ($("cancelEdit")) $("cancelEdit").hidden = false;
    if ($("entryFormTitle")) $("entryFormTitle").textContent = "Corregir anotación";
    if ($("entryForm")) $("entryForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetEntryForm() {
    const form = $("entryForm");
    if (form) form.reset();
    if ($("entryDate")) $("entryDate").value = today();
    if ($("entryType")) $("entryType").value = "income";
    if ($("entryMethod")) $("entryMethod").value = "cash";
    if ($("saveEntry")) $("saveEntry").textContent = "Guardar anotación";
    if ($("cancelEdit")) $("cancelEdit").hidden = true;
    if ($("entryFormTitle")) $("entryFormTitle").textContent = "Anotar dinero";
    editingEntryId = null;
  }

  async function renderNotebookSelector() {
    const notebooks = await store.ensureDefaultNotebook();
    if (!notebooks.length) throw new Error("No hay ninguna libreta disponible.");

    const selectedId = await store.activeNotebookId();
    activeNotebookId = notebooks.some(n => n.id === selectedId)
      ? selectedId : notebooks[0].id;

    await store.setActiveNotebook(activeNotebookId);
    const select = $("notebookSelect");
    if (select) {
      select.replaceChildren();
      notebooks.forEach(n => addOption(select, n.id, n.name));
      select.value = activeNotebookId;
    }

    const name = notebooks.find(n => n.id === activeNotebookId)?.name || "Mi negocio";
    if ($("activeNotebookName")) $("activeNotebookName").textContent = name;
    const subtitle = $("homeNotebookName");
    if (subtitle) subtitle.textContent = name;
  }

  async function renderReminders() {
    remindersCache = await store.reminders(activeNotebookId);
    const list = $("remindersList");
    if (!list) {
      renderHomeStatus();
      return;
    }
    list.replaceChildren();

    if (!remindersCache.length) {
      list.append(element("p", "No tienes recordatorios anotados."));
      renderHomeStatus();
      return;
    }

    for (const reminder of remindersCache) {
      const row = element("article", "",
        "reminder-row" + (reminder.done ? " completed" : ""));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(reminder.done);
      checkbox.setAttribute("aria-label", "Marcar pendiente como completado");

      checkbox.addEventListener("change", async () => {
        try {
          await store.saveReminder({ ...reminder, done: checkbox.checked });
          await renderReminders();
          message("Recordatorio actualizado.");
        } catch (error) {
          message(error.message || "No se pudo actualizar el recordatorio.", true);
        }
      });

      const info = element("div", "", "reminder-info");
      info.append(element("strong", reminder.title));
      info.append(element("span", `Fecha: ${reminder.dueDate}`));
      if (reminder.note) info.append(element("small", reminder.note));

      const remove = element("button", "Borrar", "danger");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm("¿Borrar este recordatorio?")) return;
        try {
          await store.deleteReminder(reminder.id);
          await renderReminders();
          message("Recordatorio borrado.");
        } catch (error) {
          message(error.message || "No se pudo borrar el recordatorio.", true);
        }
      });

      row.append(checkbox, info, remove);
      list.append(row);
    }

    renderHomeStatus();
  }

  async function refresh() {
    await renderNotebookSelector();
    entriesCache = await store.entries(activeNotebookId);
    renderEntries();
    renderSummary();
    renderTodayTotal();
    await renderReminders();
    renderHomeStatus();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportBackup() {
    const data = await store.backupData();
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `libreta-privada-copia-${today()}.json`
    );
    message("Copia preparada. Guárdala en un lugar seguro.");
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function exportCSV() {
    const header = ["Fecha", "Tipo", "Cantidad USD", "Método", "Categoría", "Nota"];
    const rows = entriesCache.map(e => [
      e.date, LABELS[e.type] || e.type, e.amount, e.method, e.category, e.note
    ]);
    const csv = "\uFEFF" + [header, ...rows]
      .map(row => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `libreta-privada-registros-${today()}.csv`);
    message("CSV preparado con los registros de esta libreta.");
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function openPrintWindow(title, body) {
    const win = window.open("", "_blank");
    if (!win) {
      message("El navegador bloqueó la ventana. Permite abrir la impresión para continuar.", true);
      return;
    }

    win.document.open();
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${escapeHTML(title)}</title><style>
      body{font:14px Arial,sans-serif;margin:28px;color:#222}
      h1,h2{color:#17324d}table{border-collapse:collapse;width:100%;margin:16px 0}
      td,th{border:1px solid #ccc;padding:7px;text-align:left;overflow-wrap:anywhere}
      .note{font-size:12px;color:#444;margin-top:20px}
      </style></head><body>${body}</body></html>`);
    win.document.close();
    win.onload = () => win.print();
  }

  function printSummary() {
    const month = ($("summaryMonth") && $("summaryMonth").value) || today().slice(0, 7);
    const year = ($("summaryYear") && $("summaryYear").value) || today().slice(0, 4);
    const monthly = calculate(entriesCache.filter(e => monthOf(e.date) === month));
    const annual = calculate(entriesCache.filter(e => yearOf(e.date) === String(year)));

    const rows = (names, data) => Object.entries(data).map(([key, value]) =>
      `<tr><td>${escapeHTML(names[key] || key)}</td><td>${escapeHTML(money(value))}</td></tr>`
    ).join("");

    const names = {
      income: "Ingresos anotados",
      outflow: "Salidas anotadas",
      net: "Diferencia registrada",
      cashIncome: "Ventas en efectivo",
      cardIncome: "Ventas con tarjeta",
      otherIncome: "Otros ingresos",
      purchases: "Compras",
      expenses: "Gastos",
      payments: "Pagos anotados",
      losses: "Pérdidas anotadas",
      reserves: "Dinero reservado",
      debts: "Deudas anotadas"
    };

    const notebookName = $("activeNotebookName")?.textContent || "Mi negocio";
    const body = `<h1>LIBRETA PRIVADA</h1>
      <p>${escapeHTML(notebookName)}</p>
      <h2>Resumen mensual: ${escapeHTML(month)}</h2>
      <table><thead><tr><th>Concepto</th><th>Cantidad</th></tr></thead>
      <tbody>${rows(names, monthly)}</tbody></table>
      <h2>Resumen anual: ${escapeHTML(year)}</h2>
      <table><thead><tr><th>Concepto</th><th>Cantidad</th></tr></thead>
      <tbody>${rows(names, annual)}</tbody></table>
      <p class="note">Este documento refleja las anotaciones conservadas en la libreta.
      No certifica que estén completas ni constituye una auditoría, declaración fiscal,
      asesoramiento profesional o informe contable certificado. Revisa las cantidades
      antes de compartir el documento.</p>`;
    openPrintWindow("Resumen de libreta privada", body);
  }

  function printAllRecords() {
    const rows = entriesCache.map(e =>
      `<tr><td>${escapeHTML(e.date)}</td><td>${escapeHTML(LABELS[e.type] || e.type)}</td>` +
      `<td>${escapeHTML(money(e.amount))}</td><td>${escapeHTML(e.category)}</td>` +
      `<td>${escapeHTML(e.method)}</td><td>${escapeHTML(e.note)}</td></tr>`
    ).join("");

    const notebookName = $("activeNotebookName")?.textContent || "Mi negocio";
    const body = `<h1>LIBRETA PRIVADA</h1>
      <p>${escapeHTML(notebookName)}</p>
      <p>Registros incluidos: ${entriesCache.length}</p>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th>
      <th>Categoría</th><th>Método</th><th>Nota</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="note">Solo se incluyen los registros de esta libreta. Este documento
      no es una auditoría ni un informe certificado.</p>`;
    openPrintWindow("Registros de libreta privada", body);
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!window.confirm(
        "Restaurar esta copia reemplazará todos los datos actuales de esta aplicación " +
        "en este navegador. Crea primero una copia de los datos actuales. ¿Continuar?"
      )) return;

      await store.restoreData(data);
      resetEntryForm();
      await refresh();
      message("Copia restaurada. Revisa los registros.");
    } catch (error) {
      message(error.message || "No se pudo restaurar la copia.", true);
    } finally {
      if ($("importFile")) $("importFile").value = "";
    }
  }

  function showDialog(id) {
    const dialog = $(id);
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
  }

  function hideDialog(id) {
    const dialog = $(id);
    if (dialog && typeof dialog.close === "function" && dialog.open) dialog.close();
  }

  function navigateTo(targetId, entryType) {
    const fallbacks = {
      accountsSection: ["summarySection", "summaryCards", "summaryMonth"],
      remindersSection: ["reminderSection", "reminderForm", "remindersList"],
      entrySection: ["entrySection", "entryForm"]
    };
    let target = $(targetId);

    if (!target && fallbacks[targetId]) {
      for (const id of fallbacks[targetId]) {
        target = $(id);
        if (target) break;
      }
    }

    if (entryType && ENTRY_TYPES.includes(entryType)) {
      if ($("entryType")) $("entryType").value = entryType;
      if ($("entryFormTitle")) {
        $("entryFormTitle").textContent = entryType === "income"
          ? "Anotar dinero"
          : entryType === "expense"
            ? "Anotar gastos"
            : LABELS[entryType] || "Anotar movimiento";
      }
    }

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (target.matches("input,select,textarea")) {
        target.focus({ preventScroll: true });
      } else if (targetId === "entrySection" && $("entryAmount")) {
        $("entryAmount").focus({ preventScroll: true });
      }
    } else {
      message("No se encontró esa sección. Revisa los identificadores de index.html.", true);
    }
  }

  function bindHomeActions() {
    document.querySelectorAll("[data-go]").forEach(button => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-go");
        const entryType = button.getAttribute("data-entry-type");
        navigateTo(targetId, entryType);
      });
    });

    // Accesos alternativos por ID, por si las tarjetas no usan data-go.
    const directActions = [
      ["goIncome", "entrySection", "income"],
      ["goExpense", "entrySection", "expense"],
      ["goAccounts", "accountsSection", null],
      ["goReminders", "remindersSection", null]
    ];

    for (const [id, target, type] of directActions) {
      on(id, "click", () => navigateTo(target, type));
    }
  }

  async function init() {
    if (!store) throw new Error("No se pudo cargar el almacenamiento local.");

    if ($("entryDate")) $("entryDate").value = today();
    if ($("reminderDate")) $("reminderDate").value = today();
    if ($("summaryMonth")) $("summaryMonth").value = today().slice(0, 7);
    if ($("summaryYear")) $("summaryYear").value = Number(today().slice(0, 4));

    await store.ensureDefaultNotebook();
    await refresh();
    bindHomeActions();

    on("entryForm", "submit", async event => {
      event.preventDefault();
      try {
        await store.saveEntry({
          id: editingEntryId || undefined,
          notebookId: activeNotebookId,
          type: $("entryType").value,
          amount: $("entryAmount").value,
          date: $("entryDate").value,
          category: $("entryCategory").value,
          method: $("entryMethod").value,
          note: $("entryNote").value
        });
        resetEntryForm();
        await refresh();
        message("Anotación guardada en este dispositivo.");
      } catch (error) {
        message(error.message || "No se pudo guardar la anotación.", true);
      }
    });

    on("cancelEdit", "click", resetEntryForm);

    on("notebookSelect", "change", async event => {
      try {
        await store.setActiveNotebook(event.target.value);
        activeNotebookId = event.target.value;
        resetEntryForm();
        await refresh();
      } catch (error) {
        message(error.message || "No se pudo cambiar de libreta.", true);
      }
    });

    on("newNotebook", "click", async () => {
      const name = window.prompt("¿Cómo quieres llamar a la nueva libreta?");
      if (name === null) return;
      try {
        await store.createNotebook(name);
        resetEntryForm();
        await refresh();
        message("Nueva libreta creada.");
      } catch (error) {
        message(error.message || "No se pudo crear la libreta.", true);
      }
    });

    on("renameNotebook", "click", async () => {
      const name = window.prompt("Nuevo nombre de la libreta:",
        $("activeNotebookName")?.textContent || "Mi negocio");
      if (name === null) return;
      try {
        await store.renameNotebook(activeNotebookId, name);
        await refresh();
        message("Nombre actualizado.");
      } catch (error) {
        message(error.message || "No se pudo cambiar el nombre.", true);
      }
    });

    on("deleteNotebook", "click", async () => {
      if (!window.confirm(
        "Se borrarán esta libreta, sus anotaciones y sus recordatorios. " +
        "Esta acción no se puede deshacer. ¿Continuar?"
      )) return;
      try {
        await store.deleteNotebook(activeNotebookId);
        resetEntryForm();
        await refresh();
        message("Libreta borrada.");
      } catch (error) {
        message(error.message || "No se pudo borrar la libreta.", true);
      }
    });

    on("reminderForm", "submit", async event => {
      event.preventDefault();
      try {
        await store.saveReminder({
          notebookId: activeNotebookId,
          title: $("reminderTitle").value,
          dueDate: $("reminderDate").value,
          note: $("reminderNote").value,
          done: false
        });
        $("reminderForm").reset();
        if ($("reminderDate")) $("reminderDate").value = today();
        await renderReminders();
        message("Recordatorio guardado en este dispositivo.");
      } catch (error) {
        message(error.message || "No se pudo guardar el recordatorio.", true);
      }
    });

    on("summaryMonth", "change", renderSummary);
    on("summaryYear", "input", renderSummary);

    on("exportBackup", "click", () =>
      exportBackup().catch(error => message(error.message || "No se pudo crear la copia.", true)));

    on("exportCSV", "click", exportCSV);
    on("printSummary", "click", printSummary);
    on("printAllRecords", "click", printAllRecords);

    on("importFile", "change", event =>
      importBackup(event.target.files && event.target.files[0]));

    on("openLegal", "click", () => showDialog("legalDialog"));
    on("closeLegal", "click", () => hideDialog("legalDialog"));
    on("openPrivacy", "click", () => showDialog("privacyDialog"));
    on("closePrivacy", "click", () => hideDialog("privacyDialog"));

    on("helpToggle", "click", () => {
      const help = $("quickHelp");
      if (!help) return;
      help.hidden = !help.hidden;
      $("helpToggle").setAttribute("aria-expanded", String(!help.hidden));
    });

    on("eraseAll", "click", async () => {
      const confirmation = window.prompt(
        "Se borrarán todas las libretas, anotaciones y recordatorios de esta aplicación " +
        "en este navegador. Escribe BORRAR TODO para confirmar."
      );
      if (confirmation !== "BORRAR TODO") {
        message("No se borró nada.");
        return;
      }
      try {
        await store.eraseEverything();
        resetEntryForm();
        await refresh();
        message("Se borraron los datos locales de esta aplicación.");
      } catch (error) {
        message(error.message || "No se pudieron borrar los datos.", true);
      }
    });

    if ($("appLoading")) $("appLoading").hidden = true;
    if ($("appContent")) $("appContent").hidden = false;
  }

  init().catch(error => {
    if ($("appLoading")) {
      $("appLoading").textContent =
        "No se pudo abrir la libreta. No borres los datos del navegador. " +
        (error.message || "");
    }
    message(error.message || "Error al iniciar la aplicación.", true);
    console.error("Error al iniciar LIBRETA PRIVADA:", error);
  });
})();
