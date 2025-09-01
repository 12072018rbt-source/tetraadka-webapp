
// Я старался просто и понятно, без страшных слов 🙂
const BACKEND_URL = "http://api.foxtrix-bot.ru/api/analyze"; // сюда стучимся за умной проверкой

// Телеграм штучки
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.MainButton.hide();
  tg.enableClosingConfirmation();
  document.body.classList.add('tg-theme');
}

// Элементы на странице
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const fileName = document.getElementById('fileName');
const fileInfo = document.getElementById('fileInfo');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const busy = document.getElementById('busy');
const results = document.getElementById('results');
const textOut = document.getElementById('textOut');
const mistakes = document.getElementById('mistakes');
const copyBtn = document.getElementById('copyBtn');
const saveJson = document.getElementById('saveJson');

let current = null; // тут храню превью и ответ сервера

// Помощь с перетаскиванием
['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => {e.preventDefault(); e.stopPropagation();}));
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('drop', e => { const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); });
fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) handleFile(f); });

aSync(() => tg?.onEvent?.('themeChanged', () => document.body.classList.add('tg-theme')));

async function handleFile(file){
  if (!file.type.startsWith('image/')) { alert('Нужна картинка 🙃'); return; }
  const { dataUrl, width, height, bytes } = await compressImage(file, 1600, 0.85);
  previewImg.src = dataUrl;
  fileName.textContent = file.name || 'image.jpg';
  fileInfo.textContent = `${width}×${height} · ~${human(bytes)}`;
  preview.classList.remove('hidden');
  sendBtn.disabled = false; clearBtn.disabled = false;
  results.classList.add('hidden');
  current = { dataUrl };
}

// Сжатие изображения, чтобы не грузить слишком тяжело
async function compressImage(file, maxSide=1600, quality=0.85){
  // Если createImageBitmap не работает (старый браузер) — делаем запасной план
  const bitmap = await createBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const type = 'image/jpeg';
  const dataUrl = canvas.toDataURL(type, quality);
  const bytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3/4);
  return { dataUrl, width:w, height:h, bytes };
}

function createBitmap(file){
  if (window.createImageBitmap) return createImageBitmap(file);
  // Фолбэк через <img>
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Кнопки
sendBtn.addEventListener('click', sendToServer);
clearBtn.addEventListener('click', () => {
  fileInput.value = '';
  preview.classList.add('hidden');
  sendBtn.disabled = true; clearBtn.disabled = true;
  results.classList.add('hidden');
  current = null;
});
copyBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(textOut.textContent || ''); tg?.HapticFeedback?.impactOccurred('light'); } catch {}
});
saveJson.addEventListener('click', () => {
  const payload = current?.response || {};
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='analysis.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
});

async function sendToServer(){
  if (!current?.dataUrl) return;
  lock(true);
  try{
    const res = await fetch(BACKEND_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ image_base64: current.dataUrl, init_data: tg?.initData || null })
    });
    if (!res.ok) throw new Error('Сервер устал: ' + res.status);
    const data = await res.json();
    current.response = data;
    showResults(data);
    tg?.HapticFeedback?.notificationOccurred('success');
  }catch(err){
    console.error(err);
    alert('Ой! Не вышло. Попробуй ещё раз.');
    tg?.HapticFeedback?.notificationOccurred('error');
  }finally{ lock(false); }
}

function showResults(data){
  textOut.textContent = data.recognized_text || '—';
  mistakes.innerHTML = '';
  const list = Array.isArray(data.mistakes) ? data.mistakes : [];
  if (!list.length){
    const ok = document.createElement('div');
    ok.className = 'muted';
    ok.textContent = 'Ошибок не нашлось ✔️';
    mistakes.appendChild(ok);
  } else {
    for (const m of list){
      const box = document.createElement('div');
      box.className = 'mistake';
      const type = m.type || 'ошибка';
      const fragment = m.fragment || '—';
      const suggestion = m.suggestion || '—';
      const why = m.explanation || '';
      box.innerHTML = `
        <div><span class="badge">${escapeHtml(type)}</span></div>
        <div><b>Фрагмент:</b> «${escapeHtml(fragment)}»</div>
        <div><b>Исправление:</b> ${escapeHtml(suggestion)}</div>
        ${why ? `<div class="muted">${escapeHtml(why)}</div>` : ''}
      `;
      mistakes.appendChild(box);
    }
  }
  results.classList.remove('hidden');
}

function lock(v){
  if (v){
    busy.classList.remove('hidden');
    sendBtn.disabled = true; clearBtn.disabled = true;
  } else {
    busy.classList.add('hidden');
    clearBtn.disabled = false;
  }
}

function human(bytes){
  const u=['Б','КБ','МБ','ГБ']; let i=0, n=bytes;
  while(n>=1024 && i<u.length-1){ n/=1024; i++; }
  return (n<10? n.toFixed(1): Math.round(n)) + ' ' + u[i];
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
}

// маленькая помощница, чтобы не ругался старый браузер

function aSync(fn){ try{ fn(); }catch(_){} }
