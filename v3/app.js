const APP_VERSION = "v2.5-gps-stable";
console.log("Offline Survey", APP_VERSION);

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

// ---- 方位補正用変数 ----
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
let currentGeo = null; 

// ---- 方位更新ロジック (GPSを邪魔しないようtry-catchを徹底) ----
function handleOrientation(event) {
  try {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; 
    } else if (event.alpha) {
        alpha = 360 - event.alpha; 
    } else { return; }

    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;
    
    currentHeading.val = corrected;
    currentHeading.str = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    // UIリアルタイム表示（GPSがある場合は精度も表示）
    if (els.acc) {
        const accDisplay = (currentGeo && currentGeo.coords) ? Math.round(currentGeo.coords.accuracy) + "m" : "- m";
        els.acc.textContent = `${accDisplay} (${currentHeading.str})`;
    }
  } catch(e) {}
}

async function startOrientationSensor() {
    // 既に動いている場合は何もしない
    if (window.isHeadingStarted) return; 
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
                window.isHeadingStarted = true;
            }
        } catch (e) { console.warn("Compass permission denied or failed."); }
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
        window.isHeadingStarted = true;
    }
}

// 画面をどこでもいいので触ると方位センサーだけ予備起動
document.body.addEventListener('click', () => startOrientationSensor(), { once: true });

// ---- GPS取得 (安定化処理) ----
if (els.btnGeo) els.btnGeo.addEventListener("click", () => {
  els.btnGeo.disabled = true;
  els.btnGeo.textContent = "取得中...";
  
  // 方位センサーの要求をバックグラウンドへ
  setTimeout(() => startOrientationSensor(), 100);

  if (!navigator.geolocation) {
    alert("このブラウザではGPSが使えません");
    els.btnGeo.disabled = false;
    return;
  }

  // タイムアウト設定を少し緩め、失敗時の再試行をしやすくする
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentGeo = pos;
      setGeoUI(pos);
      els.btnGeo.disabled = false;
      els.btnGeo.textContent = "GPS取得";
    },
    (err) => {
      console.error(err);
      let msg = "GPS取得に失敗しました。";
      if (err.code === 1) msg = "位置情報の利用が許可されていません。";
      if (err.code === 3) msg = "GPS信号が受信できません(タイムアウト)。場所を移動してください。";
      alert(msg);
      els.btnGeo.disabled = false;
      els.btnGeo.textContent = "GPS取得";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

// ---- [以下、ZIP/CSV/IndexedDBの全機能を完全維持] ----

function setGeoUI(pos){
  if(!pos) return;
  els.lat.textContent = pos.coords.latitude.toFixed(7);
  els.lng.textContent = pos.coords.longitude.toFixed(7);
  const accVal = Math.round(pos.coords.accuracy) + "m";
  els.acc.textContent = `${accVal} (${currentHeading.str})`;
}

function pad2(n){ return String(n).padStart(2,"0"); }
function formatTs(d){ return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }
function setPreviewFromFile(file){
  if (!file) { els.preview.src = ""; return; }
  const url = URL.createObjectURL(file); els.preview.src = url;
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function escCsv(v){ const s = String((v === undefined || v === null) ? "" : v); if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"'; return s; }
function escapeHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function uniq(arr){ return Array.from(new Set(arr.filter(v => String(v).trim() !== "").map(v => String(v).trim()))); }
function makeId(){ return "id_" + Date.now() + "_" + Math.floor(Math.random()*1e9); }

const LIST_KEY = "fieldlog_lists_v1";
function loadLists(){
  try{ const raw = localStorage.getItem(LIST_KEY); if (!raw) return { locations: [], locations2: [], items: [] };
    const obj = JSON.parse(raw); return { locations: obj.locations || [], locations2: obj.locations2 || [], items: obj.items || [] };
  }catch(_){ return { locations: [], locations2: [], items: [] }; }
}
function saveLists(lists){ localStorage.setItem(LIST_KEY, JSON.stringify(lists)); }
function setStatus(msg){ if (els.listStatus) els.listStatus.textContent = msg || ""; }

function fillSelect(selectEl, values, placeholder){
  if (!selectEl) return; selectEl.innerHTML = "";
  const ph = document.createElement("option"); ph.value = ""; ph.textContent = placeholder; selectEl.appendChild(ph);
  for (const v of values){ const opt = document.createElement("option"); opt.value = v; opt.textContent = v; selectEl.appendChild(opt); }
}

function refreshListUI(){
  const lists = loadLists(); fillSelect(els.selLocation, lists.locations, "地点を選択");
  fillSelect(els.selLocation2, lists.locations2, "地点2を選択"); fillSelect(els.selItem, lists.items, "調査項目を選択");
  setStatus(`登録済み: 地点 ${lists.locations.length} / 地点2 ${lists.locations2.length} / 項目 ${lists.items.length}`);
}

async function parseListCsv(file){
  const ab = await file.arrayBuffer(); const u8 = new Uint8Array(ab);
  const decode = (enc) => { try{ return new TextDecoder(enc, { fatal:false }).decode(u8); }catch(_){return null;} };
  let text = decode("utf-8") || "";
  if ((text.match(/\uFFFD/g) || []).length > 5) { const sjis = decode("shift-jis"); if (sjis) text = sjis; }
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) throw new Error("CSV空");
  const first = splitCsvLine(lines[0]).map(s => String(s||"").trim());
  const start = (first[0] === "地点" || first[0] === "location") ? 1 : 0;
  const locs = [], locs2 = [], items = [];
  for (let i=start; i<lines.length; i++){
    const row = splitCsvLine(lines[i]);
    if (row[0]) locs.push(row[0]); if (row[1]) locs2.push(row[1]); if (row[2]) items.push(row[2]);
  }
  return { locations: uniq(locs), locations2: uniq(locs2), items: uniq(items) };
}

function splitCsvLine(line){
  const out = []; let cur = ""; let inQ = false;
  for (let i=0; i<line.length; i++){
    const ch = line[i];
    if (ch === '"'){ if (inQ && line[i+1] === '"'){ cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ){ out.push(cur); cur = ""; } else { cur += ch; }
  }
  out.push(cur); return out.map(s => s.trim());
}

if (els.listCsvInput) els.listCsvInput.addEventListener("change", async () => {
  const f = els.listCsvInput.files[0]; if (!f) return;
  try{ setStatus("読込中..."); const lists = await parseListCsv(f); saveLists(lists); refreshListUI(); setStatus("CSV読込完了 ✅"); } 
  catch(e){ alert("CSV失敗"); } finally { els.listCsvInput.value = ""; }
});

if (els.btnClearLists) els.btnClearLists.addEventListener("click", () => {
  if (confirm("削除しますか？")) { saveLists({locations:[], locations2:[], items:[]}); refreshListUI(); }
});

const DB_NAME = "offline_survey_pwa_db";
const STORE = "records";
function openDB(){
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
}
async function dbPut(rec){ const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); await tx.objectStore(STORE).put(rec); db.close(); }
async function dbGetAll(){ const db = await openDB(); return new Promise(res => { const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); req.onsuccess = () => { db.close(); res(req.result || []); }; }); }
async function dbClear(){ const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); await tx.objectStore(STORE).clear(); db.close(); }

let currentFile = null, currentTs = null;

function updateAutoName(){ if (!currentTs) return; els.autoName.textContent = formatTs(currentTs)+"-01.jpg"; els.ts.textContent = currentTs.toLocaleString(); }

if (els.photoInput) els.photoInput.addEventListener("change", () => {
  currentFile = els.photoInput.files[0]; currentTs = new Date(); updateAutoName(); setPreviewFromFile(currentFile);
});

if (els.btnSave) els.btnSave.addEventListener("click", async () => {
  if (!currentFile || !currentGeo) return alert("写真とGPSが必要です");
  const loc = (els.selLocation?.value || "").trim();
  const item = (els.selItem?.value || "").trim();
  if (!loc || !item) return alert("地点と項目を選択してください");

  const ts = currentTs || new Date();
  const all = await dbGetAll();
  const sameSec = all.filter(r => (r.photoName || "").startsWith(formatTs(ts))).length;
  const rec = {
    id: makeId(), createdAt: ts.toISOString(), lat: currentGeo.coords.latitude, lng: currentGeo.coords.longitude, acc: currentGeo.coords.accuracy,
    headingVal: currentHeading.val, headingStr: currentHeading.str,
    location: loc, location2: (els.selLocation2?.value || ""), item: item, memo: els.memo.value, memo2: els.memo2.value,
    photoName: `${formatTs(ts)}-${pad2(sameSec+1)}.jpg`, photoBlob: currentFile
  };
  await dbPut(rec); alert("保存しました"); await renderList();
  els.memo.value = ""; els.memo2.value = ""; els.photoInput.value = ""; currentFile = null;
});

async function renderList(){
  const all = await dbGetAll(); all.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  els.count.textContent = all.length; els.list.innerHTML = "";
  for (const r of all.slice(0, 50)) {
    const d = document.createElement("div"); d.className = "item";
    const url = URL.createObjectURL(r.photoBlob);
    d.innerHTML = `<img class="thumb" src="${url}" onload="setTimeout(()=>URL.revokeObjectURL('${url}'),60000)">
      <div class="kv"><b>${r.photoName}</b><br><small>地点: ${escapeHtml(r.location)} / 項目: ${escapeHtml(r.item)} (${r.headingStr})</small></div>`;
    els.list.appendChild(d);
  }
}

// ---- ZIP生成ロジック (CRC含む全関数を復元) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i=0;i<256;i++){ let c = i; for (let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i=0;i<u8.length;i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function u16(n){ return new Uint8Array([n & 255, (n>>>8) & 255]); }
function u32(n){ return new Uint8Array([n & 255, (n>>>8) & 255, (n>>>16) & 255, (n>>>24) & 255]); }
function strU8(s){ return new TextEncoder().encode(s); }
function concatU8(parts){ const len = parts.reduce((a,b)=>a+b.length,0); const out = new Uint8Array(len); let off=0; for (const p of parts){ out.set(p, off); off += p.length; } return out; }
function dosTime(date){
  const d = new Date(date);
  const dt = ((d.getFullYear()-1980) << 9) | ((d.getMonth()+1) << 5) | d.getDate();
  const tm = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds()/2);
  return {dt, tm};
}
function makeZip(files){
  let lp = [], cp = [], offset = 0;
  for (const f of files){
    const n = strU8(f.name), d = f.data, c = crc32(d), {dt, tm} = dosTime(f.mtime);
    const lh = concatU8([u32(0x04034b50), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(d.length), u32(d.length), u16(n.length), u16(0), n]);
    lp.push(lh, d);
    const ch = concatU8([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(d.length), u32(d.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), n]);
    cp.push(ch); offset += lh.length + d.length;
  }
  const cd = concatU8(cp);
  return concatU8([...lp, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
}

if (els.btnExportZip) els.btnExportZip.addEventListener("click", async () => {
  els.btnExportZip.disabled = true; els.exportStatus.textContent = "ZIP生成中...";
  try {
    const all = await dbGetAll(); if (!all.length) return alert("データなし");
    let csv = "\uFEFFphoto,createdAt,location,location2,item,lat,lng,acc,heading,headingName,memo,memo2\n";
    const files = [];
    for (const r of all){
      csv += `${r.photoName},${r.createdAt},${escCsv(r.location)},${escCsv(r.location2)},${escCsv(r.item)},${r.lat},${r.lng},${Math.round(r.acc)},${Math.round(r.headingVal||0)},${r.headingStr||"-"},${escCsv(r.memo)},${escCsv(r.memo2)}\n`;
      files.push({ name: "photos/" + r.photoName, data: new Uint8Array(await r.photoBlob.arrayBuffer()), mtime: new Date(r.createdAt) });
    }
    files.push({ name: "records.csv", data: strU8(csv), mtime: new Date() });
    downloadBlob(new Blob([makeZip(files)], { type: "application/zip" }), `survey_${formatTs(new Date())}.zip`);
    els.exportStatus.textContent = "書き出しました ✅";
  } catch (e) { alert("失敗"); } finally { els.btnExportZip.disabled = false; }
});

if (els.btnClear) els.btnClear.addEventListener("click", async () => { if(confirm("全消去？")){ await dbClear(); renderList(); } });

(async function(){ refreshListUI(); updateAutoName(); renderList(); })();
