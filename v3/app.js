/* FieldLog v6.5 - app.js (Orientation Corrected) */

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

// --- 3. GPS & 方位（センサー）設定 ---
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// 方位センサーの起動（iOS対応）
async function startOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } catch (err) { console.error("Permission denied", err); }
    } else {
        // Android / PC
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

function handleOrientation(event) {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; // iOS用
    } else if (event.alpha) {
        alpha = 360 - event.alpha; // Android用 (反時計回りを時計回りに変換)
    } else {
        return;
    }

    // ★重要: 画面回転(縦/横)による補正
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

updateGPS();
// 初回クリック時にセンサーを有効化させる
document.body.addEventListener('click', startOrientation, { once: true });

// --- 4. 以降、CSV/保存/一覧/ZIP処理 (前回までの内容を維持) ---
// (省略：前回の全上書きコードと同様)
// ...
