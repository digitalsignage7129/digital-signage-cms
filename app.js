import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.SIGNAGE_CONFIG || {};
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const loginView = $('#loginView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const configWarning = $('#configWarning');
const accountInfo = $('#accountInfo');
const roleBadge = $('#roleBadge');
const siteList = $('#siteList');
const emptyState = $('#emptyState');
const editorBody = $('#editorBody');
const displayTitle = $('#displayTitle');
const projectName = $('#projectName');
const siteIdLabel = $('#siteIdLabel');
const saveState = $('#saveState');
const publishBtn = $('#publishBtn');
const weatherLink = $('#weatherLink');
const precipLink = $('#precipLink');
const adminNav = $('#adminNav');
const customerList = $('#customerList');
const playerList = $('#playerList');
const deviceList = $('#deviceList');

const DEFAULT_WEATHER_TODAY = 'https://digital-signage-led.github.io/led-weather-signage/?region=national&content=today_weather';
const DEFAULT_WEATHER_TOMORROW = 'https://digital-signage-led.github.io/led-weather-signage/?region=national&content=tomorrow_weather';
const DEFAULT_WEATHER_WEEKLY = 'https://digital-signage-led.github.io/led-weather-signage/?region=national&content=weekly_weather';

const fields = {
  greeting: { input: '#file-greeting', preview: '#preview-greeting', meta: '#meta-greeting', column: 'greeting_image_url', kind: 'image' },
  notice: { input: '#file-notice', preview: '#preview-notice', meta: '#meta-notice', column: 'notice_image_url', kind: 'image' },
  schedule: { input: '#file-schedule', preview: '#preview-schedule', meta: '#meta-schedule', column: 'schedule_image_url', kind: 'image' },
  pr: { input: '#file-pr', preview: '#preview-pr', meta: '#meta-pr', column: 'pr_video_url', kind: 'video' }
};

let supabase = null;
let currentUser = null;
let currentProfile = null;
let sites = [];
let customers = [];
let selectedSite = null;
let pendingFiles = {};
let dirty = false;

function isAdmin() { return currentProfile?.role === 'admin'; }

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.className = 'toast', 3600);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function setDirty(value = true) {
  dirty = value;
  saveState.textContent = value ? '未公開の変更あり' : '公開済み';
  saveState.className = `save-state ${value ? 'dirty' : 'saved'}`;
}

function publicUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

function validateConfig() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')) {
    configWarning.textContent = 'config.js に Supabase Publishable key を設定してください。';
    configWarning.classList.remove('hidden');
    return false;
  }
  return true;
}

async function init() {
  if (!validateConfig()) return;
  supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await enterApp(session.user);
  supabase.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (!sessionNow) showLogin();
  });
}

function showLogin() {
  currentUser = null;
  currentProfile = null;
  sites = [];
  customers = [];
  selectedSite = null;
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

async function enterApp(user) {
  currentUser = user;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('user_id,role,company_name')
    .eq('user_id', user.id)
    .single();

  if (error) {
    toast('プロフィールを取得できません。管理者にお問い合わせください。', true);
    await supabase.auth.signOut();
    return;
  }

  currentProfile = profile;
  accountInfo.textContent = `${profile.company_name || ''} / ${user.email || ''}`;
  roleBadge.textContent = profile.role;
  adminNav.classList.toggle('hidden', !isAdmin());
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  switchView('contentView');
  await loadSites();
}

function switchView(id) {
  $$('.view-section').forEach(v => v.classList.toggle('hidden', v.id !== id));
  $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  if (id === 'customersView' && isAdmin()) loadCustomers();
  if (id === 'playersView' && isAdmin()) { renderPlayers(); loadDevices(); }
}

$$('.nav-tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

async function loadSites() {
  siteList.innerHTML = '<div class="muted">読込中...</div>';
  const { data, error } = await supabase.from('sites').select('*').order('site_id', { ascending: true });
  if (error) {
    siteList.innerHTML = '';
    toast(`現場一覧の取得に失敗しました: ${error.message}`, true);
    return;
  }
  sites = data || [];
  renderSiteList();
  renderPlayers();
  if (selectedSite) {
    const next = sites.find(s => s.site_id === selectedSite.site_id);
    if (next) selectSite(next);
  } else if (sites.length === 1) {
    selectSite(sites[0]);
  }
}

function renderSiteList() {
  siteList.innerHTML = '';
  if (!sites.length) {
    siteList.innerHTML = '<div class="muted">割り当てられた現場がありません。</div>';
    return;
  }
  for (const site of sites) {
    const btn = document.createElement('button');
    btn.className = `site-item${selectedSite?.site_id === site.site_id ? ' active' : ''}`;
    btn.innerHTML = `<strong>${escapeHtml(site.project_name || site.title || site.site_id)}</strong><div class="site-id">${escapeHtml(site.site_id)}</div>`;
    btn.addEventListener('click', () => selectSite(site));
    siteList.appendChild(btn);
  }
}

function selectSite(site) {
  selectedSite = site;
  pendingFiles = {};
  dirty = false;
  renderSiteList();
  emptyState.classList.add('hidden');
  editorBody.classList.remove('hidden');
  siteIdLabel.textContent = `SITE ID: ${site.site_id}`;
  displayTitle.value = site.title || '';
  projectName.value = site.project_name || '';
  weatherLink.textContent = site.weather_url || '';
  precipLink.textContent = site.precip_url || '';
  saveState.textContent = '公開済み';
  saveState.className = 'save-state saved';

  for (const spec of Object.values(fields)) {
    const path = site[spec.column] || '';
    const preview = $(spec.preview);
    const input = $(spec.input);
    const meta = $(spec.meta);
    input.value = '';
    meta.textContent = path || '未登録';
    const url = publicUrl(path);
    if (spec.kind === 'image') {
      preview.removeAttribute('src');
      if (url) preview.src = `${url}?v=${Date.now()}`;
    } else {
      preview.removeAttribute('src');
      preview.load();
      if (url) { preview.src = `${url}?v=${Date.now()}`; preview.load(); }
    }
  }
}

for (const [key, spec] of Object.entries(fields)) {
  $(spec.input).addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (key === 'pr' && file.size > 50 * 1024 * 1024) {
      toast('PR動画は50MB以下にしてください。', true);
      e.target.value = '';
      return;
    }
    pendingFiles[key] = file;
    const preview = $(spec.preview);
    const meta = $(spec.meta);
    const objectUrl = URL.createObjectURL(file);
    if (spec.kind === 'image') preview.src = objectUrl;
    else { preview.src = objectUrl; preview.load(); }
    meta.textContent = `${file.name} / ${(file.size / 1024 / 1024).toFixed(1)} MB（未公開）`;
    setDirty(true);
  });
}

displayTitle.addEventListener('input', () => setDirty(true));
projectName.addEventListener('input', () => setDirty(true));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const btn = loginForm.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'ログイン中...';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'ログイン';
  if (error) return toast(`ログインできません: ${error.message}`, true);
  await enterApp(data.user);
});

$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); showLogin(); });
$('#refreshBtn').addEventListener('click', async () => {
  await loadSites();
  if (isAdmin()) await loadCustomers();
  toast('最新情報に更新しました。');
});

publishBtn.addEventListener('click', async () => {
  if (!selectedSite) return;
  publishBtn.disabled = true;
  publishBtn.textContent = '公開中...';
  try {
    const patch = {
      title: displayTitle.value.trim(),
      project_name: projectName.value.trim(),
      updated_at: new Date().toISOString()
    };
    if (!patch.title || !patch.project_name) throw new Error('タイトルと工事名を入力してください。');

    for (const [key, file] of Object.entries(pendingFiles)) {
      const spec = fields[key];
      const ext = (file.name.split('.').pop() || (key === 'pr' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${selectedSite.site_id}/${key}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(cfg.STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '60', upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      patch[spec.column] = path;
    }

    const { data, error } = await supabase
      .from('sites')
      .update(patch)
      .eq('site_id', selectedSite.site_id)
      .select('*')
      .single();
    if (error) throw error;
    selectedSite = data;
    const idx = sites.findIndex(s => s.site_id === data.site_id);
    if (idx >= 0) sites[idx] = data;
    pendingFiles = {};
    selectSite(data);
    renderPlayers();
    toast('公開しました。');
  } catch (err) {
    console.error(err);
    toast(`公開に失敗しました: ${err.message || err}`, true);
    setDirty(true);
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = '公開する';
  }
});

async function loadCustomers() {
  if (!isAdmin()) return;
  customerList.innerHTML = '<div class="muted">読込中...</div>';
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,role,company_name')
    .eq('role', 'customer')
    .order('company_name', { ascending: true });
  if (error) {
    customerList.innerHTML = '';
    toast(`顧客一覧の取得に失敗しました: ${error.message}`, true);
    return;
  }
  customers = data || [];
  const { data: mappings, error: mapError } = await supabase.from('user_sites').select('user_id,site_id');
  if (mapError) return toast(`割り当て情報の取得に失敗しました: ${mapError.message}`, true);
  const byUser = new Map();
  for (const row of mappings || []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Set());
    byUser.get(row.user_id).add(row.site_id);
  }
  renderCustomers(byUser);
}

function renderCustomers(byUser) {
  customerList.innerHTML = '';
  if (!customers.length) {
    customerList.innerHTML = '<div class="muted">顧客アカウントはまだありません。</div>';
    return;
  }
  for (const customer of customers) {
    const assigned = byUser.get(customer.user_id) || new Set();
    const row = document.createElement('div');
    row.className = 'customer-row';
    row.innerHTML = `
      <div class="row-head">
        <div>
          <div class="row-title">${escapeHtml(customer.company_name || '名称未設定')}</div>
          <div class="row-sub">USER ID: ${escapeHtml(customer.user_id)}</div>
        </div>
        <span class="badge">CUSTOMER</span>
      </div>
      <div class="assignment-box">
        <div class="assignment-title">管理を許可する現場</div>
        <div class="assignment-grid">
          ${sites.map(site => `<label class="check-item"><input type="checkbox" data-site="${escapeHtml(site.site_id)}" ${assigned.has(site.site_id) ? 'checked' : ''}> <span>${escapeHtml(site.project_name || site.site_id)}<br><small>${escapeHtml(site.site_id)}</small></span></label>`).join('') || '<span class="muted">先にプレイヤーを登録してください。</span>'}
        </div>
        <div class="row-actions"><button class="primary small save-assignment">割り当てを保存</button></div>
      </div>`;
    row.querySelector('.save-assignment').addEventListener('click', () => saveAssignments(customer.user_id, row));
    customerList.appendChild(row);
  }
}

async function saveAssignments(userId, row) {
  const btn = row.querySelector('.save-assignment');
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    const desired = new Set([...row.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.dataset.site));
    const { data: existing, error: readError } = await supabase.from('user_sites').select('site_id').eq('user_id', userId);
    if (readError) throw readError;
    const current = new Set((existing || []).map(x => x.site_id));
    const add = [...desired].filter(x => !current.has(x));
    const remove = [...current].filter(x => !desired.has(x));

    if (add.length) {
      const { error } = await supabase.from('user_sites').insert(add.map(site_id => ({ user_id: userId, site_id })));
      if (error) throw error;
    }
    if (remove.length) {
      const { error } = await supabase.from('user_sites').delete().eq('user_id', userId).in('site_id', remove);
      if (error) throw error;
    }
    toast('現場の割り当てを保存しました。');
  } catch (err) {
    console.error(err);
    toast(`割り当て保存に失敗しました: ${err.message || err}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '割り当てを保存';
  }
}

$('#createCustomerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin()) return;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = '作成中...';
  try {
    const body = {
      company_name: $('#customerCompany').value.trim(),
      email: $('#customerEmail').value.trim(),
      password: $('#customerPassword').value
    };
    const { data, error } = await supabase.functions.invoke('create-customer', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    e.target.reset();
    await loadCustomers();
    toast('顧客アカウントを作成しました。');
  } catch (err) {
    console.error(err);
    toast('顧客作成に失敗しました。Edge Function「create-customer」の設定を確認してください。', true);
  } finally {
    btn.disabled = false;
    btn.textContent = '顧客アカウントを作成';
  }
});

$('#reloadCustomersBtn').addEventListener('click', loadCustomers);

function renderPlayers() {
  if (!playerList || !isAdmin()) return;
  playerList.innerHTML = '';
  if (!sites.length) {
    playerList.innerHTML = '<div class="muted">登録済みプレイヤーはありません。</div>';
    return;
  }
  for (const site of sites) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <div class="row-head">
        <div>
          <div class="row-title">${escapeHtml(site.project_name || site.site_id)}</div>
          <div class="row-sub">SITE ID: ${escapeHtml(site.site_id)} / ${escapeHtml(site.title || '')}</div>
        </div>
        <span class="badge">PLAYER</span>
      </div>
      <div class="row-actions">
        <button class="secondary small edit-content">コンテンツを開く</button>
        <button class="danger-btn small delete-site">削除</button>
      </div>`;
    row.querySelector('.edit-content').addEventListener('click', () => { selectSite(site); switchView('contentView'); });
    row.querySelector('.delete-site').addEventListener('click', () => deleteSite(site));
    playerList.appendChild(row);
  }
}

$('#createSiteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin()) return;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = '登録中...';
  try {
    const site_id = $('#newSiteId').value.trim();
    const title = $('#newSiteTitle').value.trim();
    const project_name = $('#newProjectName').value.trim();
    if (!site_id || !title || !project_name) throw new Error('必須項目を入力してください。');
    const payload = {
      site_id,
      title,
      project_name,
      weather_url: DEFAULT_WEATHER_TODAY,
      precip_url: DEFAULT_WEATHER_WEEKLY,
      weather_mode: 'today',
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('sites').insert(payload);
    if (error) throw error;
    e.target.reset();
    $('#newSiteTitle').value = 'デジタルサイネージ';
    await loadSites();
    toast('プレイヤーを登録しました。');
  } catch (err) {
    console.error(err);
    toast(`プレイヤー登録に失敗しました: ${err.message || err}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'プレイヤーを登録';
  }
});

async function deleteSite(site) {
  const ok = confirm(`「${site.project_name || site.site_id}」を削除しますか？\nこの操作は元に戻せません。`);
  if (!ok) return;
  try {
    const { data: filesInFolder } = await supabase.storage.from(cfg.STORAGE_BUCKET).list(site.site_id, { limit: 1000 });
    if (filesInFolder?.length) {
      const paths = filesInFolder.filter(f => f.name).map(f => `${site.site_id}/${f.name}`);
      if (paths.length) await supabase.storage.from(cfg.STORAGE_BUCKET).remove(paths);
    }
    const { error } = await supabase.from('sites').delete().eq('site_id', site.site_id);
    if (error) throw error;
    if (selectedSite?.site_id === site.site_id) {
      selectedSite = null;
      editorBody.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }
    await loadSites();
    await loadCustomers();
    toast('プレイヤーを削除しました。');
  } catch (err) {
    console.error(err);
    toast(`削除に失敗しました: ${err.message || err}`, true);
  }
}

$('#reloadPlayersBtn').addEventListener('click', async () => { await loadSites(); toast('プレイヤー一覧を更新しました。'); });


async function loadDevices() {
  if (!deviceList || !isAdmin()) return;
  deviceList.innerHTML = '<div class="muted">読込中...</div>';
  const { data, error } = await supabase
    .from('devices')
    .select('id,device_uid,registration_code,site_id,created_at,linked_at,last_seen_at')
    .order('created_at', { ascending: false });
  if (error) {
    deviceList.innerHTML = '';
    toast(`端末一覧の取得に失敗しました: ${error.message}`, true);
    return;
  }
  renderDevices(data || []);
}

function renderDevices(devices) {
  deviceList.innerHTML = '';
  if (!devices.length) {
    deviceList.innerHTML = '<div class="muted">まだ実機から登録コードが届いていません。V3アプリを起動してください。</div>';
    return;
  }
  for (const device of devices) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const linked = sites.find(s => s.site_id === device.site_id);
    row.innerHTML = `
      <div class="row-head">
        <div>
          <div class="device-code">${escapeHtml(device.registration_code || '')}</div>
          <div class="device-status">${device.site_id ? `接続済み: ${escapeHtml(device.site_id)}${linked ? ` / ${escapeHtml(linked.project_name || '')}` : ''}` : '未接続'}</div>
          <div class="row-sub">DEVICE: ${escapeHtml(device.device_uid || '')}</div>
        </div>
        <span class="badge">DEVICE</span>
      </div>
      <div class="device-link-grid">
        <label>接続する Site ID
          <select class="device-site-select">
            <option value="">未接続</option>
            ${sites.map(site => `<option value="${escapeHtml(site.site_id)}" ${site.site_id === device.site_id ? 'selected' : ''}>${escapeHtml(site.site_id)} / ${escapeHtml(site.project_name || site.site_id)}</option>`).join('')}
          </select>
        </label>
        <div class="muted">アプリ側は接続後、自動的にこの Site ID のコンテンツを受信します。</div>
       <button class="primary small save-device-link">接続を保存</button>
       <button class="danger-btn small delete-device">削除</button>
      </div>`;
    row.querySelector('.save-device-link').addEventListener('click', async () => {
      const btn = row.querySelector('.save-device-link');
      const site_id = row.querySelector('.device-site-select').value || null;
      btn.disabled = true;
      btn.textContent = '保存中...';
      try {
        const patch = { site_id, linked_at: site_id ? new Date().toISOString() : null };
        const { error } = await supabase.from('devices').update(patch).eq('id', device.id);
        if (error) throw error;
        toast(site_id ? '実機をプレイヤーに接続しました。' : '実機の接続を解除しました。');
        await loadDevices();
      } catch (err) {
        console.error(err);
        toast(`端末接続の保存に失敗しました: ${err.message || err}`, true);
      } finally {
        btn.disabled = false;
        btn.textContent = '接続を保存';
      }
    });
        row.querySelector('.delete-device').addEventListener('click', async () => {
      const ok = confirm(
        `登録コード「${device.registration_code || ''}」を削除しますか？\n\nこの操作は元に戻せません。`
      );
      if (!ok) return;

      const btn = row.querySelector('.delete-device');
      btn.disabled = true;
      btn.textContent = '削除中...';

      try {
        const { error } = await supabase
          .from('devices')
          .delete()
          .eq('id', device.id);

        if (error) throw error;

        toast('登録コードを削除しました。');
        await loadDevices();

      } catch (err) {
        console.error(err);
        toast(`登録コードの削除に失敗しました: ${err.message || err}`, true);
        btn.disabled = false;
        btn.textContent = '削除';
      }
    });
    deviceList.appendChild(row);
  }
}

$('#reloadDevicesBtn')?.addEventListener('click', async () => {
  await loadDevices();
  toast('実機一覧を更新しました。');
});

init();
