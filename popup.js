// popup.js - управление отображением данных + комментарии

let allMangas = [];
let manga1History = [];
let manga2History = [];
let manga1Data = null;
let manga2Data = null;
let currentSearch = '';
let lastCommentCheckDate = localStorage.getItem('mangalib_lastCommentCheck') || new Date().toISOString();

async function loadData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_STATS' }, (response) => {
      allMangas = response?.success ? response.data : [];
      resolve(allMangas);
    });
  });
}

async function loadMangaHistory(mangaId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_MANGA_HISTORY', mangaId }, (response) => {
      resolve(response?.data || []);
    });
  });
}

function formatNumber(num) {
  return (num || num === 0) ? num.toLocaleString('ru-RU') : '0';
}

async function updateOverview() {
  await loadData();
  
  const topRated = [...allMangas]
    .filter(m => m.averageRating)
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 5);
  
  const topRatedDiv = document.getElementById('topRated');
  if (topRatedDiv) {
    topRatedDiv.innerHTML = topRated.length ? topRated.map((m, i) => `
      <div class="top-item">
        <span class="top-rank">${i+1}</span>
        <span class="top-title">${m.title}</span>
        <span class="top-rating">⭐ ${m.averageRating}</span>
        <span class="top-votes">(${formatNumber(m.votesCount)} оценок)</span>
      </div>
    `).join('') : '<div class="empty">Нет данных</div>';
  }
  
  const recentDiv = document.getElementById('recentList');
  if (recentDiv) {
    const recent = allMangas.slice(0, 10);
    recentDiv.innerHTML = recent.length ? recent.map(m => `
      <div class="recent-item">
        <a href="${m.url}" target="_blank" class="recent-title">${m.title}</a>
        <span class="recent-date">${new Date(m.lastVisited).toLocaleDateString('ru-RU')}</span>
        <span class="recent-stats">⭐ ${m.averageRating || '—'} | 📖 ${m.chapters || 0} глав</span>
      </div>
    `).join('') : '<div class="empty">Нет данных</div>';
  }
  
  const totalSpan = document.getElementById('totalCount');
  if (totalSpan) totalSpan.textContent = `${allMangas.length} тайтлов`;
}

function renderMangaList() {
  let filtered = allMangas;
  if (currentSearch) {
    filtered = filtered.filter(m => m.title.toLowerCase().includes(currentSearch.toLowerCase()));
  }
  
  const container = document.getElementById('mangaList');
  if (!container) return;
  
  if (!filtered.length) {
    container.innerHTML = '<div class="empty">Нет тайтлов</div>';
    return;
  }
  
  container.innerHTML = filtered.map(m => {
    // Вычисляем разницу с предыдущей записью
    const history = m.history || [];
    const prevStats = history.length > 1 ? history[history.length - 2] : null;
    const currStats = history.length > 0 ? history[history.length - 1] : null;
    
    const calcDiff = (curr, prev, key) => {
      if (!curr || !prev) return 0;
      const c = curr[key] ?? 0;
      const p = prev[key] ?? 0;
      return c - p;
    };
    
    const diffTotal = calcDiff(currStats, prevStats, 'totalInLists');
    const diffReading = calcDiff(currStats?.listStats, prevStats?.listStats, 'reading');
    const diffPlanned = calcDiff(currStats?.listStats, prevStats?.listStats, 'planned');
    const diffCompleted = calcDiff(currStats?.listStats, prevStats?.listStats, 'completed');
    const diffFavorite = calcDiff(currStats?.listStats, prevStats?.listStats, 'favorite');
    const diffDropped = calcDiff(currStats?.listStats, prevStats?.listStats, 'dropped');
    const diffOther = calcDiff(currStats?.listStats, prevStats?.listStats, 'other');
    
    const formatDiff = (diff) => {
      if (diff === 0) return '';
      return diff > 0 ? `↑ +${formatNumber(diff)}` : `↓ ${formatNumber(diff)}`;
    };
    
    return `
    <div class="manga-card">
      <div class="manga-card-header">
        <a href="${m.url}" target="_blank" class="manga-title">${m.title}</a>
        <span class="manga-rating">⭐ ${m.averageRating || '—'}</span>
      </div>
      <div class="manga-card-stats">
        <span>📖 ${m.chapters || 0} глав</span>
        <span>🗳️ ${formatNumber(m.votesCount)} оценок</span>
        <span>👁️ ${formatNumber(m.viewsCount || 0)} просмотров</span>
        <span>📊 ${formatNumber(m.totalInLists)} в списках ${formatDiff(diffTotal)}</span>
      </div>
      <div class="manga-card-lists">
        <span class="list-badge">📖 Читаю: ${formatNumber(m.listStats?.reading)} ${formatDiff(diffReading)}</span>
        <span class="list-badge">📅 В планах: ${formatNumber(m.listStats?.planned)} ${formatDiff(diffPlanned)}</span>
        <span class="list-badge">✅ Прочитано: ${formatNumber(m.listStats?.completed)} ${formatDiff(diffCompleted)}</span>
        <span class="list-badge">❤️ Любимые: ${formatNumber(m.listStats?.favorite)} ${formatDiff(diffFavorite)}</span>
        <span class="list-badge">❌ Брошено: ${formatNumber(m.listStats?.dropped)} ${formatDiff(diffDropped)}</span>
        <span class="list-badge">📌 Другое: ${formatNumber(m.listStats?.other)} ${formatDiff(diffOther)}</span>
      </div>
      <div class="manga-card-footer">
        <span class="manga-status">${m.status || '—'}</span>
        <span class="manga-visits">👁️ ${m.visitCount || 1} раз</span>
        <button class="btn-history" data-id="${m.id}" data-title="${m.title.replace(/"/g, '&quot;')}">📈 История</button>
        <button class="btn-delete" data-id="${m.id}" data-title="${m.title.replace(/"/g, '&quot;')}">🗑 Удалить</button>
      </div>
    </div>
    `;
  }).join('');
  
  document.querySelectorAll('.btn-history').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { id, title } = btn.dataset;
      const manga = allMangas.find(m => m.id === id);
      if (manga) {
        document.querySelector('.tab-btn[data-tab="history"]').click();
        setTimeout(async () => {
          manga1Data = manga;
          manga1History = await loadMangaHistory(id);
          const infoDiv = document.getElementById('selectedManga1Info');
          if (infoDiv) infoDiv.innerHTML = `✅ ${title}`;
          document.getElementById('searchManga1').value = title;
          drawChart();
        }, 100);
      }
    });
  });
  
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { id, title } = btn.dataset;
      if (confirm(`Удалить "${title}" из статистики?`)) {
        chrome.runtime.sendMessage({ type: 'DELETE_MANGA', mangaId: id }, async (response) => {
          if (response?.success) {
            await loadData();
            updateOverview();
            renderMangaList();
            
            if (manga1Data?.id === id) {
              manga1Data = null;
              manga1History = [];
              document.getElementById('selectedManga1Info').innerHTML = 'Тайтл 1 не выбран';
              document.getElementById('searchManga1').value = '';
            }
            if (manga2Data?.id === id) {
              manga2Data = null;
              manga2History = [];
              document.getElementById('selectedManga2Info').innerHTML = 'Тайтл 2 не выбран';
              document.getElementById('searchManga2').value = '';
            }
            updateChart();
          }
        });
      }
    });
  });
}

async function drawChart() {
  const metric = document.getElementById('chartMetric')?.value || 'averageRating';
  const period = parseInt(document.getElementById('chartPeriod')?.value || '30');
  const canvas = document.getElementById('comparisonChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  
  if (!manga1Data) {
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Выберите тайтл для отображения графика', width / 2, height / 2);
    return;
  }
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - period);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  const filtered1 = (manga1History || []).filter(h => h.date >= cutoffStr);
  const filtered2 = manga2Data ? (manga2History || []).filter(h => h.date >= cutoffStr) : [];
  
  const allDates = [...new Set([...filtered1.map(h => h.date), ...filtered2.map(h => h.date)])].sort();
  
  if (!allDates.length) {
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Нет исторических данных', width / 2, height / 2);
    return;
  }
  
  const map1 = new Map(filtered1.map(h => [h.date, h]));
  const map2 = new Map(filtered2.map(h => [h.date, h]));
  
  const getValue = (h, metric) => {
    if (metric === 'averageRating') return h?.averageRating ?? null;
    if (metric === 'votesCount') return h?.votesCount ?? null;
    if (metric === 'totalInLists') return h?.totalInLists ?? null;
    if (metric === 'viewsCount') return h?.viewsCount ?? null;
    return h?.listStats?.[metric] ?? null;
  };
  
  const data1 = allDates.map(date => getValue(map1.get(date), metric));
  const data2 = allDates.map(date => getValue(map2.get(date), metric));
  const labels = allDates.map(d => {
    const date = new Date(d);
    return `${date.getDate()}.${date.getMonth()+1}`;
  });
  
  const allValidValues = [...data1.filter(v => v !== null), ...(manga2Data ? data2.filter(v => v !== null) : [])];
  
  if (!allValidValues.length) {
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для отображения', width / 2, height / 2);
    return;
  }
  
  let maxValue = Math.max(...allValidValues);
  let minValue = Math.min(...allValidValues);
  let range = maxValue - minValue;
  
  let yMin = minValue - (range * 0.1);
  let yMax = maxValue + (range * 0.1);
  
  if (metric === 'averageRating') {
    yMin = Math.max(0, yMin);
    yMax = Math.min(10, yMax);
    if (yMax - yMin < 1) {
      yMin = Math.max(0, yMin - 0.02);
      yMax = Math.min(10, yMax + 0.02);
    }
  }
  
  if (yMax === yMin) {
    yMin = yMin - (yMin * 0.1);
    yMax = yMax + (yMax * 0.1);
    if (yMin === yMax) {
      yMin = 0;
      yMax = yMax * 2 || 10;
    }
  }
  
  const padding = { top: 30, right: 40, bottom: 40, left: 55 };
  const graphW = width - padding.left - padding.right;
  const graphH = height - padding.top - padding.bottom;
  
  ctx.fillStyle = '#313244';
  ctx.fillRect(0, 0, width, height);
  
  ctx.strokeStyle = '#45475a';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();
  
  ctx.strokeStyle = '#45475a';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
  
  ctx.fillStyle = '#a6adc8';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const value = yMax - (ratio * (yMax - yMin));
    let displayValue;
    if (metric === 'averageRating') {
      displayValue = value.toFixed(2);
    } else {
      displayValue = Math.round(value).toString();
    }
    const y = padding.top + (graphH / 4) * i;
    ctx.fillText(displayValue, padding.left - 5, y + 3);
  }
  
  ctx.textAlign = 'center';
  ctx.font = '9px system-ui';
  const step = graphW / (labels.length - 1 || 1);
  labels.forEach((label, i) => {
    const x = padding.left + step * i;
    ctx.fillText(label, x, height - padding.bottom + 15);
  });
  
  const metricNames = {
    averageRating: '⭐ Оценка', votesCount: '📊 Количество оценок', totalInLists: '📚 Всего в списках',
    reading: '📖 Читаю', planned: '📅 В планах', completed: '✅ Прочитано',
    favorite: '❤️ Любимые', dropped: '❌ Брошено', other: '📌 Другое'
  };
  
  const points = [];
  
  const drawLine = (data, color, title, pointsArray) => {
    if (data.every(v => v === null)) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    let first = true;
    data.forEach((val, i) => {
      if (val === null) { first = true; return; }
      const normalizedY = (val - yMin) / (yMax - yMin);
      const y = padding.top + graphH - (normalizedY * graphH);
      const x = padding.left + step * i;
      pointsArray.push({ x, y, value: val, label: labels[i], title, color });
      if (first) { ctx.moveTo(x, y); first = false; }
      else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    data.forEach((val, i) => {
      if (val === null) return;
      const normalizedY = (val - yMin) / (yMax - yMin);
      const y = padding.top + graphH - (normalizedY * graphH);
      const x = padding.left + step * i;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#1e1e2e';
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  };
  
  drawLine(data1, '#89b4fa', manga1Data.title, points);
  if (manga2Data) drawLine(data2, '#f9e2af', manga2Data.title, points);
  
  let legendY = 10;
  if (manga1Data) {
    ctx.fillStyle = '#89b4fa';
    ctx.fillRect(width - 140, legendY, 12, 12);
    ctx.fillStyle = '#cdd6f4';
    ctx.fillText(`${manga1Data.title.substring(0, 20)} (${metricNames[metric]})`, width - 172, legendY + 10);
    legendY += 20;
  }
  if (manga2Data) {
    ctx.fillStyle = '#f9e2af';
    ctx.fillRect(width - 140, legendY, 12, 12);
    ctx.fillStyle = '#cdd6f4';
    ctx.fillText(`${manga2Data.title.substring(0, 20)} (${metricNames[metric]})`, width - 125, legendY + 10);
  }
  
  const handleMousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    let closestPoint = null;
    let minDist = 15;
    
    for (const point of points) {
      const dist = Math.hypot(mouseX - point.x, mouseY - point.y);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }
    
    if (closestPoint) {
      const value = formatNumber(closestPoint.value);
      showTooltip(e.clientX, e.clientY, value);
    } else {
      hideTooltip();
    }
  };
  
  const handleMouseleave = () => hideTooltip();
  
  canvas.removeEventListener('mousemove', handleMousemove);
  canvas.removeEventListener('mouseleave', handleMouseleave);
  canvas.addEventListener('mousemove', handleMousemove);
  canvas.addEventListener('mouseleave', handleMouseleave);
}

function showTooltip(x, y, text) {
  let tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      background: #1e1e2e;
      border: 1px solid #89b4fa;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12px;
      font-family: system-ui;
      color: #cdd6f4;
      pointer-events: none;
      z-index: 100000;
      white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(tooltip);
  }
  
  tooltip.innerHTML = text;
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  let left = x + 15;
  let top = y - 40;
  
  if (left + tooltipRect.width > viewportWidth - 10) left = x - tooltipRect.width - 15;
  if (left < 10) left = 10;
  if (top < 10) top = y + 20;
  if (top + tooltipRect.height > viewportHeight - 10) top = viewportHeight - tooltipRect.height - 10;
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.display = 'block';
}

function hideTooltip() {
  const tooltip = document.getElementById('chart-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function updateChart() {
  setTimeout(drawChart, 50);
}

function setupMangaSearch(inputId, listId, isManga1) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  
  input.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    let filtered = allMangas.filter(m => m.title.toLowerCase().includes(search)).slice(0, 8);
    
    if (isManga1 && manga2Data) filtered = filtered.filter(m => m.id !== manga2Data.id);
    if (!isManga1 && manga1Data) filtered = filtered.filter(m => m.id !== manga1Data.id);
    
    list.innerHTML = filtered.map(m => `
      <div class="manga-select-item" data-id="${m.id}" data-title="${m.title}" data-info='${JSON.stringify(m)}'>
        <strong>${m.title}</strong>
        <span class="manga-select-stats">⭐ ${m.averageRating || '—'}</span>
      </div>
    `).join('');
    
    list.querySelectorAll('.manga-select-item').forEach(item => {
      item.addEventListener('click', async () => {
        const { id, title, info } = item.dataset;
        const mangaData = JSON.parse(info);
        
        if (isManga1) {
          if (manga2Data?.id === id) {
            alert('Этот тайтл уже выбран как Тайтл 2');
            return;
          }
          manga1Data = mangaData;
          manga1History = await loadMangaHistory(id);
          document.getElementById('selectedManga1Info').innerHTML = `✅ ${title}`;
        } else {
          if (manga1Data?.id === id) {
            alert('Этот тайтл уже выбран как Тайтл 1');
            return;
          }
          manga2Data = mangaData;
          manga2History = await loadMangaHistory(id);
          document.getElementById('selectedManga2Info').innerHTML = `✅ ${title}`;
        }
        
        input.value = title;
        list.innerHTML = '';
        updateChart();
      });
    });
  });
  
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.innerHTML = '';
    }
  });
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(allMangas, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mangalib_stats_${new Date().toISOString().slice(0,19)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV() {
  const headers = ['ID', 'Название', 'Главы', 'Оценка', 'Кол-во оценок', 'В списках', 'Читаю', 'В планах', 'Брошено', 'Прочитано', 'Любимые', 'Другое', 'Статус'];
  const rows = allMangas.map(m => [
    m.id, `"${m.title.replace(/"/g, '""')}"`, m.chapters || 0, m.averageRating || '',
    m.votesCount || 0, m.totalInLists || 0, m.listStats?.reading || 0, m.listStats?.planned || 0,
    m.listStats?.dropped || 0, m.listStats?.completed || 0, m.listStats?.favorite || 0,
    m.listStats?.other || 0, m.status || ''
  ]);
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mangalib_stats_${new Date().toISOString().slice(0,19)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function clearData() {
  if (confirm('Удалить всю статистику?')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_STATS' }, async () => {
      await loadData();
      updateOverview();
      renderMangaList();
      manga1Data = manga2Data = null;
      manga1History = manga2History = [];
      document.getElementById('selectedManga1Info').innerHTML = 'Тайтл 1 не выбран';
      document.getElementById('selectedManga2Info').innerHTML = 'Тайтл 2 не выбран';
      updateChart();
    });
  }
}

function initEvents() {
  const updateAllBtn = document.getElementById('updateAllBtn');
  if (updateAllBtn) updateAllBtn.addEventListener('click', updateAllMangas);
  
  const addMangaBtn = document.getElementById('addMangaBtn');
  if (addMangaBtn) {
    addMangaBtn.addEventListener('click', () => {
      const urlsInput = document.getElementById('mangaUrlsInput');
      if (urlsInput) addMangasByUrls(urlsInput.value);
    });
  }
  
  const urlsInput = document.getElementById('mangaUrlsInput');
  if (urlsInput) {
    urlsInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        addMangasByUrls(e.target.value);
      }
    });
  }
  
  const clearManga2Btn = document.getElementById('clearManga2');
  if (clearManga2Btn) {
    clearManga2Btn.addEventListener('click', () => {
      manga2Data = null;
      manga2History = [];
      document.getElementById('selectedManga2Info').innerHTML = 'Тайтл 2 не выбран';
      document.getElementById('searchManga2').value = '';
      updateChart();
    });
  }
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');
      if (tabId === 'list') renderMangaList();
      if (tabId === 'history') setTimeout(updateChart, 100);
    });
  });
  
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderMangaList();
  });
  
  document.getElementById('chartMetric')?.addEventListener('change', updateChart);
  document.getElementById('chartPeriod')?.addEventListener('change', updateChart);
  document.getElementById('exportJson')?.addEventListener('click', exportJSON);
  document.getElementById('exportCsv')?.addEventListener('click', exportCSV);
  document.getElementById('clearData')?.addEventListener('click', clearData);
  
  setupMangaSearch('searchManga1', 'mangaList1', true);
  setupMangaSearch('searchManga2', 'mangaList2', false);
  setupCommentsMangaSearch();
  setupCommentsControls();
}

// ========== КОММЕНТАРИИ ==========
let selectedCommentsManga = null;

function setupCommentsMangaSearch() {
  const input = document.getElementById('searchCommentsManga');
  const list = document.getElementById('commentsMangaList');
  if (!input || !list) return;
  
  input.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    const filtered = allMangas.filter(m => m.title.toLowerCase().includes(search)).slice(0, 8);
    
    list.innerHTML = filtered.map(m => `
      <div class="manga-select-item" data-id="${m.id}" data-title="${m.title}" data-info='${JSON.stringify(m)}'>
        <strong>${m.title}</strong>
        <span class="manga-select-stats">⭐ ${m.averageRating || '—'}</span>
      </div>
    `).join('');
    
    list.querySelectorAll('.manga-select-item').forEach(item => {
      item.addEventListener('click', () => {
        const { title, info } = item.dataset;
        selectedCommentsManga = JSON.parse(info);
        input.value = title;
        list.innerHTML = '';
        loadChaptersForManga(selectedCommentsManga.id);
      });
    });
  });
  
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.innerHTML = '';
    }
  });
}

async function loadChaptersForManga(mangaId) {
  const chapterSelect = document.getElementById('lastChapterSelect');
  if (!chapterSelect) return;
  
  chapterSelect.innerHTML = '<option value="">Загрузка глав...</option>';
  
  try {
    const manga = allMangas.find(m => m.id === mangaId);
    if (!manga) return;
    
    const slug = manga.url.match(/\/ru\/manga\/(\d+--[^?]+)/)?.[1];
    if (!slug) return;
    
    const response = await fetch(`https://api.cdnlibs.org/api/manga/${slug}/chapters`, {
      headers: { 'Site-Id': '1', 'Accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    
    const chapters = data.data || [];
    
    if (!chapters.length) {
      chapterSelect.innerHTML = '<option value="">Нет глав</option>';
      return;
    }
    
    chapterSelect.innerHTML = '<option value="">Выберите главу</option>' + 
      chapters.slice(-20).reverse().map(ch => 
        `<option value="${ch.number}" data-volume="${ch.volume || 1}">Гл. ${ch.number} (том ${ch.volume || 1})</option>`
      ).join('');
  } catch (e) {
    chapterSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
  }
}

function setupCommentsControls() {
  const sourceTypeSelect = document.getElementById('commentSourceType');
  const chapterSelect = document.getElementById('lastChapterSelect');
  
  if (sourceTypeSelect && chapterSelect) {
    sourceTypeSelect.addEventListener('change', () => {
      chapterSelect.style.display = sourceTypeSelect.value === 'chapter' ? 'block' : 'none';
    });
  }
  
  document.getElementById('loadCommentsBtn')?.addEventListener('click', loadComments);
  document.getElementById('markCommentsReadBtn')?.addEventListener('click', markCommentsAsRead);
}

async function loadComments() {
  if (!selectedCommentsManga) {
    alert('Выберите тайтл');
    return;
  }

  const commentsList = document.getElementById('commentsList');
  commentsList.innerHTML = '<div class="empty">Загрузка комментариев...</div>';

  try {
    const slug = selectedCommentsManga.url.match(/\/ru\/manga\/(\d+--[^?]+)/)?.[1];
    if (!slug) throw new Error('Не удалось получить slug манги');

    // Загружаем комментарии со всех глав и с самой манги
    const allComments = [];
    
    // Сначала загружаем комментарии к манге
    const mangaCommentsResponse = await fetch(
      `https://api.cdnlibs.org/api/comments?page=1&post_id=${selectedCommentsManga.id}&post_type=manga&sort_by=id&sort_type=desc`,
      { headers: { 'Site-Id': '1', 'Accept': 'application/json' } }
    );
    
    if (mangaCommentsResponse.ok) {
      const mangaCommentsData = await mangaCommentsResponse.json();
      const mangaComments = mangaCommentsData.data || [];
      allComments.push(...mangaComments.map(c => ({ ...c, _source: 'manga' })));
    }
    
    // Загружаем главы и комментарии к ним
    const chaptersResponse = await fetch(
      `https://api.cdnlibs.org/api/manga/${slug}/chapters`,
      { headers: { 'Site-Id': '1', 'Accept': 'application/json' } }
    );
    
    if (chaptersResponse.ok) {
      const chaptersData = await chaptersResponse.json();
      const chapters = chaptersData.data || [];
      
      // Загружаем комментарии для каждой главы (последние 50 глав чтобы не перегружать)
      const recentChapters = chapters.slice(-50);
      for (const chapter of recentChapters) {
        const chapterId = chapter.id;
        if (!chapterId) continue;
        
        try {
          const chapterCommentsResponse = await fetch(
            `https://api.cdnlibs.org/api/comments?page=1&post_id=${chapterId}&post_type=chapter&sort_by=id&sort_type=desc`,
            { headers: { 'Site-Id': '1', 'Accept': 'application/json' } }
          );
          
          if (chapterCommentsResponse.ok) {
            const chapterCommentsData = await chapterCommentsResponse.json();
            const chapterComments = chapterCommentsData.data || [];
            allComments.push(...chapterComments.map(c => ({ 
              ...c, 
              _source: 'chapter',
              _chapterNumber: chapter.number,
              _chapterVolume: chapter.volume
            })));
          }
        } catch (e) {
          console.error(`Ошибка загрузки комментариев главы ${chapter.number}:`, e);
        }
        
        // Небольшая задержка между запросами
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    // Сортируем все комментарии по ID (новые сверху)
    allComments.sort((a, b) => b.id - a.id);
    
    const checkDate = new Date(lastCommentCheckDate);

    if (!allComments.length) {
      commentsList.innerHTML = '<div class="empty">Нет комментариев</div>';
      return;
    }

    commentsList.innerHTML = allComments.map(comment => {
      const commentDate = new Date(comment.created_at);
      const isNew = commentDate > checkDate;
      const authorUrl = `https://mangalib.me/ru/user/${comment.user?.id || comment.author_id || 0}`;
      
      let commentUrl;
      let sourceLabel;
      if (comment._source === 'chapter') {
        commentUrl = `https://mangalib.me/ru/manga/${slug}/read/volume/${comment._chapterVolume || 1}?page=1#comment-${comment.id}`;
        sourceLabel = `Глава ${comment._chapterNumber}`;
      } else {
        commentUrl = `https://mangalib.me/ru/manga/${selectedCommentsManga.id}?section=comments#comment-${comment.id}`;
        sourceLabel = 'Манга';
      }

      return `
        <div class="comment-item ${isNew ? 'new' : ''}">
          <div class="comment-header">
            <span class="comment-source">${sourceLabel}</span>
            <a href="${authorUrl}" target="_blank" class="comment-author">@${comment.user?.username || comment.author || 'Аноним'}</a>
            <span class="comment-date">${commentDate.toLocaleDateString('ru-RU')} ${commentDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.text || comment.content || '')}</div>
          <a href="${commentUrl}" target="_blank" class="comment-link">📍 Перейти к комментарию</a>
          ${isNew ? '<span class="comment-new-badge">НОВЫЙ</span>' : ''}
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error('Ошибка загрузки комментариев:', e);
    commentsList.innerHTML = `<div class="empty">Ошибка: ${e.message}</div>`;
  }
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function markCommentsAsRead() {
  lastCommentCheckDate = new Date().toISOString();
  localStorage.setItem('mangalib_lastCommentCheck', lastCommentCheckDate);
  alert('✅ Комментарии отмечены как прочитанные');
  if (selectedCommentsManga) loadComments();
}

async function addMangasByUrls(rawInput) {
  const btn = document.getElementById('addMangaBtn');
  const progress = document.getElementById('addProgress');
  
  if (!rawInput?.trim()) {
    alert('Введите ссылки');
    return;
  }
  
  let urls = rawInput
    .split(/[,\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .flatMap(s => s.split(/\s+/))
    .filter(Boolean);
  
  const cleanUrls = [];
  for (const url of urls) {
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.includes('mangalib.me/ru/manga/') && !cleanUrls.includes(cleanUrl)) {
      cleanUrls.push(cleanUrl);
    }
  }
  
  if (!cleanUrls.length) {
    alert('Не найдено корректных ссылок на мангу');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = `⏳ Добавление (0/${cleanUrls.length})...`;
  progress.style.display = 'block';
  
  let added = 0, failed = 0;
  
  for (let i = 0; i < cleanUrls.length; i++) {
    const url = cleanUrls[i];
    progress.innerHTML = `[${i+1}/${cleanUrls.length}] Загрузка: ${url.split('/').pop()}...`;
    btn.textContent = `⏳ Добавление (${i+1}/${cleanUrls.length})...`;
    
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'ADD_MANGA_BY_URL', url }, resolve);
      });
      
      if (response?.success) {
        added++;
        progress.innerHTML = `[${i+1}/${cleanUrls.length}] ✅ Добавлен: ${response.data.title}`;
        const recentlyAdded = JSON.parse(localStorage.getItem('mangalib_recently_added') || '[]');
        recentlyAdded.unshift(response.data);
        if (recentlyAdded.length > 10) recentlyAdded.pop();
        localStorage.setItem('mangalib_recently_added', JSON.stringify(recentlyAdded));
        updateRecentlyAdded();
      } else {
        failed++;
        progress.innerHTML = `[${i+1}/${cleanUrls.length}] ❌ Ошибка: ${response?.error || 'Не удалось добавить'}`;
      }
    } catch(e) {
      failed++;
      progress.innerHTML = `[${i+1}/${cleanUrls.length}] ❌ Ошибка: ${e.message}`;
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  await loadData();
  updateOverview();
  renderMangaList();
  
  progress.innerHTML = `✅ Готово: +${added} тайтлов, ошибок: ${failed}`;
  btn.textContent = '➕ Добавить все';
  
  setTimeout(() => {
    progress.style.display = 'none';
    btn.disabled = false;
    if (document.getElementById('mangaUrlsInput')) document.getElementById('mangaUrlsInput').value = '';
  }, 5000);
}

function updateRecentlyAdded() {
  const container = document.getElementById('recentlyAdded');
  if (!container) return;
  const recentlyAdded = JSON.parse(localStorage.getItem('mangalib_recently_added') || '[]');
  if (!recentlyAdded.length) {
    container.innerHTML = '<div class="empty">Нет недавно добавленных</div>';
    return;
  }
  container.innerHTML = recentlyAdded.map(m => `
    <div class="recently-added-item">
      <a href="${m.url}" target="_blank" class="recently-added-title">${m.title}</a>
      <span class="recently-added-stats">⭐ ${m.averageRating || '—'} | 📖 ${m.chapters || 0} глав</span>
    </div>
  `).join('');
}

async function updateAllMangas() {
  const updateBtn = document.getElementById('updateAllBtn');
  
  if (!updateBtn || !allMangas.length) return;
  
  updateBtn.disabled = true;
  updateBtn.textContent = '⏳ Обновление в фоне...';
  
  try {
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TRIGGER_UPDATE_ALL' }, (response) => {
        resolve(response);
      });
    });
    
    // Ждем немного после завершения фонового обновления
    await new Promise(r => setTimeout(r, 2000));
    
    await loadData();
    updateOverview();
    renderMangaList();
    
    alert('✅ Обновление завершено!');
  } catch (e) {
    alert('❌ Ошибка обновления: ' + e.message);
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = '🔄 Обновить все тайтлы';
  }
}

async function init() {
  const saved = localStorage.getItem('mangalib_recently_added');
  if (saved) updateRecentlyAdded();
  await updateOverview();
  renderMangaList();
  initEvents();
}

init();