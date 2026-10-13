
"use strict";
(function(){
const DB_NAME="MayRogaLibretaPrivada";
const DB_VERSION=1;
const STORES={notebooks:"notebooks",entries:"entries",reminders:"reminders",settings:"settings"};
const ENTRY_TYPES=["income","expense","purchase","payment","debt","reserve","investment","transfer","loss"];
const money=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error("El importe debe ser un número válido igual o mayor que cero.");return Math.round((n+Number.EPSILON)*100)/100;};
const text=(value,max=1000)=>String(value??"").trim().slice(0,max);
const makeId=()=>globalThis.crypto&&typeof crypto.randomUUID==="function"?crypto.randomUUID():"id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,12);
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))&&!Number.isNaN(new Date(String(value)+"T12:00:00").getTime());
let dbPromise=null;
function open(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!("indexedDB" in window)){reject(new Error("Este navegador no permite guardar datos localmente."));return;}
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORES.notebooks))db.createObjectStore(STORES.notebooks,{keyPath:"id"});
   if(!db.objectStoreNames.contains(STORES.entries))db.createObjectStore(STORES.entries,{keyPath:"id"});
   if(!db.objectStoreNames.contains(STORES.reminders))db.createObjectStore(STORES.reminders,{keyPath:"id"});
   if(!db.objectStoreNames.contains(STORES.settings))db.createObjectStore(STORES.settings,{keyPath:"key"});
  };
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
  request.onerror=()=>{dbPromise=null;reject(request.error||new Error("No se pudo abrir el almacenamiento."));};
  request.onblocked=()=>reject(new Error("Cierra otras pestañas de esta aplicación y vuelve a intentarlo."));
 });
 return dbPromise;
}
async function transaction(storeNames,mode,work){
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeNames,mode);
  let result;
  try{result=work(tx);}catch(error){try{tx.abort();}catch(_){}reject(error);return;}
  tx.oncomplete=()=>resolve(result&&result.__request?result.__request.result:result);
  tx.onerror=()=>reject(tx.error||new Error("No se pudo completar la operación."));
  tx.onabort=()=>reject(tx.error||new Error("La operación fue cancelada."));
 });
}
function requestPromise(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Error de almacenamiento."));});}
async function all(storeName){
 const db=await open();
 return requestPromise(db.transaction(storeName,"readonly").objectStore(storeName).getAll());
}
async function get(storeName,key){
 const db=await open();
 return requestPromise(db.transaction(storeName,"readonly").objectStore(storeName).get(key));
}
async function put(storeName,value){
 const db=await open();
 return requestPromise(db.transaction(storeName,"readwrite").objectStore(storeName).put(value));
}
async function remove(storeName,key){
 const db=await open();
 return requestPromise(db.transaction(storeName,"readwrite").objectStore(storeName).delete(key));
}
async function clearStore(storeName){
 const db=await open();
 return requestPromise(db.transaction(storeName,"readwrite").objectStore(storeName).clear());
}
async function ensureDefaultNotebook(){
 let notebooks=await all(STORES.notebooks);
 if(!notebooks.length){
  const notebook={id:makeId(),name:"Mi libreta",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await put(STORES.notebooks,notebook);
  notebooks=[notebook];
 }
 let active=await get(STORES.settings,"activeNotebookId");
 if(!active||!notebooks.some(n=>n.id===active.value)){
  active={key:"activeNotebookId",value:notebooks[0].id};
  await put(STORES.settings,active);
 }
 return notebooks;
}
async function activeNotebookId(){
 await ensureDefaultNotebook();
 const item=await get(STORES.settings,"activeNotebookId");
 return item?item.value:null;
}
async function setActiveNotebook(id){
 const notebook=await get(STORES.notebooks,id);
 if(!notebook)throw new Error("No se encontró esa libreta.");
 await put(STORES.settings,{key:"activeNotebookId",value:id});
 return id;
}
async function entries(notebookId){
 const rows=await all(STORES.entries);
 return rows.filter(r=>!notebookId||r.notebookId===notebookId).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")));
}
async function reminders(notebookId){
 const rows=await all(STORES.reminders);
 return rows.filter(r=>!notebookId||r.notebookId===notebookId).sort((a,b)=>Number(!!a.completed)-Number(!!b.completed)||String(a.date||"").localeCompare(String(b.date||"")));
}
async function createNotebook(name){
 name=text(name,80);
 if(!name)throw new Error("Escribe un nombre para la libreta.");
 const notebooks=await all(STORES.notebooks);
 if(notebooks.some(n=>String(n.name).toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error("Ya existe una libreta con ese nombre.");
 const notebook={id:makeId(),name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 await put(STORES.notebooks,notebook);
 await setActiveNotebook(notebook.id);
 return notebook;
}
async function renameNotebook(id,name){
 name=text(name,80);
 if(!name)throw new Error("Escribe un nombre para la libreta.");
 const notebook=await get(STORES.notebooks,id);
 if(!notebook)throw new Error("No se encontró esa libreta.");
 const notebooks=await all(STORES.notebooks);
 if(notebooks.some(n=>n.id!==id&&String(n.name).toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error("Ya existe una libreta con ese nombre.");
 notebook.name=name;notebook.updatedAt=new Date().toISOString();
 await put(STORES.notebooks,notebook);
 return notebook;
}
async function deleteNotebook(id){
 const notebooks=await all(STORES.notebooks);
 if(notebooks.length<=1)throw new Error("Debe quedar al menos una libreta.");
 if(!notebooks.some(n=>n.id===id))throw new Error("No se encontró esa libreta.");
 const db=await open();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction([STORES.notebooks,STORES.entries,STORES.reminders,STORES.settings],"readwrite");
  const entryStore=tx.objectStore(STORES.entries);
  const reminderStore=tx.objectStore(STORES.reminders);
  entryStore.getAll().onsuccess=e=>e.target.result.filter(r=>r.notebookId===id).forEach(r=>entryStore.delete(r.id));
  reminderStore.getAll().onsuccess=e=>e.target.result.filter(r=>r.notebookId===id).forEach(r=>reminderStore.delete(r.id));
  tx.objectStore(STORES.notebooks).delete(id);
  const settings=tx.objectStore(STORES.settings);
  const req=settings.get("activeNotebookId");
  req.onsuccess=()=>{if(req.result&&req.result.value===id)settings.put({key:"activeNotebookId",value:notebooks.find(n=>n.id!==id).id});};
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("No se pudo eliminar la libreta."));tx.onabort=()=>reject(tx.error||new Error("La operación fue cancelada."));
 });
}
function normalizeEntry(record){
 if(!record||typeof record!=="object")throw new Error("La anotación no es válida.");
 const type=String(record.type||"");
 if(!ENTRY_TYPES.includes(type))throw new Error("Selecciona un tipo de movimiento válido.");
 const amount=money(record.amount);
 if(amount<=0)throw new Error("El importe debe ser mayor que cero.");
 if(!validDate(record.date))throw new Error("Selecciona una fecha válida.");
 if(!record.notebookId)throw new Error("Selecciona una libreta.");
 const now=new Date().toISOString();
 return {id:record.id||makeId(),notebookId:String(record.notebookId),type,amount,date:record.date,category:text(record.category,80),method:text(record.method,30)||"other",note:text(record.note,1000),createdAt:record.createdAt||now,updatedAt:now};
}
async function saveEntry(record){
 const normalized=normalizeEntry(record);
 const notebook=await get(STORES.notebooks,normalized.notebookId);
 if(!notebook)throw new Error("La libreta seleccionada ya no existe.");
 if(record.id){
  const old=await get(STORES.entries,record.id);
  if(old)normalized.createdAt=old.createdAt||normalized.createdAt;
 }
 await put(STORES.entries,normalized);
 return normalized;
}
async function deleteEntry(id){if(!id)throw new Error("Falta la anotación que deseas eliminar.");await remove(STORES.entries,id);}
function normalizeReminder(record){
 if(!record||typeof record!=="object")throw new Error("El recordatorio no es válido.");
 const title=text(record.title,160);
 if(!title)throw new Error("Escribe qué necesitas recordar.");
 if(!validDate(record.date))throw new Error("Selecciona una fecha válida para el recordatorio.");
 if(!record.notebookId)throw new Error("Selecciona una libreta.");
 const now=new Date().toISOString();
 return {id:record.id||makeId(),notebookId:String(record.notebookId),title,date:record.date,note:text(record.note,1000),completed:!!record.completed,createdAt:record.createdAt||now,updatedAt:now};
}
async function saveReminder(record){
 const normalized=normalizeReminder(record);
 if(!await get(STORES.notebooks,normalized.notebookId))throw new Error("La libreta seleccionada ya no existe.");
 if(record.id){const old=await get(STORES.reminders,record.id);if(old)normalized.createdAt=old.createdAt||normalized.createdAt;}
 await put(STORES.reminders,normalized);
 return normalized;
}
async function deleteReminder(id){if(!id)throw new Error("Falta el recordatorio que deseas eliminar.");await remove(STORES.reminders,id);}
async function backupData(){
 await ensureDefaultNotebook();
 const [notebooks,entryRows,reminderRows,settings]=await Promise.all([all(STORES.notebooks),all(STORES.entries),all(STORES.reminders),all(STORES.settings)]);
 return {app:"LIBRETA_PRIVADA_MAY_ROGA",version:1,exportedAt:new Date().toISOString(),notebooks,entries:entryRows,reminders:reminderRows,settings};
}
function validateBackup(data){
 if(!data||typeof data!=="object"||!Array.isArray(data.notebooks)||!Array.isArray(data.entries)||!Array.isArray(data.reminders))throw new Error("El archivo no tiene el formato de copia de seguridad esperado.");
 if(data.notebooks.length>500||data.entries.length>100000||data.reminders.length>100000)throw new Error("La copia contiene demasiados registros.");
 const notebookIds=new Set();
 const notebooks=data.notebooks.map(n=>{
  if(!n||typeof n!=="object")throw new Error("Hay una libreta inválida en la copia.");
  const id=text(n.id,120),name=text(n.name,80);
  if(!id||!name||notebookIds.has(id))throw new Error("Hay una libreta sin identificador, sin nombre o duplicada.");
  notebookIds.add(id);return {...n,id,name};
 });
 if(!notebooks.length)throw new Error("La copia debe contener al menos una libreta.");
 const entries=data.entries.map(r=>{
  if(!r||!notebookIds.has(String(r.notebookId)))throw new Error("Hay una anotación que apunta a una libreta inexistente.");
  const normalized=normalizeEntry(r);
  return {...normalized,id:text(r.id,120)||makeId(),createdAt:r.createdAt||normalized.createdAt,updatedAt:r.updatedAt||normalized.updatedAt};
 });
 const reminders=data.reminders.map(r=>{
  if(!r||!notebookIds.has(String(r.notebookId)))throw new Error("Hay un recordatorio que apunta a una libreta inexistente.");
  const normalized=normalizeReminder(r);
  return {...normalized,id:text(r.id,120)||makeId(),createdAt:r.createdAt||normalized.createdAt,updatedAt:r.updatedAt||normalized.updatedAt};
 });
 const settings=Array.isArray(data.settings)?data.settings.filter(s=>s&&s.key==="activeNotebookId"&&notebookIds.has(s.value)).map(s=>({key:"activeNotebookId",value:s.value})): [];
 if(!settings.length)settings.push({key:"activeNotebookId",value:notebooks[0].id});
 return {notebooks,entries,reminders,settings};
}
async function restoreData(data){
 const checked=validateBackup(data);
 const db=await open();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction([STORES.notebooks,STORES.entries,STORES.reminders,STORES.settings],"readwrite");
  for(const name of Object.values(STORES))tx.objectStore(name).clear();
  checked.notebooks.forEach(r=>tx.objectStore(STORES.notebooks).put(r));
  checked.entries.forEach(r=>tx.objectStore(STORES.entries).put(r));
  checked.reminders.forEach(r=>tx.objectStore(STORES.reminders).put(r));
  checked.settings.forEach(r=>tx.objectStore(STORES.settings).put(r));
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("No se pudo restaurar la copia."));tx.onabort=()=>reject(tx.error||new Error("La restauración fue cancelada."));
 });
 await ensureDefaultNotebook();
 return true;
}
async function eraseEverything(){
 const db=await open();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(Object.values(STORES),"readwrite");
  Object.values(STORES).forEach(name=>tx.objectStore(name).clear());
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("No se pudieron borrar los datos."));tx.onabort=()=>reject(tx.error||new Error("La eliminación fue cancelada."));
 });
 await ensureDefaultNotebook();
 return true;
}
const api={open,all,get,put,ensureDefaultNotebook,activeNotebookId,setActiveNotebook,entries,reminders,createNotebook,renameNotebook,deleteNotebook,saveEntry,deleteEntry,saveReminder,deleteReminder,backupData,restoreData,eraseEverything,ENTRY_TYPES,DB_NAME};
window.privateNotebookStorage=api;
window.MayRogaPrivateStorage=api;
})();
