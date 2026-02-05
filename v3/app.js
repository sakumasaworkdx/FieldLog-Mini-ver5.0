/* * FieldLog v6.6 - app.js
 * 修正内容: GPS方位取得の安定化（iOS/Android対応）および画面回転補正の追加
 */

// --- 1. グローバル変数・要素取得 ---
let db;
// headingオブジェクトを整理
let currentPosition = { lat: null, lng: null, heading: 0, headingStr: "-", accuracy: null };
let stream = null;
let masterData = [];

const video = document.getElementById('cameraPreview');
const canvas = document.getElementById('photoCanvas');
const locationSelect = document.getElementById('locationSelect'); 
const subSelect = document.getElementById('subSelect');           
const itemSelect = document.getElementById('itemSelect');         
const csvInput = document.getElementById('csvInput');             
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const listContainer = document.getElementById('listContainer');
const statusMsg = document.getElementById('statusMsg');
const gpsStatus = document.getElementById('gpsStatus');

// --- 2. IndexedDB 初期化 (変更なし) ---
const DB_NAME = 'FieldLogDB_v6';
const STORE_NAME = 'logs';
const request = indexedDB.open(DB_NAME, 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
};
request.onsuccess = (e) => { db = e.target.result; loadList(); };

// --- 3. カメラ & GPS (方位ロジックを強化) ---
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
    } catch (err) { statusMsg.textContent = "カメラエラー: " + err.message; }
}
initCamera();

const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// ★方位更新関数 (縦横補正付き)
function handleOrientation(e) {
    let alpha = 0;
    if (e.webkitCompassHeading) {
        alpha = e.webkitCompassHeading; // iOS
    } else if (e.alpha) {
        alpha = 360 - e.alpha; // Android
    } else { return; }

    // 画面の回転角を補正
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;

    currentPosition.heading = Math.round(corrected);
    currentPosition.headingStr = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    updateGpsStatusDisplay();
}

function updateGpsStatusDisplay() {
    if (currentPosition.lat) {
        gpsStatus.textContent = `GPS: 取得済 (精度${Math.round(currentPosition.accuracy)}m) ${currentPosition.headingStr}`;
        gpsStatus.style.color = "green";
    }
}

function updateGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lng = pos.coords.longitude;
        currentPosition.accuracy = pos.coords.accuracy;
        updateGpsStatusDisplay();
    }, null, { enableHighAccuracy: true });
}
updateGPS();

// --- 4. CSV読込 & プルダウン連動 (変更なし) ---
csvInput.addEventListener('change', e => {
    const reader = new FileReader();
    reader.onload = evt => {
        const lines = evt.target.result.split(/\r\n|\n/);
        masterData = lines.filter(l => l.trim()).map(l => {
            const c = l.split(',');
            return { loc: c[0]?.trim(), sub: c[1]?.trim(), item: c[2]?.trim() };
        });
        initDropdowns();
    };
    reader.readAsText(e.target.files[0], 'Shift_JIS');
});

function initDropdowns() {
    const locSet = new Set(masterData.map(d => d.loc).filter(v => v));
    populateSelect(locationSelect, Array.from(locSet));
}

locationSelect.addEventListener('change', () => {
    const filtered = masterData.filter(d => d.loc === locationSelect.value);
    populateSelect(subSelect, Array.from(new Set(filtered.map(d => d.sub).filter(v => v))));
    itemSelect.innerHTML = '<option value="">選択してください</option>';
});

subSelect.addEventListener('change', () => {
    const filtered = masterData.filter(d => d.loc === locationSelect.value && d.sub === subSelect.value);
    populateSelect(itemSelect, Array.from(new Set(filtered.map(d => d.item).filter(v => v))));
});

function populateSelect(elem, items) {
    elem.innerHTML = '<option value="">選択してください</option>';
    items.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; elem.appendChild(o); });
}

// --- 5. 記録保存 (ここで方位センサーを明示的に開始) ---
saveBtn.addEventListener('click', async () => {
    // ★ブラウザ制限対策: 保存ボタンが押されたタイミングで方位センサーの使用を要求
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } catch (e) { console.error("Orientation permission error:", e); }
    } else {
        // Android等
        window.addEventListener('deviceorientationabsolute', handleOrientation, true) || 
        window.addEventListener('deviceorientation', handleOrientation, true);
    }

    const w = video.videoWidth, h = video.videoHeight;
    if (w === 0) return alert("カメラが起動していません");

    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob(blob => {
        const now = new Date();
        const ts = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-
