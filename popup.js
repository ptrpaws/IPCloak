document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form');
  const enabledCheckbox = document.getElementById('enabled');
  const statusMessageEl = document.getElementById('status-message');
  const resetLink = document.getElementById('reset-config');
  const rotationSelect = document.getElementById('rotation-behavior');
  const rotateNowBtn = document.getElementById('rotate-now-btn');
  const currentIpEl = document.getElementById('current-ip');
  const nextRotationEl = document.getElementById('next-rotation');

  let countdownInterval = null;

  function toggleFormEnabled(isEnabled) {
    document.querySelectorAll('fieldset:not(#status-display)').forEach(fs => {
      fs.disabled = !isEnabled;
    });
    rotateNowBtn.disabled = !isEnabled;
  }

  function updateBehaviorUI(behavior) {
    document.getElementById('fieldset-range').style.display = behavior === 'range' ? 'block' : 'none';
    document.getElementById('fieldset-list').style.display = behavior === 'list' ? 'block' : 'none';
    document.getElementById('fieldset-manual').style.display = behavior === 'manual' ? 'block' : 'none';
  }

  function startCountdown(timestamp) {
    if (countdownInterval) clearInterval(countdownInterval);
    if (!timestamp) {
      nextRotationEl.textContent = 'Rotation is manual or paused.';
      return;
    }

    countdownInterval = setInterval(() => {
      const diff = Math.max(0, timestamp - Date.now());
      if (diff === 0) {
        nextRotationEl.textContent = 'Rotating now...';
        clearInterval(countdownInterval);
        setTimeout(refreshPopupState, 1000);
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      nextRotationEl.textContent = `Next rotation in: ${minutes}:${seconds}`;
    }, 1000);
  }

  function populateForm(state) {
    enabledCheckbox.checked = state.enabled;
    currentIpEl.textContent = state.currentIp;
    rotationSelect.value = state.rotationBehavior;

    document.querySelectorAll('input[name="behaviour"]').forEach(radio => {
      radio.checked = radio.value === state.behaviour;
    });

    document.getElementById('manual-ip').value = state.manualIp;
    document.getElementById('ip-range-from').value = state.range_from;
    document.getElementById('ip-range-to').value = state.range_to;
    document.getElementById('ip-list').value = state.list;
    document.getElementById('whitelist').value = state.whitelist;

    const headerContainer = document.querySelector('.header-columns');
    headerContainer.innerHTML = '';
    const headers = ["X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP", "True-Client-IP", "Forwarded", "Client-IP", "Via", "X-Cluster-Client-IP", "X-Originating-IP", "WL-Proxy-Client-IP", "Proxy-Client-IP", "Source-IP", "X-Remote-IP", "X-Remote-Addr"];
    let col1 = '<div>', col2 = '<div>';
    headers.forEach((h, i) => {
      const checked = state.headers.includes(h) ? 'checked' : '';
      const label = `<label><input type="checkbox" name="header" value="${h}" ${checked} /> ${h}</label><br />`;
      if (i < headers.length / 2) col1 += label;
      else col2 += label;
    });
    col1 += '</div>'; col2 += '</div>';
    headerContainer.innerHTML = col1 + col2;

    toggleFormEnabled(state.enabled);
    updateBehaviorUI(state.behaviour);
    startCountdown(state.nextRotationTimestamp);
  }

  function refreshPopupState() {
    chrome.runtime.sendMessage({ action: "getState" }, (state) => {
      if (chrome.runtime.lastError) {
        statusMessageEl.textContent = 'Error loading state.';
      } else {
        populateForm(state);
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    statusMessageEl.textContent = 'Saving...';
    const newSettings = {
      enabled: enabledCheckbox.checked,
      rotationBehavior: rotationSelect.value,
      headers: Array.from(document.querySelectorAll('input[name="header"]:checked')).map(cb => cb.value),
      behaviour: document.querySelector('input[name="behaviour"]:checked').value,
      manualIp: document.getElementById('manual-ip').value,
      range_from: document.getElementById('ip-range-from').value,
      range_to: document.getElementById('ip-range-to').value,
      list: document.getElementById('ip-list').value,
      whitelist: document.getElementById('whitelist').value
    };

    chrome.runtime.sendMessage({ action: "saveSettings", settings: newSettings }, (response) => {
      statusMessageEl.textContent = response.status;
      setTimeout(() => statusMessageEl.textContent = '', 2000);
      refreshPopupState();
    });
  });

  rotateNowBtn.addEventListener('click', () => {
    currentIpEl.textContent = 'Rotating...';
    if (countdownInterval) clearInterval(countdownInterval);
    nextRotationEl.textContent = '';
    chrome.runtime.sendMessage({ action: "rotateNow" }, (newState) => {
      populateForm(newState);
    });
  });

  resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Reset all settings to default?')) {
      chrome.runtime.sendMessage({ action: "resetSettings" }, (defaults) => {
        populateForm(defaults);
        statusMessageEl.textContent = 'Settings reset to default.';
        setTimeout(() => statusMessageEl.textContent = '', 2000);
      });
    }
  });

  enabledCheckbox.addEventListener('change', () => toggleFormEnabled(enabledCheckbox.checked));
  document.querySelectorAll('input[name="behaviour"]').forEach(radio => {
    radio.addEventListener('change', () => updateBehaviorUI(radio.value));
  });

  refreshPopupState();
});
