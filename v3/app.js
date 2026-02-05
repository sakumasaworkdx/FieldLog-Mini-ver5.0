/* * FieldLog v6.5.1 - app.js 
 * 安定ロールバック版: GPS・方位取得の確実性を向上
 */

// --- 1. グローバル変数・要素取得 ---
let db;
// headingStrとheadingValを初期化
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

// --- 2. IndexedDB 初期化 (v6.5 構造維持) ---
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

// --- 3. カメラ起動 ---
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
    } catch (err) { statusMsg.textContent = "カメラエラー: " + err.message; }
}
initCamera();

// --- 4. GPS & 方位計測 (ここを安定ロジックに差し替え) ---
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// 方位を計算・表示する関数
function handleOrientation(e) {
    let heading = 0;
    if (e.webkitCompassHeading) {
        heading = e.webkitCompassHeading; // iOS
    } else if (e.alpha) {
        heading = 360 - e.alpha; // Android
    } else { return; }

    // 画面の回転（横持ち）補正
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (heading + angle + 360) % 360;

    currentPosition.heading = Math.round(corrected);
    currentPosition.headingStr = DIR_NAMES[Math.round(corrected / 22.5) % 16];
    
    // GPSが既に取得されていれば表示を更新
    if (currentPosition.lat) {
        gpsStatus.textContent = `GPS: 取得済 (精度${Math.round(currentPosition.accuracy)}m) ${currentPosition.headingStr}`;
        gpsStatus.style.color = "green";
    }
}

function updateGPS() {
    if (!navigator.geolocation) {
        gpsStatus.textContent = "GPS非対応";
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            currentPosition.lat = pos.coords.latitude;
            currentPosition.lng = pos.coords.longitude;
            currentPosition.accuracy = pos.coords.accuracy;
            
            // 地磁気センサーが動いていない場合、Geolocationのheadingをフォールバックとして試みる
            if (currentPosition.headingStr === "-" && pos.coords.heading !== null) {
                const h = pos.coords.heading;
                currentPosition.heading = h;
                currentPosition.headingStr = DIR_NAMES[Math.round(h / 22.5) % 16];
            }

            gpsStatus.textContent = `GPS: 取得済 (精度${Math.round(pos.coords.accuracy)}m) ${currentPosition.headingStr}`;
            gpsStatus.style.color =
