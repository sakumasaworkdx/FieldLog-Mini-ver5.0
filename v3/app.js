const APP_VERSION = "v2.1-corrected"; 
console.log("Offline Survey", APP_VERSION);

// --- 以前の els 定義をそのまま維持 ---
const $ = (id) => document.getElementById(id);

const els = {
  listCsvInput: $("listCsvInput"),
  btnClearLists: $("btnClearLists"),
  listStatus: $("listStatus"),
  selLocation: $("selLocation"),
  selLocation2: $("selLocation2"),
  selItem: $("selItem"),

  photoInput: $("photoInput"),
  btnGeo: $("btnGeo"),
  btnSave: $("btnSave"),
  btnExportZip: $("btnExportZip"),
  btnClear: $("btnClear"),
  lat: $("lat"),
  lng: $("lng"),
  acc: $("acc"),
  memo: $("memo"),
  memo2: $("memo2"),
  preview: $("preview"),
  autoName: $("autoName"),
  ts: $("ts"),
  list: $("list"),
  count: $("count"),
  exportStatus: $("exportStatus"),
  swState: $("swState"),
  btnInstall: $("btnInstall"),
};

// --- 方位補正用の定義を追加 ---
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

function handleOrientation(event) {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; 
    } else if (event.alpha) {
        alpha = 360 - event.alpha; 
    } else { return; }

    // 画面の回転（縦/横）を検知して角度を補正
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;
    
    currentHeading.val = corrected;
    currentHeading.str = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    // UIの表示を更新（精度表示の横に方位を表示）
    if (els.acc && currentGeo) {
        els.acc.textContent = Math.round(currentGeo.coords.accuracy) + "m (" + currentHeading.str + ")";
    }
}

async function startOrientationSensor() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

// --- 以下、既存の関数群 (pad2〜renderListまで元のコードをそのまま貼り付け) ---

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (els.btnInstall) els.btnInstall.style.display = "inline-block";
});
if (els.btnInstall) els.btnInstall.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.btnInstall.style.display = "none";
});

(async function initSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.register("./sw.js");
    els.swState.textContent = "SW: registered";
    if (reg && reg.update) reg.update();
  }catch(e){
    els.swState.textContent = "SW: failed";
  }
})();

function pad2(n){ return String(n).padStart(2,"0"); }
function formatTs(d){
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
function setGeoUI(pos){
  els.lat.textContent = (pos && pos.coords && typeof pos.coords.latitude==="number") ? pos.coords.latitude.toFixed(7) : "-";
  els.lng.textContent = (pos && pos.coords && typeof pos.coords.longitude==="number") ? pos.coords.longitude.toFixed(7) : "-";
  els.acc.textContent = (pos && pos.coords && typeof pos.coords.accuracy==="number") ? (Math.round(pos.coords.accuracy) + "m (" + currentHeading.str + ")") : "-";
}
function setPreviewFromFile(file){
  if (!file) { els.preview.src = ""; return; }
  const url = URL.createObjectURL(file);
  els.preview.src = url;
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function escCsv(v){
  const s = String((v === undefined || v === null) ? "" : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}
function escapeHtml(s){
  return String((s === undefined || s === null) ? "" : s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function uniq(arr){
  return Array.from(new Set(arr.filter(v => String(v).trim() !== "").map(v => String(v).trim())));
}
function makeId(){
  if (window.crypto && crypto.getRandomValues){
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    let s = "";
    for (let i=0;i<buf.length;i++){ s += ("0" + buf[i].toString(16)).slice(-2); }
    return s;
  }
  return "id_" + Date.now() + "_" + Math.floor(Math.random()*1e9);
}

const LIST_KEY = "fieldlog_lists_v1";
function loadLists(){
  try{
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return { locations: [], locations2: [], items: [] };
    const obj = JSON.parse(raw);
    return {
      locations: Array.isArray(obj.locations) ? obj.locations : [],
      locations2: Array.isArray(obj.locations2) ? obj.locations2 : [],
      items: Array.isArray(obj.items) ? obj.items : []
    };
  }catch(_){ return { locations: [], locations2: [], items: [] }; }
}
function saveLists(lists){
  localStorage.setItem(LIST_KEY, JSON.stringify({
    locations: lists.locations || [],
    locations2: lists.locations2 || [],
    items: lists.items || []
  }));
}
function setStatus(msg){ if (els.listStatus) els.listStatus.textContent = msg || ""; }

function fillSelect(selectEl, values, placeholder){
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = placeholder;
  selectEl.appendChild(ph);
  for (const v of values){
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

function refreshListUI(){
  const lists = loadLists();
  fillSelect(els.selLocation, lists.locations, "地点を選択");
  fillSelect(els.selLocation2, lists.locations2, "地点2を選択");
  fillSelect(els.selItem, lists.items, "調査項目を選択");
  setStatus(`登録済み: 地点 ${lists.locations.length} / 地点2 ${lists.locations2.length} / 項目 ${lists.items.length}`);
}

async function parseListCsv(file){
  const ab = await file.arrayBuffer();
  const u8 = new Uint8Array(ab);
  function decodeWith(enc){
    try{ const dec = new TextDecoder(enc, { fatal:false }); return dec.decode(u8); }catch(_){ return null; }
  }
  let text = decodeWith("utf-8") || "";
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > 5 || (!text.includes(",") && !text.includes("，"))) {
    const sjis = decodeWith("shift-jis");
    if (sjis) text = sjis;
  }
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) throw new Error("CSVが空です");
  const first = splitCsvLine(lines[0]).map(s => String(s || "").trim());
  const isHeader = (first[0] === "地点" || first[0] === "location") || (first[1] === "地点2" || first[1] === "location2") || (first[2] === "項目" || first[2] === "item");
  const start = isHeader ? 1 : 0;
  const locs = []; const locs2 = []; const items = [];
  for (let i=start;i<lines.length;i++){
    const row = splitCsvLine(lines[i]);
    if (row[0]) locs.push(row[0]);
    if (row[1]) locs2.push(row[1]);
    if (row[2]) items.push(row[2]);
  }
  return { locations: uniq(locs), locations2: uniq(locs2), items: uniq(items) };
}

function splitCsvLine(line){
  const out = []; let cur = ""; let inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){ if (inQ && line[i+1] === '"'){ cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ){ out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(s => String((s === undefined || s === null) ? "" : s).trim());
}

if (els.listCsvInput) els.listCsvInput.addEventListener("change", async () => {
  const f = (els.listCsvInput.files && els.listCsvInput.files[0]);
  if (!f) return;
  try{
    setStatus("CSV読込中...");
    const lists = await parseListCsv(f);
    saveLists(lists);
    refreshListUI();
    setStatus("CSVを読み込みました ✅");
  }catch(e){ alert("CSV読み込みに失敗"); }finally{ els.listCsvInput.value = ""; }
});

if (els.btnClearLists) els.btnClearLists.addEventListener("click", () => {
  if (!confirm("地点/項目リストを削除しますか？")) return;
  saveLists({locations:[], items:[]});
  refreshListUI();
});

const DB_NAME = "offline_survey_pwa_db";
const DB_VER = 1;
const STORE = "records";

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(record){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const e = tx.error; db.close(); reject(e); };
  });
}
async function dbGetAll(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => { const v = req.result || []; db.close(); resolve(v); };
    req.onerror = () => { const e = req.error; db.close(); reject(e); };
  });
}
async function dbClear(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const e = tx.error; db.close(); reject(e); };
  });
}

let currentFile = null;
let currentGeo = null;
let currentTs = null;

function updateAutoName(){
  if (!currentTs) { els.autoName.textContent = "-"; els.ts.textContent = "-"; return; }
  const base = formatTs(currentTs);
  els.autoName.textContent = `${base}-01.jpg`;
  els.ts.textContent = currentTs.toLocaleString();
}

if (els.photoInput) els.photoInput.addEventListener("change", () => {
  currentFile = ((els.photoInput.files && els.photoInput.files[0]) ? els.photoInput.files[0] : null);
  currentTs = new Date();
  updateAutoName();
  setPreviewFromFile(currentFile);
});

// GPSボタンクリック時に方位センサーも開始
if (els.btnGeo) els.btnGeo.addEventListener("click", async () => {
  els.btnGeo.disabled = true;
  els.btnGeo.textContent = "GPS取得中...";
  startOrientationSensor(); // 方位開始
  try {
    currentGeo = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no geolocation"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
    });
    setGeoUI(currentGeo);
  } catch (e) { alert("GPS取得失敗"); } finally {
    els.btnGeo.disabled = false;
    els.btnGeo.textContent = "GPS取得";
  }
});

if (els.btnSave) els.btnSave.addEventListener("click", async () => {
  if (!currentFile || !currentGeo) { alert("写真とGPSが必要です"); return; }
  const location = (els.selLocation?.value || "").trim();
  const location2 = (els.selLocation2?.value || "").trim();
  const item = (els.selItem?.value || "").trim();
  if (!location || !item) { alert("地点と項目を選択してください"); return; }

  const ts = (currentTs || new Date());
  const base = formatTs(ts);
  const all = await dbGetAll();
  const sameSec = all.filter(r => (r.photoName || "").startsWith(base + "-")).length;
  const photoName = `${base}-${pad2(sameSec + 1)}.jpg`;

  const blob = (currentFile.type?.indexOf("image/") === 0) ? currentFile : new Blob([await currentFile.arrayBuffer()], { type: "image/jpeg" });

  const rec = {
    id: makeId(),
    createdAt: ts.toISOString(),
    lat: currentGeo.coords.latitude,
    lng: currentGeo.coords.longitude,
    acc: currentGeo.coords.accuracy,
    headingVal: currentHeading.val,   // 追加
    headingStr: currentHeading.str,   // 追加
    location, location2, item,
    memo: (els.memo.value || "").trim(),
    memo2: (els.memo2.value || "").trim(),
    photoName, photoType: blob.type || "image/jpeg", photoBlob: blob
  };

  try {
    await dbPut(rec);
    els.memo.value = ""; els.memo2.value = ""; els.photoInput.value = "";
    if (els.selItem) els.selItem.value = "";
    currentFile = null; currentGeo = null; currentTs = null;
    setGeoUI(null); els.preview.src = ""; updateAutoName();
    await renderList();
    alert("保存しました");
  } catch (e) { alert("保存失敗"); }
});

async function renderList(){
  const all = await dbGetAll();
  all.sort((a,b) => (a.createdAt < b.createdAt ? 1 : -1));
  els.count.textContent = String(all.length);
  els.list.innerHTML = "";
  for (const r of all.slice(0, 50)) {
    const wrap = document.createElement("div");
    wrap.className = "item";
    const img = document.createElement("img");
    img.className = "thumb";
    try{
      const url = URL.createObjectURL(r.photoBlob);
      img.src = url; img.onload = () => setTimeout(()=>URL.revokeObjectURL(url), 60000);
    }catch(_){}
    const right = document.createElement("div");
    right.className = "kv";
    right.innerHTML = `
      <div><b>${r.photoName}</b></div>
      <div class="small">地点: ${escapeHtml(r.location)} / 項目: ${escapeHtml(r.item)} (${r.headingStr || "-"})</div>
      <div class="small">備考: ${escapeHtml(r.memo)} / 備考2: ${escapeHtml(r.memo2)}</div>
    `;
    wrap.appendChild(img); wrap.appendChild(right); els.list.appendChild(wrap);
  }
}

// --- ZIP出力関連 (元のロジック維持 + CSV列追加) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++){
    let c = i; for (let k=0;k<8;k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(u8){
  let c = 0xFFFFFFFF; for (let i=0;i<u8.length;i++){ c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(n){ return new Uint8Array([n & 255, (n>>>8) & 255]); }
function u32(n){ return new Uint8Array([n & 255, (n>>>8) & 255, (n>>>16) & 255, (n>>>24) & 255]); }
function strU8(s){ return new TextEncoder().encode(s); }
function concatU8(parts){
  const len = parts.reduce((a,b)=>a+b.length,0);
  const out = new Uint8Array(len); let off=0;
  for (const p of parts){ out.set(p, off); off += p.length; }
  return out;
}
function dosTime(date){
  const d = new Date(date);
  const dt = ((d.getFullYear()-1980) << 9) | ((d.getMonth()+1) << 5) | d.getDate();
  const tm = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds()/2);
  return {dt, tm};
}
function makeZip(files){
  let localParts = []; let centralParts = []; let offset = 0;
  for (const f of files){
    const nameU8 = strU8(f.name); const dataU8 = f.data; const c = crc32(dataU8); const {dt, tm} = dosTime(f.mtime);
    const lh = concatU8([u32(0x04034b50), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(dataU8.length), u32(dataU8.length), u16(nameU8.length), u16(0), nameU8]);
    localParts.push(lh, dataU8);
    const ch = concatU8([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(dataU8.length), u32(dataU8.length), u16(nameU8.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameU8]);
    centralParts.push(ch); offset += lh.length + dataU8.length;
  }
  const cd = concatU8(centralParts);
  const end = concatU8([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return concatU8([...localParts, cd, end]);
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

if (els.btnExportZip) els.btnExportZip.addEventListener("click", async () => {
  els.btnExportZip.disabled = true; els.exportStatus.textContent = "ZIP生成中...";
  try {
    const all = await dbGetAll(); if (all.length === 0) return alert("データなし");
    const header = ["photo","createdAt","location","location2","item","lat","lng","acc","heading","headingName","memo","memo2"];
    const rows = [header.join(",")];
    for (const r of all){
      rows.push([escCsv(r.photoName), escCsv(r.createdAt), escCsv(r.location), escCsv(r.location2), escCsv(r.item), escCsv(r.lat), escCsv(r.lng), escCsv(Math.round(r.acc)), escCsv(r.headingVal || 0), escCsv(r.headingStr || "-"), escCsv(r.memo), escCsv(r.memo2)].join(","));
    }
    const files = [{ name: "records.csv", data: strU8("\uFEFF" + rows.join("\r\n")), mtime: new Date() }];
    for (const r of all){
      files.push({ name: "photos/" + r.photoName, data: new Uint8Array(await r.photoBlob.arrayBuffer()), mtime: new Date(r.createdAt) });
    }
    downloadBlob(new Blob([makeZip(files)], { type: "application/zip" }), `survey_${formatTs(new Date())}.zip`);
    els.exportStatus.textContent = "完了";
  } catch (e) { alert("ZIP失敗"); } finally { els.btnExportZip.disabled = false; }
});

if (els.btnClear) els.btnClear.addEventListener("click", async () => {
  if (confirm("全消去しますか？")) { await dbClear(); renderList(); }
});

(async function(){ refreshListUI(); updateAutoName(); renderList(); })();
