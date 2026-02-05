const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-";

const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// 16方位変換
function getDirectionName(deg) {
    if (deg === null || deg === undefined) return "-";
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
}

// 方位更新（★縦横補正を追加）
function updateHeading(e) {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        // ★画面の回転角（0:縦, 90:横, -90:逆横）を取得して補正
        const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
        const corrected = (h + angle + 360) % 360;
        
        currentHeading = Math.round(corrected);
        currentDirName = getDirectionName(currentHeading);
        $("heading").textContent = `${currentHeading}° (${currentDirName})`;
    }
}

// GPS & 方位取得ボタン（★干渉しないように分離して実行）
$("btnGeo").onclick = async () => {
    $("geoCheck").textContent = "⌛";

    // 1. GPS取得（方位を待たずに実行）
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
            alert("GPS失敗: " + err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // 2. 方位センサー取得（GPSを邪魔しないように実行）
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            // iOSではここでユーザー許可が必要
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') {
                window.addEventListener("deviceorientation", updateHeading, true);
            }
        } catch (e) { console.error("Heading Error:", e); }
    } else {
        // Androidなど
        window.addEventListener("deviceorientationabsolute", updateHeading, true) || 
        window.addEventListener("deviceorientation", updateHeading, true);
    }
};

// --- 以下、既存の機能（保存・履歴・CSV・ZIP等）はそのまま維持 ---
// ... (あなたの旧バージョンの後半部分をそのまま繋げてください)
