const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null;
let currentSortCol = 'id', isSortAsc = false;

// JSZipの読み込み
if (typeof JSZip === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
}

const getDirectionName = (deg) => {
    if (deg === null || deg === undefined || isNaN(deg)) return "-";
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
};

const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    d.createObjectStore("surveys", { keyPath: "id" });
    d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

navigator.geolocation.watchPosition(p => { currentGeo = p; }, null, {enableHighAccuracy:true});
window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) currentHeading = Math.round(h);
}, true);

$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS受信中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    const dirName = getDirectionName(currentHeading);
    $("heading").textContent = `${currentHeading || 0}° (${dirName})`;
    $("geoCheck").textContent = "✅";
};

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
    tx.oncomplete = () => { alert("読込完了"); loadLists(); };
};

async function loadLists() {
    if (!db) return;
    db.transaction("lists", "readonly").objectStore("lists").getAll().onsuccess = (e) => {
        const d = e.target.result;
        const upd = (id, vals, lbl) => {
            $(id).innerHTML = `<option value="">${lbl}</option>` + [...new Set(vals)].filter(v=>v).map(v=>`<option value="${v}">${v}</option>`).join("");
        };
        upd("selLocation", d.map(x=>x.a), "地点");
        upd("selSubLocation", d.map(x=>x.b), "小区分");
        upd("selItem", d.map(x=>x.c), "項目");
    };
}

$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

$("btnSave").onclick = () => {
    if (!currentFile && $("lat").textContent === "-" && !$("memo").value && !$("selLocation").value) return alert("データなし");
    const id = Date.now();
    const dirName = getDirectionName(currentHeading);
    const rec = {
        id: id, createdAt: new Date().toLocaleString('ja-JP'),
        lat: $("lat").textContent, lng: $("lng").textContent, 
        headingValue: currentHeading !== null ? currentHeading : 0,
        headingName: dirName,
        location: $("selLocation").value || "(未選択)",
        subLocation: $("selSubLocation").value || "",
        item: $("selItem").value || "",
        memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : null, 
        photoBlob: currentFile
    };
    db.transaction("surveys", "readwrite").objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null; $("photoCheck").textContent = ""; $("geoCheck").textContent = "";
        $("lat").textContent = "-"; $("lng").textContent = "-"; $("heading").textContent = "-";
        $("memo").value = ""; $("previewContainer").style.display = "none";
        renderTable();
    };
};

$("btnDownloadAll").onclick = async () => {
    if (typeof JSZip === "undefined") return alert("JSZip準備中");
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データなし");
        const zip = new JSZip();
        let csv = "\ufeff日時,緯度,経度,方位角(°),方位名,地点,小区分,項目,備考,写真ファイル名\n";
        for (const r of data) {
            csv += `${r.createdAt},${r.lat},${r.lng},${r.headingValue},${r.headingName},${r.location},${r.subLocation},${r.item},"${r.memo}",${r.photoName||""}\n`;
            if (r.photoBlob) zip.file(r.photoName, r.photoBlob);
        }
        zip.file("data.csv", csv);
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `survey_${Date.now()}.zip`;
        a.click();
    };
};

// --- 絞り込み・ソート機能 ---
function toggleSort(col) {
    if (currentSortCol === col) isSortAsc = !isSortAsc;
    else { currentSortCol = col; isSortAsc = true; }
    renderTable();
}

function renderTable() {
    if(!db) return;
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = (e) => {
        let allData = e.target.result;
        
        // 既存のフィルター値を取得
        const fLoc = $("filterLoc") ? $("filterLoc").value : "";
        const fItem = $("filterItem") ? $("filterItem").value : "";

        // 絞り込み実行
        let filteredData = allData.filter(r => {
            return (fLoc === "" || r.location === fLoc) && (fItem === "" || r.item === fItem);
        });

        // ソート
        filteredData.sort((a, b) => {
            let valA = a[currentSortCol], valB = b[currentSortCol];
            if (valA < valB) return isSortAsc ? -1 : 1;
            if (valA > valB) return isSortAsc ? 1 : -1;
            return 0;
        });

        // フィルター用のプルダウン選択肢（全データから重複なく生成）
        const locOptions = [...new Set(allData.map(r => r.location))].filter(v=>v);
        const itemOptions = [...new Set(allData.map(r => r.item))].filter(v=>v);

        let html = `
            <div style="display:flex; gap:5px; margin-bottom:10px;">
                <select id="filterLoc" class="input-field" style="margin-bottom:0; font-size:12px;" onchange="renderTable()">
                    <option value="">全ての地点</option>
                    ${locOptions.map(v => `<option value="${v}" ${v===fLoc?'selected':''}>${v}</option>`).join("")}
                </select>
                <select id="filterItem" class="input-field" style="margin-bottom:0; font-size:12px;" onchange="renderTable()">
                    <option value="">全ての項目</option>
                    ${itemOptions.map(v => `<option value="${v}" ${v===fItem?'selected':''}>${v}</option>`).join("")}
                </select>
            </div>
            <table style="font-size:10px; width:100%; border-collapse:collapse;">
            <tr style="background:#222; color:#aaa; cursor:pointer;">
                <th onclick="toggleSort('location')" style="padding:5px; border:1px solid #333;">地点⇅</th>
                <th onclick="toggleSort('subLocation')" style="padding:5px; border:1px solid #333;">小区分⇅</th>
                <th onclick="toggleSort('item')" style="padding:5px; border:1px solid #333;">項目⇅</th>
                <th style="padding:5px; border:1px solid #333;">GPS</th>
                <th style="padding:5px; border:1px solid #333;">写真</th>
            </tr>`;
        
        filteredData.forEach(r => {
            const gpsStatus = (r.lat !== "-") ? "✅" : "-";
            const photoBtn = r.photoBlob ? `<button onclick="window.open('${URL.createObjectURL(r.photoBlob)}')" style="background:#00bb55; color:white; border:none; border-radius:4px; padding:2px 8px;">◯</button>` : "-";
            html += `<tr>
                <td style="padding:5px; border:1px solid #333;">${r.location}</td>
                <td style="padding:5px; border:1px solid #333;">${r.subLocation}</td>
                <td style="padding:5px; border:1px solid #333;">${r.item}</td>
                <td style="text-align:center; border:1px solid #333;">${gpsStatus}</td>
                <td style="text-align:center; border:1px solid #333;">${photoBtn}</td>
            </tr>`;
        });
        html += `</table>`;
        $("list").innerHTML = html;
    };
}

window.toggleSort = toggleSort;

$("btnDeleteAll").onclick = () => {
    if(confirm("全消去しますか？")) {
        db.transaction("surveys", "readwrite").objectStore("surveys").clear().onsuccess = () => renderTable();
    }
};
