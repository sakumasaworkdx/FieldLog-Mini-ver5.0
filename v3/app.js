/* FieldLog v6.5 - app.js */

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

// --- 3. GPS設定 ---
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
function updateGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition((pos) => {
        currentPosition.lat = pos.coords.latitude;
        currentPosition.lng = pos.coords.longitude;
        currentPosition.accuracy = pos.coords.accuracy;
        currentPosition.heading = pos.coords.heading;
        currentPosition.headingStr = pos.coords.heading !== null ? DIR_NAMES[Math.round(pos.coords.heading / 22.5) % 16] : "-";
        
        gpsStatus.textContent = `GPS: 精度${Math.round(pos.coords.accuracy)}m / 方位: ${currentPosition.headingStr}`;
        gpsStatus.style.color = "green";
    }, null, { enableHighAccuracy: true });
}
updateGPS();

// --- 4. CSV連動 ---
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

// --- 5. 保存 ---
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

// --- 6. 一覧 ---
function loadList() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        listContainer.innerHTML = "";
        e.target.result.reverse().forEach(r => {
            const div = document.createElement('div');
            div.className = "list-row";
            div.innerHTML = `<span>[${r.point}] ${r.item}</span> 
                             <div>
                                <button onclick="viewImg('${URL.createObjectURL(r.photoBlob)}')" style="width:auto; display:inline;">◯</button>
                                <button onclick="delRec(${r.id})" style="width:auto; display:inline; color:red;">×</button>
                             </div>`;
            listContainer.appendChild(div);
        });
    };
}
window.viewImg = (url) => window.open(url, '_blank');
window.delRec = (id) => { if(confirm("データを削除しますか？")){ const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(id); tx.oncomplete = loadList; } };

// --- 7. 書き出し (修正済みカスタムダイアログ) ---
exportBtn.addEventListener('click', () => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const records = e.target.result;
        if (!records.length) return alert("データがありません");
        showExportDialog(records);
    };
});

function showExportDialog(records) {
    const oldDlg = document.getElementById('customDlg');
    if (oldDlg) oldDlg.remove();

    const dlg = document.createElement('div');
    dlg.id = 'customDlg';
    dlg.style = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:0; border:1px solid #007bff; z-index:10000; box-shadow:0 10px 25px rgba(0,0,0,0.2); text-align:center; width:85%; max-width:350px; border-radius:12px; overflow:hidden; font-family:sans-serif;";
    
    dlg.innerHTML = `
        <div style="background:#007bff; color:white; padding:12px; font-size:14px; font-weight:bold;">FieldLog システム書き出し</div>
        <div style="padding:20px;">
            <p style="font-size:15px; color:#333; margin-bottom:20px; line-height:1.4;">写真の保存形式を選択してください</p>
            <button id="btnFoldered" style="display:block; width:100%; padding:14px; margin-bottom:10px; background:#007bff; color:white; border:none; border-radius:8px; font-size:16px; cursor:pointer;">地点ごとにフォルダ分け</button>
            <button id="btnFlat" style="display:block; width:100%; padding:14px; margin-bottom:15px; background:#f8f9fa; color:#333; border:1px solid #ddd; border-radius:8px; font-size:16px; cursor:pointer;">フォルダ分けなし（一括）</button>
            <button id="btnCancel" style="background:none; border:none; color:#666; text-decoration:underline; font-size:14px; cursor:pointer;">キャンセル</button>
        </div>
    `;
    document.body.appendChild(dlg);

    document.getElementById('btnFoldered').onclick = () => { dlg.remove(); createZip(records, true); };
    document.getElementById('btnFlat').onclick = () => { dlg.remove(); createZip(records, false); };
    document.getElementById('btnCancel').onclick = () => { dlg.remove(); };
}

function createZip(records, separateByLocation) {
    const zip = new JSZip();
    let csv = "日時,地点,小区分,項目,緯度,経度,方位角,方位名,ファイル名\n";
    
    records.forEach(r => {
        csv += `${r.timestamp},${r.point},${r.sub},${r.item},${r.lat},${r.lng},${r.headingVal},${r.headingStr},${r.fileName}\n`;
        let path = r.fileName;
        if (separateByLocation) {
            let folder = (r.point ? r.point.trim() : "未分類").replace(/[\\/:*?"<>|]/g, "_");
            path = folder + "/" + r.fileName;
        }
        zip.file(path, r.photoBlob);
    });
    
    zip.file("data.csv", csv);
    statusMsg.textContent = "ZIP作成中...";
    zip.generateAsync({ type: "blob" }).then(content => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `FieldLog_${new Date().getTime()}.zip`;
        a.click();
        statusMsg.textContent = "出力完了";
    });
}
