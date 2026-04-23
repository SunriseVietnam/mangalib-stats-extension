// popup.js - только отображение данных, без обновлений

let allMangas = [];
let manga1History = [];
let manga2History = [];
let manga1Data = null;
let manga2Data = null;
let currentSearch = '';
let recentlyAdded = [];

// Загрузка данных
async function loadData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_STATS' }, (response) => {
      if (response && response.success) {
        allMangas = response.data || [];
        console.log('Загружено тайтлов:', allMangas.length);
        resolve(allMangas);
      } else {
        allMangas = [];
        resolve([]);
      }
    });
  });
}

async function loadMangaHistory(mangaId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_MANGA_HISTORY', mangaId: mangaId }, (response) => {
      resolve(response?.data || []);
    });
  });
}

function formatNumber(num) {
  if (!num && num !== 0) return '0';
  return num.toLocaleString('ru-RU');
}

function formatNumberFull(num) {
  if (!num && num !== 0) return '0';
  return num.toLocaleString('ru-RU');
}

// Обновление общей статистики
async function updateOverview() {
  await loadData();
  
  const topRated = [...allMangas]
    .filter(m => m.averageRating)
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 5);
  
  const topRatedDiv = document.getElementById('topRated');
  if (topRatedDiv) {
    topRatedDiv.innerHTML = topRated.map((m, i) => `
      <div class="top-item">
        <span class="top-rank">${i+1}</span>
        <span class="top-title">${m.title}</span>
        <span class="top-rating">⭐ ${m.averageRating}</span>
        <span class="top-votes">(${formatNumber(m.votesCount)} оценок)</span>
      </div>
    `).join('') || '<div class="empty">Нет данных</div>';
  }
  
  const recent = [...allMangas].slice(0, 10);
  const recentDiv = document.getElementById('recentList');
  if (recentDiv) {
    recentDiv.innerHTML = recent.map(m => `
      <div class="recent-item">
        <a href="${m.url}" target="_blank" class="recent-title">${m.title}</a>
        <span class="recent-date">${new Date(m.lastVisited).toLocaleDateString('ru-RU')}</span>
        <span class="recent-stats">⭐ ${m.averageRating || '—'} | 📖 ${m.chapters || 0} глав</span>
      </div>
    `).join('') || '<div class="empty">Нет данных</div>';
  }
  
  const totalSpan = document.getElementById('totalCount');
  if (totalSpan) totalSpan.textContent = `${allMangas.length} тайтлов`;
}

// Рендер списка с кнопкой удаления
function renderMangaList() {
  let filtered = [...allMangas];
  if (currentSearch) {
    filtered = filtered.filter(m => m.title.toLowerCase().includes(currentSearch.toLowerCase()));
  }
  
  const container = document.getElementById('mangaList');
  if (!container) return;
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty">Нет тайтлов</div>';
    return;
  }
  
  container.innerHTML = filtered.map(m => `
    <div class="manga-card">
      <div class="manga-card-header">
        <a href="${m.url}" target="_blank" class="manga-title">${m.title}</a>
        <span class="manga-rating">⭐ ${m.averageRating || '—'}</span>
      </div>
      <div class="manga-card-stats">
        <span>📖 ${m.chapters || 0} глав</span>
        <span>🗳️ ${formatNumber(m.votesCount)} оценок</span>
        <span>📊 ${formatNumber(m.totalInLists)} в списках</span>
      </div>
      <div class="manga-card-lists">
        <span class="list-badge">📖 Читаю: ${formatNumber(m.listStats?.reading)}</span>
        <span class="list-badge">📅 В планах: ${formatNumber(m.listStats?.planned)}</span>
        <span class="list-badge">✅ Прочитано: ${formatNumber(m.listStats?.completed)}</span>
        <span class="list-badge">❤️ Любимые: ${formatNumber(m.listStats?.favorite)}</span>
        <span class="list-badge">❌ Брошено: ${formatNumber(m.listStats?.dropped)}</span>
        <span class="list-badge">📌 Другое: ${formatNumber(m.listStats?.other)}</span>
      </div>
      <div class="manga-card-footer">
        <span class="manga-status">${m.status || '—'}</span>
        <span class="manga-visits">👁️ ${m.visitCount || 1} раз</span>
        <button class="btn-history" data-id="${m.id}" data-title="${m.title.replace(/"/g, '&quot;')}">📈 История</button>
        <button class="btn-delete" data-id="${m.id}" data-title="${m.title.replace(/"/g, '&quot;')}">🗑 Удалить</button>
      </div>
    </div>
  `).join('');
  
  // Обработчики для кнопок истории
  document.querySelectorAll('.btn-history').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const title = btn.dataset.title;
      const manga = allMangas.find(m => m.id === id);
      if (manga) {
        document.querySelector('.tab-btn[data-tab="history"]').click();
        setTimeout(async () => {
          manga1Data = manga;
          manga1History = await loadMangaHistory(id);
          const infoDiv = document.getElementById('selectedManga1Info');
          if (infoDiv) infoDiv.innerHTML = `✅ ${title}`;
          document.getElementById('searchManga1').value = title;
          await drawChart();
        }, 100);
      }
    });
  });
  
  // Обработчики для кнопок удаления
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const title = btn.dataset.title;
      
      if (confirm(`Удалить "${title}" из статистики?`)) {
        chrome.runtime.sendMessage({ type: 'DELETE_MANGA', mangaId: id }, async (response) => {
          if (response && response.success) {
            await loadData();
            updateOverview();
            renderMangaList();
            
            if (manga1Data && manga1Data.id === id) {
              manga1Data = null;
              manga1History = [];
              document.getElementById('selectedManga1Info').innerHTML = 'Тайтл 1 не выбран';
              document.getElementById('searchManga1').value = '';
            }
            if (manga2Data && manga2Data.id === id) {
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
// Отрисовка графика с тултипами для двух тайтлов (от минимального значения)
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
  
  let filtered1 = (manga1History || []).filter(h => h.date >= cutoffStr);
  let filtered2 = (manga2History || []).filter(h => h.date >= cutoffStr);
  
  let allDates;
  if (manga2Data) {
    allDates = [...new Set([...filtered1.map(h => h.date), ...filtered2.map(h => h.date)])].sort();
  } else {
    allDates = filtered1.map(h => h.date).sort();
  }
  
  if (allDates.length === 0) {
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Нет исторических данных', width / 2, height / 2);
    return;
  }
  
  const map1 = new Map(filtered1.map(h => [h.date, h]));
  const map2 = new Map(filtered2.map(h => [h.date, h]));
  
  let data1 = [], data2 = [];
  for (const date of allDates) {
    const h1 = map1.get(date);
    const h2 = map2.get(date);
    if (metric === 'averageRating') {
      data1.push(h1?.averageRating ?? null);
      data2.push(h2?.averageRating ?? null);
    } else if (metric === 'votesCount') {
      data1.push(h1?.votesCount ?? null);
      data2.push(h2?.votesCount ?? null);
    } else if (metric === 'totalInLists') {
      data1.push(h1?.totalInLists ?? null);
      data2.push(h2?.totalInLists ?? null);
    } else {
      data1.push(h1?.listStats?.[metric] ?? null);
      data2.push(h2?.listStats?.[metric] ?? null);
    }
  }
  
  const labels = allDates.map(d => {
    const date = new Date(d);
    return `${date.getDate()}.${date.getMonth()+1}`;
  });
  
  // Собираем все валидные значения
  const validValues1 = data1.filter(v => v !== null);
  const validValues2 = data2.filter(v => v !== null);
  const allValidValues = [...validValues1];
  if (manga2Data) {
    allValidValues.push(...validValues2);
  }
  
  if (allValidValues.length === 0) {
    ctx.fillStyle = '#a6adc8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для отображения', width / 2, height / 2);
    return;
  }
  
  // Находим минимальное и максимальное значение
  const maxValue = Math.max(...allValidValues);
  const minValue = Math.min(...allValidValues);
  const range = maxValue - minValue;
  
  // Добавляем небольшой отступ сверху и снизу (10% от диапазона)
  const paddingPercent = 0.1;
  let yMin = minValue - (range * paddingPercent);
  let yMax = maxValue + (range * paddingPercent);
  
  // Для оценок (0-10) используем фиксированный диапазон
  if (metric === 'averageRating') {
    yMin = Math.max(0, yMin);
    yMax = Math.min(10, yMax);
    if (yMax - yMin < 1) {
      yMin = Math.max(0, yMin - 0.02);
      yMax = Math.min(10, yMax + 0.02);
    }
  }
  
  // Если значения одинаковые, добавляем отступ
  if (yMax === yMin) {
    yMin = yMin - (yMin * 0.1);
    yMax = yMax + (yMax * 0.1);
    if (yMin === yMax) {
      yMin = 0;
      yMax = yMax * 2 || 10;
    }
  }
  
  const finalMin = yMin;
  const finalMax = yMax;
  const finalRange = finalMax - finalMin;
  
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
  
  // Рисуем сетку (5 линий)
  ctx.strokeStyle = '#45475a';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
  
  // Подписи Y
  ctx.fillStyle = '#a6adc8';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const value = finalMax - (ratio * finalRange);
    let displayValue;
    if (metric === 'averageRating') {
      displayValue = value.toFixed(2);
    } else if (value >= 1000000) {
      displayValue = (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      displayValue = (value / 1000).toFixed(1) + 'K';
    } else {
      displayValue = Math.round(value).toString();
    }
    const y = padding.top + (graphH / 4) * i;
    ctx.fillText(displayValue, padding.left - 5, y + 3);
  }
  
  // Подписи X
  ctx.textAlign = 'center';
  ctx.font = '9px system-ui';
  const step = graphW / (labels.length - 1 || 1);
  labels.forEach((label, i) => {
    const x = padding.left + step * i;
    ctx.fillText(label, x, height - padding.bottom + 15);
  });
  
  const drawLine = (data, color, title, pointsArray) => {
    if (data.every(v => v === null)) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    let first = true;
    data.forEach((val, i) => {
      if (val === null) { first = true; return; }
      const normalizedY = (val - finalMin) / finalRange;
      const y = padding.top + graphH - (normalizedY * graphH);
      const x = padding.left + step * i;
      pointsArray.push({ x, y, value: val, label: labels[i], title: title, color: color });
      if (first) { ctx.moveTo(x, y); first = false; }
      else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    data.forEach((val, i) => {
      if (val === null) return;
      const normalizedY = (val - finalMin) / finalRange;
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
  
  const metricNames = {
    averageRating: '⭐ Оценка', votesCount: '📊 Количество оценок', totalInLists: '📚 Всего в списках',
    reading: '📖 Читаю', planned: '📅 В планах', completed: '✅ Прочитано',
    favorite: '❤️ Любимые', dropped: '❌ Брошено', other: '📌 Другое'
  };
  
  // Очищаем массив точек перед рисованием
  const points1 = [];
  const points2 = [];
  
  drawLine(data1, '#89b4fa', manga1Data.title, points1);
  
  if (manga2Data) {
    drawLine(data2, '#f9e2af', manga2Data.title, points2);
  }
  
  // Объединяем все точки
  const allPointsArray = [...points1, ...points2];
  
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
  
  // Обработчик движения мыши для тултипов
  const handleMousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Ищем ближайшую точку
    let closestPoint = null;
    let minDist = 15; // Радиус обнаружения
    
    for (const point of allPointsArray) {
      const dist = Math.hypot(mouseX - point.x, mouseY - point.y);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }
    
    if (closestPoint) {
      let value = closestPoint.value;
      if (metric === 'averageRating') {
        value = value.toFixed(2);
      } else {
        value = formatNumberFull(value);
      }
      showTooltip(e.clientX, e.clientY, `${value}`);
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
  
  tooltip.innerHTML = `${text}`;
  
  // Получаем размеры тултипа
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Базовая позиция (справа и выше от курсора)
  let left = x + 15;
  let top = y - 40;
  
  // Корректировка, если тултип выходит за правый край
  if (left + tooltipRect.width > viewportWidth - 10) {
    left = x - tooltipRect.width - 15;
  }
  
  // Корректировка, если тултип выходит за левый край
  if (left < 10) {
    left = 10;
  }
  
  // Корректировка, если тултип выходит за верхний край
  if (top < 10) {
    top = y + 20;
  }
  
  // Корректировка, если тултип выходит за нижний край
  if (top + tooltipRect.height > viewportHeight - 10) {
    top = viewportHeight - tooltipRect.height - 10;
  }
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.display = 'block';
}

function hideTooltip() {
  const tooltip = document.getElementById('chart-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

async function updateChart() {
  setTimeout(drawChart, 50);
}

function setupMangaSearch(inputId, listId, isManga1) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  
  input.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    let filtered = allMangas.filter(m => m.title.toLowerCase().includes(search)).slice(0, 8);
    
    if (isManga1 && manga2Data) {
      filtered = filtered.filter(m => m.id !== manga2Data.id);
    }
    if (!isManga1 && manga1Data) {
      filtered = filtered.filter(m => m.id !== manga1Data.id);
    }
    
    list.innerHTML = filtered.map(m => `
      <div class="manga-select-item" data-id="${m.id}" data-title="${m.title}" data-info='${JSON.stringify(m)}'>
        <strong>${m.title}</strong>
        <span class="manga-select-stats">⭐ ${m.averageRating || '—'}</span>
      </div>
    `).join('');
    
    list.querySelectorAll('.manga-select-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const title = item.dataset.title;
        const info = JSON.parse(item.dataset.info);
        
        if (isManga1) {
          if (manga2Data && manga2Data.id === id) {
            alert('Этот тайтл уже выбран как Тайтл 2');
            return;
          }
          manga1Data = info;
          manga1History = await loadMangaHistory(id);
          document.getElementById('selectedManga1Info').innerHTML = `✅ ${title}`;
        } else {
          if (manga1Data && manga1Data.id === id) {
            alert('Этот тайтл уже выбран как Тайтл 1');
            return;
          }
          manga2Data = info;
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
  // Кнопка обновления всех тайтлов
const updateAllBtn = document.getElementById('updateAllBtn');
if (updateAllBtn) {
  updateAllBtn.addEventListener('click', updateAllMangas);
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
}

// Обновление всех тайтлов
async function updateAllMangas() {
  const updateBtn = document.getElementById('updateAllBtn');
  const progressSpan = document.getElementById('updateProgress');
  
  if (!updateBtn || allMangas.length === 0) return;
  
  updateBtn.disabled = true;
  updateBtn.textContent = '⏳ Обновление...';
  progressSpan.style.display = 'inline';
  progressSpan.textContent = 'Подготовка...';
  
  const mangasToUpdate = [...allMangas];
  let updated = 0;
  let failed = 0;
  
  for (let i = 0; i < mangasToUpdate.length; i++) {
    const manga = mangasToUpdate[i];
    progressSpan.textContent = `[${i+1}/${mangasToUpdate.length}] ${manga.title.substring(0, 35)}...`;
    
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          type: 'UPDATE_SINGLE_MANGA', 
          mangaId: manga.id, 
          mangaUrl: manga.url 
        }, resolve);
      });
      
      if (response && response.success) {
        updated++;
        console.log(`[MangaLib] Обновлён: ${manga.title}`);
      } else {
        failed++;
        console.log(`[MangaLib] Ошибка: ${manga.title}`);
      }
    } catch(e) {
      console.error('Ошибка обновления:', manga.title, e);
      failed++;
    }
    
    // Задержка между запросами
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // Перезагружаем данные
  await loadData();
  updateOverview();
  renderMangaList();
  
  progressSpan.textContent = `✅ Готово: ${updated} обновлено, ${failed} ошибок`;
  
  updateBtn.disabled = false;
  updateBtn.textContent = '🔄 Обновить все тайтлы';
  
  setTimeout(() => {
    progressSpan.style.display = 'none';
    progressSpan.textContent = '';
  }, 5000);
}

async function init() {
  await updateOverview();
  renderMangaList();
  initEvents();
}

init();