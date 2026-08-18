let allResponses = [];
let membersMap = {};
let radarChartInstance = null;
let barChartInstance = null;

const METRICS = [
  '協調性', '素直さ', '積極性', '明るさ', '礼儀正しさ', 
  '清潔さ', '正確さ', '懸命さ', '柔軟性', 'ホスピタリティー'
];

document.addEventListener('DOMContentLoaded', async () => {
  if(GAS_API_URL === 'YOUR_GAS_WEB_APP_URL_HERE') {
    alert('js/api.js の GAS_API_URL を設定してください。');
    return;
  }
  
  showLoader('集計データを取得中...');
  try {
    const res = await API.fetchDashboardData();
    hideLoader();
    if (res.error) {
      alert(res.error);
      return;
    }
    allResponses = res.responses || [];
    membersMap = res.membersMap || {};
    initDashboard();
  } catch(e) {
    hideLoader();
    alert(e.message);
  }
});

function showLoader(text) {
  const loader = document.getElementById('loader');
  if(loader) {
    loader.querySelector('.loader-text').textContent = text;
    loader.classList.remove('hidden');
  }
}
function hideLoader() {
  const loader = document.getElementById('loader');
  if(loader) loader.classList.add('hidden');
}

function initDashboard() {
  populateFilters();
  drawOverallBarChart();
  
  document.getElementById('personFilter').addEventListener('change', (e) => {
    const personId = e.target.value;
    document.getElementById('attributeFilter').value = ''; // 属性フィルターをリセット
    updatePersonView(personId);
  });
  
  document.getElementById('attributeFilter').addEventListener('change', (e) => {
    const attr = e.target.value;
    document.getElementById('personFilter').value = ''; // 個人フィルターをリセット
    updateAttributeView(attr);
  });
  
  const monthlyUpdateBtn = document.getElementById('monthlyUpdateBtn');
  if (monthlyUpdateBtn) {
    monthlyUpdateBtn.addEventListener('click', async () => {
      const month = prompt('次回の評価月を入力してください（例: 2026-07）');
      if (!month) return;
      const deadline = prompt('回答締め切りを入力してください（例: 2026-07-25）');
      if (!deadline) return;

      if (confirm(`以下の内容で月次更新（Settings更新＆answeredクリア）を実行しますか？\n\n対象月: ${month}\n締め切り: ${deadline}`)) {
        showLoader('月次更新を実行中...');
        try {
          const res = await API.updateMonthlySettings(month, deadline);
          hideLoader();
          if (res.error) {
            alert(res.error);
          } else {
            alert('月次更新が完了しました。');
            location.reload();
          }
        } catch (e) {
          hideLoader();
          alert(e.message);
        }
      }
    });
  }
}

function populateFilters() {
  const personSelect = document.getElementById('personFilter');
  const attrSelect = document.getElementById('attributeFilter');
  
  // 個人のリスト生成
  const evaluateeIds = [...new Set(allResponses.map(r => r.evaluateeId))];
  evaluateeIds.forEach(id => {
    const name = membersMap[id] || `ID:${id}`;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${name} (${id})`;
    personSelect.appendChild(opt);
  });
  
  // 属性のリスト生成
  const allAttrs = [];
  allResponses.forEach(r => {
    (r.attributes || []).forEach(a => {
      if(a && !allAttrs.includes(a)) allAttrs.push(a);
    });
  });
  allAttrs.sort().forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    attrSelect.appendChild(opt);
  });
}

function calcAverages(responses) {
  if(!responses || responses.length === 0) return Array(METRICS.length).fill(0);
  const sums = Array(METRICS.length).fill(0);
  
  responses.forEach(r => {
    METRICS.forEach((m, i) => {
      sums[i] += (r.scores[m] || 0);
    });
  });
  
  return sums.map(s => (s / responses.length).toFixed(1));
}

function updatePersonView(personId) {
  if(!personId) {
    drawOverallBarChart();
    return;
  }
  
  const personResponses = allResponses.filter(r => r.evaluateeId === personId);
  const personAvgs = calcAverages(personResponses);
  const overallAvgs = calcAverages(allResponses);
  const name = membersMap[personId] || personId;
  
  drawRadarChart([
    { label: `${name}さんの平均`, data: personAvgs, color: '#4f46e5' },
    { label: '全体平均', data: overallAvgs, color: '#94a3b8' }
  ]);
  
  drawBarChart([
    { label: `${name}さんのスコア`, data: personAvgs, color: '#10b981' }
  ], `${name}さんの項目別平均`);
  
  renderComments(personResponses);
}

function updateAttributeView(attr) {
  if(!attr) {
    drawOverallBarChart();
    return;
  }
  
  const attrResponses = allResponses.filter(r => (r.attributes || []).includes(attr));
  const attrAvgs = calcAverages(attrResponses);
  const overallAvgs = calcAverages(allResponses);
  
  drawRadarChart([
    { label: `属性「${attr}」の平均`, data: attrAvgs, color: '#f59e0b' },
    { label: '全体平均', data: overallAvgs, color: '#94a3b8' }
  ]);
  
  drawBarChart([
    { label: `属性「${attr}」の平均`, data: attrAvgs, color: '#f59e0b' }
  ], `属性「${attr}」の項目別平均`);
  
  renderComments(attrResponses);
}

function drawOverallBarChart() {
  const overallAvgs = calcAverages(allResponses);
  drawRadarChart([{ label: '全体平均', data: overallAvgs, color: '#94a3b8' }]);
  drawBarChart([{ label: '全体平均', data: overallAvgs, color: '#3b82f6' }], '全社 項目別平均');
  renderComments([]);
}

function drawRadarChart(datasets) {
  const ctx = document.getElementById('radarChart').getContext('2d');
  if (radarChartInstance) radarChartInstance.destroy();
  
  const chartDatasets = datasets.map(ds => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: hexToRgbA(ds.color, 0.2),
    borderColor: ds.color,
    pointBackgroundColor: ds.color,
    borderWidth: 2
  }));

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: METRICS,
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2 }
        }
      }
    }
  });
}

function drawBarChart(datasets, titleText) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChartInstance) barChartInstance.destroy();
  
  const chartDatasets = datasets.map(ds => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: ds.color,
    borderRadius: 4
  }));

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: METRICS,
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: !!titleText, text: titleText }
      },
      scales: {
        y: { min: 0, max: 10 }
      }
    }
  });
}

function renderComments(responses) {
  const container = document.getElementById('commentsContainer');
  container.innerHTML = '';
  
  const validComments = responses.filter(r => r.comment && r.comment.trim() !== '');
  
  if(validComments.length === 0) {
    container.innerHTML = '<p class="text-muted">コメントはありません。</p>';
    return;
  }
  
  validComments.forEach(r => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    const evalName = membersMap[r.evaluatorId] || r.evaluatorId;
    const date = new Date(r.timestamp).toLocaleDateString('ja-JP');
    
    // 属性の表示も追加
    const attrText = (r.attributes && r.attributes.length) ? `[枠: ${r.attributes.join(', ')}]` : '';
    
    div.innerHTML = `
      <div class="comment-meta">評価者: ${evalName} (${date}) <span style="color:#f59e0b">${attrText}</span></div>
      <div>${r.comment.replace(/\n/g, '<br>')}</div>
    `;
    container.appendChild(div);
  });
}

function hexToRgbA(hex, alpha){
  let c;
  if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
    c= hex.substring(1).split('');
    if(c.length== 3){
      c= [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c= '0x'+c.join('');
    return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
  }
  return `rgba(0,0,0,${alpha})`;
}
