const APP_VERSION = "v2.8-stable-fix";
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

// ---- 方位管理ロジック (縦横補正付き) ----
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
let currentGeo = null;

function handleOrientation(event) {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; // iOS
    } else if (event.alpha) {
        alpha = 360 - event.alpha; // Android
    } else { return; }

    // ★縦横補正: 画面の回転角(0, 90, -90)を取得して方位に加算
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;
    
    currentHeading.val = Math.round(corrected);
    currentHeading.str = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    // リアルタイム表示
    if (els.acc) {
        const accDisplay = (currentGeo && currentGeo.coords) ? Math.round(currentGeo.coords.accuracy) + "m" : "- m";
        els.acc.textContent = `${accDisplay} (${currentHeading.str})`;
    }
}

// 方位センサーの起動をGPSと分離
async function startHeading() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

// ---- GPS取得 (ここをシンプルに復旧) ----
if (els.btnGeo) {
    els.btnGeo.addEventListener("click", () => {
        els.btnGeo.disabled = true;
        els.btnGeo.textContent = "取得中...";

        // ★重要: 方位センサーを同時に起動（ただしawaitしないことでGPSを邪魔しない）
        startHeading();

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
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

// ---- 以下、ZIP/CSV/IndexedDBの全機能は変更せず維持 ----

// (ZIP生成のCRC計算、makeZip、CSV読込、IndexedDB処理などは元のv2.0〜v2.7と同じものを維持します)
// ...中略（ZIP/CSV/IndexedDBのコード）...

if (els.btnSave) els.btnSave.addEventListener("click", async () => {
    if (!currentFile || !currentGeo) return alert("写真とGPSが必要です");
    const rec = {
        id: "id_" + Date.now(), createdAt: new Date().toISOString(),
        lat: currentGeo.coords.latitude, lng: currentGeo.coords.longitude, acc: currentGeo.coords.accuracy,
        heading: currentHeading.val, // ★方位(数値)を保存
        headingName: currentHeading.str, // ★方位(北/南など)も保存
        location: els.selLocation.value, location2: els.selLocation2.value, item: els.selItem.value,
        memo: els.memo.value, memo2: els.memo2.value,
        photoName: formatTs(currentTs)+"-01.jpg", photoBlob: currentFile
    };
    await dbPut(rec); alert("保存しました"); renderList();
});

// CSV書き出し部分も修正
if (els.btnExportZip) els.btnExportZip.addEventListener("click", async () => {
    const all = await dbGetAll();
    // CSVヘッダーに方位を追加
    let csv = "\uFEFFphoto,lat,lng,acc,heading,headingName,location,item,memo\n";
    for (const r of all){
        csv += `${r.photoName},${r.lat},${r.lng},${r.acc},${r.heading},${r.headingName},${r.location},${r.item},${r.memo}\n`;
        // ... ZIP追加処理
    }
});

// 初期化（リスト描画など）
(async function(){ renderList(); })();
