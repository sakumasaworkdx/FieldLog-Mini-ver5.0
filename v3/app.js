const APP_VERSION = "v2.6-final-fixed";
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

// ---- 方位補正ロジック ----
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
let currentGeo = null;

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
  
  if (els.acc) {
    const accDisplay = (currentGeo && currentGeo.coords) ? Math.round(currentGeo.coords.accuracy) + "m" : "- m";
    els.acc.textContent = `${accDisplay} (${currentHeading.str})`;
  }
}

// センサーを安全に開始する関数
async function requestHeading() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const resp = await DeviceOrientationEvent.requestPermission();
      if (resp === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    } catch (e) { console.error("Heading Permission Error:", e); }
  } else {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

// ---- GPS取得（方位要求と分離） ----
if (els.btnGeo) {
  els.btnGeo.addEventListener("click", async () => {
    // 1. ボタンを無効化
    els.btnGeo.disabled = true;
    els.btnGeo.textContent = "取得中...";

    // 2. 方位センサーをまず試みる（失敗しても次に進む）
    await requestHeading().catch(() => {});

    // 3. GPS取得
    if (!navigator.geolocation) {
      alert("GPS非対応です");
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
        alert("GPS失敗: " + err.message);
        els.btnGeo.disabled = false;
        els.btnGeo.textContent = "GPS取得";
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ---- ZIP生成（CRC計算などの独自ロジックを完全復元） ----
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

// ---- その他全機能（CSV読み込み、保存、IndexedDB、UI表示）を完全維持 ----

function pad2(n){ return String(n).padStart(2,"0"); }
function formatTs(d){ return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }
function setPreviewFromFile(file){ if (!file) { els.preview.src
