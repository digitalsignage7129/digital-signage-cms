import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.SIGNAGE_CONFIG || {};
const loginView = document.querySelector('#loginView');
const appView = document.querySelector('#appView');
const loginForm = document.querySelector('#loginForm');
const configWarning = document.querySelector('#configWarning');
const accountInfo = document.querySelector('#accountInfo');
const roleBadge = document.querySelector('#roleBadge');
const siteList = document.querySelector('#siteList');
const emptyState = document.querySelector('#emptyState');
const editorBody = document.querySelector('#editorBody');
const displayTitle = document.querySelector('#displayTitle');
const projectName = document.querySelector('#projectName');
const siteIdLabel = document.querySelector('#siteIdLabel');
const saveState = document.querySelector('#saveState');
const publishBtn = document.querySelector('#publishBtn');
const weatherLink = document.querySelector('#weatherLink');
const precipLink = document.querySelector('#precipLink');

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
let selectedSite = null;
let pendingFiles = {};
let dirty = false;

function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.className = 'toast', 3000);
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
  if (session) {
    await enterApp(session.user);
  }

  supabase.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (!sessionNow) showLogin();
  });
}

function showLogin() {
  currentUser = null;
  currentProfile = null;
  sites = [];
  selectedSite = null;
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

async function enterApp(user) {
  currentUser = user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,role,company_name')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    toast('プロフィールを取得できません。管理者にお問い合わせください。', true);
    await supabase.auth.signOut();
    return;
  }

  currentProfile = profile;
  accountInfo.textContent = `${profile.company_name || ''} / ${user.email || ''}`;
  roleBadge.textContent = profile.role;
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  await loadSites();
}

async function loadSites() {
  siteList.innerHTML = '<div class="muted">読込中...</div>';
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .order('site_id', { ascending: true });

  if (error) {
    siteList.innerHTML = '';
    toast(`現場一覧の取得に失敗しました: ${error.message}`, true);
    return;
  }

  sites = data || [];
  renderSiteList();

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

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
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

  for (const [key, spec] of Object.entries(fields)) {
    const path = site[spec.column] || '';
    const preview = document.querySelector(spec.preview);
    const input = document.querySelector(spec.input);
    const meta = document.querySelector(spec.meta);
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
  document.querySelector(spec.input).addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (key === 'pr' && file.size > 50 * 1024 * 1024) {
      toast('PR動画は50MB以下にしてください。', true);
      e.target.value = '';
      return;
    }
    pendingFiles[key] = file;
    const preview = document.querySelector(spec.preview);
    const meta = document.querySelector(spec.meta);
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
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  const btn = loginForm.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'ログイン中...';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'ログイン';
  if (error) return toast(`ログインできません: ${error.message}`, true);
  await enterApp(data.user);
});

document.querySelector('#logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showLogin();
});

document.querySelector('#refreshBtn').addEventListener('click', async () => {
  await loadSites();
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
      const base = key === 'greeting' ? 'greeting' : key === 'notice' ? 'notice' : key === 'schedule' ? 'schedule' : 'pr';
      const path = `${selectedSite.site_id}/${base}_${Date.now()}.${ext}`;
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

init();
