/* * FieldLog v6.7 - 安定版 app.js */

const $ = (id) => document.getElementById(id);

// --- 1. グローバル変数 ---
let db;
let currentPosition = { lat: null, lng: null, heading: 0, headingStr: "-", accuracy: null };
let currentFile = null;
let masterData = [];

// --- 2. IndexedDB 初期化 ---
const DB_NAME = 'FieldLogDB_stable';
const STORE_NAME = 'logs';
const request = indexedDB.open(DB_NAME, 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
};
request.onsuccess = (e) => { db = e.target.result; renderList(); };

// --- 3. カメラプレビュー (オプション) ---
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        $('cameraPreview').srcObject = stream;
    } catch (err) { console.log("Camera preview not available"); }
}
startCamera();

// --- 4. GPS & 方位ロジック (縦横補正付き) ---
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

function handleOrientation(e) {
    let alpha = e.webkitCompassHeading || (360 - (e.alpha || 0));
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;
    currentPosition.heading = Math.round(corrected);
    currentPosition.headingStr = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    updateGpsDisplay();
}

function updateGpsDisplay() {
    $('gpsDisplay').innerHTML = `
        緯度: ${currentPosition.lat ? currentPosition.lat.toFixed(7) : "-"} <br>
        経度: ${currentPosition.lng ? currentPosition.lng.toFixed(7) : "-"} <br>
        方位: ${currentPosition.headingStr} (${currentPosition.heading || 0}°)
    `;
}

// ボタンクリック時にGPSと方位センサーを起動
$('btnGeo').addEventListener('click', async () => {
    $('btnGeo').textContent = "取得中...";
    
    // iOSの方位センサー許可
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') window.addEventListener('deviceorientation', handleOrientation, true);
        } catch (err) { console.error(err); }
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }

    // 位置情報取得
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentPosition.lat = pos.coords.latitude;
            currentPosition.lng = pos.coords.longitude;
            currentPosition.accuracy = pos.coords.accuracy;
            updateGpsDisplay();
            $('btnGeo').textContent = "📍 位置・方位を記録";
            $('btnGeo').style.background = "#007bff";
        },
        (err) => {
            alert("GPSエラー: " + err.message);
            $('btnGeo').textContent = "📍 位置・方位を記録";
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

// --- 5. 写真選択時の処理 ---
$('photoInput').addEventListener('change', (e) => {
    currentFile = e.target.files[0];
    $('statusMsg').textContent = "写真を選択しました";
});

// --- 6. 保存処理 ---
$('saveBtn').addEventListener('click', async () => {
    if (!currentFile) return alert("写真を撮ってください");
    if (!currentPosition.lat) return alert("GPSを取得してください");

    const record = {
        timestamp: new Date().toLocaleString(),
        point: $('locationSelect').value,
        sub: $('subSelect').value,
        item: $('itemSelect').value,
        memo: $('memo').value,
        lat: currentPosition.lat,
        lng: currentPosition.lng,
        heading: currentPosition.heading,
        headingStr: currentPosition.headingStr,
        photoBlob: currentFile,
        fileName: `IMG_${Date.now()}.jpg`
    };

    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => {
        $('statusMsg').textContent = "保存完了！";
        $('memo').value = "";
        currentFile = null;
        renderList();
    };
});

// --- 7. ZIP保存 (フォルダ分け) ---
$('exportBtn').addEventListener('click', () => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const records = e.target.result;
        if (!records.length) return alert("データがありません");

        const separate = confirm("地点ごとにフォルダ分けしますか？");
        const zip = new JSZip();
        let csv = "\ufeff日時,地点,小区分,項目,緯度,経度,方位,備考,ファイル名\n";

        records.forEach(r => {
            csv += `${r.timestamp},${r.point},${r.sub},${r.item},${r.lat},${r.lng},${r.headingStr},${r.memo},${r.fileName}\n`;
            let path = r.fileName;
            if (separate && r.point) {
                path = `${r.point.replace(/[\\/:*?"<>|]/g, "_")}/${r.fileName}`;
            }
            zip.file(path, r.photoBlob);
        });
        zip.file("data.csv", csv);
        zip.generateAsync({type:"blob"}).then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `FieldLog_${Date.now()}.zip`;
            a.click();
        });
    };
});

// リスト表示
function renderList() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const list = $('listContainer');
        list.innerHTML = "";
        e.target.result.reverse().slice(0, 10).forEach(r => {
            const div = document.createElement('div');
            div.style = "padding: 10px; border-bottom: 1px solid #333; font-size: 12px;";
            div.textContent = `${r.timestamp} [${r.point}] ${r.item}`;
            list.appendChild(div);
        });
    };
}

// 全削除
$('clearAllBtn').addEventListener('click', () => {
    if (confirm("全データを削除しますか？")) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => renderList();
    }
});
