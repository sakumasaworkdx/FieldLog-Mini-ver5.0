const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null;

// JSZipの読み込み
if (typeof JSZip === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
}

// 16方位を計算する関数
const getDirectionName = (deg) => {
    if (deg === null || deg === undefined || isNaN(deg)) return "-";
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
};

// IndexedDB
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    d.createObjectStore("surveys", { keyPath: "id" });
    d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// GPS/Orientation
navigator.geolocation.watchPosition(p => { 
    currentGeo = p; 
}, null, {enableHighAccuracy:true});

window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        currentHeading = Math.round(h);
    }
}, true);

// 位置記録ボタン
$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS受信中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    const dirName = getDirectionName(currentHeading);
    $("heading").textContent = `${currentHeading || 0}° (${dirName})`;
    $("geoCheck").textContent = "✅";
};

// CSVリスト読み込み
$("listCsvInput").onchange = async (e) => {
    if(!e.target.files[0]) return;
    const text = await e.target.files[0].text();
    const rows = text.split(/\r?\n/).filter(r => r.trim() !== "");
    const tx = db.transaction("lists", "readwrite");
    const store = tx.objectStore("lists");
    await store.clear();
    rows.forEach((row, idx) => {
        const c = row.split(",").map(v => v.replace(/["']/g, "").trim());
        store.put({ id: idx, a: c[0]||"", b: c[1]||"", c: c[2]||"" });
    });
    tx.oncomplete = () => { alert("リスト読込完了"); loadLists(); };
};

async function loadLists() {
    if (!db) return;
    db.transaction("lists", "readonly").objectStore("lists").getAll().onsuccess = (e) => {
        const d = e.target.result;
        const upd = (id, vals, lbl) => {
            $(id).innerHTML = `<option value="">${lbl}</option>` + [...new Set(vals)].filter(v=>v).map(v=>`<option value="${v}">${v}</option>`).join("");
        };
        upd("selLocation", d.map(x=>x.a), "地点を選択");
        upd("selSubLocation", d.map(x=>x.b), "小区分を選択");
        upd("selItem", d.map(x=>x.c), "項目を選択");
    };
}

// 写真撮影
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

// データ保存
$("btnSave").onclick = () => {
    if (!$("selLocation").value) return alert("地点を選んでください");
    const id = Date.now();
    const dirName = getDirectionName(currentHeading);
    const rec = {
        id: id, createdAt: new Date().toLocaleString('ja-JP'),
        lat: $("lat").textContent, lng: $("lng").textContent, 
        headingValue: currentHeading !== null ? currentHeading : 0, // セル分け用(数値)
        headingName: dirName, // セル分け用(日本語)
        location: $("selLocation").value, subLocation: $("selSubLocation").value,
        item: $("selItem").value, memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : null, photoBlob: currentFile
    };
    db.transaction("surveys", "readwrite").objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null; $("photoCheck").textContent = ""; $("previewContainer").style.display = "none";
        renderTable();
    };
};

// 一括ZIP保存（CSVセル分け対応）
$("btnDownloadAll").onclick = async () => {
    if (typeof JSZip === "undefined") return alert("JSZip準備中。");
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データなし");
        const zip = new JSZip();
        // ヘッダーで方位を分離
        let csv = "\ufeff日時,緯度,経度,方位角(°),方位名,地点,小区分,項目,備考,写真ファイル名\n";
        for (const r of data) {
            // 各値をカンマで区切ってセル分け
            csv += `${r.createdAt},${r.lat},${r.lng},${r.headingValue},${r.headingName},${r.location},${r.subLocation},${r.item},"${r.memo}",${r.photoName||""}\n`;
            if (r.photoBlob) zip.file(r.photoName, r.photoBlob);
        }
        zip.file("data.csv", csv);
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `survey_data_${Date.now()}.zip`;
        a.click();
    };
};

// 一覧表示とプレビュー
function renderTable() {
    if(!db) return;
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = (e) => {
        const data = e.target.result.sort((a,b)=>b.id-a.id);
        let html = `<tr style="background:#222; color:#aaa; font-size:11px;">
            <th style="padding:5px;">地点</th><th style="padding:5px;">GPS</th><th style="padding:5px;">写真</th></tr>`;
        
        data.forEach(r => {
            const gpsStatus = (r.lat !== "-") ? "✅" : "-";
            let photoBtn = "-";
            if (r.photoBlob) {
                const url = URL.createObjectURL(r.photoBlob);
                // ◯をクリックでプレビュー
                photoBtn = `<button onclick="window.open('${url}')" style="background:#00bb55; color:white; border:none; border-radius:4px; padding:2px 8px;">◯</button>`;
            }
            html += `<tr style="border-bottom:1px solid #333;">
                <td style="padding:8px; font-size:13px;">${r.location}</td>
                <td style="text-align:center;">${gpsStatus}</td>
                <td style="text-align:center;">${photoBtn}</td>
            </tr>`;
        });
        $("list").innerHTML = html;
    };
}

$("btnDeleteAll").onclick = () => {
    if(confirm("全ての記録を削除します。CSV・ZIPの書き出しは済みましたか？")) {
        db.transaction("surveys", "readwrite").objectStore("surveys").clear().onsuccess = () => renderTable();
    }
};
