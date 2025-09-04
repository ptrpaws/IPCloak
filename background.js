const RULE_ID = 1;
const ALARM_NAME = 'ip-rotation-alarm';

const defaultSettings = {
  enabled: true,
  rotationBehavior: 1,
  headers: ["X-Forwarded-For", "X-Real-IP", "Forwarded"],
  behaviour: "range",
  manualIp: "127.0.0.1",
  range_from: "0.0.0.0",
  range_to: "255.255.255.255",
  list: "127.0.0.1\n192.168.1.1\n10.0.0.1\n8.8.8.8",
  whitelist: "ignore_this_domain.com",
  currentIp: "N/A",
  nextRotationTimestamp: null
};

async function getFullState() {
  return new Promise(resolve => chrome.storage.local.get(defaultSettings, resolve));
}
async function saveSettings(settings) {
  return new Promise(resolve => chrome.storage.local.set(settings, resolve));
}

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
  return [
    (long >>> 24),
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255
  ].join('.');
}


function generateIp(settings) {
  if (settings.behaviour === "manual") {
    return settings.manualIp;
  }

  if (settings.behaviour === "range") {
    const fromLong = ipToLong(settings.range_from);
    const toLong = ipToLong(settings.range_to);

    const start = Math.min(fromLong, toLong);
    const end = Math.max(fromLong, toLong);

    const randomLong = Math.floor(Math.random() * (end - start + 1)) + start;

    return longToIp(randomLong);
  } else {
    const list = settings.list.split('\n').filter(ip => ip.trim() !== '');
    if (list.length === 0) return "127.0.0.1";
    return list[Math.floor(Math.random() * list.length)];
  }
}


async function updateDeclarativeNetRequestRules() {
  const settings = await getFullState();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID] });

  if (!settings.enabled || settings.headers.length === 0) {
    chrome.storage.local.set({ currentIp: "Disabled" });
    return;
  }

  const ip = generateIp(settings);
  chrome.storage.local.set({ currentIp: ip });

  const requestHeaders = settings.headers.map(header => ({
    header: header,
    operation: "set",
    value: header.toLowerCase() === 'forwarded' ? `for=${ip}` : ip
  }));
  const excludedRequestDomains = settings.whitelist.split('\n').map(d => d.trim()).filter(Boolean);

  const newRule = {
    id: RULE_ID,
    priority: 1,
    action: { type: "modifyHeaders", requestHeaders },
    condition: {
      urlFilter: "*",
      resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
    }
  };

  if (excludedRequestDomains.length > 0) {
    newRule.condition.excludedRequestDomains = excludedRequestDomains;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [newRule] });
}

async function createOrClearAlarm() {
  const settings = await getFullState();
  const rotationMinutes = parseInt(settings.rotationBehavior, 10);
  const isManualMode = settings.behaviour === 'manual';

  await chrome.alarms.clear(ALARM_NAME);

  if (settings.enabled && !isManualMode && rotationMinutes > 0) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: rotationMinutes });
    const alarm = await chrome.alarms.get(ALARM_NAME);
    chrome.storage.local.set({ nextRotationTimestamp: alarm.scheduledTime });
  } else {
    chrome.storage.local.set({ nextRotationTimestamp: null });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateDeclarativeNetRequestRules();

    const updatedAlarm = await chrome.alarms.get(ALARM_NAME);
    if (updatedAlarm) {
      await chrome.storage.local.set({ nextRotationTimestamp: updatedAlarm.scheduledTime });
    }
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getState") {
    getFullState().then(sendResponse);
    return true;
  }

  if (request.action === "saveSettings") {
    saveSettings(request.settings).then(async () => {
      await updateDeclarativeNetRequestRules();
      await createOrClearAlarm();
      sendResponse({ status: "Settings saved and rules updated." });
    });
    return true;
  }

  if (request.action === "rotateNow") {
    updateDeclarativeNetRequestRules().then(async () => {
      await createOrClearAlarm();
      getFullState().then(sendResponse);
    });
    return true;
  }

  if (request.action === "resetSettings") {
    chrome.storage.local.clear(() => {
      saveSettings(defaultSettings).then(async () => {
        await updateDeclarativeNetRequestRules();
        await createOrClearAlarm();
        sendResponse(defaultSettings);
      });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await saveSettings(defaultSettings);
  }
  await updateDeclarativeNetRequestRules();
  await createOrClearAlarm();
});
