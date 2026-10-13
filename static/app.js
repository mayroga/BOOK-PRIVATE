
"use strict";
document.addEventListener("DOMContentLoaded",()=>{
const $=id=>document.getElementById(id);
const storage=window.privateNotebookStorage;
const ENTRY_LABELS={income:"Ingreso recibido",expense:"Gasto",purchase:"Compra",payment:"Pago realizado",debt:"Deuda anotada",reserve:"Dinero reservado",investment:"Inversión",transfer:"Transferencia interna",loss:"Pérdida"};
const METHOD_LABELS={cash:"Efectivo",bank:"Banco",card:"Tarjeta",savings:"Ahorros",other:"Otro"};
const state={notebookId:null,notebooks:[],entries:[],reminders:[],editingEntryId:null,editingReminderId:null,period:"month",busy:false};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const money=value=>new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(Number(value)||0);
const number=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const dateLabel=value=>{if(!value)return "Sin fecha";const p=String(value).split("-");return p.length===3?`${p[1]}/${p[2]}/${p[0]}`:String(value);};
const showError=error=>notify(error&&error.message?error.message:"No se pudo completar la operación.",true);
function notify(message,error=false){
 const el=$("message");
 if(!el){if(error)window.alert(message);return;}
 el.textContent=message;el.classList.toggle("error",!!error);el.classList.add("visible");
 if(state.noticeTimer)clearTimeout(state.noticeTimer);
 state.noticeTimer=setTimeout(()=>el.classList.remove("visible"),5000);
}
function safeRun(fn){return async event=>{if(state.busy)return;if(event&&event.preventDefault)event.preventDefault();state.busy=true;document.querySelectorAll("button[type=submit]").forEach(b=>{b.dataset.oldDisabled=b.disabled?"1":"0";b.disabled=true;});try{await fn(event);}catch(error){showError(error);}finally{state.busy=false;document.querySelectorAll("button[type=submit]").forEach(b=>{b.disabled=b.dataset.oldDisabled==="1";delete b.dataset.oldDisabled;});}};}
function showScreen(id){
 const target=$(id);
 if(!target||!target.classList.contains("screen"))return;
 document.querySelectorAll(".screen").forEach(s=>{s.classList.toggle("active",s===target);s.setAttribute("aria-hidden",s===target?"false":"true");});
 window.scrollTo({top:0,behavior:"auto"});
 if(id==="summarySection")renderSummary();
 if(id==="recordsSection")renderEntries();
 if(id==="remindersSection")renderReminders();
 if(id==="accountsSection")renderAccountSummary();
}
function setEntryType(type){
 if($("entryType")&&ENTRY_LABELS[type])$("entryType").value=type;
 state.editingEntryId=null;
 if($("entryFormTitle"))$("entryFormTitle").textContent="Nueva anotación";
 if($("saveEntry"))$("saveEntry").textContent="Guardar anotación";
 if($("cancelEdit"))$("cancelEdit").classList.add("hidden");
}
function resetEntryForm(){
 const form=$("entryForm");
 if(form)form.reset();
 if($("entryDate"))$("entryDate").value=today();
 if($("entryMethod"))$("entryMethod").value="cash";
 state.editingEntryId=null;
 if($("entryFormTitle"))$("entryFormTitle").textContent="Nueva anotación";
 if($("saveEntry"))$("saveEntry").textContent="Guardar anotación";
 if($("cancelEdit"))$("cancelEdit").classList.add("hidden");
}
function resetReminderForm(){
 const form=$("reminderForm");
 if(form)form.reset();
 state.editingReminderId=null;
 if($("reminderFormTitle"))$("reminderFormTitle").textContent="Nuevo recordatorio";
 if($("saveReminder"))$("saveReminder").textContent="Guardar recordatorio";
 if($("cancelReminderEdit"))$("cancelReminderEdit").classList.add("hidden");
}
async function reloadData(){
 state.notebooks=await storage.all("notebooks");
 state.notebookId=await storage.activeNotebookId();
 if(!state.notebooks.some(n=>n.id===state.notebookId)){
  await storage.ensureDefaultNotebook();
  state.notebooks=await storage.all("notebooks");
  state.notebookId=await storage.activeNotebookId();
 }
 [state.entries,state.reminders]=await Promise.all([storage.entries(state.notebookId),storage.reminders(state.notebookId)]);
 renderNotebookControls();
 renderHome();
 renderAccountSummary();
 renderSummary();
 renderEntries();
 renderReminders();
}
function renderNotebookControls(){
 const select=$("notebookSelect");
 if(select){
  select.innerHTML="";
  state.notebooks.forEach(n=>{const option=document.createElement("option");option.value=n.id;option.textContent=n.name;option.selected=n.id===state.notebookId;select.appendChild(option);});
 }
 const current=state.notebooks.find(n=>n.id===state.notebookId);
 if($("activeNotebookName"))$("activeNotebookName").textContent=current?current.name:"Mi libreta";
 if($("homeNotebookName"))$("homeNotebookName").value=current?current.name:"Mi libreta";
}
function inRange(record,start,end){return record.date>=start&&record.date<=end;}
function startOfWeek(date){
 const d=new Date(date+"T12:00:00");
 const day=(d.getDay()+6)%7;
 d.setDate(d.getDate()-day);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(date,count){
 const d=new Date(date+"T12:00:00");
 d.setDate(d.getDate()+count);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getPeriodRange(period){
 const now=today();
 if(period==="day")return {start:now,end:now,label:`Hoy · ${dateLabel(now)}`};
 if(period==="week"){const start=startOfWeek(now),end=addDays(start,6);return {start,end,label:`Esta semana · ${dateLabel(start)}–${dateLabel(end)}`};}
 if(period==="year"){const y=String(new Date().getFullYear());return {start:`${y}-01-01`,end:`${y}-12-31`,label:`Año ${y}`};}
 const month=$("summaryMonth")?Number($("summaryMonth").value):new Date().getMonth()+1;
 const year=$("summaryYear")?Number($("summaryYear").value):new Date().getFullYear();
 const y=Number.isFinite(year)&&year>=2000&&year<=2100?year:new Date().getFullYear();
 const m=Number.isFinite(month)&&month>=1&&month<=12?month:new Date().getMonth()+1;
 const start=`${y}-${String(m).padStart(2,"0")}-01`;
 const last=new Date(y,m,0).getDate();
 return {start,end:`${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`,label:`${new Date(y,m-1,1).toLocaleDateString("es-US",{month:"long",year:"numeric"})}`};
}
function totals(records){
 const t={income:0,expense:0,purchase:0,payment:0,debt:0,reserve:0,investment:0,transfer:0,loss:0,outflow:0,net:0,count:records.length};
 records.forEach(r=>{
  const amount=Number(r.amount)||0;
  if(Object.prototype.hasOwnProperty.call(t,r.type)&&r.type!=="count"&&r.type!=="outflow"&&r.type!=="net")t[r.type]+=amount;
 });
 t.outflow=t.expense+t.purchase+t.payment+t.loss;
 t.net=t.income-t.outflow;
 Object.keys(t).forEach(k=>{if(typeof t[k]==="number")t[k]=number(t[k]);});
 return t;
}
function putText(id,value){const el=$(id);if(el)el.textContent=value;}
function renderHome(){
 const dayRows=state.entries.filter(r=>r.date===today());
 const dayTotals=totals(dayRows);
 putText("todayMoneyTotal",money(dayTotals.income));
 putText("homeStatus",state.entries.length?"Tu libreta está en marcha.":"Tu libreta está lista.");
 putText("homeStatusDetail",state.entries.length?`${state.entries.length} anotación${state.entries.length===1?"":"es"} guardada${state.entries.length===1?"":"s"} en esta libreta.`:"Añade una anotación para empezar.");
}
function setAmount(id,value){putText(id,money(value));}
function renderSummary(){
 if(!state.entries)return;
 const range=getPeriodRange(state.period);
 const rows=state.entries.filter(r=>inRange(r,range.start,range.end));
 const t=totals(rows);
 putText("summaryPeriodLabel",range.label);
 setAmount("summaryIncome",t.income);
 setAmount("summaryPurchases",t.purchase);
 setAmount("summaryExpenses",t.expense);
 setAmount("summaryPayments",t.payment);
 setAmount("summaryLosses",t.loss);
 setAmount("summaryReserves",t.reserve);
 setAmount("summaryDebts",t.debt);
 setAmount("summaryNet",t.net);
 const year=Number($("summaryYear")&&$("summaryYear").value)||new Date().getFullYear();
 const yearRows=state.entries.filter(r=>r.date>=`${year}-01-01`&&r.date<=`${year}-12-31`);
 const yt=totals(yearRows);
 setAmount("yearIncome",yt.income);
 setAmount("yearExpenses",yt.expense+yt.purchase+yt.payment+yt.loss);
 setAmount("yearNet",yt.net);
}
function renderAccountSummary(){
 const t=totals(state.entries||[]);
 setAmount("accountIncomeTotal",t.income);
 setAmount("accountOutflowTotal",t.outflow);
 setAmount("accountNetTotal",t.net);
}
function renderEntries(){
 const host=$("entriesList");
 if(!host)return;
 const query=($("recordsSearch")?.value||"").trim().toLocaleLowerCase();
 const type=$("recordsTypeFilter")?.value||"";
 const date=$("recordsDateFilter")?.value||"";
 const rows=state.entries.filter(r=>{
  const searchable=[r.note,r.category,ENTRY_LABELS[r.type],METHOD_LABELS[r.method],r.date].join(" ").toLocaleLowerCase();
  return (!query||searchable.includes(query))&&(!type||r.type===type)&&(!date||r.date===date);
 });
 host.innerHTML="";
 if(!rows.length){host.innerHTML='<div class="empty-state">No hay anotaciones que coincidan. Prueba otro filtro o registra un movimiento.</div>';return;}
 rows.forEach(r=>{
  const item=document.createElement("article");item.className="list-item";
  const category=r.category?` · ${escapeHTML(r.category)}`:"";
  const method=METHOD_LABELS[r.method]||"Otro";
  const sign=r.type==="income"?"+":r.type==="expense"||r.type==="purchase"||r.type==="payment"||r.type==="loss"?"−":"";
  item.innerHTML=`<div class="list-item-head"><div><strong>${escapeHTML(ENTRY_LABELS[r.type]||r.type)}</strong><p>${escapeHTML(dateLabel(r.date))}${category} · ${escapeHTML(method)}</p></div><div class="item-amount">${sign}${money(r.amount)}</div></div>${r.note?`<p>${escapeHTML(r.note)}</p>`:""}<div class="item-actions"><button type="button" data-entry-action="edit" data-id="${escapeHTML(r.id)}">Editar</button><button type="button" data-entry-action="delete" data-id="${escapeHTML(r.id)}">Eliminar</button></div>`;
  host.appendChild(item);
 });
}
function renderReminders(){
 const host=$("remindersList");
 if(!host)return;
 host.innerHTML="";
 const rows=[...state.reminders].sort((a,b)=>Number(!!a.completed)-Number(!!b.completed)||String(a.date).localeCompare(String(b.date)));
 if(!rows.length){host.innerHTML='<div class="empty-state">Todavía no tienes recordatorios. Puedes crear uno arriba.</div>';return;}
 rows.forEach(r=>{
  const item=document.createElement("article");item.className="list-item";
  item.innerHTML=`<div class="list-item-head"><div><strong>${escapeHTML(r.title)}</strong><p>${escapeHTML(dateLabel(r.date))}${r.completed?" · Completado":""}</p></div><span aria-label="${r.completed?"Completado":"Pendiente"}">${r.completed?"✓":"◷"}</span></div>${r.note?`<p>${escapeHTML(r.note)}</p>`:""}<div class="item-actions"><button type="button" data-reminder-action="toggle" data-id="${escapeHTML(r.id)}">${r.completed?"Marcar pendiente":"Marcar completado"}</button><button type="button" data-reminder-action="edit" data-id="${escapeHTML(r.id)}">Editar</button><button type="button" data-reminder-action="delete" data-id="${escapeHTML(r.id)}">Eliminar</button></div>`;
  host.appendChild(item);
 });
}
function editEntry(id){
 const r=state.entries.find(x=>x.id===id);
 if(!r)return notify("No se encontró esa anotación.",true);
 state.editingEntryId=r.id;
 $("entryType").value=r.type;$("entryAmount").value=r.amount;$("entryDate").value=r.date;$("entryCategory").value=r.category||"";$("entryMethod").value=r.method||"other";$("entryNote").value=r.note||"";
 putText("entryFormTitle","Editar anotación");putText("saveEntry","Guardar cambios");
 $("cancelEdit").classList.remove("hidden");
 showScreen("entrySection");
}
async function deleteEntry(id){
 const r=state.entries.find(x=>x.id===id);
 if(!r)return;
 if(!window.confirm(`¿Eliminar esta anotación de ${money(r.amount)}? Esta acción no se puede deshacer.`))return;
 await storage.deleteEntry(id);await reloadData();notify("Anotación eliminada.");
}
function editReminder(id){
 const r=state.reminders.find(x=>x.id===id);
 if(!r)return notify("No se encontró ese recordatorio.",true);
 state.editingReminderId=r.id;
 $("reminderTitle").value=r.title;$("reminderDate").value=r.date;$("reminderNote").value=r.note||"";
 putText("reminderFormTitle","Editar recordatorio");putText("saveReminder","Guardar cambios");
 $("cancelReminderEdit").classList.remove("hidden");
 showScreen("remindersSection");
 $("reminderTitle").focus();
}
async function deleteReminder(id){
 if(!window.confirm("¿Eliminar este recordatorio?"))return;
 await storage.deleteReminder(id);await reloadData();notify("Recordatorio eliminado.");
}
function csvCell(value){const s=String(value??"");return '"'+s.replace(/"/g,'""')+'"';}
function downloadFile(filename,content,type){
 const blob=new Blob([content],{type});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=filename;a.style.display="none";document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportBackup(){
 const data=await storage.backupData();
 downloadFile(`libreta-privada-copia-${today()}.json`,JSON.stringify(data,null,2),"application/json;charset=utf-8");
 notify("Copia de seguridad descargada.");
}
function exportCSV(){
 const rows=[["Fecha","Tipo","Importe USD","Categoría","Método","Nota","Libreta"]];
 const notebook=state.notebooks.find(n=>n.id===state.notebookId);
 state.entries.forEach(r=>rows.push([r.date,ENTRY_LABELS[r.type]||r.type,Number(r.amount).toFixed(2),r.category,METHOD_LABELS[r.method]||r.method,r.note,notebook?notebook.name:""]));
 const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
 downloadFile(`libreta-privada-anotaciones-${today()}.csv`,csv,"text/csv;charset=utf-8");
 notify("Archivo CSV preparado.");
}
function printContent(title,body){
 const win=window.open("","_blank");
 if(!win){notify("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para imprimir.",true);return;}
 const safeTitle=escapeHTML(title);
 win.document.open();
 win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font:14px Arial,sans-serif;color:#203348;margin:28px}h1{font-size:22px}p{line-height:1.5}.row{padding:10px 0;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;gap:15px}.muted{color:#63768a;font-size:12px}@media print{button{display:none}}</style></head><body><h1>${safeTitle}</h1><p class="muted">LIBRETA PRIVADA · MAY ROGA LLC · ${escapeHTML(today())}</p>${body}<script>window.onload=function(){window.print();};<\/script></body></html>`);
 win.document.close();
}
function printSummary(){
 const range=getPeriodRange(state.period),t=totals(state.entries.filter(r=>inRange(r,range.start,range.end)));
 const rows=[["Ingresos recibidos",t.income],["Compras",t.purchase],["Gastos",t.expense],["Pagos realizados",t.payment],["Pérdidas",t.loss],["Dinero reservado",t.reserve],["Deudas anotadas",t.debt],["Resultado neto registrado",t.net]];
 printContent("Resumen "+range.label,`<p>Período: ${escapeHTML(range.label)}</p>${rows.map(r=>`<div class="row"><span>${escapeHTML(r[0])}</span><strong>${escapeHTML(money(r[1]))}</strong></div>`).join("")}<p class="muted">El resultado neto resta compras, gastos, pagos y pérdidas de los ingresos registrados. Deudas, reservas, inversiones y transferencias se muestran por separado.</p>`);
}
function printAllRecords(){
 const notebook=state.notebooks.find(n=>n.id===state.notebookId);
 const rows=state.entries.map(r=>`<div class="row"><span><strong>${escapeHTML(dateLabel(r.date))} · ${escapeHTML(ENTRY_LABELS[r.type]||r.type)}</strong><br>${escapeHTML(r.category||"Sin categoría")}${r.note?`<br>${escapeHTML(r.note)}`:""}</span><strong>${escapeHTML(money(r.amount))}</strong></div>`).join("");
 printContent("Anotaciones · "+(notebook?notebook.name:"Mi libreta"),rows||"<p>No hay anotaciones guardadas.</p>");
}
function openDialog(id){const dlg=$(id);if(dlg&&typeof dlg.showModal==="function"&&!dlg.open)dlg.showModal();}
function closeDialog(id){const dlg=$(id);if(dlg&&dlg.open)dlg.close();}
function promptName(message,initial=""){const result=window.prompt(message,initial);return result===null?null:result.trim();}
document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>{
 const destination=button.dataset.go;
 if(destination==="entrySection"&&button.dataset.entryType)setEntryType(button.dataset.entryType);
 if(destination==="entrySection"&&!state.editingEntryId)resetEntryForm();
 showScreen(destination);
}));
document.querySelectorAll("[data-summary-period]").forEach(button=>button.addEventListener("click",()=>{
 state.period=button.dataset.summaryPeriod;
 renderSummary();
}));
if($("summaryMonth"))$("summaryMonth").addEventListener("change",()=>{state.period="month";renderSummary();});
if($("summaryYear"))$("summaryYear").addEventListener("change",()=>renderSummary());
if($("entryForm"))$("entryForm").addEventListener("submit",safeRun(async()=>{
 const type=$("entryType").value;
 const record={id:state.editingEntryId||undefined,notebookId:state.notebookId,type,amount:$("entryAmount").value,date:$("entryDate").value,category:$("entryCategory").value,method:$("entryMethod").value,note:$("entryNote").value};
 const wasEditing=!!state.editingEntryId;
 await storage.saveEntry(record);await reloadData();resetEntryForm();notify(wasEditing?"Anotación actualizada.":"Anotación guardada.");showScreen("homeSection");
}));
if($("cancelEdit"))$("cancelEdit").addEventListener("click",()=>{resetEntryForm();showScreen("homeSection");});
if($("notebookSelect"))$("notebookSelect").addEventListener("change",safeRun(async()=>{
 await storage.setActiveNotebook($("notebookSelect").value);state.notebookId=$("notebookSelect").value;await reloadData();showScreen("accountsSection");notify("Libreta seleccionada.");
}));
if($("newNotebook"))$("newNotebook").addEventListener("click",safeRun(async()=>{
 const name=promptName("¿Qué nombre quieres ponerle a la nueva libreta?");
 if(!name)return;
 const notebook=await storage.createNotebook(name);state.notebookId=notebook.id;await reloadData();notify("Nueva libreta creada.");
}));
if($("renameNotebook"))$("renameNotebook").addEventListener("click",safeRun(async()=>{
 const current=state.notebooks.find(n=>n.id===state.notebookId);
 if(!current)return;
 const name=promptName("Escribe el nuevo nombre:",current.name);
 if(!name)return;
 await storage.renameNotebook(current.id,name);await reloadData();notify("Nombre de la libreta actualizado.");
}));
if($("deleteNotebook"))$("deleteNotebook").addEventListener("click",safeRun(async()=>{
 const current=state.notebooks.find(n=>n.id===state.notebookId);
 if(!current)return;
 if(!window.confirm(`¿Eliminar la libreta "${current.name}" y todas sus anotaciones y recordatorios? Esta acción no se puede deshacer.`))return;
 await storage.deleteNotebook(current.id);await reloadData();notify("Libreta eliminada.");
}));
if($("recordsSearch"))$("recordsSearch").addEventListener("input",renderEntries);
if($("recordsTypeFilter"))$("recordsTypeFilter").addEventListener("change",renderEntries);
if($("recordsDateFilter"))$("recordsDateFilter").addEventListener("change",renderEntries);
if($("clearRecordFilters"))$("clearRecordFilters").addEventListener("click",()=>{
 if($("recordsSearch"))$("recordsSearch").value="";
 if($("recordsTypeFilter"))$("recordsTypeFilter").value="";
 if($("recordsDateFilter"))$("recordsDateFilter").value="";
 renderEntries();
});
if($("entriesList"))$("entriesList").addEventListener("click",safeRun(async event=>{
 const button=event.target.closest("button[data-entry-action]");
 if(!button)return;
 const id=button.dataset.id;
 if(button.dataset.entryAction==="edit")editEntry(id);
 if(button.dataset.entryAction==="delete")await deleteEntry(id);
}));
if($("reminderForm"))$("reminderForm").addEventListener("submit",safeRun(async()=>{
 const wasEditing=!!state.editingReminderId;
 await storage.saveReminder({id:state.editingReminderId||undefined,notebookId:state.notebookId,title:$("reminderTitle").value,date:$("reminderDate").value,note:$("reminderNote").value,completed:state.reminders.find(r=>r.id===state.editingReminderId)?.completed||false});
 await reloadData();resetReminderForm();notify(wasEditing?"Recordatorio actualizado.":"Recordatorio guardado.");
}));
if($("cancelReminderEdit"))$("cancelReminderEdit").addEventListener("click",resetReminderForm);
if($("remindersList"))$("remindersList").addEventListener("click",safeRun(async event=>{
 const button=event.target.closest("button[data-reminder-action]");
 if(!button)return;
 const id=button.dataset.id;
 if(button.dataset.reminderAction==="edit")editReminder(id);
 else if(button.dataset.reminderAction==="delete")await deleteReminder(id);
 else if(button.dataset.reminderAction==="toggle"){
  const r=state.reminders.find(x=>x.id===id);if(!r)return;
  await storage.saveReminder({...r,completed:!r.completed});await reloadData();notify(r.completed?"Recordatorio marcado como pendiente.":"Recordatorio completado.");
 }
}));
if($("exportBackup"))$("exportBackup").addEventListener("click",safeRun(exportBackup));
if($("importBackupButton"))$("importBackupButton").addEventListener("click",safeRun(async()=>{
 const file=$("importFile")?.files?.[0];
 if(!file){notify("Selecciona primero un archivo JSON de copia de seguridad.",true);return;}
 if(file.size>20*1024*1024){notify("El archivo supera el límite de 20 MB.",true);return;}
 if(!window.confirm("Restaurar esta copia reemplazará las libretas, anotaciones y recordatorios actuales. Descarga una copia de los datos actuales antes de continuar. ¿Deseas seguir?"))return;
 let data;
 try{data=JSON.parse(await file.text());}catch(_){throw new Error("El archivo no contiene JSON válido.");}
 await storage.restoreData(data);await reloadData();$("importFile").value="";notify("Copia restaurada correctamente.");showScreen("homeSection");
}));
if($("importFile"))$("importFile").addEventListener("change",()=>{
 const button=$("importBackupButton");
 if(button)button.disabled=!$("importFile").files||!$("importFile").files.length;
});
if($("exportCSV"))$("exportCSV").addEventListener("click",exportCSV);
if($("printSummary"))$("printSummary").addEventListener("click",printSummary);
if($("printAllRecords"))$("printAllRecords").addEventListener("click",printAllRecords);
if($("eraseAll"))$("eraseAll").addEventListener("click",safeRun(async()=>{
 const answer=window.prompt('Para borrar todos los datos, escribe BORRAR en mayúsculas.');
 if(answer!=="BORRAR"){if(answer!==null)notify("No se borró nada. Debes escribir BORRAR exactamente.");return;}
 await storage.eraseEverything();await reloadData();resetEntryForm();resetReminderForm();notify("Se borraron los datos y se creó una libreta vacía.");showScreen("homeSection");
}));
if($("openLegal"))$("openLegal").addEventListener("click",()=>openDialog("legalDialog"));
if($("closeLegal"))$("closeLegal").addEventListener("click",()=>closeDialog("legalDialog"));
if($("openPrivacy"))$("openPrivacy").addEventListener("click",()=>openDialog("privacyDialog"));
if($("openPrivacyFromAbout"))$("openPrivacyFromAbout").addEventListener("click",()=>openDialog("privacyDialog"));
if($("closePrivacy"))$("closePrivacy").addEventListener("click",()=>closeDialog("privacyDialog"));
["legalDialog","privacyDialog"].forEach(id=>{
 const dlg=$(id);
 if(dlg)dlg.addEventListener("click",event=>{if(event.target===dlg)dlg.close();});
});
if($("helpToggle"))$("helpToggle").addEventListener("click",()=>{
 const help=$("quickHelp");if(!help)return;
 const opening=help.classList.contains("hidden");
 help.classList.toggle("hidden",!opening);
 $("helpToggle").setAttribute("aria-expanded",opening?"true":"false");
 if(opening)help.scrollIntoView({behavior:"smooth",block:"nearest"});
});
if($("summaryMonth"))$("summaryMonth").value=String(new Date().getMonth()+1);
if($("summaryYear"))$("summaryYear").value=String(new Date().getFullYear());
if($("entryDate"))$("entryDate").value=today();
if($("reminderDate"))$("reminderDate").value=today();
if($("importBackupButton"))$("importBackupButton").disabled=true;
if(!storage){
 notify("No se encontró el almacenamiento. Comprueba que /static/storage.js cargue antes que /static/app.js.",true);
 return;
}
(async()=>{
 try{
  await storage.ensureDefaultNotebook();
  await reloadData();
  showScreen("homeSection");
 }catch(error){showError(error);}
})();
});
