import './style.css';

const API_DEFAULT = 'http://127.0.0.1:18080';

let apiBase = localStorage.getItem('kokoni_api_base') || API_DEFAULT;
let selectedFile = null;
let filamentHot = false;
let currentJobState = 'unknown';

document.querySelector('#app').innerHTML = `
  <main class="app">
    <header class="header">
      <div>
        <h1>KOKONI EC1 Controller</h1>
        <p class="sub">Desktop UI for kokoni_agent</p>
      </div>
      <div class="status-pill" id="connPill">checking</div>
    </header>

    <section class="card">
      <h2>Job</h2>
      <div id="jobHuman" class="job-human">loading...</div>

      <div class="row job-actions">
        <button id="start" class="danger">Start</button>
        <button id="pause">Pause</button>
        <button id="resume">Resume</button>
        <button id="cancel" class="danger">Cancel</button>
      </div>
      <div id="actionResult" class="message small-message"></div>


    </section>

    <section class="card">
      <h2>G-code Upload</h2>
      <input id="fileInput" type="file" accept=".gcode" />
      <div class="row">
        <button id="upload">Upload</button>
      </div>
      <div id="uploadResult" class="message"></div>
    </section>

    <section class="card">
      <h2>Logs</h2>
      <pre id="logBox">no logs</pre>
    </section>

    <section class="card">
      <h2>Filament</h2>
      <div id="filamentState" class="message small-message">Cold: heat first before extrude/retract.</div>

      <div class="row filament-row">
        <button id="filamentHeat">Heat 200℃</button>
        <button id="filamentCooldown">Cooldown</button>
      </div>

      <div class="row filament-row">
        <span class="control-label">Preset</span>
        <button id="filamentLoad340">Load 340mm</button>
        <button id="filamentUnload340" class="danger">Unload 340mm</button>
      </div>

      <div class="row filament-row">
        <span class="control-label">Fine</span>
        <button id="extrude20">+20mm</button>
        <button id="retract20">-20mm</button>
      </div>
    </section>

    <section class="card">
      <h2>Leveling</h2>

      <div class="row leveling-row">
        <button id="levelHome">Home</button>
        <button id="levelCenter">Center</button>
      </div>

      <div class="row leveling-row">
        <button id="levelXY1010">Left Front</button>
        <button id="levelXY9010">Right Front</button>
        <button id="levelXY1090">Left Back</button>
        <button id="levelXY9090">Right Back</button>
      </div>
    </section>

    <section class="card">
      <h2>Printer</h2>
      <div class="row">
        <button id="initUart">Connect Printer</button>
        <button id="lightOn">Light ON</button>
        <button id="lightOff">Light OFF</button>
      </div>
    </section>

    <section class="card compact-card advanced-card">
      <h2>Advanced</h2>

      <details>
        <summary>Raw Job JSON</summary>
        <pre id="jobBox">loading...</pre>
      </details>

      <details>
        <summary>Raw Status JSON</summary>
        <pre id="statusBox">loading...</pre>
      </details>

      <details>
        <summary>Agent URL</summary>
        <div class="row agent-url-row">
          <input id="apiBase" class="input" value="${apiBase}" />
          <button id="saveApi">Save</button>
          <button id="refresh">Refresh</button>
        </div>
      </details>
    </section>
  </main>
`;

const $ = (id) => document.getElementById(id);

function endpoint(path) {
  return `${apiBase}${path}`;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function request(path, options = {}) {
  const res = await fetch(endpoint(path), options);
  const text = await res.text();

  let body = text;
  try {
    body = JSON.parse(text);
  } catch (_) {
    // keep plain text
  }

  if (!res.ok) {
    throw new Error(typeof body === 'string' ? body : pretty(body));
  }

  return body;
}

function setConn(ok, text) {
  const pill = $('connPill');
  pill.textContent = text;
  pill.className = ok ? 'status-pill ok' : 'status-pill ng';
}


function fmtSeconds(sec) {
  if (!sec || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }
  return `${m}m ${s}s`;
}

function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(digits);
}


function renderStatus(status) {
  const uart = status.uart_connected ? 'connected' : 'disconnected';
  const printer = status.printer || 'unknown';

  return `
    <div class="summary-grid">
      <div><span>Agent</span><strong>${escapeHtml(status.agent || '-')}</strong></div>
      <div><span>State</span><strong>${escapeHtml(status.state || '-')}</strong></div>
      <div><span>Printer</span><strong>${escapeHtml(printer)}</strong></div>
      <div><span>UART</span><strong>${escapeHtml(uart)}</strong></div>

      <div><span>Uptime</span><strong>${fmtSeconds(status.uptime_sec || 0)}</strong></div>
    </div>

    <div class="last-command">
      <span>Last MCU line</span>
      <code>${escapeHtml(status.last_mcu_line || '-')}</code>
    </div>
  `;
}


function updateJobButtons(job) {
  const state = job?.state || 'unknown';

  const start = $('start');
  const pause = $('pause');
  const resume = $('resume');
  const cancel = $('cancel');

  start.disabled = true;
  pause.disabled = true;
  resume.disabled = true;
  cancel.disabled = true;

  if (['uploaded', 'done', 'cancelled', 'error', 'interrupted'].includes(state)) {
    start.disabled = false;
  }

  if (state === 'printing') {
    pause.disabled = false;
    cancel.disabled = false;
  }

  if (state === 'paused') {
    resume.disabled = false;
    cancel.disabled = false;
  }
}

function renderJob(job) {
  const summary = job.summary || {};
  const pct = job.progress_pct || 0;
  const warnings = summary.warnings || [];

  const stateClass = `state-${job.state || 'unknown'}`;

  const visibleWarnings = warnings.filter(w => {
    const text = String(w);
    if (text.includes('M140 is present')) return false;
    if (text.includes('M106 is present')) return false;
    return true;
  });

  const warningHtml = visibleWarnings.length
    ? `<div class="warnings">${visibleWarnings.map(w => `<div>⚠ ${escapeHtml(w)}</div>`).join('')}</div>`
    : ``;

  return `
    <div class="job-top">
      <span class="state ${stateClass}">${escapeHtml(job.state || 'unknown')}</span>
      <span class="muted">${escapeHtml(job.file_name || 'no file')}</span>
    </div>

    <div class="progress">
      <div class="progress-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
    </div>

    <div class="job-line">
      <strong>${pct}%</strong>
      <span>${job.current_line || 0} / ${job.total_lines || 0} lines</span>
    </div>

    <div class="summary-grid">








    </div>

    ${warningHtml}
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function refresh() {
  try {
    const status = await request('/api/status');
    const job = await request('/api/job');

    $('statusBox').textContent = pretty(status);
    $('jobBox').textContent = pretty(job);
    $('jobHuman').innerHTML = renderJob(job);
    updateJobButtons(job);
    setConn(true, 'connected');

    return { status, job };
  } catch (err) {
    $('statusBox').textContent = String(err.message || err);
    $('jobBox').textContent = 'unavailable';
    $('jobHuman').textContent = 'unavailable';
    updateJobButtons({ state: 'unknown' });
    setConn(false, 'offline');
    return null;
  }
}

async function reloadLogs() {
  try {
    const text = await request('/api/logs?lines=30');
    const logBox = $('logBox');
    logBox.textContent = typeof text === 'string' ? text : pretty(text);
    logBox.scrollTop = logBox.scrollHeight;
  } catch (err) {
    $('logBox').textContent = String(err.message || err);
  }
}


async function sendManualCommand(cmd) {
  return request(`/api/send?cmd=${encodeURIComponent(cmd)}`, { method: 'POST' });
}

async function sendCommandSequence(commands) {
  for (const cmd of commands) {
    await sendManualCommand(cmd);
  }
}

function isJobActiveState(state) {
  return state === 'printing' || state === 'paused' || state === 'pausing';
}

function updateFilamentButtons() {
  const active = isJobActiveState(currentJobState);

  const heat = $('filamentHeat');
  const cooldown = $('filamentCooldown');
  const buttons = [
    $('filamentLoad340'), $('filamentUnload340'),
    $('extrude20'), $('retract20'),
  ];

  if (heat) heat.disabled = active;
  if (cooldown) cooldown.disabled = active;

  for (const btn of buttons) {
    if (!btn) continue;
    btn.disabled = active || !filamentHot;
  }

  const state = $('filamentState');
  if (state) {
    if (active) {
      state.textContent = 'Filament controls disabled while job is active.';
    } else if (filamentHot) {
      state.textContent = 'Hot: extrusion controls enabled.';
    } else {
      state.textContent = 'Cold: heat first before extrude/retract.';
    }
  }
}

async function heatFilament() {
  const ok = confirm('Heat nozzle to 200℃ for filament operation?');
  if (!ok) return;

  try {
    $('actionResult').textContent = 'Heating to 200℃...';
    await sendManualCommand('M109 S200');
    filamentHot = true;
    $('actionResult').textContent = 'Nozzle heated to 200℃.';
    updateFilamentButtons();
    await refresh();
    await reloadLogs();
  } catch (err) {
    filamentHot = false;
    $('actionResult').textContent = String(err.message || err);
    updateFilamentButtons();
  }
}

async function cooldownFilament() {
  const ok = confirm('Cooldown nozzle?');
  if (!ok) return;

  try {
    await sendManualCommand('M104 S0');
    filamentHot = false;
    $('actionResult').textContent = 'Cooldown command sent.';
    updateFilamentButtons();
    await refresh();
    await reloadLogs();
  } catch (err) {
    $('actionResult').textContent = String(err.message || err);
  }
}


async function sendLevelingSequence(label, commands) {
  if (isJobActiveState(currentJobState)) {
    alert('Leveling controls are disabled while a job is active.');
    return;
  }

  const ok = confirm(`${label}?\n\nMake sure the printer area is clear.`);
  if (!ok) return;

  try {
    $('actionResult').textContent = `${label}...`;
    await sendCommandSequence(commands);
    $('actionResult').textContent = `${label} done.`;
    await refresh();
    await reloadLogs();
  } catch (err) {
    $('actionResult').textContent = String(err.message || err);
  }
}

function updateLevelingButtons() {
  const active = isJobActiveState(currentJobState);
  const ids = [
    'levelHome',
    'levelCenter',
    'levelXY1010',
    'levelXY9010',
    'levelXY1090',
    'levelXY9090',
  ];

  for (const id of ids) {
    const btn = $(id);
    if (btn) btn.disabled = active;
  }
}

async function moveFilament(mm) {
  if (!filamentHot) {
    alert('Nozzle is not marked as hot. Press Heat 200℃ first.');
    return;
  }

  if (isJobActiveState(currentJobState)) {
    alert('Filament controls are disabled while a job is active.');
    return;
  }

  const direction = mm > 0 ? 'extrude' : 'retract';
  const ok = confirm(`${direction} ${Math.abs(mm)}mm?\n\nOnly do this when the nozzle is hot and filament movement is expected.`);
  if (!ok) return;

  try {
    $('actionResult').textContent = `${direction} ${Math.abs(mm)}mm...`;
    await sendCommandSequence([
      'G91',
      `G1 E${mm} F300`,
      'G90',
    ]);
    $('actionResult').textContent = `${direction} ${Math.abs(mm)}mm done.`;
    await refresh();
    await reloadLogs();
  } catch (err) {
    $('actionResult').textContent = String(err.message || err);
  }
}

async function post(path) {
  try {
    await request(path, { method: 'POST' });
    $('actionResult').textContent = 'OK';
    await refresh();
    await reloadLogs();
  } catch (err) {
    $('actionResult').textContent = String(err.message || err);
  }
}

$('saveApi').onclick = async () => {
  apiBase = $('apiBase').value.trim() || API_DEFAULT;
  localStorage.setItem('kokoni_api_base', apiBase);
  await refresh();
};

$('refresh').onclick = async () => {
  await refresh();
  await reloadLogs();
};


$('fileInput').onchange = (event) => {
  selectedFile = event.target.files?.[0] || null;
  $('uploadResult').textContent = selectedFile ? selectedFile.name : '';
};

$('upload').onclick = async () => {
  if (!selectedFile) {
    $('uploadResult').textContent = 'Select a .gcode file first.';
    return;
  }

  if (!selectedFile.name.toLowerCase().endsWith('.gcode')) {
    $('uploadResult').textContent = 'Only .gcode files are allowed.';
    return;
  }

  const form = new FormData();
  form.append('gcode', selectedFile);

  try {
    const data = await request('/api/job/upload', {
      method: 'POST',
      body: form,
    });
    $('uploadResult').textContent = `Uploaded: ${data.file_name || selectedFile.name}`;
    await refresh();
  } catch (err) {
    $('uploadResult').textContent = String(err.message || err);
  }
};

$('start').onclick = () => {
  const ok = confirm('Start printing the uploaded G-code?\n\nCheck that the printer is ready, the build plate is clear, and filament is loaded.');
  if (!ok) return;
  post('/api/job/start');
};

$('pause').onclick = () => post('/api/job/pause');
$('resume').onclick = () => post('/api/job/resume');

$('cancel').onclick = () => {
  const ok = confirm('Cancel the current job?\n\nThe running command may finish before the job stops.');
  if (!ok) return;
  post('/api/job/cancel');
};

$('filamentHeat').onclick = heatFilament;
$('filamentCooldown').onclick = cooldownFilament;

$('filamentLoad340').onclick = () => moveFilament(340);
$('filamentUnload340').onclick = () => moveFilament(-340);

$('extrude20').onclick = () => moveFilament(20);
$('retract20').onclick = () => moveFilament(-20);


$('levelHome').onclick = () => sendLevelingSequence('Home', [
  'G28',
]);

$('levelCenter').onclick = () => sendLevelingSequence('Move to center', [
  'G90',
  'G1 Z45 F900',
  'G1 X50 Y50 F3000',
]);

$('levelXY1010').onclick = () => sendLevelingSequence('Move to Left Front', [
  'G90',
  'G1 Z45 F900',
  'G1 X0 Y0 F3000',
]);

$('levelXY9010').onclick = () => sendLevelingSequence('Move to Right Front', [
  'G90',
  'G1 Z45 F900',
  'G1 X100 Y0 F3000',
]);

$('levelXY1090').onclick = () => sendLevelingSequence('Move to Left Back', [
  'G90',
  'G1 Z45 F900',
  'G1 X0 Y100 F3000',
]);

$('levelXY9090').onclick = () => sendLevelingSequence('Move to Right Back', [
  'G90',
  'G1 Z45 F900',
  'G1 X100 Y100 F3000',
]);





$('initUart').onclick = () => post('/api/init');
$('lightOn').onclick = () => post('/api/light?value=255');
$('lightOff').onclick = () => post('/api/light?value=0');

updateFilamentButtons();
updateLevelingButtons();

refresh();
reloadLogs();

setInterval(refresh, 2000);
