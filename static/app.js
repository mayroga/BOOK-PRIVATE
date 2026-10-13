
"use strict";

(() => {
const $ = id => document.getElementById(id);
const storage = window.privateNotebookStorage;
const TYPES = {
  income: "Ingreso / venta",
  expense: "Gasto",
  purchase: "Compra",
  payment: "Pago realizado",
  debt: "Deuda anotada",
  reserve: "Dinero reservado",
  loss: "Pérdida"
};
const METHODS = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro método"
};
const OUTGOING = new Set(["expense", "purchase", "payment", "loss"]);
const INCOME = new Set(["income"]);
const state = {
  notebooks: [],
  notebookId: null,
  entries: [],
  reminders: [],
  editingEntryId: null,
  busy: false
};
const $all = selector => [...document.querySelectorAll(selector)];
const has = id => !!$(id);
const on = (id, event, callback) => {
  const el = $(id);
  if (el) el.addEventListener(event, callback);
};
const localDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const money = value => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value) || 0);
const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const cents = value => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const fmtDate = value => {
  if (!value) return "Sin fecha";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};
const announce = (message, kind = "info") => {
  const el = $("message");
  if (!el) return;
  el.textContent = message || "";
  el.className = "form-message";
  if (kind === "error") {
    el.style.background = "#fff0f0";
    el.style.color = "#a83e43";
  } else if (kind === "success") {
    el.style.background = "#eef8f1";
    el.style.color = "#19764b";
  } else {
    el.style.background = "";
    el.style.color = "";
  }
};
const notify = (message, kind = "info") => {
  announce(message, kind);
  if (!has("message")) window.alert(message);
};
const confirmAction = message => window.confirm(message);
const setBusy = value => {
  state.busy = value;
  $all("button[type='submit']").forEach(el => {
    if (value) {
      el.dataset.wasDisabled = el.disabled ? "1" : "0";
      el.disabled = true;
    } else {
      el.disabled = el.dataset.wasDisabled === "1";
      delete el.dataset.wasDisabled;
    }
  });
};
const safeRun = async (callback, errorMessage = "No se pudo completar la operación.") => {
  if (state.busy) return;
  setBusy(true);
  try {
    return await callback();
  } catch (error) {
    console.error(error);
    notify(`${errorMessage}${error?.message ? " " + error.message : ""}`, "error");
  } finally {
    setBusy(false);
  }
};
const storageReady = () => {
  if (!storage) throw new Error("No se encontró privateNotebookStorage. Comprueba que /static/storage.js se carga antes de /static/app.js.");
};
const entryId = item => item?.id ?? item?.entryId ?? item?.key ?? null;
const notebookId = item => item?.id ?? item?.notebookId ?? item?.key ?? null;
const reminderId = item => item?.id ?? item?.reminderId ?? item?.key ?? null;
const entryDate = item => String(item?.date || item?.createdAt || "").slice(0, 10);
const entryType = item => TYPES[item?.type] ? item.type : "expense";
const methodLabel = item => METHODS[item?.method] || item?.method || "Otro método";
const notebookName = item => item?.name || item?.title || "Mi libreta";
const sortEntries = items => [...items].sort((a, b) =>
  entryDate(b).localeCompare(entryDate(a)) ||
  String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
);
const activeNotebook = () => state.notebooks.find(n => String(notebookId(n)) === String(state.notebookId));
const sum = (items, predicate) => cents(items.reduce((total, item) =>
  total + (predicate(item) ? num(item.amount) : 0), 0));
const calculate = items => {
  const income = sum(items, item => INCOME.has(entryType(item)));
  const expenses = sum(items, item => OUTGOING.has(entryType(item)));
  const purchases = sum(items, item => entryType(item) === "purchase");
  const regularExpenses = sum(items, item => entryType(item) === "expense");
  const payments = sum(items, item => entryType(item) === "payment");
  const losses = sum(items, item => entryType(item) === "loss");
  const reserves = sum(items, item => entryType(item) === "reserve");
  const debts = sum(items, item => entryType(item) === "debt");
  const cashIncome = sum(items, item => entryType(item) === "income" && item.method === "cash");
  const cardIncome = sum(items, item => entryType(item) === "income" && item.method === "card");
  const otherIncome = sum(items, item => entryType(item) === "income" && !["cash", "card"].includes(item.method));
  return {
    income, expenses, purchases, regularExpenses, payments, losses,
    reserves, debts, cashIncome, cardIncome, otherIncome,
    difference: cents(income - expenses)
  };
};
const statCard = (label, value, note = "") => `
  <div class="stat">
    <span class="stat-label">${esc(label)}</span>
    <span class="stat-value">${esc(money(value))}</span>
    ${note ? `<span class="stat-note">${esc(note)}</span>` : ""}
  </div>`;
const renderTodayTotal = () => {
  const el = $("todayMoneyTotal");
  if (!el) return;
  const today = localDate();
  el.textContent = money(sum(state.entries, item =>
    INCOME.has(entryType(item)) && entryDate(item) === today
  ));
};
const renderHome = () => {
  const name = notebookName(activeNotebook() || {});
  if ($("homeNotebookName")) $("homeNotebookName").textContent = name;
  if ($("activeNotebookName")) $("activeNotebookName").textContent = name;
  renderTodayTotal();
  renderHomeStatus();
};
const reminderDone = item => Boolean(item?.completed ?? item?.done ?? item?.isDone);
const reminderDate = item => String(item?.date || "").slice(0, 10);
const renderHomeStatus = () => {
  const open = state.reminders.filter(item => !reminderDone(item));
  const overdue = open.filter(item => reminderDate(item) && reminderDate(item) < localDate());
  const today = open.filter(item => reminderDate(item) === localDate());
  const title = $("homeStatus");
  const detail = $("homeStatusDetail");
  if (!title || !detail) return;
  if (overdue.length) {
    title.textContent = overdue.length === 1 ? "Tienes un pendiente atrasado" : `Tienes ${overdue.length} pendientes atrasados`;
    detail.textContent = "Revisa tus recordatorios y actualiza las fechas que necesites.";
  } else if (today.length) {
    title.textContent = today.length === 1 ? "Tienes un pendiente para hoy" : `Tienes ${today.length} pendientes para hoy`;
    detail.textContent = "Consulta tus recordatorios para ver qué necesitas hacer.";
  } else if (open.length) {
    title.textContent = "Tus recordatorios están organizados";
    detail.textContent = `${open.length} pendiente${open.length === 1 ? "" : "s"} por completar.`;
  } else {
    title.textContent = "Todo tranquilo por ahora";
    detail.textContent = "Aquí aparecerán tus avisos importantes cuando los necesites.";
  }
};
const renderNotebooks = () => {
  const select = $("notebookSelect");
  if (!select) return;
  const previous = state.notebookId;
  select.replaceChildren();
  state.notebooks.forEach(item => {
    const id = notebookId(item);
    if (id == null) return;
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = notebookName(item);
    select.appendChild(option);
  });
  if (previous != null && state.notebooks.some(item => String(notebookId(item)) === String(previous))) {
    select.value = String(previous);
  } else if (select.options.length) {
    select.selectedIndex = 0;
    state.notebookId = select.value;
  }
  if ($("homeNotebookName")) $("homeNotebookName").textContent = notebookName(activeNotebook() || {});
  if ($("activeNotebookName")) $("activeNotebookName").textContent = notebookName(activeNotebook() || {});
};
const renderSummaries = () => {
  const month = $("summaryMonth")?.value || localDate().slice(0, 7);
  const year = Number($("summaryYear")?.value) || Number(localDate().slice(0, 4));
  const monthly = state.entries.filter(item => entryDate(item).slice(0, 7) === month);
  const yearly = state.entries.filter(item => entryDate(item).slice(0, 4) === String(year));
  const m = calculate(monthly);
  const y = calculate(yearly);
  const monthCards = $("summaryCards");
  if (monthCards) {
    monthCards.innerHTML = [
      statCard("Ingresos del mes", m.income),
      statCard("Salidas registradas", m.expenses, "Compras, gastos, pagos y pérdidas anotadas"),
      statCard("Diferencia registrada", m.difference, "Ingresos menos salidas anotadas"),
      statCard("Ventas en efectivo", m.cashIncome),
      statCard("Ventas con tarjeta", m.cardIncome),
      statCard("Otros ingresos", m.otherIncome),
      statCard("Dinero reservado", m.reserves, "Se muestra aparte; no se resta automáticamente"),
      statCard("Deudas anotadas", m.debts, "No significa que se hayan cobrado o pagado")
    ].join("");
  }
  const yearCards = $("yearSummary");
  if (yearCards) {
    yearCards.innerHTML = [
      statCard("Ingresos del año", y.income),
      statCard("Salidas del año", y.expenses),
      statCard("Diferencia del año", y.difference),
      statCard("Compras del año", y.purchases),
      statCard("Gastos del año", y.regularExpenses),
      statCard("Pagos anotados", y.payments),
      statCard("Pérdidas anotadas", y.losses),
      statCard("Dinero reservado", y.reserves)
    ].join("");
  }
  if ($("summaryDisclaimer")) {
    $("summaryDisclaimer").textContent = `Resumen de ${month} y ${year}. Refleja únicamente las anotaciones conservadas en esta libreta. No verifica que estén completas y no es una declaración fiscal ni un informe contable certificado.`;
  }
};
const renderEntries = () => {
  const container = $("entriesList");
  if (!container) return;
  const items = sortEntries(state.entries);
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Todavía no hay anotaciones en esta libreta.</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const id = entryId(item);
    const type = entryType(item);
    const title = TYPES[type];
    const category = item.category ? ` · ${esc(item.category)}` : " · Sin categoría";
    const note = item.note ? `<div class="entry-meta">${esc(item.note)}</div>` : "";
    return `<article class="entry-item" data-entry-id="${esc(id)}">
      <div class="entry-top">
        <div>
          <div class="entry-name">${esc(title)}</div>
          <div class="entry-meta">${esc(fmtDate(entryDate(item)))}${category} · ${esc(methodLabel(item))}</div>
          ${note}
        </div>
        <div class="entry-amount">${esc(money(item.amount))}</div>
      </div>
      <div class="entry-actions">
        <button class="btn btn-secondary btn-small" type="button" data-entry-edit="${esc(id)}">Corregir</button>
        <button class="btn btn-danger btn-small" type="button" data-entry-delete="${esc(id)}">Borrar</button>
      </div>
    </article>`;
  }).join("");
};
const renderReminders = () => {
  const container = $("remindersList");
  if (!container) return;
  const items = [...state.reminders].sort((a, b) =>
    Number(reminderDone(a)) - Number(reminderDone(b)) ||
    reminderDate(a).localeCompare(reminderDate(b))
  );
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No tienes recordatorios anotados.</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const id = reminderId(item);
    const done = reminderDone(item);
    const title = item.title || item.name || "Recordatorio";
    const note = item.note || item.detail || "";
    const date = reminderDate(item);
    const detail = [date ? fmtDate(date) : "", note].filter(Boolean).join(" · ");
    return `<article class="reminder-item" data-reminder-id="${esc(id)}">
      <input type="checkbox" data-reminder-toggle="${esc(id)}" aria-label="Marcar como completado: ${esc(title)}" ${done ? "checked" : ""}>
      <div class="reminder-content">
        <div class="reminder-title ${done ? "reminder-done" : ""}">${esc(title)}</div>
        ${detail ? `<div class="reminder-detail">${esc(detail)}</div>` : ""}
        <div class="entry-actions">
          <button class="btn btn-danger btn-small" type="button" data-reminder-delete="${esc(id)}">Borrar</button>
        </div>
      </div>
    </article>`;
  }).join("");
};
const renderAll = () => {
  renderNotebooks();
  renderHome();
  renderSummaries();
  renderEntries();
  renderReminders();
};
const reloadData = async () => {
  storageReady();
  const [notebooks, activeId] = await Promise.all([
    storage.all("notebooks"),
    storage.activeNotebookId()
  ]);
  state.notebooks = Array.isArray(notebooks) ? notebooks : [];
  state.notebookId = activeId ?? state.notebookId;
  if (state.notebookId == null || !state.notebooks.some(item => String(notebookId(item)) === String(state.notebookId))) {
    state.notebookId = notebookId(state.notebooks[0]) ?? null;
    if (state.notebookId != null) await storage.setActiveNotebook(state.notebookId);
  }
  if (state.notebookId == null) {
    await storage.ensureDefaultNotebook();
    const fresh = await storage.all("notebooks");
    state.notebooks = Array.isArray(fresh) ? fresh : [];
    state.notebookId = await storage.activeNotebookId();
  }
  const [entries, reminders] = await Promise.all([
    storage.entries(state.notebookId),
    storage.reminders(state.notebookId)
  ]);
  state.entries = Array.isArray(entries) ? entries : [];
  state.reminders = Array.isArray(reminders) ? reminders : [];
  renderAll();
};
const setEntryType = type => {
  const select = $("entryType");
  if (select && TYPES[type]) select.value = type;
  if (type === "income") {
    if ($("entrySectionTitle")) $("entrySectionTitle").textContent = "Anotar dinero";
    if ($("entryFormTitle")) $("entryFormTitle").textContent = state.editingEntryId ? "Corregir anotación" : "Anotar un ingreso o una venta";
  } else if (type === "expense") {
    if ($("entrySectionTitle")) $("entrySectionTitle").textContent = "Anotar gastos";
    if ($("entryFormTitle")) $("entryFormTitle").textContent = state.editingEntryId ? "Corregir anotación" : "Anotar un gasto";
  } else {
    if ($("entrySectionTitle")) $("entrySectionTitle").textContent = "Anotar un movimiento";
    if ($("entryFormTitle")) $("entryFormTitle").textContent = state.editingEntryId ? "Corregir anotación" : "Anotar un movimiento";
  }
};
const resetEntryForm = () => {
  const form = $("entryForm");
  if (form) form.reset();
  state.editingEntryId = null;
  if ($("entryDate")) $("entryDate").value = localDate();
  if ($("entryType")) $("entryType").value = "income";
  if ($("entryMethod")) $("entryMethod").value = "cash";
  if ($("saveEntry")) $("saveEntry").textContent = "Guardar anotación";
  if ($("cancelEdit")) $("cancelEdit").hidden = true;
  setEntryType("income");
};
const startEditEntry = id => {
  const item = state.entries.find(entry => String(entryId(entry)) === String(id));
  if (!item) return notify("No se encontró esa anotación.", "error");
  state.editingEntryId = entryId(item);
  if ($("entryType")) $("entryType").value = entryType(item);
  if ($("entryAmount")) $("entryAmount").value = num(item.amount).toFixed(2);
  if ($("entryDate")) $("entryDate").value = entryDate(item);
  if ($("entryCategory")) $("entryCategory").value = item.category || "";
  if ($("entryMethod")) $("entryMethod").value = item.method || "cash";
  if ($("entryNote")) $("entryNote").value = item.note || "";
  if ($("saveEntry")) $("saveEntry").textContent = "Guardar cambios";
  if ($("cancelEdit")) $("cancelEdit").hidden = false;
  setEntryType(entryType(item));
  $("entrySection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("entryAmount")?.focus({ preventScroll: true });
};
const saveEntry = async event => {
  event.preventDefault();
  const amount = Number($("entryAmount")?.value);
  const date = $("entryDate")?.value || localDate();
  const type = $("entryType")?.value || "income";
  if (!Number.isFinite(amount) || amount <= 0) return notify("Introduce una cantidad mayor que cero.", "error");
  if (!TYPES[type]) return notify("Selecciona un tipo de movimiento válido.", "error");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return notify("Selecciona una fecha válida.", "error");
  const record = {
    ...(state.editingEntryId != null ? { id: state.editingEntryId } : {}),
    notebookId: state.notebookId,
    type,
    amount: cents(amount),
    date,
    category: $("entryCategory")?.value.trim() || "",
    method: $("entryMethod")?.value || "other",
    note: $("entryNote")?.value.trim() || "",
    updatedAt: new Date().toISOString()
  };
  await safeRun(async () => {
    await storage.saveEntry(record);
    await reloadData();
    resetEntryForm();
    notify(state.editingEntryId == null ? "Anotación guardada." : "Anotación actualizada.", "success");
  }, "No se pudo guardar la anotación.");
};
const deleteEntry = async id => {
  const item = state.entries.find(entry => String(entryId(entry)) === String(id));
  if (!item) return notify("No se encontró esa anotación.", "error");
  if (!confirmAction(`¿Borrar la anotación "${TYPES[entryType(item)]}" por ${money(item.amount)}? Esta acción no se puede deshacer.`)) return;
  await safeRun(async () => {
    await storage.deleteEntry(id);
    if (String(state.editingEntryId) === String(id)) resetEntryForm();
    await reloadData();
    notify("Anotación borrada.", "success");
  }, "No se pudo borrar la anotación.");
};
const createNotebook = async () => {
  const name = window.prompt("Nombre de la nueva libreta:");
  if (name == null) return;
  const clean = name.trim();
  if (!clean) return notify("Escribe un nombre para la libreta.", "error");
  if (clean.length > 80) return notify("El nombre no puede superar 80 caracteres.", "error");
  await safeRun(async () => {
    await storage.createNotebook(clean);
    const all = await storage.all("notebooks");
    state.notebooks = Array.isArray(all) ? all : [];
    const found = state.notebooks.find(item => notebookName(item) === clean);
    if (found) {
      state.notebookId = notebookId(found);
      await storage.setActiveNotebook(state.notebookId);
    }
    await reloadData();
    notify("Libreta creada.", "success");
  }, "No se pudo crear la libreta.");
};
const renameNotebook = async () => {
  const notebook = activeNotebook();
  if (!notebook) return notify("No hay una libreta seleccionada.", "error");
  const name = window.prompt("Nuevo nombre para la libreta:", notebookName(notebook));
  if (name == null) return;
  const clean = name.trim();
  if (!clean) return notify("El nombre no puede estar vacío.", "error");
  if (clean.length > 80) return notify("El nombre no puede superar 80 caracteres.", "error");
  await safeRun(async () => {
    await storage.renameNotebook(state.notebookId, clean);
    await reloadData();
    notify("Nombre actualizado.", "success");
  }, "No se pudo cambiar el nombre.");
};
const deleteNotebook = async () => {
  const notebook = activeNotebook();
  if (!notebook) return notify("No hay una libreta seleccionada.", "error");
  if (state.notebooks.length <= 1) {
    return notify("Debe quedar al menos una libreta. Puedes borrar sus anotaciones individualmente o usar la opción de borrar todos los datos locales.", "error");
  }
  if (!confirmAction(`¿Borrar la libreta "${notebookName(notebook)}" y sus movimientos y recordatorios? Esta acción no se puede deshacer.`)) return;
  await safeRun(async () => {
    await storage.deleteNotebook(state.notebookId);
    await reloadData();
    notify("Libreta borrada.", "success");
  }, "No se pudo borrar la libreta.");
};
const addReminder = async event => {
  event.preventDefault();
  const title = $("reminderTitle")?.value.trim() || "";
  if (!title) return notify("Escribe qué necesitas recordar.", "error");
  const record = {
    notebookId: state.notebookId,
    title,
    date: $("reminderDate")?.value || "",
    note: $("reminderNote")?.value.trim() || "",
    completed: false,
    createdAt: new Date().toISOString()
  };
  await safeRun(async () => {
    await storage.saveReminder(record);
    $("reminderForm")?.reset();
    await reloadData();
    notify("Recordatorio guardado.", "success");
  }, "No se pudo guardar el recordatorio.");
};
const toggleReminder = async (id, completed) => {
  const item = state.reminders.find(reminder => String(reminderId(reminder)) === String(id));
  if (!item) return notify("No se encontró ese recordatorio.", "error");
  const updated = {
    ...item,
    completed: Boolean(completed),
    updatedAt: new Date().toISOString()
  };
  await safeRun(async () => {
    await storage.saveReminder(updated);
    await reloadData();
  }, "No se pudo actualizar el recordatorio.");
};
const deleteReminder = async id => {
  const item = state.reminders.find(reminder => String(reminderId(reminder)) === String(id));
  if (!item) return notify("No se encontró ese recordatorio.", "error");
  if (!confirmAction(`¿Borrar el recordatorio "${item.title || item.name || "Recordatorio"}"?`)) return;
  await safeRun(async () => {
    await storage.deleteReminder(id);
    await reloadData();
    notify("Recordatorio borrado.", "success");
  }, "No se pudo borrar el recordatorio.");
};
const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const exportCSV = () => {
  if (!state.entries.length) return notify("No hay anotaciones para exportar.", "info");
  const rows = [
    ["Fecha", "Tipo", "Cantidad USD", "Método", "Categoría", "Nota"],
    ...sortEntries(state.entries).map(item => [
      entryDate(item), TYPES[entryType(item)], cents(item.amount).toFixed(2),
      methodLabel(item), item.category || "", item.note || ""
    ])
  ];
  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `libreta-privada-${localDate()}.csv`);
  notify("Archivo CSV preparado.", "success");
};
const exportBackup = async () => {
  await safeRun(async () => {
    const data = await storage.backupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `libreta-privada-copia-${localDate()}.json`);
    notify("Copia de seguridad preparada. Guárdala en un lugar protegido.", "success");
  }, "No se pudo crear la copia de seguridad.");
};
const importBackup = async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera el límite de 20 MB.");
    const text = await file.text();
    const data = JSON.parse(text);
    if (!confirmAction("Restaurar esta copia reemplazará los datos actuales de la aplicación en este navegador. ¿Ya guardaste una copia de los datos actuales y deseas continuar?")) {
      event.target.value = "";
      return;
    }
    await safeRun(async () => {
      await storage.restoreData(data);
      state.editingEntryId = null;
      await reloadData();
      resetEntryForm();
      notify("Copia restaurada.", "success");
    }, "No se pudo restaurar la copia.");
  } catch (error) {
    console.error(error);
    notify(`No se pudo leer el archivo de copia. ${error.message || "Comprueba que sea un JSON válido."}`, "error");
  } finally {
    event.target.value = "";
  }
};
const eraseAll = async () => {
  if (!confirmAction("¿Borrar todas las libretas, anotaciones y recordatorios guardados por esta aplicación en este navegador? Esta acción no se puede deshacer.")) return;
  if (!confirmAction("Última confirmación: asegúrate de tener una copia de seguridad si quieres conservar tus datos. ¿Borrar todo?")) return;
  await safeRun(async () => {
    await storage.eraseEverything();
    state.editingEntryId = null;
    await reloadData();
    resetEntryForm();
    notify("Se han borrado los datos locales de la aplicación.", "success");
  }, "No se pudieron borrar los datos locales.");
};
const printDocument = (title, content) => {
  const win = window.open("", "_blank");
  if (!win) return notify("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para esta aplicación e inténtalo de nuevo.", "error");
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#203047;margin:28px;line-height:1.5}h1{font-size:23px}h2{font-size:17px;margin-top:25px}p{font-size:12px;color:#58677a}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px;font-size:12px;overflow-wrap:anywhere}th{background:#f0f4f8}.amount{text-align:right;white-space:nowrap}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.box{border:1px solid #ddd;padding:12px;border-radius:8px}.box strong{display:block;margin-top:5px;font-size:18px}@media print{body{margin:12mm}}</style></head><body>${content}<p>LIBRETA PRIVADA · MAY ROGA LLC</p><script>window.addEventListener("load",()=>window.print())<\/script></body></html>`;
  win.document.open();
  win.document.write(doc);
  win.document.close();
};
const printSummary = () => {
  const month = $("summaryMonth")?.value || localDate().slice(0, 7);
  const year = Number($("summaryYear")?.value) || Number(localDate().slice(0, 4));
  const monthly = calculate(state.entries.filter(item => entryDate(item).slice(0, 7) === month));
  const yearly = calculate(state.entries.filter(item => entryDate(item).slice(0, 4) === String(year)));
  const cards = (title, values) => `<h2>${esc(title)}</h2><div class="summary">${values.map(([label, value]) => `<div class="box">${esc(label)}<strong>${esc(money(value))}</strong></div>`).join("")}</div>`;
  printDocument("Resumen de cuentas", `<h1>Resumen de tus cuentas</h1><p>Libreta: ${esc(notebookName(activeNotebook() || {}))}</p>${cards(`Resumen mensual · ${month}`, [["Ingresos", monthly.income], ["Salidas", monthly.expenses], ["Diferencia", monthly.difference], ["Reservas", monthly.reserves], ["Deudas anotadas", monthly.debts]])}${cards(`Resumen anual · ${year}`, [["Ingresos", yearly.income], ["Salidas", yearly.expenses], ["Diferencia", yearly.difference], ["Compras", yearly.purchases], ["Gastos", yearly.regularExpenses], ["Pagos", yearly.payments], ["Pérdidas", yearly.losses], ["Reservas", yearly.reserves]])}<p>Los resultados reflejan únicamente las anotaciones registradas. No constituyen un informe contable certificado ni una declaración fiscal.</p>`);
};
const printAllRecords = () => {
  const rows = sortEntries(state.entries).map(item => `<tr><td>${esc(fmtDate(entryDate(item)))}</td><td>${esc(TYPES[entryType(item)])}</td><td>${esc(item.category || "")}</td><td>${esc(methodLabel(item))}</td><td>${esc(item.note || "")}</td><td class="amount">${esc(money(item.amount))}</td></tr>`).join("");
  printDocument("Mis anotaciones", `<h1>Mis anotaciones</h1><p>Libreta: ${esc(notebookName(activeNotebook() || {}))}</p><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Método</th><th>Nota</th><th class="amount">Cantidad</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No hay anotaciones.</td></tr>'}</tbody></table><p>Estos registros reflejan las anotaciones conservadas en la libreta.</p>`);
};
const navigateTo = (target, type) => {
  if (type) setEntryType(type);
  const el = $(target);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (target === "entrySection") setTimeout(() => $("entryAmount")?.focus({ preventScroll: true }), 250);
  }
};
const bindHomeActions = () => {
  $all("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.go, button.dataset.entryType));
  });
};
const bindEntryActions = () => {
  on("entryForm", "submit", saveEntry);
  on("cancelEdit", "click", resetEntryForm);
  on("entryType", "change", event => setEntryType(event.target.value));
  on("entriesList", "click", event => {
    const edit = event.target.closest("[data-entry-edit]");
    const del = event.target.closest("[data-entry-delete]");
    if (edit) startEditEntry(edit.dataset.entryEdit);
    if (del) deleteEntry(del.dataset.entryDelete);
  });
};
const bindNotebookActions = () => {
  on("notebookSelect", "change", async event => {
    const id = event.target.value;
    if (!id) return;
    await safeRun(async () => {
      state.notebookId = id;
      await storage.setActiveNotebook(id);
      state.editingEntryId = null;
      await reloadData();
      resetEntryForm();
    }, "No se pudo cambiar de libreta.");
  });
  on("newNotebook", "click", createNotebook);
  on("renameNotebook", "click", renameNotebook);
  on("deleteNotebook", "click", deleteNotebook);
};
const bindReminderActions = () => {
  on("reminderForm", "submit", addReminder);
  on("remindersList", "change", event => {
    const checkbox = event.target.closest("[data-reminder-toggle]");
    if (checkbox) toggleReminder(checkbox.dataset.reminderToggle, checkbox.checked);
  });
  on("remindersList", "click", event => {
    const button = event.target.closest("[data-reminder-delete]");
    if (button) deleteReminder(button.dataset.reminderDelete);
  });
};
const bindBackupActions = () => {
  on("exportBackup", "click", exportBackup);
  on("exportCSV", "click", exportCSV);
  on("importFile", "change", importBackup);
  on("eraseAll", "click", eraseAll);
};
const bindPrintActions = () => {
  on("printSummary", "click", printSummary);
  on("printAllRecords", "click", printAllRecords);
};
const bindDialogs = () => {
  const open = (dialogId, buttonId) => on(buttonId, "click", () => {
    const dialog = $(dialogId);
    if (dialog && !dialog.open) dialog.showModal();
  });
  const close = (dialogId, buttonId) => on(buttonId, "click", () => {
    const dialog = $(dialogId);
    if (dialog?.open) dialog.close();
  });
  open("legalDialog", "openLegal");
  open("privacyDialog", "openPrivacy");
  close("legalDialog", "closeLegal");
  close("legalDialog", "legalDone");
  close("privacyDialog", "closePrivacy");
  close("privacyDialog", "privacyDone");
  ["legalDialog", "privacyDialog"].forEach(id => {
    const dialog = $(id);
    if (dialog) dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });
};
const bindHelp = () => {
  on("helpToggle", "click", () => {
    const help = $("quickHelp");
    const button = $("helpToggle");
    if (!help || !button) return;
    help.hidden = !help.hidden;
    button.setAttribute("aria-expanded", String(!help.hidden));
    button.textContent = help.hidden ? "Ayuda" : "Cerrar ayuda";
    if (!help.hidden) help.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
};
const bindFilters = () => {
  on("summaryMonth", "change", renderSummaries);
  on("summaryYear", "change", renderSummaries);
};
const init = async () => {
  storageReady();
  if ($("appLoading")) $("appLoading").hidden = false;
  if ($("appContent")) $("appContent").setAttribute("aria-busy", "true");
  bindHomeActions();
  bindEntryActions();
  bindNotebookActions();
  bindReminderActions();
  bindBackupActions();
  bindPrintActions();
  bindDialogs();
  bindHelp();
  bindFilters();
  if ($("entryDate") && !$("entryDate").value) $("entryDate").value = localDate();
  if ($("summaryMonth") && !$("summaryMonth").value) $("summaryMonth").value = localDate().slice(0, 7);
  if ($("summaryYear") && !$("summaryYear").value) $("summaryYear").value = String(new Date().getFullYear());
  await storage.ensureDefaultNotebook();
  await reloadData();
  if ($("appLoading")) $("appLoading").hidden = true;
  if ($("appContent")) $("appContent").removeAttribute("aria-busy");
};
document.addEventListener("DOMContentLoaded", () => {
  init().catch(error => {
    console.error("Error al iniciar LIBRETA PRIVADA:", error);
    if ($("appLoading")) {
      $("appLoading").hidden = false;
      $("appLoading").textContent = "No se pudo abrir la libreta. Recarga la página. Si el problema continúa, comprueba que storage.js se haya cargado correctamente.";
    } else {
      window.alert("No se pudo abrir la libreta. Comprueba que storage.js se haya cargado correctamente.");
    }
  });
});
})();
