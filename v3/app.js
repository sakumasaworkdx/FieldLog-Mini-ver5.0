/* FieldLog v6.5 - app.js
 * 機能: GPS/写真/属性記録, 縦横方位補正, ZIPフォルダ分け, 完全オフライン
 */

let db;
let currentPosition = { lat: null, lng: null, heading: null, accuracy: null, headingStr: "-" };
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

const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// --- 1. IndexedDB 初期化 ---
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

// --- 2. カメラ起動 ---
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
    } catch (err) { statusMsg.textContent = "カメラエラー: " + err.message; }
}
initCamera();

// --- 3. GPS & 方位（センサー）設定 & 縦横補正 ---

// iOS対応の方位センサー開始
async function startOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } catch (err) { console.error("Orientation Permission Denied", err); }
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

function handleOrientation(event) {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; // iOS
    } else if (event.alpha) {
        alpha = 360 - event.alpha; // Android (時計回りに変換)
    } else { return; }

    // ★ 縦横補正: 端末を左/右に倒した時の角度(90/-90)を取得して加算
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const correctedHeading = (alpha + angle + 360) % 360;

    currentPosition.heading = correctedHeading;
    currentPosition.headingStr = DIR_NAMES[Math.round(correctedHeading / 22.5) % 16];
    updateStatusDisplay();
}

function updateGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lng = pos.coords.longitude;
        currentPosition.accuracy = pos.coords.accuracy;
        updateStatusDisplay();
    }, null, { enableHighAccuracy: true });
}

function updateStatusDisplay() {
    gpsStatus.textContent = `GPS: 精度${Math.round(currentPosition.accuracy || 0)}m / 方位: ${currentPosition.headingStr}`;
    gpsStatus.style.color = currentPosition.accuracy ? "green" : "red";
}

// 初期化
updateGPS();
document.body.addEventListener('click', startOrientation, { once: true });

// --- 4. CSV読込 & プルダウン連動 ---
csvInput.addEventListener('change', e => {
    const reader = new FileReader();
    reader.onload = evt => {
        const lines = evt.target.result.split(/\r\n|\n/);
        masterData = lines.filter(l => l.trim()).map(l => {
            const c = l.split(',');
            return { loc: c[0]?.trim(), sub: c[1]?.trim(), item: c[2]?.trim() };
        });
        const locSet = new Set(masterData.map(d => d.loc).filter(v => v));
        populateSelect(locationSelect, Array.from(locSet));
        statusMsg.textContent = "CSV読込完了";
    };
    reader.readAsText(e.target.files[0], 'Shift_JIS');
});

locationSelect.addEventListener('change', () => {
    const filtered = masterData.filter(d => d.loc === locationSelect.value);
    populateSelect(subSelect, Array.from(new Set(filtered.map(d => d.sub).filter(v => v))));
    itemSelect.innerHTML = '<option value="">項目を選択</option>';
});

subSelect.addEventListener('change', () => {
    const filtered = masterData.filter(d => d.loc === locationSelect.value && d.sub === subSelect.value);
    populateSelect(itemSelect, Array.from(new Set(filtered.map(d => d.item).filter(v => v))));
});

function populateSelect(elem, items) {
    elem.innerHTML = '<option value="">選択してください</option>';
    items.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; elem.appendChild(o); });
}

// --- 5. 記録保存 ---
saveBtn.addEventListener('click', () => {
    const w = video.videoWidth, h = video.videoHeight;
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob(blob => {
        const now = new Date();
        const ts = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + "_" + ('0'+now.getHours()).slice(-2) + ('0'+now.getMinutes()).slice(-2) + ('0'+now.getSeconds()).slice(-2);
        const record = {
            timestamp: now.toLocaleString(),
            fileName: `IMG_${ts}.jpg`,
            point: locationSelect.value || "",
            sub: subSelect.value || "",
            item: itemSelect.value || "",
            lat: currentPosition.lat || 0,
            lng: currentPosition.lng || 0,
            headingVal: currentPosition.heading || 0,
            headingStr: currentPosition.headingStr || "-",
            photoBlob: blob
        };
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(record);
        tx.oncomplete = () => { statusMsg.textContent = "保存完了"; loadList(); };
    }, 'image/jpeg', 0.8);
});

// --- 6. 一覧表示・削除 ---
function loadList() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        listContainer.innerHTML = "";
        e.
