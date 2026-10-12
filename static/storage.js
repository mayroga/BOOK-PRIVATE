
"use strict";

(() => {
  const DB_NAME = "MayRogaLibretaPrivada";
  const DB_VERSION = 1;
  const STORE_NAMES = ["notebooks", "entries", "reminders", "settings"];
  const ENTRY_TYPES = ["income", "expense", "purchase", "payment", "debt", "reserve", "loss"];

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2);
  }

  function validText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("No se pudo completar la operación local.")
      );
    });
  }

  class PrivateNotebookStorage {
    constructor() {
      this.db = null;
      this.opening = null;
    }

    async open() {
      if (this.db) return this.db;
      if (this.opening) return this.opening;
      if (!("indexedDB" in window)) {
        throw new Error("Este navegador no permite guardar la libreta localmente.");
      }

      this.opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains("notebooks")) {
            db.createObjectStore("notebooks", { keyPath: "id" });
          }

          if (!db.objectStoreNames.contains("entries")) {
            const entries = db.createObjectStore("entries", { keyPath: "id" });
            entries.createIndex("notebookId", "notebookId", { unique: false });
            entries.createIndex("date", "date", { unique: false });
          }

          if (!db.objectStoreNames.contains("reminders")) {
            const reminders = db.createObjectStore("reminders", { keyPath: "id" });
            reminders.createIndex("notebookId", "notebookId", { unique: false });
            reminders.createIndex("dueDate", "dueDate", { unique: false });
          }

          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => {
            this.db.close();
            this.db = null;
            this.opening = null;
          };
          resolve(this.db);
        };

        request.onerror = () => reject(
          request.error || new Error("No se pudo abrir el almacenamiento local.")
        );

        request.onblocked = () => reject(
          new Error("Cierra otras pestañas de la libreta e inténtalo de nuevo.")
        );
      });

      try {
        return await this.opening;
      } finally {
        this.opening = null;
      }
    }

    async all(storeName) {
      const db = await this.open();
      const tx = db.transaction(storeName, "readonly");
      return requestValue(tx.objectStore(storeName).getAll());
    }

    async get(storeName, key) {
      const db = await this.open();
      const tx = db.transaction(storeName, "readonly");
      return requestValue(tx.objectStore(storeName).get(key));
    }

    async put(storeName, value) {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(
          tx.error || new Error("No se pudo guardar el registro.")
        );
        tx.onabort = () => reject(
          tx.error || new Error("Se canceló el guardado.")
        );
      });
      return value;
    }

    async ensureDefaultNotebook() {
      let notebooks = await this.all("notebooks");
      if (notebooks.length) return notebooks;

      const notebook = {
        id: makeId(),
        name: "Mi negocio",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["notebooks", "settings"], "readwrite");
        tx.objectStore("notebooks").put(notebook);
        tx.objectStore("settings").put({
          key: "activeNotebookId",
          value: notebook.id
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo crear la libreta."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló la creación."));
      });

      notebooks = [notebook];
      return notebooks;
    }

    async activeNotebookId() {
      const setting = await this.get("settings", "activeNotebookId");
      return setting && setting.value ? setting.value : null;
    }

    async setActiveNotebook(id) {
      const notebook = await this.get("notebooks", id);
      if (!notebook) throw new Error("No se encontró esa libreta.");
      await this.put("settings", { key: "activeNotebookId", value: id });
    }

    async createNotebook(name) {
      const cleanName = validText(name, 80);
      if (!cleanName) throw new Error("Escribe un nombre para la libreta.");

      const notebook = {
        id: makeId(),
        name: cleanName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["notebooks", "settings"], "readwrite");
        tx.objectStore("notebooks").put(notebook);
        tx.objectStore("settings").put({
          key: "activeNotebookId",
          value: notebook.id
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo crear la libreta."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló la creación."));
      });
      return notebook;
    }

    async renameNotebook(id, name) {
      const notebook = await this.get("notebooks", id);
      const cleanName = validText(name, 80);
      if (!notebook || !cleanName) {
        throw new Error("No se pudo cambiar el nombre de la libreta.");
      }
      notebook.name = cleanName;
      notebook.updatedAt = new Date().toISOString();
      return this.put("notebooks", notebook);
    }

    async deleteNotebook(id) {
      const notebooks = await this.all("notebooks");
      if (notebooks.length <= 1) {
        throw new Error("Debes conservar al menos una libreta.");
      }

      const entries = await this.entries(id);
      const reminders = await this.reminders(id);
      const nextNotebook = notebooks.find(item => item.id !== id);
      const db = await this.open();

      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES, "readwrite");
        tx.objectStore("notebooks").delete(id);
        entries.forEach(item => tx.objectStore("entries").delete(item.id));
        reminders.forEach(item => tx.objectStore("reminders").delete(item.id));
        tx.objectStore("settings").put({
          key: "activeNotebookId",
          value: nextNotebook.id
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo borrar la libreta."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló el borrado."));
      });
    }

    async entries(notebookId) {
      const entries = await this.all("entries");
      return entries
        .filter(item => item.notebookId === notebookId)
        .sort((a, b) =>
          String(b.date || "").localeCompare(String(a.date || "")) ||
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        );
    }

    async saveEntry(entry) {
      const amount = Number(entry.amount);
      const date = String(entry.date || "");
      const notebookId = String(entry.notebookId || "");
      const type = String(entry.type || "");

      if (!notebookId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Comprueba la libreta y la fecha.");
      }
      if (!ENTRY_TYPES.includes(type)) {
        throw new Error("Selecciona un tipo de movimiento válido.");
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
        throw new Error("Introduce una cantidad mayor que cero y dentro del límite permitido.");
      }
      if (!(await this.get("notebooks", notebookId))) {
        throw new Error("La libreta seleccionada no existe.");
      }

      const entryToSave = {
        id: entry.id || makeId(),
        notebookId,
        type,
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        date,
        category: validText(entry.category, 80),
        method: ["cash", "card", "transfer", "other"].includes(entry.method)
          ? entry.method : "other",
        note: validText(entry.note, 500),
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      return this.put("entries", entryToSave);
    }

    async deleteEntry(id) {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("entries", "readwrite");
        tx.objectStore("entries").delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo borrar la anotación."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló el borrado."));
      });
    }

    async reminders(notebookId) {
      const reminders = await this.all("reminders");
      return reminders
        .filter(item => item.notebookId === notebookId)
        .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
    }

    async saveReminder(reminder) {
      const notebookId = String(reminder.notebookId || "");
      const title = validText(reminder.title, 120);
      const dueDate = String(reminder.dueDate || "");

      if (!notebookId || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        throw new Error("Escribe el pendiente y una fecha válida.");
      }
      if (!(await this.get("notebooks", notebookId))) {
        throw new Error("La libreta seleccionada no existe.");
      }

      const item = {
        id: reminder.id || makeId(),
        notebookId,
        title,
        dueDate,
        note: validText(reminder.note, 300),
        done: Boolean(reminder.done),
        createdAt: reminder.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return this.put("reminders", item);
    }

    async deleteReminder(id) {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("reminders", "readwrite");
        tx.objectStore("reminders").delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo borrar el recordatorio."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló el borrado."));
      });
    }

    async backupData() {
      const [notebooks, entries, reminders, settings] = await Promise.all([
        this.all("notebooks"),
        this.all("entries"),
        this.all("reminders"),
        this.all("settings")
      ]);
      return {
        format: "may-roga-libretaprivada-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        notebooks,
        entries,
        reminders,
        settings
      };
    }

    async restoreData(data) {
      if (!data || data.format !== "may-roga-libretaprivada-backup" ||
          data.version !== 1 || !Array.isArray(data.notebooks) ||
          !Array.isArray(data.entries) || !Array.isArray(data.reminders) ||
          !Array.isArray(data.settings)) {
        throw new Error("El archivo no es una copia válida de esta aplicación.");
      }

      const notebooks = data.notebooks;
      const entries = data.entries;
      const reminders = data.reminders;
      const settings = data.settings;

      const uniqueIds = (items, key) => {
        const ids = items.map(item => item && item[key]);
        return ids.every(id => typeof id === "string" && id.length > 0) &&
          new Set(ids).size === ids.length;
      };

      if (!notebooks.length ||
          !uniqueIds(notebooks, "id") ||
          !uniqueIds(entries, "id") ||
          !uniqueIds(reminders, "id") ||
          !uniqueIds(settings, "key")) {
        throw new Error("La copia contiene registros incompletos o repetidos.");
      }

      const notebookIds = new Set(notebooks.map(item => item.id));
      if (entries.some(item => !notebookIds.has(item.notebookId) ||
          !ENTRY_TYPES.includes(item.type) ||
          !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) ||
          reminders.some(item => !notebookIds.has(item.notebookId))) {
        throw new Error("La copia contiene anotaciones incompatibles.");
      }

      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES, "readwrite");
        for (const name of STORE_NAMES) tx.objectStore(name).clear();
        notebooks.forEach(item => tx.objectStore("notebooks").put(item));
        entries.forEach(item => tx.objectStore("entries").put(item));
        reminders.forEach(item => tx.objectStore("reminders").put(item));
        settings.forEach(item => tx.objectStore("settings").put(item));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo restaurar la copia."));
        tx.onabort = () => reject(tx.error || new Error("Se canceló la restauración."));
      });

      const activeId = await this.activeNotebookId();
      if (!notebooks.some(item => item.id === activeId)) {
        await this.setActiveNotebook(notebooks[0].id);
      }
    }

    async eraseEverything() {
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = resolve;
        request.onerror = () => reject(
          request.error || new Error("No se pudieron borrar los datos locales.")
        );
        request.onblocked = () => reject(
          new Error("Cierra las otras pestañas de la libreta e inténtalo de nuevo.")
        );
      });

      this.opening = null;
      await this.ensureDefaultNotebook();
    }
  }

  window.privateNotebookStorage = new PrivateNotebookStorage();
})();
