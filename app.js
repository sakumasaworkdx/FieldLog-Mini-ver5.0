/* * FieldLog v7.0 - Final Version */
const $ = (id) => document.getElementById(id);

// データベース名を変更して強制リセット
const DB_NAME = 'FieldLog_V7_FINAL';
const STORE_NAME = 'logs';
let db;
let currentPos = { lat: null, lng: null, heading: 0, headingStr: "-" };
let capturedBlob = null;

// --- 1. 起動処理 ---
const request = indexedDB.open(DB_NAME, 1);
request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
request.onsuccess = (e) => { db = e.target.result; renderList(); };

// カメラ：ファイル選択ではなく、プレビューから直接撮る方式
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { $("cameraPreview").srcObject = s; })
    .catch(err => { $("statusMsg").textContent = "カメラ使用不可"; });

// --- 2. 方位・GPS ---
const DIRS = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];
$("btnGeo").onclick = async () => {
    $("btnGeo").textContent = "取得中...";
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        try {
            const s = await DeviceOrientationEvent.requestPermission();
            if (s === 'granted') window.addEventListener('deviceorientation', updateOri, true);
        } catch(e) {}
    } else {
        window.addEventListener('deviceorientationabsolute', updateOri, true);
    }
    navigator.geolocation.getCurrentPosition(p => {
        currentPos.lat = p.coords.latitude;
        currentPos.lng = p.coords.longitude;
        updateUI();
        $("btnGeo").textContent = "📍 位置・方位を記録";
    }, () => { alert("GPS取得失敗"); $("btnGeo").textContent = "📍 位置・方位を記録"; }, { enableHighAccuracy: true });
};

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

// --- 3. 撮影と保存 ---
$("snapBtn").onclick = () => {
    const v = $("cameraPreview"), c = $("photoCanvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => { capturedBlob = b; $("statusMsg").textContent = "✅ 撮影完了"; }, 'image/jpeg', 0.8);
};

$("saveBtn").onclick = () => {
    // 保存条件を緩和：GPSや写真がなくても保存可能にする
    const record = {
        date: new Date().toLocaleString(),
        point: $("locationSelect").value || "未設定",
        sub: $("subSelect").value || "-",
        item: $("itemSelect").value || "未設定",
        memo: $("memo").value || "",
        lat: currentPos.lat, lng: currentPos.lng,
        hStr: currentPos.headingStr,
        blob: capturedBlob,
        file: `IMG_${Date.now()}.jpg`
    };
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => { 
        $("statusMsg").textContent = "💾 データを保存しました"; 
        capturedBlob = null; // 連続撮影のためリセット
        renderList(); 
        setTimeout(() => $("statusMsg").textContent = "", 3000);
    };
};

// --- 4. 履歴・フィルタ表示 ---
function renderList() {
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        updateFilterOptions(all);
        const fLoc = $("filterLoc").value;
        const fItem = $("filterItem").value;
        
        const filtered = all.filter(r => (!fLoc || r.point === fLoc) && (!fItem || r.item === fItem));
        
        $("listBody").innerHTML = filtered.map(r => `
            <tr>
                <td>${r.point}</td>
                <td>${r.sub}</td>
                <td>${r.item}</td>
                <td>${r.lat ? 'ok' : '-'}</td>
                <td><button onclick="viewImg(${r.id})" style="background:none; border:1px solid #444; color:white; border-radius:4px; padding:2px 8px;">◯</button></td>
            </tr>
        `).join("");
    };
}

function updateFilterOptions(data) {
    const locs = [...new Set(data.map(r => r.point))].filter(v => v !== "未設定");
    const items = [...new Set(data.map(r => r.item))].filter(v => v !== "未設定");
    const setOptions = (el, list, def) => {
        const val = el.value;
        el.innerHTML = `<option value="">${def}</option>` + list.map(v => `<option value="${v}">${v}</option>`).join("");
        el.value = val;
    };
    setOptions($("filterLoc"), locs, "全ての地点");
    setOptions($("filterItem"), items, "全ての項目");
}

$("filterLoc").onchange = $("filterItem").onchange = renderList;

window.viewImg = (id) => {
    db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id).onsuccess = (e) => {
        if(e.target.result.blob) window.open(URL.createObjectURL(e.target.result.blob), '_blank');
        else alert("写真がありません");
    };
};

// --- 5. ZIP出力と全消去 ---
$("clearAllBtn").onclick = () => { if(confirm("全データを消去しますか？")) { db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).clear(); renderList(); }};

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
            const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`Log_${Date.now()}.zip`; a.click();
        });
    };
};
