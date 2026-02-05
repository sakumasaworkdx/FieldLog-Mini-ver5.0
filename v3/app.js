const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-";

// IndexedDB 初期化
const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { 
    db = e.target.result; 
    renderTable(); 
    loadLists(); 
};

// 16方位変換
function getDirectionName(deg) {
    if (deg === null || deg === undefined) return "-";
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
}

// 方位更新（★縦横補正ロジックを統合）
function updateHeading(e) {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined && h !== null) {
        // 画面の回転（0:縦, 90:右倒し, -90:左倒し）を取得
        const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
        // 方位角に回転角を足して360度以内に収める
        const corrected = (h + angle + 360) % 360;
        
        currentHeading = Math.round(corrected);
        currentDirName = getDirectionName(currentHeading);
        
        const target = $("heading");
        if (target) {
            target.textContent = `${currentHeading}° (${currentDirName})`;
        }
    }
}

// GPS & 方位取得ボタン
$("btnGeo").onclick = async () => {
    $("geoCheck").textContent = "⌛";
    
    // 1. 方位センサーの起動リクエスト（iOS対策）
    // GPS取得の直前に実行することで、1つのクリックイベントとして認識させます
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') {
                window.addEventListener("deviceorientation", updateHeading, true);
            }
        } catch (err) {
            console.error("Orientation Permission Denied:", err);
        }
    } else {
        // Android / PC
        window.addEventListener("deviceorientationabsolute", updateHeading, true);
        window.addEventListener("deviceorientation", updateHeading, true);
    }

    // 2. GPS取得（旧バージョンの安定した書き方）
    navigator.geolocation.getCurrentPosition(
        (p) => {
            currentGeo = p;
            $("lat").textContent = p.coords.latitude.toFixed(6);
            $("lng").textContent = p.coords.longitude.toFixed(6);
            $("geoCheck").textContent = "✅";
        },
        (err) => { 
            console.error("GPS Error:", err);
            $("geoCheck").textContent = "❌";
            alert("GPS取得失敗。位置情報設定を確認してください。");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

// 写真プレビュー処理
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        const reader = new FileReader();
        reader.onload = (re) => {
            $("imgPreview").src = re.target.result;
            $("previewContainer").style.display = "block";
        };
        reader.readAsDataURL(currentFile);
    }
};

// CSVリスト読み込み
$("listCsvInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r !== "");
        const tx = db.transaction("lists", "readwrite");
        const store = tx.objectStore("lists");
        await store.clear();
        rows.forEach((row, idx) => {
            const cols = row.split(",").map(c => c.replace(/^["']|["']$/g, '').trim());
            if (cols.length >= 1) store.put({ id: idx, loc: cols[0] || "", sub: cols[1] || "", item: cols[2] || "" });
        });
        tx.oncomplete = () => { alert("リスト更新完了"); loadLists(); };
    } catch (err) { alert("読み込み失敗"); }
};

// セレクトボックスへのリスト反映
async function loadLists() {
    if (!db) return;
    const tx = db.transaction("lists", "readonly");
    tx.objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        const updateSelect = (id, values, label) => {
            const el = $(id);
            if (!el) return;
            el.innerHTML = `<option value="">${label}</option>`;
            [...new Set(values)].filter(v => v && !["地点","小区分","項目"].includes(v)).forEach(v => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = v; 
                el.appendChild(opt);
            });
        };
        updateSelect("selLocation", data.map(d => d.loc), "地点を選択");
        updateSelect("selSubLocation", data.map(d => d.sub), "小区分を選択");
        updateSelect("selItem", data.map(d => d.item), "項目を選択");
    };
}

// 保存処理
$("btnSave").onclick = async () => {
    const hasData = currentFile || $("memo").value.trim() !== "" || $("selLocation").value !== "";
    if (!hasData) { alert("保存するデータがありません"); return; }
    
    const id = Date.now();
    const rec = {
        id: id, 
        createdAt: new Date().toISOString(),
        lat: currentGeo ? currentGeo.coords.latitude : 0,
        lng: currentGeo ? currentGeo.coords.longitude : 0,
        heading: currentHeading || 0,
        headingName: currentDirName || "-",
        location: $("selLocation").value || "-",
        subLocation: $("selSubLocation").value || "-",
        item: $("selItem").value || "-",
        memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : "no_image.jpg",
        photoBlob: currentFile || new Blob([])
    };
    
    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null; 
        $("previewContainer").style.display = "none";
        $("photoCheck").textContent = ""; 
        $("memo").value = "";
        renderTable(); 
    };
};

// 履歴テーブルの表示
async function renderTable() {
    if (!db) return;
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = (e) => {
        const listEl = $("list");
        listEl.innerHTML = "";
        e.target.result.sort((a,b) => b.id - a.id).forEach(r => {
            const tr = document.createElement("tr");
            tr.style.fontSize = "11px";
            tr.innerHTML = `
                <td style="text-align:left;">${r.location}</td>
                <td style="text-align:left;">${r.subLocation}</td>
                <td style="text-align:left;">${r.item}</td>
                <td class="photo-cell" style="cursor:pointer; color:#00bb55; font-weight:bold; font-size:16px;">${r.photoBlob.size > 0 ? "◯" : "-"}</td>
                <td>${r.lat !== 0 ? "◯" : "-"}</td>
            `;
            if (r.photoBlob.size > 0) {
                tr.querySelector(".photo-cell").onclick = () => {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        $("imgPreview").src = re.target.result; 
                        $("previewContainer").style.display = "block";
                        $("previewLabel").innerHTML = `【履歴】${r.location}<br>方位: ${r.headingName}(${r.heading}°)<br>${r.memo || ""}`;
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    };
                    reader.readAsDataURL(r.photoBlob);
                };
            }
            listEl.appendChild(tr);
        });
    };
}

// 全削除処理
$("btnDeleteAll").onclick = async () => {
    if (!confirm("履歴をすべて削除しますか？")) return;
    if (prompt("確認のため「さくじょ」と入力してください") !== "さくじょ") return;
    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").clear().onsuccess = () => { 
        renderTable(); 
        alert("削除しました"); 
    };
};

// ZIP & CSV ダウンロード
$("btnDownloadAll").onclick = async () => {
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data || data.length === 0) { alert("データがありません"); return; }
        
        const zip = new JSZip();
        let csv = "ID,日時,緯度,経度,方位(度),方位(名称),地点,小区分,項目,備考,写真名\n";
        
        for (const r of data) {
            csv += `${r.id},${r.createdAt},${r.lat},${r.lng},${r.heading},${r.headingName},${r.location},${r.subLocation},${r.item},"${(r.memo || "").replace(/"/g, '""')}",${r.photoName}\n`;
            if (r.photoBlob && r.photoBlob.size > 0) {
                zip.file(r.photoName, await r.photoBlob.arrayBuffer());
            }
        }
        
        zip.file("data_list.csv", "\ufeff" + csv);
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `survey_data_${Date.now()}.zip`;
        link.click();
    };
};
