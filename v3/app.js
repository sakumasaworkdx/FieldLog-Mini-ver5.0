const APP_VERSION = "v2.7-stable-fix";
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

// ---- 方位センサー制御 (GPSと完全に切り離す) ----
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
let currentGeo = null;
let isHeadingActive = false;

function handleOrientation(event) {
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
  
  // 表示の即時更新
  if (els.acc) {
    const accDisplay = (currentGeo && currentGeo.coords) ? Math.round(currentGeo.coords.accuracy) + "m" : "- m";
    els.acc.textContent = `${accDisplay} (${currentHeading.str})`;
  }
}

// ユーザーが最初に画面を触った時にセンサーを起動する（重要）
async function initSensor() {
  if (isHeadingActive) return;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const resp = await DeviceOrientationEvent.requestPermission();
      if (resp === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation, true);
        isHeadingActive = true;
      }
    } catch (e) { console.warn("Sensor denied"); }
  } else {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    isHeadingActive = true;
  }
}
// 画面タップで方位準備
document.body.addEventListener('touchstart', initSensor, { once: false });
document.body.addEventListener('click', initSensor, { once: false });

// ---- GPS取得 (v2.0の安定した書き方に戻す) ----
if (els.btnGeo) {
  els.btnGeo.addEventListener("click", () => {
    els.btnGeo.disabled = true;
    els.btnGeo.textContent = "取得中...";

    if (!navigator.geolocation) {
      alert("GPS非対応");
      els.btnGeo.disabled = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentGeo = pos;
        els.lat.textContent = pos.coords.latitude.toFixed(7);
        els.lng.textContent = pos.coords.longitude.toFixed(7);
        els.acc.textContent = Math.round(pos.coords.accuracy) + "m (" + currentHeading.str + ")";
        els.btnGeo.disabled = false;
        els.btnGeo.textContent = "GPS取得";
      },
      (err) => {
        alert("GPSエラー: " + err.message);
        els.btnGeo.disabled = false;
        els.btnGeo.textContent = "GPS取得";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ---- ZIP生成（CRC計算を含む以前の全ロジックを復元） ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i=0; i<256; i++) {
    let c = i; for (let k=0; k<8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF; for (let i=0; i<u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
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
  let lp = [], cp = [], offset = 0;
  for (const f of files){
    const n = strU8(f.name), d = f.data, c = crc32(d), {dt, tm} = dosTime(f.mtime);
    const lh = concatU8([u32(0x04034b50), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(d.length), u32(d.length), u16(n.length), u16(0), n]);
    lp.push(lh, d);
    const ch = concatU8([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(tm), u16(dt), u32(c), u32(d.length), u32(d.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), n]);
    cp.push(ch); offset += lh.length + d.length;
  }
  const cd = concatU8(cp);
  const end = concatU8([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return concatU8([...lp, cd, end]);
}

// ---- 保存・IndexedDB関連（v2.0を維持） ----
const DB_NAME = "offline_survey_pwa_db";
const STORE = "records";
function openDB(){
  return new Promise((res) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => res(req.result);
  });
}
async function dbPut(rec){ const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); await tx.objectStore(STORE).put(rec); db.close(); }
async function dbGetAll(){ const db = await openDB(); return new Promise(res => { const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); req.onsuccess = () => { db.close(); res(req.result || []); }; }); }

let currentFile = null, currentTs = null;
function pad2(n){ return String(n).padStart(2,"0"); }
function formatTs(d){ return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }

if (els.photoInput) els.photoInput.addEventListener("change", () => {
  currentFile = els.photoInput.files[0]; currentTs = new Date();
  els.autoName.textContent = formatTs(currentTs)+"-01.jpg"; els.ts.textContent = currentTs.toLocaleString();
  if(currentFile) { const url = URL.createObjectURL(currentFile); els.preview.src = url; }
});

if (els.btnSave) els.btnSave.addEventListener("click", async () => {
  if (!currentFile || !currentGeo) return alert("写真とGPSが必要です");
  const rec = {
    id: "id_" + Date.now(), createdAt: new Date().toISOString(),
    lat: currentGeo.coords.latitude, lng: currentGeo.coords.longitude, acc: currentGeo.coords.accuracy,
    headingVal: currentHeading.val, headingStr: currentHeading.str,
    location: els.selLocation.value, location2: els.selLocation2.value, item: els.selItem.value,
    memo: els.memo.value, memo2: els.memo2.value,
    photoName: formatTs(currentTs)+"-01.jpg", photoBlob: currentFile
  };
  await dbPut(rec); alert("保存しました"); renderList();
});

async function renderList(){
  const all = await dbGetAll(); all.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  els.count.textContent = all.length; els.list.innerHTML = "";
  all.slice(0, 50).forEach(r => {
    const d = document.createElement("div"); d.className = "item";
    d.innerHTML = `<img class="thumb" src="${URL.createObjectURL(r.photoBlob)}">
      <div class="kv"><b>${r.photoName}</b><br><small>${r.location} / ${r.item} (${r.headingStr})</small></div>`;
    els.list.appendChild(d);
  });
}

// CSV読み込み・ZIP書き出し（v2.0を維持）
if (els.listCsvInput) els.listCsvInput.addEventListener("change", async () => {
  const f = els.listCsvInput.files[0]; if (!f) return;
  const ab = await f.arrayBuffer(); const text = new TextDecoder("utf-8").decode(ab);
  const lines = text.split("\n").filter(l => l.trim() !== "");
  const locs = [], items = [];
  lines.forEach(l => { const r = l.split(","); if(r[0]) locs.push(r[0]); if(r[2]) items.push(r[2]); });
  localStorage.setItem("fieldlog_lists_v1", JSON.stringify({locations:locs, items:items}));
  location.reload();
});

if (els.btnExportZip) els.btnExportZip.addEventListener("click", async () => {
  const all = await dbGetAll(); if (!all.length) return alert("なし");
  let csv = "\uFEFFphoto,lat,lng,acc,heading,memo\n";
  const files = [];
  for (const r of all){
    csv += `${r.photoName},${r.lat},${r.lng},${r.acc},${r.headingStr},${r.memo}\n`;
    files.push({ name: "photos/" + r.photoName, data: new Uint8Array(await r.photoBlob.arrayBuffer()), mtime: new Date() });
  }
  files.push({ name: "records.csv", data: strU8(csv), mtime: new Date() });
  const blob = new Blob([makeZip(files)], { type: "application/zip" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "survey.zip"; a.click();
});

(async function(){ renderList(); })();
