// content.js - сбор данных со страницы + кнопка добавления + индикатор изменений

// ========== УТИЛИТЫ ==========
function parseMangaId() {
  const match = window.location.href.match(/\/ru\/manga\/(\d+)/);
  return match?.[1] || null;
}

function parseNumberWithSuffix(text) {
  if (!text) return 0;
  const clean = text.toString().trim().replace(/[^\d.KMkm]/g, '');
  const mult = clean.includes('K') || clean.includes('k') ? 1000 : clean.includes('M') || clean.includes('m') ? 1_000_000 : 1;
  return mult !== 1 ? Math.round(parseFloat(clean.replace(/[KMkm]/g, '')) * mult) : parseInt(clean) || 0;
}

function sendMessage(type, data = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...data }, response => resolve(response?.success ?? false)));
}

function isMangaTracked(mangaId) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_STATS' }, response => {
      resolve(response?.success && response.data.some(m => m.id === mangaId));
    });
  });
}

function getMangaHistory(mangaId) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_MANGA_HISTORY', mangaId }, response => resolve(response?.data || []));
  });
}

function deleteMangaFromTracker(mangaId) {
  return sendMessage('DELETE_MANGA', { mangaId });
}

// ========== СБОР ДАННЫХ ==========
function queryFirst(selector, getText = true) {
  const el = document.querySelector(selector);
  return el ? (getText ? el.innerText?.trim() : el) : null;
}

function hasRealData() {
  return !!(document.querySelector('.rating-info__value') || document.querySelector('[data-stats="bookmarks"]'));
}

function isValidMangaData(data) {
  if (!data) return false;
  const hasValidTitle = data.title && data.title !== 'Неизвестно' && !data.title.includes('MangaLIB') && data.title.length > 3;
  const hasNumbers = data.chapters > 0 || data.votesCount > 0 || data.totalInLists > 0;
  return hasValidTitle || hasNumbers;
}

function collectStats() {
  const mangaId = parseMangaId();
  if (!mangaId) return null;

  // Название
  const titleSelectors = ['h1 span', 'h1'];
  let title = titleSelectors.reduce((found, sel) => {
    if (found !== 'Неизвестно') return found;
    const el = document.querySelector(sel);
    const text = el?.innerText?.trim();
    return text && !text.includes('MangaLIB') && text.length > 0 ? text : 'Неизвестно';
  }, 'Неизвестно');

  // Кол-во глав
  let chapters = 0;
  const tabsItems = document.querySelectorAll('.tabs-item');
  for (const tab of tabsItems) {
    const span = tab.querySelector('.tabs-item__inner');
    if (span?.innerText?.includes('Главы')) {
      const small = span.querySelector('small');
      if (small?.innerText) chapters = parseInt(small.innerText) || 0;
      else chapters = parseInt(span.innerText.match(/Главы\s*(\d+)/)?.[1]) || 0;
      break;
    }
  }

  if (chapters === 0) {
    const allDivs = document.querySelectorAll('div, span');
    for (const el of allDivs) {
      if (el.innerText === 'Глав') {
        const parent = el.parentElement;
        if (parent) {
          const numbers = parent.querySelectorAll('span');
          for (const num of numbers) {
            if (num !== el && num.innerText && num.innerText.match(/^\d+$/)) {
              chapters = parseInt(num.innerText);
              break;
            }
          }
        }
        if (chapters > 0) break;
      }
    }
  }

  // Рейтинг и голоса
  const ratingEl = document.querySelector('.rating-info__value');
  const averageRating = ratingEl?.innerText ? parseFloat(ratingEl.innerText) : null;
  const votesEl = document.querySelector('.rating-info__votes');
  const totalVotes = votesEl?.innerText ? parseNumberWithSuffix(votesEl.innerText) : 0;

  // Статистика списков
  const bookmarksBlock = document.querySelector('[data-stats="bookmarks"]');
  let totalInLists = 0;
  const listStats = { reading: 0, planned: 0, dropped: 0, completed: 0, favorite: 0, other: 0 };

  if (bookmarksBlock) {
    const sectionTitle = bookmarksBlock.querySelector('.section-title');
    const match = sectionTitle?.innerText?.match(/(\d+[\d.KMkm]*)/);
    totalInLists = match ? parseNumberWithSuffix(match[1]) : 0;

    const categoryMap = { 'Читаю': 'reading', 'В планах': 'planned', 'Брошено': 'dropped', 'Прочитано': 'completed', 'Любимые': 'favorite', 'Другое': 'other' };
    for (const row of bookmarksBlock.querySelectorAll('.agt_n')) {
      let label = '';
      for (const el of row.querySelectorAll('div, span')) {
        const text = el.innerText?.trim();
        if (categoryMap[text]) { label = text; break; }
      }
      const countEl = row.querySelector('.agt_sm');
      const count = countEl?.innerText ? parseInt(countEl.innerText) : 0;
      if (label && count > 0) listStats[categoryMap[label]] = count;
    }
  }

  // Сбор статистики по оценкам (1-10) через data-stats-id
  const ratingStats = {};
  const ratingBlock = document.querySelector('[data-stats="rating"]');
  if (ratingBlock) {
    for (let i = 1; i <= 10; i++) {
      const row = ratingBlock.querySelector(`.agt_n[data-stats-id="${i}"]`);
      if (row) {
        const countEl = row.querySelector('.agt_sm');
        if (countEl && countEl.innerText) {
          ratingStats[i] = parseInt(countEl.innerText) || 0;
        } else {
          ratingStats[i] = 0;
        }
      }
    }
  }

  // Статус
  let status = 'неизвестен';
  const statusLink = document.querySelector('a[href*="status"] span');
  if (statusLink?.innerText) status = statusLink.innerText.trim();

  // Жанры
  const genres = [...new Set([...document.querySelectorAll('[data-type="genre"] span, [data-type="tag"] span')]
    .map(el => el.innerText.trim())
    .filter(g => g && !g.includes('+') && !g.includes('ещё') && g.length < 30))];

  // Автор
  let author = 'неизвестен';
  const authorLink = [...document.querySelectorAll('a[href*="/people/"]')].find(link => link.innerText?.length > 0 && link.innerText.length < 50);
  if (authorLink) author = authorLink.innerText.trim();

  return { 
    id: mangaId, 
    url: window.location.href.split('?')[0], 
    title, 
    chapters: chapters || 0, 
    averageRating, 
    votesCount: totalVotes, 
    totalInLists, 
    listStats, 
    ratingStats,
    status, 
    genres, 
    author, 
    lastVisited: new Date().toISOString(), 
    visitCount: 1 
  };
}

// ========== УВЕДОМЛЕНИЯ ==========
function showNotification(message, bgColor = '#2c3e50') {
  document.querySelector('#mangalib-tracker-notification')?.remove();
  const notif = Object.assign(document.createElement('div'), { id: 'mangalib-tracker-notification', textContent: message });
  notif.style.cssText = `position:fixed;bottom:20px;right:20px;background:${bgColor};color:white;padding:10px 20px;border-radius:25px;z-index:100000;font-family:system-ui,sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// ========== УПРАВЛЕНИЕ ТРЕКЕРОМ ==========
function saveMangaToStats() {
  if (!hasRealData()) return showNotification('❌ Данные не загружены, попробуйте позже', '#f38ba8');
  const stats = collectStats();
  if (!stats?.id) return;
  if (!isValidMangaData(stats)) return showNotification('❌ Не удалось собрать данные', '#f38ba8');

  chrome.runtime.sendMessage({ type: 'SAVE_MANGA_STATS', data: stats }, response => {
    if (chrome.runtime.lastError) showNotification('❌ Ошибка сохранения', '#f38ba8');
    else { showNotification(`✅ Добавлен: ${stats.title}`, '#27ae60'); updateTrackButtonState(stats.id); setTimeout(refreshDateSelector, 1000); }
  });
}

async function removeMangaFromTracker(mangaId, mangaTitle) {
  if (await deleteMangaFromTracker(mangaId)) {
    showNotification(`🗑 Удалён: ${mangaTitle}`, '#f38ba8');
    updateTrackButtonState(mangaId);
    document.querySelector('#mangalib-date-selector')?.remove();
  } else showNotification('❌ Ошибка удаления', '#f38ba8');
}

async function updateTrackButtonState(mangaId) {
  const trackBtn = document.querySelector('#mangalib-track-btn');
  if (!trackBtn) return;
  const isTracked = await isMangaTracked(mangaId);
  const mangaTitle = queryFirst('h1, h1 span') || 'Тайтл';

  trackBtn.innerHTML = isTracked
    ? `<svg viewBox="0 0 448 512" width="14" height="14" style="fill:white"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> В трекере`
    : `<svg viewBox="0 0 448 512" width="14" height="14" style="fill:white"><path fill="currentColor" d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/></svg> В трекер`;

  trackBtn.style.background = isTracked ? '#27ae60' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  trackBtn.dataset.tracked = isTracked;
  trackBtn.disabled = false;
  trackBtn.style.cursor = 'pointer';
}

// ========== ИНДИКАТОР ИЗМЕНЕНИЙ ==========
async function getStatsForDate(mangaId, date) {
  const history = await getMangaHistory(mangaId);
  return history.find(h => h.date === date.split('T')[0]) || null;
}

function updateRatingWithChanges(current, previous) {
  const ratingContainer = document.querySelector('.rating-info');
  if (!ratingContainer) return;
  ratingContainer.querySelectorAll('.mangalib-rating-change, .mangalib-rating-progress').forEach(el => el.remove());

  if (previous && current.averageRating !== undefined && previous.averageRating !== undefined) {
    const change = current.averageRating - previous.averageRating;
    if (change !== 0) {
      // Текстовый индикатор
      const changeSpan = Object.assign(document.createElement('span'), { className: 'mangalib-rating-change', innerHTML: `${change > 0 ? '↑ +' : '↓ '}${change.toFixed(2)}` });
      changeSpan.style.cssText = `margin-left:8px;font-size:11px;color:${change > 0 ? '#a6e3a1' : '#f38ba8'}`;
      ratingContainer.appendChild(changeSpan);
    }
  }

  // Количество оценок
  const votesContainer = document.querySelector('.rating-info__votes');
  if (votesContainer && previous?.votesCount !== undefined && current.votesCount !== undefined) {
    const change = current.votesCount - previous.votesCount;
    if (change !== 0) {
      let changeSpan = votesContainer.querySelector('.mangalib-votes-change');
      if (!changeSpan) {
        changeSpan = Object.assign(document.createElement('span'), { className: 'mangalib-votes-change' });
        votesContainer.appendChild(changeSpan);
      }
      changeSpan.textContent = `${change > 0 ? ' (+' : ' ('}${change.toLocaleString()})`;
      changeSpan.style.cssText = `margin-left:4px;font-size:10px;color:${change > 0 ? '#a6e3a1' : '#f38ba8'}`;
    }
  }
}

// Обновление таблицы оценок (от 1 до 10) с изменениями
function updateRatingTableWithChanges(current, previous) {
  if (!previous) return;
  
  // Проверяем, есть ли у previous данные об оценках
  const hasPreviousRatingStats = previous.ratingStats && Object.keys(previous.ratingStats).length > 0;
  
  // Находим все строки с оценками внутри блока data-stats="rating"
  const ratingBlock = document.querySelector('[data-stats="rating"]');
  if (!ratingBlock) return;
  
  // Ищем все строки с оценками (у них есть data-stats-id от 1 до 10)
  for (let i = 1; i <= 10; i++) {
    const row = ratingBlock.querySelector(`.agt_n[data-stats-id="${i}"]`);
    if (!row) continue;
    
    const countEl = row.querySelector('.agt_sm');
    if (!countEl) continue;
    
    const currentCount = current.ratingStats?.[i] || 0;
    const previousCount = previous.ratingStats?.[i] || 0;
    const change = currentCount - previousCount;
    
    // Удаляем старый индикатор
    const oldChangeSpan = row.querySelector('.mangalib-rating-table-change');
    if (oldChangeSpan) oldChangeSpan.remove();
    
    // Показываем изменение только если:
    // 1. Есть предыдущие данные
    // 2. Изменение не равно нулю
    // 3. Не первая запись (есть предыдущие данные)
    if (hasPreviousRatingStats && change !== 0) {
      const changeSpan = Object.assign(document.createElement('span'), { className: 'mangalib-rating-table-change' });
      changeSpan.textContent = `${change > 0 ? ' (+' : ' ('}${change.toLocaleString()})`;
      changeSpan.style.cssText = `margin-left:4px;font-size:10px;color:${change > 0 ? '#a6e3a1' : '#f38ba8'}`;
      countEl.after(changeSpan);
    }
  }
}

function updateProgressBarsWithChanges(current, previous) {
  if (!previous) return;
  
  clearAllIndicators();
  updateRatingWithChanges(current, previous);
  updateRatingTableWithChanges(current, previous);

  const totalContainer = document.querySelector('[data-stats="bookmarks"] .section-title');
  if (totalContainer && current.totalInLists !== undefined && previous.totalInLists !== undefined) {
    const change = current.totalInLists - previous.totalInLists;
    if (change !== 0) {
      const changeSpan = Object.assign(document.createElement('span'), { className: 'mangalib-change-indicator', innerHTML: `${change > 0 ? '↑ +' : '↓ '}${change.toLocaleString()}` });
      changeSpan.style.cssText = `margin-left:8px;font-size:11px;color:${change > 0 ? '#a6e3a1' : '#f38ba8'}`;
      totalContainer.appendChild(changeSpan);
    }
  }

  const categoryMap = { 'Читаю': 'reading', 'В планах': 'planned', 'Брошено': 'dropped', 'Прочитано': 'completed', 'Любимые': 'favorite', 'Другое': 'other' };
  
  for (const row of document.querySelectorAll('[data-stats="bookmarks"] .agt_n')) {
    const label = Object.keys(categoryMap).find(key => [...row.querySelectorAll('div, span')].some(el => el.innerText?.trim() === key));
    if (!label) continue;
    const key = categoryMap[label];
    const currentCount = current.listStats?.[key] || 0;
    const previousCount = previous.listStats?.[key] || 0;
    const change = currentCount - previousCount;
    
    const progressBar = row.querySelector('.progress__bar');
    if (!progressBar) continue;
    
    // Получаем текущую ширину в процентах
    const currentPercent = parseFloat(progressBar.style.width) || 0;
    
    // Удаляем старый индикатор
    const oldChangeBar = progressBar.parentElement?.querySelector('.mangalib-progress-change');
    if (oldChangeBar) oldChangeBar.remove();
    
    if (change !== 0) {
      // Рассчитываем изменение в процентах
      const total = current.totalInLists;
      const changePercent = (Math.abs(change) / total) * 100;
      
      if (changePercent > 0.1) {
        // Создаём полосу изменений
        const changeBar = document.createElement('div');
        changeBar.className = 'mangalib-progress-change';
        
        if (change > 0) {
          // При росте: добавляем зелёную полосу справа
          changeBar.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            height: 100%;
            width: ${changePercent}%;
            background: rgba(166, 227, 161, 0.7);
            border-radius: 0 3px 3px 0;
            z-index: 1;
          `;
        } else {
          // При падении: добавляем красную полосу (показывает потерю)
          changeBar.style.cssText = `
            position: absolute;
            top: 0;
            left: ${currentPercent}%;
            height: 100%;
            width: ${changePercent}%;
            background: rgba(243, 139, 168, 0.7);
            border-radius: 0 3px 3px 0;
            z-index: 1;
          `;
        }
        
        progressBar.parentElement.style.position = 'relative';
        progressBar.style.position = 'relative';
        progressBar.style.zIndex = '2';
        progressBar.parentElement.appendChild(changeBar);
      }
      
      // Текстовый индикатор
      const countEl = row.querySelector('.agt_sm');
      if (countEl) {
        let changeSpan = row.querySelector(`.mangalib-category-change[data-category="${key}"]`);
        if (!changeSpan) {
          changeSpan = Object.assign(document.createElement('span'), { className: 'mangalib-category-change' });
          changeSpan.setAttribute('data-category', key);
          countEl.after(changeSpan);
        }
        changeSpan.textContent = `${change > 0 ? ' (+' : ' ('}${change.toLocaleString()})`;
        changeSpan.style.cssText = `margin-left:4px;font-size:10px;color:${change > 0 ? '#a6e3a1' : '#f38ba8'}`;
      }
    }
  }
}

function clearProgressBars() {
  document.querySelectorAll('.mangalib-progress-change').forEach(el => el.remove());
  
  // Восстанавливаем оригинальные прогресс-бары
  const progressBars = document.querySelectorAll('[data-stats="bookmarks"] .progress__bar');
  progressBars.forEach(bar => {
    const originalWidth = bar.style.width;
    bar.style.width = originalWidth;
    bar.style.position = '';
    if (bar.parentElement) {
      bar.parentElement.style.position = '';
    }
  });
}

async function fetchFreshDataViaApi(mangaId, mangaUrl) {
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_SINGLE_MANGA', 
      mangaId: mangaId, 
      mangaUrl: mangaUrl 
    }, (response) => {
      if (response && response.success && response.data) {
        resolve(response.data);
      } else {
        resolve(null);
      }
    });
  });
}

async function populateDateSelector(mangaId, currentStats, mangaUrl) {
  const history = await getMangaHistory(mangaId);
  const dateInput = document.getElementById('mangalib-compare-date');
  const infoDiv = document.getElementById('mangalib-date-info');
  
  if (!dateInput) return;
  
  const today = new Date().toISOString().split('T')[0];
  const hasTodayData = history.some(h => h.date === today);
  
  if (!hasTodayData && mangaUrl) {
    if (infoDiv) infoDiv.innerHTML = '⏳ Обновление данных...';
    
    const freshData = await fetchFreshDataViaApi(mangaId, mangaUrl);
    if (freshData) {
      Object.assign(currentStats, freshData);
      if (infoDiv) infoDiv.innerHTML = '✅ Данные обновлены';
      setTimeout(() => {
        if (infoDiv && infoDiv.innerHTML === '✅ Данные обновлены') infoDiv.innerHTML = '';
      }, 2000);
    } else {
      if (infoDiv) infoDiv.innerHTML = '⚠️ Не удалось обновить данные';
      setTimeout(() => {
        if (infoDiv && infoDiv.innerHTML === '⚠️ Не удалось обновить данные') infoDiv.innerHTML = '';
      }, 3000);
    }
  }
  
  const updatedHistory = await getMangaHistory(mangaId);
  const sortedDates = updatedHistory.map(h => h.date).sort();
  const availableDates = sortedDates.filter(d => d !== today);
  const lastDate = availableDates.length ? availableDates[availableDates.length - 1] : sortedDates[0];
  
  dateInput.disabled = false;
  if (sortedDates.length) {
    dateInput.min = sortedDates[0];
    dateInput.max = sortedDates[sortedDates.length - 1];
  }
  dateInput.value = lastDate || '';
  
  dateInput.onchange = () => {
    const selected = dateInput.value;
    if (selected && updatedHistory.length) {
      const previousStats = updatedHistory.find(h => h.date === selected);
      if (previousStats) {
        clearProgressBars();
        updateProgressBarsWithChanges(currentStats, previousStats);
        if (infoDiv) {
          const dateObj = new Date(selected);
          infoDiv.innerHTML = `📊 Изменения с ${dateObj.toLocaleDateString('ru-RU')}`;
        }
      }
    } else {
      clearAllIndicators();
      clearProgressBars();
      if (infoDiv) infoDiv.innerHTML = '';
    }
  };
  
  if (lastDate) {
    const previousStats = updatedHistory.find(h => h.date === lastDate);
    if (previousStats) {
      clearProgressBars();
      updateProgressBarsWithChanges(currentStats, previousStats);
      if (infoDiv) {
        const dateObj = new Date(lastDate);
        infoDiv.innerHTML = `📊 Изменения с ${dateObj.toLocaleDateString('ru-RU')}`;
      }
    }
  }
}

async function addChangeIndicator() {
  const mangaId = parseMangaId();
  const mangaUrl = window.location.href;
  if (!mangaId) return;
  
  const urlParams = new URLSearchParams(window.location.search);
  const section = urlParams.get('section');
  const isInfoTab = !section || section === 'info';
  
  const existingSelector = document.querySelector('#mangalib-date-selector');
  if (existingSelector) existingSelector.remove();
  
  if (!isInfoTab) {
    return;
  }
  
  const isTracked = await isMangaTracked(mangaId);
  
  if (!isTracked) {
    return;
  }
  
  let mediaContent = document.querySelector('.media-content.paper') || document.querySelector('.media-content');
  
  if (!mediaContent) {
    setTimeout(async () => {
      mediaContent = document.querySelector('.media-content.paper') || document.querySelector('.media-content');
      if (mediaContent && !document.querySelector('#mangalib-date-selector')) {
        const dateSelector = createDateSelector();
        mediaContent.appendChild(dateSelector);
        
        const currentStats = collectStats();
        if (currentStats) {
          await populateDateSelector(mangaId, currentStats, mangaUrl);
        }
      }
    }, 500);
    return;
  }
  
  const dateSelector = createDateSelector();
  mediaContent.appendChild(dateSelector);
  
  const currentStats = collectStats();
  if (currentStats) {
    await populateDateSelector(mangaId, currentStats, mangaUrl);
  }
}

async function refreshDateSelector() {
  const mangaId = parseMangaId();
  const mangaUrl = window.location.href;
  if (!mangaId) return;
  
  const urlParams = new URLSearchParams(window.location.search);
  const section = urlParams.get('section');
  const isInfoTab = !section || section === 'info';
  
  const isTracked = await isMangaTracked(mangaId);
  const dateSelector = document.querySelector('#mangalib-date-selector');
  
  if (!isInfoTab || !isTracked) {
    if (dateSelector) {
      dateSelector.remove();
    }
    return;
  }
  
  if (!dateSelector) {
    const mediaContent = document.querySelector('.media-content.paper') || document.querySelector('.media-content');
    if (mediaContent) {
      const dateSelectorNew = createDateSelector();
      mediaContent.appendChild(dateSelectorNew);
      
      const currentStats = collectStats();
      if (currentStats) {
        await populateDateSelector(mangaId, currentStats, mangaUrl);
      }
    }
  } else {
    const currentStats = collectStats();
    if (currentStats) {
      await populateDateSelector(mangaId, currentStats, mangaUrl);
    }
  }
}

function clearAllIndicators() {
  document.querySelectorAll('.mangalib-change-indicator, .mangalib-category-change, .mangalib-rating-change, .mangalib-votes-change, .mangalib-rating-table-change, .mangalib-progress-change').forEach(el => el.remove());
}

function createDateSelector() {
  const selector = Object.assign(document.createElement('div'), { id: 'mangalib-date-selector' });
  selector.style.cssText = 'padding-bottom:16px;display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap';
  selector.innerHTML = `<input type="date" id="mangalib-compare-date" style="background:#313244;border:1px solid #45475a;border-radius:8px;padding:6px 10px;color:#cdd6f4;font-size:12px;cursor:pointer;font-family:monospace"><div id="mangalib-date-info" style="font-size:11px;color:#a6adc8"></div>`;
  return selector;
}

// ========== КНОПКА ТРЕКЕРА ==========
const BTN_HTML = {
  add: `<svg viewBox="0 0 448 512" width="14" height="14" style="fill:white"><path fill="currentColor" d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/></svg> В трекер`,
  tracked: `<svg viewBox="0 0 448 512" width="14" height="14" style="fill:white"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> В трекере`,
  delete: `<svg viewBox="0 0 448 512" width="14" height="14" style="fill:white"><path fill="currentColor" d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg> Удалить из трекера`
};

let isCreatingButton = false;

async function createButton() {
  if (isCreatingButton) return false;
  if (document.querySelector('#mangalib-track-btn')) return true;
  
  const mangaId = parseMangaId();
  if (!mangaId) return false;
  
  const headerElement = document.querySelector('[data-header]');
  const isMobile = headerElement?.getAttribute('data-header') === 'mobile';
  
  let buttonContainer = document.querySelector('#mangalib-tracker-container');
  let targetElement = null;
  let buttonGroup = null;
  
  if (isMobile) {
    buttonGroup = document.querySelector('.btn.is-outline.variant-light');
  } else {
    buttonGroup = document.querySelector('.btns._group');
  }
  
  if (!buttonGroup) return false;
  
  isCreatingButton = true;
  
  try {
    if (!buttonContainer) {
      buttonContainer = Object.assign(document.createElement('div'), { id: 'mangalib-tracker-container' });
      buttonContainer.style.cssText = 'display:flex;justify-content:center;width:100%;';
      
      buttonGroup.parentNode.insertBefore(buttonContainer, buttonGroup.nextSibling);
    }
    
    if (!buttonContainer.querySelector('#mangalib-track-btn')) {
      buttonContainer.innerHTML = '';
      
      const trackBtn = Object.assign(document.createElement('button'), { id: 'mangalib-track-btn', className: 'btn is-outline variant-light' });
      trackBtn.style.cssText = `background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border:none;color:white;font-weight:500;padding:10px 20px;border-radius:5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.2s ease;width:100%;max-width:300px;min-width:180px`;
      trackBtn.innerHTML = BTN_HTML.add;

      const isTracked = await isMangaTracked(mangaId);
      if (isTracked) { 
        trackBtn.innerHTML = BTN_HTML.tracked; 
        trackBtn.style.background = '#27ae60'; 
      }
      trackBtn.dataset.tracked = isTracked;
      trackBtn.dataset.mangaId = mangaId;

      trackBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentMangaId = parseMangaId();
        const mangaTitle = queryFirst('h1, h1 span') || 'Тайтл';
        trackBtn.dataset.tracked === 'true' ? removeMangaFromTracker(currentMangaId, mangaTitle) : saveMangaToStats();
      };

      trackBtn.onmouseenter = () => {
        if (trackBtn.dataset.tracked === 'true') {
          trackBtn.innerHTML = BTN_HTML.delete;
          trackBtn.style.background = '#f38ba8';
          trackBtn.style.transform = 'scale(1.02)';
        } else { 
          trackBtn.style.transform = 'scale(1.02)'; 
          trackBtn.style.opacity = '0.9'; 
        }
      };

      trackBtn.onmouseleave = () => {
        if (trackBtn.dataset.tracked === 'true') {
          trackBtn.innerHTML = BTN_HTML.tracked;
          trackBtn.style.background = '#27ae60';
        } else { 
          trackBtn.style.transform = 'scale(1)'; 
          trackBtn.style.opacity = '1'; 
        }
      };

      buttonContainer.appendChild(trackBtn);
    }
    
    return true;
  } finally {
    isCreatingButton = false;
  }
}

// ========== НАБЛЮДАТЕЛИ ==========
let observer = null;

function startMutationObserver() {
  observer?.disconnect();
  observer = new MutationObserver(async () => {
    if (document.querySelector('#mangalib-track-btn')) return;
    
    const container = document.querySelector('#mangalib-tracker-container');
    
    let buttonGroup = document.querySelector('.btns._group');
    if (!buttonGroup) {
      buttonGroup = document.querySelector('.btn.is-outline.variant-light');
    }
    
    if (container && buttonGroup) await createButton();
    else if (!container && buttonGroup) await createButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function addTrackButton() {
  await createButton();
  startMutationObserver();

  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl && url.match(/\/ru\/manga\/\d+/)) {
      lastUrl = url;
      
      // Мгновенно обновляем кнопку и селектор при смене URL
      setTimeout(async () => {
        // Обновляем кнопку
        const existingBtn = document.querySelector('#mangalib-track-btn');
        if (existingBtn) {
          // Обновляем состояние кнопки
          const mangaId = parseMangaId();
          if (mangaId) {
            const isTracked = await isMangaTracked(mangaId);
            updateTrackButtonState(mangaId);
          }
        } else {
          await createButton();
        }
        
        // Мгновенно обновляем селектор даты
        await refreshDateSelector();
      }, 100);
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });
}

function addStyles() {
  if (document.querySelector('#mangalib-tracker-styles')) return;
  const style = Object.assign(document.createElement('style'), { id: 'mangalib-tracker-styles' });
  style.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
  document.head.appendChild(style);
}

// ========== ОБРАБОТЧИК СООБЩЕНИЙ ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    if (!hasRealData()) { sendResponse({ data: null }); return true; }
    const stats = collectStats();
    sendResponse({ data: stats?.id && isValidMangaData(stats) ? stats : null });
    return true;
  }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
addStyles();
addTrackButton();
addChangeIndicator();