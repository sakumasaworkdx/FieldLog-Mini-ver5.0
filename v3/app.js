const APP_VERSION = "v3.0-final-integrated";
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
  exportStatus: $("exportStatus")
};

let currentGeo = null, currentFile = null, currentTs = null;
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// ---- 方位ロジック (縦横補正あり) ----
function handleOrientation(e) {
  let h = e.webkitCompassHeading || (360 - e.alpha);
  if (h !== undefined) {
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (h + angle + 360) % 360;
    currentHeading.val = Math.round(corrected);
    currentHeading.str = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    if (els.acc) {
      const accVal = currentGeo ? Math.round(currentGeo.coords.accuracy) + "m" : "-m";
      els.acc.textContent = `${accVal} (${currentHeading.str})`;
    }
  }
}

// ---- GPS & 方位ボタン (旧版の安定起動を採用) ----
if (els.btnGeo) {
  els.btnGeo.onclick = async () => {
    els.btnGeo.disabled = true;
    els.btnGeo.textContent = "取得中...";

    // 方位センサー起動
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') window.addEventListener("deviceorientation", handleOrientation, true);
      } catch (e) { console.error(e); }
    } else {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true) || 
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    // GPS取得
    navigator.geolocation.getCurrentPosition(
      (p) => {
        currentGeo = p;
        els.lat.textContent = p.coords.latitude.toFixed(7);
        els.lng.textContent = p.coords.longitude.toFixed(7);
        els.acc.textContent = Math.round(p.coords.accuracy) + "m (" + currentHeading.str + ")";
        els.btnGeo.disabled = false;
        els.btnGeo.textContent = "GPS取得";
      },
      (err) => {
        alert("GPS失敗: " + err.message);
        els.btnGeo.disabled = false;
        els.btnGeo.textContent = "GPS取得";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
}

// ---- IndexedDB (最新版の records ストアを使用) ----
const DB_NAME = "offline_survey_pwa_db";
const STORE = "records";
function openDB(){
  return new Promise(res => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => res(req.result);
  });
}
async function dbPut(rec){ const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); await tx.objectStore(STORE).put(rec); db.close(); }
async function dbGetAll(){ const db = await openDB(); return new Promise(res => { const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); req.onsuccess = () => { db.close(); res(req.result || []); }; }); }

// ---- 最新プレビュー・保存機能 ----
function pad2(n){ return String(n).padStart(2,"0"); }
function formatTs(d){ return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }

if (els.photoInput) els.photoInput.onchange = () => {
  currentFile = els.photoInput.files[0];
  currentTs = new Date();
  if (els.autoName) els.autoName.textContent = formatTs(currentTs) + "-01.jpg";
  if (els.ts) els.ts.textContent = currentTs.toLocaleString();
  if (currentFile && els.preview) {
    const url = URL.createObjectURL(currentFile);
    els.preview.src = url;
  }
};

if (els.btnSave) els.btnSave.onclick = async () => {
  if (!currentFile || !currentGeo) return alert("写真とGPSが必要です");
  const ts = currentTs || new Date();
  const rec = {
    id: "id_" + Date.now(),
    createdAt: ts.toISOString(),
    lat: currentGeo.coords.latitude,
    lng: currentGeo.coords.longitude,
    acc: currentGeo.coords.accuracy,
    headingVal: currentHeading.val,
    headingStr: currentHeading.str,
    location: els.selLocation.value,
    location2: els.selLocation2 ? els.selLocation2.value : "",
    item: els.selItem.value,
    memo: els.memo.value,
    memo2: els.memo2 ? els.memo2.value : "",
    photoName: formatTs(ts) + "-01.jpg",
    photoBlob: currentFile
  };
  await dbPut(rec);
  alert("保存しました");
  renderList();
  // クリア処理
  els.memo.value = "";
  if (els.memo2) els.memo2.value = "";
  els.photoInput.value = "";
  currentFile = null;
};

async function renderList(){
  const all = await dbGetAll();
  all.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (els.count) els.count.textContent = all.length;
  if (els.list) {
    els.list.innerHTML = "";
    all.slice(0, 50).forEach(r => {
      const d = document.createElement("div");
      d.className = "item";
      d.innerHTML = `<img class="thumb" src="${URL.createObjectURL(r.photoBlob)}">
        <div class="kv"><b>${r.photoName}</b><br><small>${r.location} / ${r.item} (${r.headingStr})</small></div>`;
      els.list.appendChild(d);
    });
  }
}

// ---- CRC32 & 高速ZIP生成ロジック (最新版機能) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i=0;i<256;i++){ let c=i; for (let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[i]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for (let i=0;i<u8.length;i++) c=CRC_TABLE[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function u16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function strU8(s){ return new TextEncoder().encode(s); }
function concatU8(p){ const len=p.reduce((a,b)=>a+b.length,0); const o=new Uint8Array(len); let f=0; for (const x of p){ o.set(x,f); f+=x.length; } return o; }
function dosTime(date){
  const d=new Date(date);
  const dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  const tm=(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2);
  return {dt,tm};
}
function makeZip(files){
  let lp=[], cp=[], off=0;
  for (const f of files){
    const n=strU8(f.name), d=f.data, c=crc32(d), {dt,tm}=dosTime(f.mtime);
    const lh=concatU8([u32(0x04034b50),u16(20),u16(0),u16(0),u16(tm),u16(dt),u32(c),u32(d.length),u32(d.length),u16(n.length),u16(0),n]);
    lp.push(lh,d);
    const ch=concatU8([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(tm),u16(dt),u32(c),u32(d.length),u32(d.length),u16(n.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off),n]);
    cp.push(ch); off+=lh.length+d.length;
