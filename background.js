// background.js - управление хранилищем с использованием API
const API_RULE_ID = 1;

async function setupRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [API_RULE_ID],
    addRules: [{
      id: API_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://mangalib.me' }]
      },
      condition: { urlFilter: 'api.cdnlibs.org', resourceTypes: ['xmlhttprequest'] }
    }]
  });
}

chrome.runtime.onInstalled.addListener(setupRules);

const STORAGE_KEY = 'mangalib_stats';
const HISTORY_KEY = 'mangalib_history';
const API_BASE = 'https://api.cdnlibs.org';
const SITE_ID = 1;

const getApiHeaders = () => ({
  'Site-Id': String(SITE_ID),
  'Referer': 'https://mangalib.me/',
  'Accept': 'application/json'
});

async function initStorage() {
  const data = await chrome.storage.local.get([STORAGE_KEY, HISTORY_KEY]);
  if (!data[STORAGE_KEY]) await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  if (!data[HISTORY_KEY]) await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

const getDateKey = (date = new Date()) => date.toISOString().split('T')[0];
const extractSlug = url => url.match(/\/ru\/manga\/(\d+--[^?]+)/)?.[1] || null;
const extractMangaId = url => url.match(/\/ru\/manga\/(\d+)/)?.[1] || null;

async function fetchMangaInfo(slug) {
  try {
    const response = await fetch(
      `${API_BASE}/api/manga/${slug}?fields[]=summary&fields[]=genres&fields[]=authors&fields[]=chap_count&fields[]=rate_avg&fields[]=status_id`,
      { method: 'GET', headers: getApiHeaders() }
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()).data;
  } catch (error) {
    console.error('[MangaLib API] Ошибка:', error);
    return null;
  }
}

async function fetchMangaStats(slug) {
  try {
    const response = await fetch(
      `${API_BASE}/api/manga/${slug}/stats?bookmarks=true&rating=true`,
      { method: 'GET', headers: getApiHeaders() }
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return (await response.json()).data;
  } catch (error) {
    console.error('[MangaLib API] Ошибка получения статистики:', error);
    return null;
  }
}

async function fetchAllMangaData(mangaUrl) {
  const slug = extractSlug(mangaUrl);
  if (!slug) return null;
  
  const [info, stats] = await Promise.all([fetchMangaInfo(slug), fetchMangaStats(slug)]);
  if (!info) return null;
  
  const listStats = { reading: 0, planned: 0, dropped: 0, completed: 0, favorite: 0, other: 0 };
  if (stats?.bookmarks?.stats) {
    for (const item of stats.bookmarks.stats) {
      const map = { 'Читаю': 'reading', 'В планах': 'planned', 'Брошено': 'dropped', 'Прочитано': 'completed', 'Любимые': 'favorite', 'Другое': 'other' };
      if (map[item.label]) listStats[map[item.label]] = item.value;
    }
  }
  
  const totalVotes = stats?.rating?.stats?.reduce((sum, item) => sum + item.value, 0) || 0;
  
  return {
    id: extractMangaId(mangaUrl),
    url: mangaUrl.split('?')[0],
    title: info.rus_name || info.name,
    chapters: info.items_count.uploaded,
    averageRating: info.rating.average,
    votesCount: totalVotes,
    totalInLists: stats?.bookmarks?.count || 0,
    listStats,
    status: info.status?.label || 'неизвестен',
    genres: info.genres?.map(g => g.name) || [],
    author: info.authors?.[0]?.name || 'неизвестен',
    lastVisited: new Date().toISOString(),
    visitCount: 1
  };
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
      listStats: { ...mangaData.listStats },
      ratingStats: { ...mangaData.ratingStats }
    };
    
    existingIndex !== -1 ? history[existingIndex] = snapshot : history.push(snapshot);
    
    const oneYearAgo = getDateKey(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    history = history.filter(h => h.date >= oneYearAgo);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
  } catch(e) { console.error('Ошибка сохранения истории:', e); }
}

async function saveMangaStats(mangaData) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    let mangas = result[STORAGE_KEY] || [];
    const existingIndex = mangas.findIndex(m => m.id === mangaData.id);
    
    await saveHistorySnapshot(mangaData);
    
    if (existingIndex !== -1) {
      const existing = mangas[existingIndex];
      const today = getDateKey();
      const updatedHistory = [...(existing.history || [])];
      const lastHistoryEntry = updatedHistory[updatedHistory.length - 1];
      
      if (!lastHistoryEntry || lastHistoryEntry.date !== today) {
        updatedHistory.push({
          date: today,
          averageRating: mangaData.averageRating,
          votesCount: mangaData.votesCount,
          totalInLists: mangaData.totalInLists,
          listStats: { ...mangaData.listStats }
        });
      } else {
        Object.assign(lastHistoryEntry, {
          averageRating: mangaData.averageRating,
          votesCount: mangaData.votesCount,
          totalInLists: mangaData.totalInLists,
          listStats: { ...mangaData.listStats }
        });
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
          listStats: { ...mangaData.listStats }
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

const getAllStats = async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || [];
const getMangaHistory = async mangaId => (await getAllStats()).find(m => m.id === mangaId)?.history || [];

async function deleteManga(mangaId) {
  let mangas = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || [];
  mangas = mangas.filter(m => m.id !== mangaId);
  await chrome.storage.local.set({ [STORAGE_KEY]: mangas });
  
  let history = (await chrome.storage.local.get(HISTORY_KEY))[HISTORY_KEY] || [];
  history = history.filter(h => h.mangaId !== mangaId);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return mangas;
}

const clearAllStats = async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: [], [HISTORY_KEY]: [] });
};

const updateMangaViaApi = async mangaUrl => {
  const mangaData = await fetchAllMangaData(mangaUrl);
  return mangaData?.title && mangaData.title !== 'Неизвестно' ? mangaData : null;
};

const addMangaByUrl = async mangaUrl => {
  const mangaData = await fetchAllMangaData(mangaUrl);
  if (mangaData?.title && mangaData.title !== 'Неизвестно') {
    await saveMangaStats(mangaData);
    return mangaData;
  }
  return null;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    SAVE_MANGA_STATS: () => saveMangaStats(message.data).then(mangas => ({ success: true, count: mangas.length })),
    GET_ALL_STATS: () => getAllStats().then(stats => ({ success: true, data: stats })),
    GET_MANGA_HISTORY: () => getMangaHistory(message.mangaId).then(history => ({ success: true, data: history })),
    DELETE_MANGA: () => deleteManga(message.mangaId).then(mangas => ({ success: true, count: mangas.length })),
    ADD_MANGA_BY_URL: () => addMangaByUrl(message.url).then(data => data ? { success: true, data } : { success: false, error: 'Не удалось получить данные' }),
    UPDATE_SINGLE_MANGA: () => updateMangaViaApi(message.mangaUrl).then(mangaData => mangaData ? saveMangaStats(mangaData).then(() => ({ success: true, data: mangaData })) : { success: false, error: 'Не удалось обновить' }),
    CLEAR_ALL_STATS: () => clearAllStats().then(() => ({ success: true }))
  };
  
  const handler = handlers[message.type];
  if (handler) {
    handler().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  return false;
});

initStorage();