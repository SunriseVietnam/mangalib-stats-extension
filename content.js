// content.js - сбор данных со страницы

function parseMangaId() {
  const match = window.location.href.match(/\/ru\/manga\/(\d+)/);
  return match ? match[1] : null;
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

function hasRealData() {
  const urlParams = new URLSearchParams(window.location.search);
  const section = urlParams.get('section');
  if (!section || section === 'info') {
    return true;
  } else {
    return false;
  }
  const hasRating = document.querySelector('.rating-info__value');
  const hasLists = document.querySelector('[data-stats="bookmarks"]');
  return !!(hasRating || hasLists);
}

function hasValidData(stats) {
  if (!stats) return false;
  const hasValidTitle = stats.title && stats.title !== 'Неизвестно' && !stats.title.includes('MangaLIB') && stats.title.length > 3;
  const hasNumbers = (stats.chapters > 0) || (stats.votesCount > 0) || (stats.totalInLists > 0);
  return hasValidTitle || hasNumbers;
}

function collectStats() {
  const mangaId = parseMangaId();
  if (!mangaId) return null;

  console.log('[MangaLib] ========== СБОР ДАННЫХ ==========');
  console.log('[MangaLib] ID:', mangaId);
  console.log('[MangaLib] URL:', window.location.href);

  // ========== НАЗВАНИЕ ==========
  let title = 'Неизвестно';
  const titleSelectors = ['h1 span', 'h1'];
  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 0 && !el.innerText.includes('MangaLIB')) {
      title = el.innerText.trim();
      console.log('[MangaLib] Название:', title);
      break;
    }
  }

  // ========== КОЛИЧЕСТВО ГЛАВ ==========
  let chapters = 0;
  
  // Способ 1: ищем вкладку "Главы" с числом в <small>
  const tabsItems = document.querySelectorAll('.tabs-item');
  for (const tab of tabsItems) {
    const span = tab.querySelector('.tabs-item__inner');
    if (span && span.innerText.includes('Главы')) {
      const small = span.querySelector('small');
      if (small && small.innerText) {
        chapters = parseInt(small.innerText) || 0;
        console.log('[MangaLib] Найдено глав через вкладку "Главы":', chapters);
        break;
      }
      // Если нет <small>, пробуем найти число в тексте
      const match = span.innerText.match(/Главы\s*(\d+)/);
      if (match) {
        chapters = parseInt(match[1]) || 0;
        console.log('[MangaLib] Найдено глав через текст вкладки:', chapters);
        break;
      }
    }
  }
  
  // Способ 2: ищем блок с текстом "Глав"
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
              console.log('[MangaLib] Найдено глав через блок "Глав":', chapters);
              break;
            }
          }
        }
        if (chapters > 0) break;
      }
    }
  }
  
  console.log('[MangaLib] Глав итого:', chapters);

  // ========== СРЕДНЯЯ ОЦЕНКА ==========
  let averageRating = null;
 const ratingContainer = document.querySelector('.rating-info:not(.rating-info_user)');
  if (ratingContainer) {
    const ratingValue = ratingContainer.querySelector('.rating-info__value');
    if (ratingValue && ratingValue.innerText) {
      averageRating = parseFloat(ratingValue.innerText);
      console.log('[MangaLib] Общая оценка:', averageRating);
    }
  }

  // ========== КОЛИЧЕСТВО ОЦЕНОК ==========
  let totalVotes = 0;
  const votesEl = document.querySelector('.rating-info__votes');
  if (votesEl && votesEl.innerText) {
    totalVotes = parseNumberWithSuffix(votesEl.innerText);
    console.log('[MangaLib] Количество оценок:', votesEl.innerText, '->', totalVotes);
  }

  // ========== КОЛИЧЕСТВО В СПИСКАХ ==========
  let totalInLists = 0;
  const bookmarksBlock = document.querySelector('[data-stats="bookmarks"]');
  if (bookmarksBlock) {
    const sectionTitle = bookmarksBlock.querySelector('.section-title');
    if (sectionTitle && sectionTitle.innerText) {
      const match = sectionTitle.innerText.match(/(\d+[\d.KMkm]*)/);
      if (match) {
        totalInLists = parseNumberWithSuffix(match[1]);
        console.log('[MangaLib] Всего в списках:', sectionTitle.innerText, '->', totalInLists);
      }
    }
  }

  // ========== КАТЕГОРИИ СПИСКОВ ==========
  const listStats = { reading: 0, planned: 0, dropped: 0, completed: 0, favorite: 0, other: 0 };
  
  if (bookmarksBlock) {
    console.log('[MangaLib] Поиск категорий списков...');
    
    // Находим все строки с категориями
    // Каждая категория находится в своей строке (div)
    const categoryRows = bookmarksBlock.querySelectorAll('*');
    console.log('[MangaLib] Найдено строк с категориями:', categoryRows.length);
    
    for (const row of categoryRows) {
      // Ищем метку категории
      let label = '';
      const labelElements = row.querySelectorAll('div, span');
      for (const el of labelElements) {
        const text = el.innerText?.trim();
        if (text === 'Читаю' || text === 'В планах' || text === 'Брошено' || 
            text === 'Прочитано' || text === 'Любимые' || text === 'Другое') {
          label = text;
          break;
        }
      }
      
      if (!label) continue;
      
      // Ищем число в этой же строке (реальное количество, не процент)
      let count = 0;
      // Ищем элементы с числами (исключая проценты, которые содержат знак %)
      const allSpans = row.querySelectorAll('span, div');
      for (const el of allSpans) {
        const text = el.innerText?.trim();
        // Ищем число без знака % и не слишком маленькое (не процент)
        if (text && text.match(/^\d{1,6}$/) && !text.includes('%')) {
          const num = parseInt(text);
          if (num > 0 && num < 10000000) {
            count = num;
            break;
          }
        }
      }
      
      if (count > 0) {
        console.log('[MangaLib] Категория:', label, '=', count);
        switch(label) {
          case 'Читаю': listStats.reading = count; break;
          case 'В планах': listStats.planned = count; break;
          case 'Брошено': listStats.dropped = count; break;
          case 'Прочитано': listStats.completed = count; break;
          case 'Любимые': listStats.favorite = count; break;
          case 'Другое': listStats.other = count; break;
        }
      }
    }
  }
  
  console.log('[MangaLib] Итоговые категории:', listStats);

  // ========== СТАТУС ==========
  let status = 'неизвестен';
  const statusLinks = document.querySelectorAll('a[href*="status"]');
  for (const link of statusLinks) {
    const span = link.querySelector('span');
    if (span && span.innerText) {
      status = span.innerText.trim();
      console.log('[MangaLib] Статус:', status);
      break;
    }
  }

  // ========== ЖАНРЫ ==========
  const genres = [];
  const genreElements = document.querySelectorAll('[data-type="genre"] span, [data-type="tag"] span');
  for (const el of genreElements) {
    const genre = el.innerText.trim();
    if (genre && !genres.includes(genre) && genre.length < 30 && !genre.includes('+') && !genre.includes('ещё')) {
      genres.push(genre);
    }
  }
  console.log('[MangaLib] Жанры:', genres.length, 'шт');

  // ========== АВТОР ==========
  let author = 'неизвестен';
  const authorLinks = document.querySelectorAll('a[href*="/people/"]');
  for (const link of authorLinks) {
    if (link.innerText && link.innerText.length > 0 && link.innerText.length < 50) {
      author = link.innerText.trim();
      console.log('[MangaLib] Автор:', author);
      break;
    }
  }

  const result = {
    id: mangaId,
    url: window.location.href.split('?')[0],
    title: title,
    chapters: chapters,
    averageRating: averageRating,
    votesCount: totalVotes,
    totalInLists: totalInLists,
    listStats: listStats,
    status: status,
    genres: genres,
    author: author,
    lastVisited: new Date().toISOString(),
    visitCount: 1
  };
  
  console.log('[MangaLib] ========== ИТОГ ==========');
  console.log('[MangaLib] Название:', result.title);
  console.log('[MangaLib] Главы:', result.chapters);
  console.log('[MangaLib] Оценка:', result.averageRating);
  console.log('[MangaLib] Количество оценок:', result.votesCount);
  console.log('[MangaLib] Всего в списках:', result.totalInLists);
  console.log('[MangaLib] Категории:', result.listStats);
  console.log('[MangaLib] ============================');
  
  return result;
}

function sendStats() {
  if (!hasRealData()) {
    console.log('[MangaLib] На странице нет данных, пропускаем сохранение');
    return;
  }
  
  const stats = collectStats();
  if (!stats || !stats.id) return;
  
  if (!hasValidData(stats)) {
    console.log('[MangaLib] Данные пустые, пропускаем сохранение (защита от зануления)');
    return;
  }
  
  console.log('[MangaLib] Отправка данных на сохранение...');
  chrome.runtime.sendMessage({ type: 'SAVE_MANGA_STATS', data: stats }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[MangaLib] Ошибка отправки:', chrome.runtime.lastError.message);
    } else {
      console.log('[MangaLib] Данные сохранены:', stats.title);
    }
  });
}

// Обработчик запроса данных от background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    console.log('[MangaLib] Запрос данных от background');
    
    if (!hasRealData()) {
      sendResponse({ data: null });
      return true;
    }
    
    const stats = collectStats();
    
    if (stats && stats.id && hasValidData(stats)) {
      sendResponse({ data: stats });
    } else {
      sendResponse({ data: null });
    }
    return true;
  }
});

// Ждём загрузки страницы
let attempts = 0;
const maxAttempts = 15;

function trySendStats() {
  attempts++;
  console.log('[MangaLib] Попытка сбора данных:', attempts, '/', maxAttempts);
  
  if (!hasRealData()) {
    if (attempts < maxAttempts) {
      setTimeout(trySendStats, 1500);
    }
    return;
  }
  
  const stats = collectStats();
  if (stats && stats.id && hasValidData(stats)) {
    sendStats();
  } else if (attempts < maxAttempts) {
    setTimeout(trySendStats, 1500);
  }
}

console.log('[MangaLib] Запуск сбора данных');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(trySendStats, 2000));
} else {
  setTimeout(trySendStats, 2000);
}

let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl && url.match(/\/ru\/manga\/\d+/)) {
    lastUrl = url;
    attempts = 0;
    setTimeout(trySendStats, 2000);
  }
}).observe(document, { subtree: true, childList: true });