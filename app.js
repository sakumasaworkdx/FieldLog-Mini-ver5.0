/* * FieldLog v6.8 - app.js */
const $ = (id) => document.getElementById(id);

// --- 1. 変数とDB準備 ---
let db;
let currentPos = { lat: null, lng: null, heading: 0, headingStr: "-" };
let capturedBlob = null;
const STORE_NAME = 'logs';

const request = indexedDB.open('FieldLogDB_v6_8', 1);
request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
request.onsuccess = (e) => { db = e.target.result; renderList(); };

// --- 2. カメラ起動 (撮影方式の修正) ---
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { $("cameraPreview").srcObject = s; })
    .catch(() => { $("statusMsg").textContent = "カメラ起動不可"; });

// --- 3. 位置・方位 (安定版) ---
const DIRS = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
$("btnGeo").addEventListener('click', async () => {
    $("btnGeo").textContent = "取得中...";
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        const s = await DeviceOrientationEvent.requestPermission();
        if (s === 'granted') window.addEventListener('deviceorientation', updateOri, true);
    } else {
        window.addEventListener('deviceorientationabsolute', updateOri, true);
    }
    navigator.geolocation.getCurrentPosition(p => {
        currentPos.lat = p.coords.latitude;
        currentPos.lng = p.coords.longitude;
        updateUI();
        $("btnGeo").textContent = "📍 位置・方位を記録";
    }, () => { alert("GPS失敗"); $("btnGeo").textContent = "📍 位置・方位を記録"; }, { enableHighAccuracy: true });
});

function updateOri(e) {
    let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
    let deg = (a + (window.orientation || 0) + 360) % 360;
    currentPos.heading = Math.round(deg);
    currentPos.headingStr = DIRS[Math.round(deg / 22.5) % 16];
    updateUI();
}

function updateUI() {
    $("gpsDisplay").innerHTML = `緯度: ${currentPos.lat?.toFixed(6) || "-"} <br> 経度: ${currentPos.lng?.toFixed(6) || "-"} <br> 方位: ${currentPos.headingStr}`;
}

// --- 4. 撮影と保存 (未入力でも保存可能に) ---
$("snapBtn").addEventListener('click', () => {
    const v = $("cameraPreview"), c = $("photoCanvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => { capturedBlob = b; $("statusMsg").textContent = "✅ 撮影完了"; }, 'image/jpeg', 0.8);
});

$("saveBtn").addEventListener('click', () => {
    const record = {
        date: new Date().toLocaleString(),
        point: $("locationSelect").value || "未設定",
        sub: $("subSelect").value || "-",
        item: $("itemSelect").value || "未設定",
        memo: $("memo").value,
        lat: currentPos.lat, lng: currentPos.lng,
        hStr: currentPos.headingStr,
        blob: capturedBlob,
        file: `IMG_${Date.now()}.jpg`
    };
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => { $("statusMsg").textContent = "💾 保存しました"; renderList(); };
});

// --- 5. 履歴表示とフィルタ (1枚目の機能を再現) ---
function renderList() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        updateFilters(all);
        const fLoc = $("filterLoc").value;
        const fItem = $("filterItem").value;
        
        const displayData = all.filter(r => (!fLoc || r.point === fLoc) && (!fItem || r.item === fItem));
        
        $("listBody").innerHTML = displayData.map(r => `
            <tr>
                <td>${r.point}</td>
                <td>${r.sub}</td>
                <td>${r.item}</td>
                <td>${r.lat ? 'ok' : '-'}</td>
                <td><button onclick="viewImg(${r.id})">◯</button></td>
            </tr>
        `).join("");
    };
}

// フィルタの選択肢を自動更新
function updateFilters(data) {
    const locs = [...new Set(data.map(r => r.point))];
    const items = [...new Set(data.map(r => r.item))];
    updateSelect($("filterLoc"), locs, "全ての地点");
    updateSelect($("filterItem"), items, "全ての項目");
}

function updateSelect(el, list, def) {
    const current = el.value;
    el.innerHTML = `<option value="">${def}</option>` + list.map(v => `<option value="${v}">${v}</option>`).join("");
    el.value = current;
}

$("filterLoc").onchange = $("filterItem").onchange = renderList;

// --- 6. 削除・ZIP (変更なし) ---
$("clearAllBtn").onclick = () => { if(confirm("全消去しますか？")) { db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).clear(); renderList(); }};

window.viewImg = (id) => {
    db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id).onsuccess = (e) => {
        const url = URL.createObjectURL(e.target.result.blob);
        window.open(url, '_blank');
    };
};

$("exportBtn").onclick = () => {
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const zip = new JSZip();
        let csv = "\ufeff日時,地点,小区分,項目,緯度,経度,方位,備考\n";
        e.target.result.forEach(r => {
            csv += `${r.date},${r.point},${r.sub},${r.item},${r.lat},${r.lng},${r.hStr},${r.memo}\n`;
            if(r.blob) zip.file(`${r.point}/${r.file}`, r.blob);
        });
        zip.file("data.csv", csv);
        zip.generateAsync({type:"blob"}).then(b => {
            const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download="Log.zip"; a.click();
        });
    };
};
