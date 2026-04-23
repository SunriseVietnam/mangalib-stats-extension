// background.js - управление хранилищем

const STORAGE_KEY = 'mangalib_stats';
const HISTORY_KEY = 'mangalib_history';

async function initStorage() {
  const data = await chrome.storage.local.get([STORAGE_KEY, HISTORY_KEY]);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }
  if (!data[HISTORY_KEY]) {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  }
}

function getDateKey(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function parseNumberWithSuffix(text) {
  if (!text) return 0;
  const clean = text.toString().trim().replace(/[^\d.KMkm]/g, '');
  if (clean.includes('K') || clean.includes('k')) {
    return Math.round(parseFloat(clean.replace(/[Kk]/g, '')) * 1000);
  }
  if (clean.includes('M') || clean.includes('m')) {
    return Math.round(parseFloat(clean.replace(/[Mm]/g, '')) * 1000000);
  }
  return parseInt(clean) || 0;
}

async function saveHistorySnapshot(mangaData) {
  try {
    const result = await chrome.storage.local.get(HISTORY_KEY);
    let history = result[HISTORY_KEY] || [];
    const today = getDateKey();
    const existingIndex = history.findIndex(h => h.date === today && h.mangaId === mangaData.id);
    
    const snapshot = {
      date: today,
      mangaId: mangaData.id,
      title: mangaData.title,
      averageRating: mangaData.averageRating,
      votesCount: mangaData.votesCount,
      totalInLists: mangaData.totalInLists,
      listStats: { ...(mangaData.listStats || {}) }
    };
    
    if (existingIndex !== -1) {
      history[existingIndex] = snapshot;
    } else {
      history.push(snapshot);
    }
    
    const oneYearAgo = getDateKey(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    history = history.filter(h => h.date >= oneYearAgo);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
  } catch(e) {
    console.error('Ошибка сохранения истории:', e);
  }
}

async function saveMangaStats(mangaData) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let mangas = result[STORAGE_KEY] || [];
    const existingIndex = mangas.findIndex(m => m.id === mangaData.id);
    
    await saveHistorySnapshot(mangaData);
    
    if (existingIndex !== -1) {
      const existing = mangas[existingIndex];
      const updatedHistory = [...(existing.history || [])];
      const today = getDateKey();
      const lastHistoryEntry = updatedHistory[updatedHistory.length - 1];
      
      if (!lastHistoryEntry || lastHistoryEntry.date !== today) {
        updatedHistory.push({
          date: today,
          averageRating: mangaData.averageRating,
          votesCount: mangaData.votesCount,
          totalInLists: mangaData.totalInLists,
          listStats: { ...(mangaData.listStats || {}) }
        });
      } else {
        lastHistoryEntry.averageRating = mangaData.averageRating;
        lastHistoryEntry.votesCount = mangaData.votesCount;
        lastHistoryEntry.totalInLists = mangaData.totalInLists;
        lastHistoryEntry.listStats = { ...(mangaData.listStats || {}) };
      }
      
      mangas[existingIndex] = {
        ...mangaData,
        history: updatedHistory.slice(-365),
        visitCount: (existing.visitCount || 0) + 1,
        firstVisited: existing.firstVisited || mangaData.lastVisited,
        lastUpdated: new Date().toISOString()
      };
    } else {
      mangas.unshift({
        ...mangaData,
        history: [{
          date: getDateKey(),
          averageRating: mangaData.averageRating,
          votesCount: mangaData.votesCount,
          totalInLists: mangaData.totalInLists,
          listStats: { ...(mangaData.listStats || {}) }
        }],
        firstVisited: mangaData.lastVisited,
        lastUpdated: mangaData.lastVisited,
        visitCount: 1
      });
    }
    
    if (mangas.length > 1000) mangas = mangas.slice(0, 1000);
    await chrome.storage.local.set({ [STORAGE_KEY]: mangas });
    return mangas;
  } catch(e) {
    console.error('Ошибка сохранения:', e);
    return [];
  }
}

async function getAllStats() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function getMangaHistory(mangaId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const mangas = result[STORAGE_KEY] || [];
  const manga = mangas.find(m => m.id === mangaId);
  return manga?.history || [];
}

async function deleteManga(mangaId) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let mangas = result[STORAGE_KEY] || [];
  mangas = mangas.filter(m => m.id !== mangaId);
  await chrome.storage.local.set({ [STORAGE_KEY]: mangas });
  
  const historyResult = await chrome.storage.local.get(HISTORY_KEY);
  let history = historyResult[HISTORY_KEY] || [];
  history = history.filter(h => h.mangaId !== mangaId);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  
  return mangas;
}

async function clearAllStats() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

// Функция обновления одного тайтла через открытие вкладки
async function updateMangaViaTab(mangaUrl) {
  const cleanUrl = mangaUrl.split('?')[0];
  console.log('[MangaLib] Обновление:', cleanUrl);
  
  return new Promise((resolve) => {
    let tabId = null;
    let isResolved = false;
    let attempts = 0;
    const maxAttempts = 20;
    
    chrome.tabs.create({ url: cleanUrl, active: false }, (tab) => {
      tabId = tab.id;
      
      const cleanup = () => {
        if (tabId) {
          try { chrome.tabs.remove(tabId); } catch(e) {}
        }
      };
      
      // Функция для повторных попыток получения данных
      const tryGetData = () => {
        if (isResolved) return;
        attempts++;
        
        chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' }, (response) => {
          if (chrome.runtime.lastError) {
            if (attempts < maxAttempts) {
              setTimeout(tryGetData, 1000);
            } else {
              cleanup();
              resolve(null);
              isResolved = true;
            }
            return;
          }
          
          if (response && response.data) {
            const data = response.data;
            const hasData = data.chapters > 0 || data.votesCount > 0 || data.totalInLists > 0;
            const hasValidTitle = data.title && data.title !== 'Неизвестно' && !data.title.includes('MangaLIB');
            
            if (hasData || hasValidTitle) {
              cleanup();
              resolve(data);
              isResolved = true;
            } else if (attempts < maxAttempts) {
              setTimeout(tryGetData, 1000);
            } else {
              cleanup();
              resolve(null);
              isResolved = true;
            }
          } else if (attempts < maxAttempts) {
            setTimeout(tryGetData, 1000);
          } else {
            cleanup();
            resolve(null);
            isResolved = true;
          }
        });
      };
      
      // Ждём полной загрузки страницы
      const onUpdated = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(tryGetData, 3000);
        }
      };
      
      chrome.tabs.onUpdated.addListener(onUpdated);
      
      // Таймаут
      setTimeout(() => {
        if (!isResolved) {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          cleanup();
          resolve(null);
          isResolved = true;
        }
      }, 30000);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_MANGA_STATS') {
    saveMangaStats(message.data).then(mangas => {
      sendResponse({ success: true, count: mangas.length });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  if (message.type === 'GET_ALL_STATS') {
    getAllStats().then(stats => {
      sendResponse({ success: true, data: stats });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  if (message.type === 'GET_MANGA_HISTORY') {
    getMangaHistory(message.mangaId).then(history => {
      sendResponse({ success: true, data: history });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  if (message.type === 'DELETE_MANGA') {
    deleteManga(message.mangaId).then(mangas => {
      sendResponse({ success: true, count: mangas.length });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  if (message.type === 'UPDATE_SINGLE_MANGA') {
    updateMangaViaTab(message.mangaUrl).then(mangaData => {
      if (mangaData) {
        saveMangaStats(mangaData).then(() => {
          sendResponse({ success: true, data: mangaData });
        });
      } else {
        sendResponse({ success: false, error: 'Не удалось обновить' });
      }
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  if (message.type === 'CLEAR_ALL_STATS') {
    clearAllStats().then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
  
  return false;
});

initStorage();
console.log('[MangaLib Stats] Background запущен');