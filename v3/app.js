const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = 0, currentDirName = "-";

// 1. データベース初期化 (旧版の安定したストア名と構造を維持)
const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// 2. 方位計算ロジック (縦横補正付き)
function getDirectionName(deg) {
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    return directions[Math.round(deg / 22.5) % 16];
}

function updateHeading(e) {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
        const corrected = (h + angle + 360) % 360;
        currentHeading = Math.round(corrected);
        currentDirName = getDirectionName(currentHeading);
        // UI更新
        if ($("heading")) $("heading").textContent = `${currentHeading}° (${currentDirName})`;
        if ($("acc")) {
            const accVal = currentGeo ? Math.round(currentGeo.coords.accuracy) + "m" : "-m";
            $("acc").textContent = `${accVal} (${currentDirName})`;
        }
    }
}

// 3. GPS & 方位取得 (旧版の「絶対に動く」非同期スタイル)
$("btnGeo").onclick = async () => {
    const btn = $("btnGeo");
    btn.disabled = true;
    btn.textContent = "取得中...";
    if($("geoCheck")) $("geoCheck").textContent = "⌛";

    // 方位許可リクエスト
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') window.addEventListener("deviceorientation", updateHeading, true);
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener("deviceorientationabsolute", updateHeading, true) || 
        window.addEventListener("deviceorientation", updateHeading, true);
    }

    // GPS取得
    navigator.geolocation.getCurrentPosition(
        (p) => {
            currentGeo = p;
            if($("lat")) $("lat").textContent = p.coords.latitude.toFixed(7);
            if($("lng")) $("lng").textContent = p.coords.longitude.toFixed(7);
            if($("geoCheck")) $("geoCheck").textContent = "✅";
            btn.disabled = false;
            btn.textContent = "GPS取得";
        },
        (err) => {
            alert("GPS失敗: " + err.message);
            if($("geoCheck")) $("geoCheck").textContent = "❌";
            btn.disabled = false;
            btn.textContent = "GPS取得";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

// 4. 写真プレビュー (最新版のリッチUI)
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    const ts = new Date();
    const tsStr = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,"0")}${String(ts.getDate()).padStart(2,"0")}_${String(ts.getHours()).padStart(2,"0")}${String(ts.getMinutes()).padStart(2,"0")}${String(ts.getSeconds()).padStart(2,"0")}`;
    
    if(currentFile) {
        if($("photoCheck")) $("photoCheck").textContent = "✅";
        if($("autoName")) $("autoName").textContent = tsStr + "-01.jpg";
        const reader = new FileReader();
        reader.onload = (re) => {
            $("imgPreview").src = re.target.result;
            if($("previewContainer")) $("previewContainer").style.display = "block";
        };
        reader.readAsDataURL(currentFile);
    }
};

// 5. 保存ロジック (旧版DB構造 + 最新メタデータ)
$("btnSave").onclick = async () => {
    if (!currentFile || !currentGeo) return alert("写真とGPSが必要です");
    const id = Date.now();
    const rec = {
        id: id,
        createdAt: new Date().toISOString(),
        lat: currentGeo.coords.latitude,
        lng: currentGeo.coords.longitude,
        heading: currentHeading,
        headingName: currentDirName,
        location: $("selLocation").value || "-",
        subLocation: ($("selSubLocation") ? $("selSubLocation").value : "-"),
        item: $("selItem").value || "-",
        memo: $("memo").value,
        photoName: $("autoName") ? $("autoName").textContent : `img_${id}.jpg`,
        photoBlob: currentFile
    };

    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null;
        if($("previewContainer")) $("previewContainer").style.display = "none";
        if($("photoCheck")) $("photoCheck").textContent = "";
        $("memo").value = "";
        renderTable(); 
    };
};

// 6. 履歴表示 (テーブル形式)
async function renderTable() {
    if (!db) return;
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = (e) => {
        const listEl = $("list");
        if(!listEl) return;
        listEl.innerHTML = "";
        e.target.result.sort((a,b) => b.id - a.id).forEach(r => {
            const tr = document.createElement("tr");
            tr.style.fontSize = "11px";
            tr.innerHTML = `<td>${r.location}</td><td>${r.item}</td><td class="photo-cell" style="cursor:pointer; color:#00bb55;">${r.photoBlob.size > 0 ? "◯" : "-"}</td><td>${r.lat !== 0 ? "◯" : "-"}</td>`;
            if (r.photoBlob.size > 0) {
                tr.querySelector(".photo-cell").onclick = () => {
                    $("imgPreview").src = URL.createObjectURL(r.photoBlob);
                    if($("previewContainer")) $("previewContainer").style.display = "block";
                    if($("previewLabel")) $("previewLabel").innerHTML = `【履歴】${r.location}<br>方位: ${r.headingName}<br>${r.memo}`;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };
            }
            listEl.appendChild(tr);
        });
    };
}

// 7. ZIP/CSV一括ダウンロード (高速ロジック)
$("btnDownloadAll").onclick = async () => {
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データなし");
        const zip = new JSZip();
        let csv = "\uFEFFID,日時,緯度,経度,方位,地点,項目,備考,写真名\n";
        for (const r of data) {
            csv += `${r.id},${r.createdAt},${r.lat},${r.lng},${r.headingName},${r.location},${r.item},"${r.memo.replace(/"/g,'""')}",${r.photoName}\n`;
            if (r.photoBlob.size > 0) zip.file(r.photoName, await r.photoBlob.arrayBuffer());
        }
        zip.file("records.csv", csv);
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `survey_${Date.now()}.zip`;
        a.click();
    };
};

// 8. リスト読み込み (旧版のDB方式を維持)
async function loadLists() {
    if (!db) return;
    db.transaction("lists", "readonly").objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        const fill = (id, vals, lbl) => {
            const el = $(id); if(!el) return;
            el.innerHTML = `<option value="">${lbl}</option>`;
            [...new Set(vals)].forEach(v => { if(v){ const o=document.createElement("option"); o.value=o.textContent=v; el.appendChild(o); }});
        };
        fill("selLocation", data.map(d => d.loc), "地点を選択");
        fill("selItem", data.map(d => d.item), "項目を選択");
    };
}

$("listCsvInput").onchange = async (e) => {
    const file = e.target.files[0];
    const text = await file.text();
    const tx = db.transaction("lists", "readwrite");
    const store = tx.objectStore("lists");
    await store.clear();
    text.split("\n").forEach((row, i) => {
        const c = row.split(",");
        if(c[0]) store.put({ id: i, loc: c[0].trim(), item: c[2] ? c[2].trim() : "" });
    });
    tx.oncomplete = () => { alert("リスト更新"); loadLists(); };
};
