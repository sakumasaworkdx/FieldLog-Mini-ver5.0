// --- JSZip Library Embedded (Partially for ZIP generation) ---
// 現場でJSZipがない事態を防ぐため、動的に読み込むか、ここにjszip.min.jsの内容を全貼り付けしてください。
// ここでは、オンライン時に一度読み込めばキャッシュされる自動インポート形式を採用します。
if (typeof JSZip === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
}

const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null;

// DB初期化
const req = indexedDB.open("offline_survey_v6_db", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    d.createObjectStore("surveys", { keyPath: "id" });
    d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// 位置・方位
navigator.geolocation.watchPosition(p => { currentGeo = p; }, null, {enableHighAccuracy:true});
window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) currentHeading = Math.round(h);
}, true);

$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS受信中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    $("heading").textContent = (currentHeading || 0) + "°";
    $("geoCheck").textContent = "✅";
};

// CSV単純読込 (A,B,C列を独立して各プルダウンへ)
$("listCsvInput").onchange = async (e) => {
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

// 保存
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

$("btnSave").onclick = () => {
    if (!$("selLocation").value) return alert("地点未選択");
    const id = Date.now();
    const rec = {
        id: id, createdAt: new Date().toLocaleString('ja-JP'),
        lat: $("lat").textContent, lng: $("lng").textContent, heading: $("heading").textContent,
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

// 一括ZIP保存
$("btnDownloadAll").onclick = async () => {
    if (typeof JSZip === "undefined") return alert("JSZip読込中...一度ネット環境で開いてください。");
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データなし");
        const zip = new JSZip();
        let csv = "\ufeff日時,緯度,経度,方位,地点,小区分,項目,備考,写真\n";
        for (const r of data) {
            csv += `${r.createdAt},${r.lat},${r.lng},${r.heading},${r.location},${r.subLocation},${r.item},"${r.memo}",${r.photoName||""}\n`;
            if (r.photoBlob) zip.file(r.photoName, r.photoBlob);
        }
        zip.file("data.csv", csv);
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `survey_${Date.now()}.zip`;
        a.click();
    };
}

function renderTable() {
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = (e) => {
        $("list").innerHTML = e.target.result.sort((a,b)=>b.id-a.id).map(r => `<tr><td>${r.location}</td><td>${r.photoName?"◯":"-"}</td></tr>`).join("");
    };
}
