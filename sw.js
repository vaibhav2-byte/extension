console.log('IMTS SW BUILD 2026-03-10 ACTIVE');

const INTERVAL_MIN = 5;
const IDLE_THRESHOLD_SEC = 600;
const ALARM = 'imts_capture_alarm';

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SEC);

async function cfg() {
  return await chrome.storage.local.get([
    'serverUrl',
    'deviceUid',
    'deviceKey',
    'systemName',
    'running',
    'enrollToken',
    'idleSinceTs'
  ]);
}

async function setBadge(on) {
  if (on) {
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: String(title || 'IMTS'),
      message: String(message || '')
    });
  } catch (e) {}
}

async function strictJson(res, text) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return { ok: false, error: `Server did not return JSON. ${text.slice(0, 160)}` };
  }
  try {
    const j = JSON.parse(text);
    if (!j || j.ok !== true) {
      return { ok: false, error: (j && j.error) ? j.error : 'Server returned ok=false' };
    }
    return { ok: true, json: j };
  } catch (e) {
    return { ok: false, error: `Invalid JSON. ${text.slice(0, 160)}` };
  }
}

async function clearIdle() {
  await chrome.storage.local.remove(['idleSinceTs']);
}

chrome.idle.onStateChanged.addListener(async (state) => {
  console.log('IDLE STATE CHANGED:', state);

  if (state === 'idle' || state === 'locked') {
    const data = await chrome.storage.local.get(['idleSinceTs']);
    if (!data.idleSinceTs) {
      await chrome.storage.local.set({
        idleSinceTs: Date.now() - (IDLE_THRESHOLD_SEC * 1000)
      });
    }
  } else if (state === 'active') {
    await clearIdle();
  }
});

async function getIdleSeconds() {
  return new Promise((resolve) => {
    chrome.idle.queryState(IDLE_THRESHOLD_SEC, async (state) => {
      const data = await chrome.storage.local.get(['idleSinceTs']);

      if ((state === 'idle' || state === 'locked') && data.idleSinceTs) {
        const seconds = Math.max(0, Math.floor((Date.now() - data.idleSinceTs) / 1000));
        resolve(seconds);
      } else {
        resolve(0);
      }
    });
  });
}

async function captureAndUpload(force = false) {
  const c = await cfg();

  console.log('CFG DEBUG', c);

  if (!c.running && !force) return;

  if (!c.serverUrl || !c.deviceUid) {
    await chrome.storage.local.set({ lastError: 'Options not configured' });
    console.log('Missing config:', { serverUrl: c.serverUrl, deviceUid: c.deviceUid });
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs.length ? tabs[0] : null;

    const activeTitle = tab && tab.title ? tab.title : '';
    const activeUrl = tab && tab.url ? tab.url : '';
    const idleSeconds = await getIdleSeconds();

    console.log('IMTS UPLOAD DEBUG', {
      activeTitle,
      activeUrl,
      idleSeconds,
      running: c.running,
      serverUrl: c.serverUrl,
      deviceUid: c.deviceUid
    });

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 });
    const blob = await (await fetch(dataUrl)).blob();

    const fd = new FormData();
    fd.append('shot', blob, 'chrome.jpg');
    fd.append('system_name', c.systemName || '');
    fd.append('client_type', 'chromeos');
    fd.append('active_window_title', activeTitle);
    fd.append('active_url', activeUrl);
    fd.append('idle_seconds', String(idleSeconds));
    fd.append('sw_build', 'IMTS_20260310_V3');

    const headers = {
      'X-Device-UID': c.deviceUid,
      'X-Device-Key': c.deviceKey || ''
    };

    if (c.enrollToken) {
      headers['X-Enroll-Token'] = c.enrollToken;
    }

    const res = await fetch(c.serverUrl, {
      method: 'POST',
      body: fd,
      headers
    });

    const text = await res.text().catch(() => '');
    const chk = await strictJson(res, text);

    console.log('SERVER RESPONSE DEBUG', {
      status: res.status,
      text,
      parsed: chk
    });

    if (!chk.ok) {
      await chrome.storage.local.set({ lastError: chk.error });
      await notify('IMTS Upload Failed', chk.error);
      return;
    }

    const json = chk.json;
    if (json.device_key) {
      await chrome.storage.local.set({ deviceKey: json.device_key });
    }

    await chrome.storage.local.set({
      lastUploadAt: new Date().toISOString(),
      lastError: ''
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log('IMTS CAPTURE ERROR', msg);
    await chrome.storage.local.set({ lastError: msg });
    await notify('IMTS Capture Error', msg);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'IMTS_START') {
      await chrome.storage.local.set({ running: true, lastError: '' });
      await setBadge(true);
      await chrome.alarms.create(ALARM, { periodInMinutes: INTERVAL_MIN });
      await captureAndUpload(true);
      sendResponse({ ok: true });
    } else if (msg?.type === 'IMTS_STOP') {
      await chrome.storage.local.set({ running: false });
      await setBadge(false);
      await chrome.alarms.clear(ALARM);
      sendResponse({ ok: true });
    } else if (msg?.type === 'IMTS_CAPTURE_NOW') {
      await captureAndUpload(true);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM) {
    await captureAndUpload(false);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('IMTS onInstalled fired');
  const { running } = await chrome.storage.local.get(['running']);
  await setBadge(!!running);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('IMTS onStartup fired');
  const { running } = await chrome.storage.local.get(['running']);
  await setBadge(!!running);
  if (running) {
    await chrome.alarms.create(ALARM, { periodInMinutes: INTERVAL_MIN });
  }
});