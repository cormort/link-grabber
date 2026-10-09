/**
 * LinkGrabber for GitHub
 * 純前端、零相依書籤與網址整理工具
 */

const $ = s => document.querySelector(s);
let pending = [];
let links = [];

const DATA = 'lg-data-v1';
const BRAND = 'lg-brand-v1';

// 安全產生唯一 ID
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Toast 提示訊息
let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// HTML 特殊字元轉義（防範 XSS / 程式碼注入）
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 網址正規化（保留 Hash，支援 SPA 路由與章節錨點，驗證 HTTP/HTTPS 協議）
function norm(v) {
  try {
    if (!v) return null;
    let urlStr = String(v).trim();
    if (/^www\./i.test(urlStr)) urlStr = 'https://' + urlStr;
    const u = new URL(urlStr);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * 解析 Netscape 書籤格式（Chrome, Edge, Firefox, Safari 匯出）
 * 解決同層書籤誤繼承子資料夾路徑的階層解析問題
 */
function parseBm(htmlText, src) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const result = [];

  function walk(node, path) {
    const children = Array.from(node.children);

    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const tag = el.tagName.toUpperCase();

      if (tag === 'DT') {
        const header = el.querySelector(':scope > H3, H3');
        const link = el.querySelector(':scope > A, A');
        const childDl = el.querySelector(':scope > DL, DL');

        if (header) {
          const folderName = header.textContent.trim() || '未命名資料夾';
          const nextEl = children[i + 1];

          if (childDl) {
            walk(childDl, [...path, folderName]);
          } else if (nextEl && nextEl.tagName.toUpperCase() === 'DL') {
            walk(nextEl, [...path, folderName]);
            i++; // 跳過已處理之兄弟 DL 節點
          }
        } else if (link) {
          const rawUrl = link.getAttribute('href') || link.href;
          const url = norm(rawUrl);
          if (url) {
            const u = new URL(url);
            const title = link.textContent.trim() || u.hostname;
            result.push({
              id: uid(),
              title,
              url,
              host: u.hostname,
              folder: [src, ...path].filter(Boolean).join(' / '),
              selected: true
            });
          }
        } else if (childDl) {
          walk(childDl, path);
        }
      } else if (tag === 'DL') {
        walk(el, path);
      }
    }
  }

  const rootDl = doc.querySelector('body > dl, dl');
  if (rootDl) {
    walk(rootDl, []);
  } else {
    // 若無 DL 標籤，退化為提取所有具備 href 的 <a> 標籤
    const allLinks = doc.querySelectorAll('a[href]');
    for (const a of allLinks) {
      const url = norm(a.getAttribute('href') || a.href);
      if (url) {
        const u = new URL(url);
        result.push({
          id: uid(),
          title: a.textContent.trim() || u.hostname,
          url,
          host: u.hostname,
          folder: src,
          selected: true
        });
      }
    }
  }

  return result;
}

// 解析 Markdown 連結：- [標題](網址)
function parseMarkdown(text, src) {
  const result = [];
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = norm(match[2]);
    if (url) {
      const u = new URL(url);
      result.push({
        id: uid(),
        title: title || u.hostname,
        url,
        host: u.hostname,
        folder: src,
        selected: true
      });
    }
  }
  return result;
}

// 解析 CSV 格式（支援包含引號的 CSV 及欄位名稱對應）
function parseCsv(text, src) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  function splitLine(line) {
    const fields = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const header = splitLine(lines[0]).map(h => h.replace(/^\ufeff/, '').toLowerCase());
  const folderIdx = header.findIndex(h => /folder|資料夾|分類|category/.test(h));
  const titleIdx = header.findIndex(h => /title|標題|名稱|name/.test(h));
  const urlIdx = header.findIndex(h => /url|網址|連結|link|href/.test(h));

  if (urlIdx === -1) return [];

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const rawUrl = cols[urlIdx];
    const url = norm(rawUrl);
    if (url) {
      const u = new URL(url);
      const title = (titleIdx !== -1 && cols[titleIdx]) ? cols[titleIdx] : u.hostname;
      const folder = (folderIdx !== -1 && cols[folderIdx]) ? cols[folderIdx] : src;
      result.push({
        id: uid(),
        title,
        url,
        host: u.hostname,
        folder,
        selected: true
      });
    }
  }
  return result;
}

// 一般文字/正則網址提取
function generic(text, src) {
  const matches = [...new Set(text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [])];
  return matches
    .map(norm)
    .filter(Boolean)
    .map(url => {
      const u = new URL(url);
      return {
        id: uid(),
        title: u.hostname,
        url,
        host: u.hostname,
        folder: src,
        selected: true
      };
    });
}

// 智慧解析多種格式（HTML、JSON、CSV、Markdown、TXT）
function parseContent(content, filename) {
  const baseName = filename.replace(/\.[^.]+$/, '');
  const trimmed = content.trim();

  // 1. 書籤 HTML
  if (/\.html?$/i.test(filename) || /NETSCAPE-Bookmark-file|<H3|<DL|<A\s+HREF/i.test(trimmed)) {
    return parseBm(content, baseName);
  }

  // 2. JSON 格式（支援本工具匯出的 links.json 或通用陣列）
  if (/\.json$/i.test(filename) || (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.links) ? parsed.links : (Array.isArray(parsed.bookmarks) ? parsed.bookmarks : null));
      if (items) {
        const result = [];
        for (const item of items) {
          if (!item) continue;
          const rawUrl = item.url || item.href || item.link;
          const url = norm(rawUrl);
          if (url) {
            const u = new URL(url);
            result.push({
              id: item.id || uid(),
              title: (item.title || item.name || u.hostname).trim(),
              url,
              host: u.hostname,
              folder: item.folder || item.category || baseName,
              selected: item.selected !== false
            });
          }
        }
        if (result.length > 0) return result;
      }
    } catch {}
  }

  // 3. CSV 格式
  if (/\.csv$/i.test(filename) || /^(資料夾|folder|title|標題|url|網址)/i.test(trimmed)) {
    const csvResult = parseCsv(trimmed, baseName);
    if (csvResult.length > 0) return csvResult;
  }

  // 4. Markdown 格式
  if (/\.md$/i.test(filename) || /\[.*?\]\(https?:\/\/.*?\)/.test(trimmed)) {
    const mdResult = parseMarkdown(trimmed, baseName);
    if (mdResult.length > 0) return mdResult;
  }

  // 5. 純文字通用提取
  return generic(trimmed, baseName);
}

// 準備檔案
async function prepare(fileList) {
  pending = [];
  const reportEl = $('#fileReport');
  reportEl.innerHTML = '';

  for (const file of fileList) {
    try {
      const text = await file.text();
      const parsed = parseContent(text, file.name);
      pending.push(...parsed);

      const fileDiv = document.createElement('div');
      fileDiv.className = 'file';
      fileDiv.innerHTML = `<span>${escapeHtml(file.name)}</span><b>${parsed.length} 筆資料</b>`;
      reportEl.appendChild(fileDiv);
    } catch (err) {
      console.error('File read error:', err);
      toast(`讀取 ${file.name} 失敗`);
    }
  }

  $('#confirm').disabled = !pending.length;
  toast(`已偵測 ${pending.length} 筆資料`);
}

// 去重邏輯
function dedupe(items, mode) {
  if (mode === 'all') return items;
  const map = new Map();

  for (const item of items) {
    if (!map.has(item.url)) {
      map.set(item.url, { ...item });
    } else if (mode === 'last') {
      map.set(item.url, { ...item });
    } else if (mode === 'merge') {
      const existing = map.get(item.url);
      const combined = new Set([...existing.folder.split('；'), item.folder].filter(Boolean));
      existing.folder = [...combined].join('；');
    }
  }

  return [...map.values()];
}

// 篩選與渲染
function getVisibleLinks() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const f = $('#folder').value;
  return links.filter(x => {
    const matchFolder = (f === 'all' || x.folder === f);
    const matchQuery = !q || `${x.title} ${x.url} ${x.folder} ${x.host}`.toLowerCase().includes(q);
    return matchFolder && matchQuery;
  });
}

function updateSummary() {
  const visible = getVisibleLinks();
  const selectedCount = links.filter(x => x.selected).length;
  const currentFolder = $('#folder')?.value || 'all';

  if (currentFolder !== 'all') {
    const visibleSelected = visible.filter(x => x.selected).length;
    $('#summary').textContent = `資料夾「${currentFolder}」：共 ${visible.length} 筆 (已選 ${visibleSelected} 筆)`;
  } else {
    $('#summary').textContent = `全部資料夾：共 ${visible.length} 筆，已選 ${selectedCount} 筆`;
  }

  // 即時更新匯出範圍選單顯示之筆數與名稱
  const scopeSelect = $('#exportScope');
  if (scopeSelect && scopeSelect.options && scopeSelect.options.length >= 3) {
    const folderLabel = currentFolder !== 'all' ? `目前資料夾「${currentFolder}」(${visible.length} 筆)` : `目前篩選清單 (${visible.length} 筆)`;
    scopeSelect.options[0].textContent = folderLabel;
    scopeSelect.options[1].textContent = `所有已勾選書籤 (${selectedCount} 筆)`;
    scopeSelect.options[2].textContent = `全部資料夾書籤 (${links.length} 筆)`;
  }
}

function renderTree(folders) {
  const currentFolder = $('#folder').value;
  const allCount = links.length;

  let html = `<div class="folder ${currentFolder === 'all' ? 'active' : ''}" data-folder="all">📁 全部資料夾 <span>(${allCount})</span></div>`;

  html += folders.map(folderName => {
    const count = links.filter(y => y.folder === folderName).length;
    const isActive = currentFolder === folderName;
    return `<div class="folder ${isActive ? 'active' : ''}" data-folder="${escapeHtml(folderName)}">📁 ${escapeHtml(folderName)} <span>(${count})</span></div>`;
  }).join('');

  $('#tree').innerHTML = html;
}

function renderList() {
  const visible = getVisibleLinks();
  updateSummary();

  if (!visible.length) {
    $('#rows').innerHTML = links.length
      ? '<div class="empty">沒有符合篩選條件的書籤</div>'
      : '<div class="empty">請先匯入檔案</div>';
    return;
  }

  $('#rows').innerHTML = visible.map(x => `
    <div class="row" data-id="${escapeHtml(x.id)}">
      <input type="checkbox" data-id="${escapeHtml(x.id)}" ${x.selected ? 'checked' : ''} aria-label="選取 ${escapeHtml(x.title)}">
      <div>
        <b>${escapeHtml(x.title)}</b>
        <small>📁 ${escapeHtml(x.folder)}</small>
      </div>
      <a href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.url)}</a>
      <span>${escapeHtml(x.host)}</span>
    </div>
  `).join('');
}

function render(updateFolders = true) {
  const folders = [...new Set(links.map(x => x.folder))].filter(Boolean).sort();

  if (updateFolders) {
    const currentFolder = $('#folder').value;
    $('#folder').innerHTML = '<option value="all">全部資料夾</option>' +
      folders.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');

    if (folders.includes(currentFolder)) {
      $('#folder').value = currentFolder;
    } else {
      $('#folder').value = 'all';
    }
  }

  renderTree(folders);
  renderList();
}

// 儲存狀態（含配額防護與防抖處理）
let saveTimer = null;
function saveDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

function save() {
  try {
    localStorage.setItem(DATA, JSON.stringify({
      links,
      dedupe: $('#dedupe').value,
      dark: document.documentElement.classList.contains('dark')
    }));
  } catch (err) {
    console.warn('localStorage save failed:', err);
    if (err && err.name === 'QuotaExceededError') {
      toast('儲存失敗：瀏覽器空間已滿');
    }
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(DATA) || '{}');
    links = Array.isArray(saved.links) ? saved.links : [];
    if (saved.dedupe) $('#dedupe').value = saved.dedupe;
    document.documentElement.classList.toggle('dark', !!saved.dark);
  } catch (err) {
    console.warn('localStorage load failed:', err);
  }
  render(true);
  applyBrand();
}

// 下載檔案輔助函式
function dl(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 取得欲匯出的目標書籤清單（依匯出範圍）
function getTargetItems() {
  const scope = $('#exportScope')?.value || 'visible';
  if (scope === 'visible') {
    const visible = getVisibleLinks();
    const checked = visible.filter(x => x.selected);
    // 若當前清單中有個別勾選，匯出已勾選項目；若全勾或都沒勾，則匯出全部可見項目
    return checked.length > 0 ? checked : visible;
  }
  if (scope === 'all') {
    return links;
  }
  // scope === 'selected'
  return links.filter(x => x.selected);
}

// 產生匯出檔名（當指定資料夾時自動加上資料夾名稱）
function getExportBaseName(prefix) {
  const currentFolder = $('#folder')?.value;
  const scope = $('#exportScope')?.value || 'visible';
  if (scope === 'visible' && currentFolder && currentFolder !== 'all') {
    const cleanFolder = currentFolder.replace(/[/\\?%*:|"<>]/g, '_').trim();
    return `${prefix}_${cleanFolder}`;
  }
  return prefix;
}

// 產生標準 Netscape 書籤 HTML
function generateBookmarkHtml(items) {
  const root = { children: {}, bookmarks: [] };

  for (const item of items) {
    const parts = (item.folder || '').split(' / ').map(p => p.trim()).filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!current.children[part]) {
        current.children[part] = { children: {}, bookmarks: [] };
      }
      current = current.children[part];
    }
    current.bookmarks.push(item);
  }

  function renderTree(node, indent = 4) {
    const sp = ' '.repeat(indent);
    let html = '';

    for (const bm of node.bookmarks) {
      const title = escapeHtml(bm.title || bm.host || bm.url);
      const url = escapeHtml(bm.url);
      html += `${sp}<DT><A HREF="${url}">${title}</A>\n`;
    }

    for (const name of Object.keys(node.children)) {
      const childNode = node.children[name];
      const safeName = escapeHtml(name);
      html += `${sp}<DT><H3>${safeName}</H3>\n`;
      html += `${sp}<DL><p>\n`;
      html += renderTree(childNode, indent + 4);
      html += `${sp}</DL><p>\n`;
    }

    return html;
  }

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${renderTree(root, 4)}</DL><p>
`;
}

// 品牌客製化
function applyBrand() {
  let b = {};
  try {
    b = JSON.parse(localStorage.getItem(BRAND) || '{}');
  } catch {}

  const name = b.name || 'LinkGrabber for GitHub';
  const subtitle = b.subtitle || '免擴充套件整理瀏覽器書籤';
  const color = b.color || '#4f46e5';
  const logo = b.logo || './assets/logo.svg';

  $('#brandName').textContent = name;
  $('#brandSubtitle').textContent = subtitle;
  $('#brandLogo').src = logo;
  $('#logoPreview').src = logo;
  $('#projectName').value = name;
  $('#projectSubtitle').value = subtitle;
  $('#brandColor').value = color;

  document.documentElement.style.setProperty('--brand', color);
  document.title = name;
}

function saveBrand() {
  try {
    const b = {
      name: $('#projectName').value.trim() || 'LinkGrabber for GitHub',
      subtitle: $('#projectSubtitle').value.trim() || '免擴充套件整理瀏覽器書籤',
      color: $('#brandColor').value,
      logo: $('#logoPreview').src
    };
    localStorage.setItem(BRAND, JSON.stringify(b));
    applyBrand();
    $('#settings').close();
    toast('品牌設定已儲存');
  } catch (err) {
    console.warn('saveBrand failed:', err);
    if (err && err.name === 'QuotaExceededError') {
      toast('儲存失敗：自訂 Logo 或設定過大，超出儲存空間');
    } else {
      toast('儲存失敗，請重試');
    }
  }
}

// 事件綁定
const drop = $('#drop');
const files = $('#files');

drop.onclick = () => files.click();
drop.onkeydown = e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    files.click();
  }
};

files.onchange = e => prepare([...e.target.files]);

drop.ondragover = e => {
  e.preventDefault();
  drop.classList.add('drag');
};
drop.ondragleave = () => drop.classList.remove('drag');
drop.ondrop = e => {
  e.preventDefault();
  drop.classList.remove('drag');
  if (e.dataTransfer && e.dataTransfer.files) {
    prepare([...e.dataTransfer.files]);
  }
};

// 確認匯入：支援追加或覆蓋
$('#confirm').onclick = () => {
  const mode = $('#importMode')?.value || 'append';
  const targetList = mode === 'replace' ? pending : [...links, ...pending];
  links = dedupe(targetList.map(x => ({ ...x })), $('#dedupe').value);
  pending = [];
  $('#fileReport').innerHTML = '';
  $('#confirm').disabled = true;
  render(true);
  save();
  toast(`已匯入並整理完成，目前共 ${links.length} 筆`);
};

// 搜尋與篩選（防抖搜尋，不頻繁寫入 storage）
let searchTimer = null;
$('#q').oninput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderList();
  }, 120);
};

$('#folder').onchange = () => {
  const folders = [...new Set(links.map(x => x.folder))].filter(Boolean).sort();
  renderTree(folders);
  renderList();
};

// 點擊左側資料夾樹狀清單可直接切換篩選
$('#tree').onclick = e => {
  const item = e.target.closest('.folder');
  if (item && item.dataset.folder) {
    const targetFolder = item.dataset.folder;
    $('#folder').value = targetFolder;
    const folders = [...new Set(links.map(x => x.folder))].filter(Boolean).sort();
    renderTree(folders);
    renderList();
  }
};

// 列表核取方塊操作：不重構全部 DOM，保留輸入焦點
$('#rows').onchange = e => {
  if (e.target.type === 'checkbox') {
    const id = e.target.dataset.id;
    const item = links.find(x => x.id === id);
    if (item) {
      item.selected = e.target.checked;
      updateSummary();
      saveDebounced();
    }
  }
};

$('#all').onclick = () => {
  const visible = getVisibleLinks();
  visible.forEach(x => x.selected = true);
  renderList();
  saveDebounced();
  toast(`已全選目前清單 (${visible.length} 筆)`);
};

$('#none').onclick = () => {
  const visible = getVisibleLinks();
  visible.forEach(x => x.selected = false);
  renderList();
  saveDebounced();
  toast('已取消選取目前清單');
};

const allGlobalBtn = $('#allGlobal');
if (allGlobalBtn) {
  allGlobalBtn.onclick = () => {
    links.forEach(x => x.selected = true);
    renderList();
    saveDebounced();
    toast(`已全選所有資料夾書籤 (${links.length} 筆)`);
  };
}

$('#clear').onclick = () => {
  if (links.length === 0) return;
  if (confirm('確定要清除所有已匯入的書籤資料嗎？')) {
    links = [];
    render(true);
    save();
    toast('已清除所有資料');
  }
};

// 監聽匯出範圍切換
const exportScopeSelect = $('#exportScope');
if (exportScopeSelect) {
  exportScopeSelect.onchange = updateSummary;
}

// 匯出功能與回饋
const htmlBtn = $('#html');
if (htmlBtn) {
  htmlBtn.onclick = () => {
    const items = getTargetItems();
    if (!items.length) return toast('沒有符合條件的書籤可匯出');
    const filename = `${getExportBaseName('bookmarks')}.html`;
    const content = generateBookmarkHtml(items);
    dl(filename, content, 'text/html;charset=utf-8');
    toast(`已匯出 ${items.length} 筆至「${filename}」`);
  };
}

$('#copy').onclick = async () => {
  const items = getTargetItems();
  if (!items.length) return toast('沒有符合條件的網址可複製');
  try {
    await navigator.clipboard.writeText(items.map(x => x.url).join('\n'));
    toast(`已複製 ${items.length} 筆網址到剪貼簿`);
  } catch {
    toast('複製失敗，請手動複製');
  }
};

$('#md').onclick = async () => {
  const items = getTargetItems();
  if (!items.length) return toast('沒有符合條件的書籤可複製');
  try {
    const markdown = items.map(x => `- [${x.title.replace(/[\[\]]/g, '\\$&')}](${x.url})`).join('\n');
    await navigator.clipboard.writeText(markdown);
    toast(`已複製 ${items.length} 筆 Markdown 連結`);
  } catch {
    toast('複製失敗，請手動複製');
  }
};

$('#csv').onclick = () => {
  const items = getTargetItems();
  if (!items.length) return toast('沒有符合條件的書籤可匯出');
  const filename = `${getExportBaseName('links')}.csv`;
  const header = '\ufeff資料夾,標題,網址,網域\n';
  const rows = items.map(x =>
    [x.folder, x.title, x.url, x.host]
      .map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"')
      .join(',')
  ).join('\n');
  dl(filename, header + rows, 'text/csv;charset=utf-8');
  toast(`已匯出 ${items.length} 筆至「${filename}」`);
};

$('#json').onclick = () => {
  const items = getTargetItems();
  if (!items.length) return toast('沒有符合條件的書籤可匯出');
  const filename = `${getExportBaseName('links')}.json`;
  dl(filename, JSON.stringify(items, null, 2), 'application/json');
  toast(`已匯出 ${items.length} 筆至「${filename}」`);
};

$('#print').onclick = () => window.print();

$('#theme').onclick = () => {
  document.documentElement.classList.toggle('dark');
  save();
};

$('#guideToggle').onclick = () => {
  $('.guide').classList.toggle('collapsed');
  $('#guideToggle').textContent = $('.guide').classList.contains('collapsed') ? '展開說明' : '收合說明';
};

// 複製瀏覽器內部指令（chrome://bookmarks/ 等）
document.addEventListener('click', async e => {
  const btn = e.target.closest('.copy-cmd-btn');
  if (btn && btn.dataset.copy) {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const originalText = btn.textContent;
      btn.textContent = '已複製！';
      toast(`已複製指令：${btn.dataset.copy}`);
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1500);
    } catch {
      toast('複製失敗，請手動選取複製');
    }
  }
});

$('#openSettings').onclick = () => $('#settings').showModal();
$('#saveBrand').onclick = saveBrand;
$('#resetBrand').onclick = () => {
  localStorage.removeItem(BRAND);
  applyBrand();
  toast('已恢復預設品牌設定');
};

$('#brandColor').oninput = e => {
  document.documentElement.style.setProperty('--brand', e.target.value);
};

$('#logoFile').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) return toast('Logo 請小於 1 MB');
  const reader = new FileReader();
  reader.onload = () => {
    $('#logoPreview').src = reader.result;
  };
  reader.readAsDataURL(file);
};

// 初始化載入
load();

// Service Worker 註冊
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}