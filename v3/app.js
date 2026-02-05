// --- 方位管理変数 ---
let currentHeading = { val: 0, str: "-" };
const DIR_NAMES = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"];

// 方位を計算・表示する関数
function handleOrientation(event) {
    let alpha = 0;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; // iOS用
    } else if (event.alpha) {
        alpha = 360 - event.alpha; // Android用
    }

    // 縦横補正を加味
    const angle = window.screen.orientation ? window.screen.orientation.angle : (window.orientation || 0);
    const corrected = (alpha + angle + 360) % 360;

    currentHeading.val = Math.round(corrected);
    currentHeading.str = DIR_NAMES[Math.round(corrected / 22.5) % 16];

    // GPSが既に取れていれば、accの横を書き換える
    if (els.acc) {
        const accVal = (currentGeo && currentGeo.coords) ? Math.round(currentGeo.coords.accuracy) + "m" : "-m";
        els.acc.textContent = `${accVal} (${currentHeading.str})`;
    }
}

// --- GPS取得ボタンのクリックイベント ---
if (els.btnGeo) {
    els.btnGeo.onclick = async () => {
        els.btnGeo.disabled = true;
        els.btnGeo.textContent = "取得中...";

        // 1. まず方位センサーを叩き起こす（これが最優先）
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                } else {
                    console.warn("方位センサーが拒否されました");
                }
            } catch (e) {
                console.error("センサー要求エラー:", e);
            }
        } else {
            // Androidや古いブラウザ
            window.addEventListener('deviceorientation', handleOrientation, true);
        }

        // 2. 方位の準備ができたらGPSを取りに行く
        if (!navigator.geolocation) {
          alert("GPS非対応");
          els.btnGeo.disabled = false;
          return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentGeo = pos;
                els.lat.textContent = pos.coords.latitude.toFixed(7);
                els.lng.textContent = pos.coords.longitude.toFixed(7);
                // 方位(str)を含めて表示
                els.acc.textContent = Math.round(pos.coords.accuracy) + "m (" + currentHeading.str + ")";
                els.btnGeo.disabled = false;
                els.btnGeo.textContent = "GPS取得";
            },
            (err) => {
                alert("GPS失敗: " + err.message);
                els.btnGeo.disabled = false;
                els.btnGeo.textContent = "GPS取得";
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };
}
