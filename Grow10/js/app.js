let currentEvaluatorId = '';
let evaluateesList = [];
let currentViewMode = 'person';
let evaluationState = {};

const METRIC_DESCRIPTIONS = {
  '協調性': '自分だけという考えを持たず、仲間のために尽くせる人。',
  '素直さ': '人の意見を良く聞き、常に反省し、自分自身を見つめられる人。',
  '積極性': '原因を他人に求めず、出来ない理由を言うのではなく、どうしたらできるかを常に考える人。',
  '明るさ': '仕事上で明るい人（好奇心旺盛、すぐ声が出る、動作が機敏、目が輝いている）。',
  '礼儀正しさ': '単に挨拶ができるだけでなく、気持ちの良い対応ができる人。',
  '清潔さ': '自分本位でなく、他人からどう見えるかを意識し行動できる人。',
  '正確さ': '決められた事は忠実に継続して守れる人。一つ一つの事がきっちりできる人。',
  '懸命さ': '何にでも一生懸命に取り組める人。適当な仕事をしない人。',
  '柔軟性': '変化に対してやってみようと思える人、何でも吸収しようとする人。',
  'ホスピタリティー': '関わった人に幸せを与えられる人。「お蔭様」「お互い様」という気持ちの持てる人。'
};

const METRICS = [
  '協調性', '素直さ', '積極性', '明るさ', '礼儀正しさ', 
  '清潔さ', '正確さ', '懸命さ', '柔軟性', 'ホスピタリティー'
];

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const squadInput = document.getElementById('squadNumber');
  const form = document.getElementById('evaluationForm');
  const resetBtn = document.getElementById('resetBtn');

  if(squadInput) squadInput.focus();

  if(loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
    squadInput.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') handleLogin();
    });
  }

  if(form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  if(resetBtn) {
    resetBtn.addEventListener('click', resetApp);
  }
});

function showLoader(text = '処理中...') { 
  const loader = document.getElementById('loader');
  loader.querySelector('.loader-text').textContent = text;
  loader.classList.remove('hidden'); 
}
function hideLoader() { 
  document.getElementById('loader').classList.add('hidden'); 
}

async function handleLogin() {
  const squadNumber = document.getElementById('squadNumber').value.trim();
  const errorEl = document.getElementById('loginError');
  
  if (!squadNumber) {
    errorEl.textContent = '背番号を入力してください。';
    return;
  }
  
  if(GAS_API_URL === 'YOUR_GAS_WEB_APP_URL_HERE') {
    errorEl.textContent = 'js/api.js の GAS_API_URL を実際のものに設定してください。';
    return;
  }

  errorEl.textContent = '';
  showLoader('対象者を取得中...');

  try {
    const res = await API.fetchEvaluatees(squadNumber);
    hideLoader();

    if (res.error) {
      errorEl.textContent = res.error;
      return;
    }

    currentEvaluatorId = squadNumber;
    evaluateesList = res.evaluatees;
    
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = res.evaluatorName + ' さん';
    document.getElementById('userAvatar').textContent = res.evaluatorName.charAt(0);

    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('evaluationSection').classList.remove('hidden');

    evaluationState = {};
    evaluateesList.forEach(person => {
      evaluationState[person.squadNumber] = {
        scores: {}, untouched: {}, comment: ''
      };
      METRICS.forEach(metric => {
        evaluationState[person.squadNumber].scores[metric] = 5;
        evaluationState[person.squadNumber].untouched[metric] = true;
      });
    });

    renderEvaluationForms();
  } catch (err) {
    hideLoader();
    errorEl.textContent = err.message;
  }
}

window.switchViewMode = function(mode) {
  if (currentViewMode === mode) return;
  currentViewMode = mode;
  document.getElementById('toggleViewPerson').classList.toggle('active', mode === 'person');
  document.getElementById('toggleViewMetric').classList.toggle('active', mode === 'metric');
  renderEvaluationForms();
}

function renderEvaluationForms() {
  const container = document.getElementById('evaluateesContainer');
  container.innerHTML = '';
  if (currentViewMode === 'person') {
    renderByPersonView(container);
  } else {
    renderByMetricView(container);
  }
}

function renderByPersonView(container) {
  evaluateesList.forEach((person, personIndex) => {
    const state = evaluationState[person.squadNumber];
    const card = document.createElement('div');
    card.className = 'eval-card';
    if (personIndex === 0) card.classList.add('expanded');
    
    const header = document.createElement('div');
    header.className = 'eval-card-header';
    header.onclick = () => toggleCard(card);
    
    const badgesHtml = (person.commonAttributes || []).map(attr => `<span class="attr-badge">${attr}</span>`).join('');
    const isCompleted = METRICS.every(m => !state.untouched[m]);

    header.innerHTML = `
      <div class="eval-card-title">
        ${person.name} 
        <span style="font-size: 0.85rem; color: #64748b; font-weight: normal;">(ID: ${person.squadNumber})</span>
        <div class="attr-badges">${badgesHtml}</div>
      </div>
      <div style="display:flex; align-items:center; gap: 12px;">
        <span class="status-badge ${isCompleted ? 'completed' : ''}" id="badge-${person.squadNumber}">${isCompleted ? '入力完了' : '未入力'}</span>
        <div class="toggle-icon">▼</div>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'eval-card-body';
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'metrics-grid';

    METRICS.forEach(metric => {
      const isUntouched = state.untouched[metric];
      const score = state.scores[metric];
      const metricItem = document.createElement('div');
      metricItem.className = 'metric-item';
      
      const desc = METRIC_DESCRIPTIONS[metric] || '';
      let marksHtml = '';
      for (let i = 0; i <= 10; i++) marksHtml += `<span>${i}</span>`;
      
      const percent = (score / 10) * 100;
      const bgStyle = isUntouched ? '' : `style="background: linear-gradient(to right, #818cf8 ${percent}%, #e2e8f0 ${percent}%)"`;

      metricItem.innerHTML = `
        <div class="metric-header">
          <div class="metric-name-wrapper">
            <span class="metric-name">${metric}</span>
            <span class="info-icon" data-tooltip="${desc}" onclick="toggleTooltip(this, event)">?</span>
          </div>
          <span class="metric-score-display ${isUntouched ? 'untouched-score' : ''}" id="score_${person.squadNumber}_${metric}">${isUntouched ? '未評価' : score}</span>
        </div>
        <div class="slider-container">
          <input type="range" class="score-slider ${isUntouched ? 'untouched' : ''}" ${bgStyle} name="${person.squadNumber}_${metric}" min="0" max="10" step="1" value="${score}" oninput="updateSlider(this, '${person.squadNumber}', '${metric}')">
          <div class="slider-marks">${marksHtml}</div>
        </div>
      `;
      metricsGrid.appendChild(metricItem);
    });

    const commentGroup = document.createElement('div');
    commentGroup.className = 'form-group';
    commentGroup.innerHTML = `
      <label>定性コメント（自由記入）</label>
      <textarea name="comment_${person.squadNumber}" placeholder="${person.name}さんの素晴らしい点や改善点をご記入ください..." oninput="updateComment(this, '${person.squadNumber}')">${state.comment}</textarea>
    `;

    body.appendChild(metricsGrid);
    body.appendChild(commentGroup);
    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function renderByMetricView(container) {
  METRICS.forEach((metric, metricIndex) => {
    const card = document.createElement('div');
    card.className = 'eval-card';
    if (metricIndex === 0) card.classList.add('expanded');
    
    const header = document.createElement('div');
    header.className = 'eval-card-header';
    header.onclick = () => toggleCard(card);
    
    header.innerHTML = `
      <div class="eval-card-title">
        ${metric}
        <span class="info-icon" style="margin-left:8px;" data-tooltip="${METRIC_DESCRIPTIONS[metric]}" onclick="toggleTooltip(this, event)">?</span>
      </div>
      <div class="toggle-icon">▼</div>
    `;

    const body = document.createElement('div');
    body.className = 'eval-card-body';
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'metrics-grid';

    evaluateesList.forEach(person => {
      const state = evaluationState[person.squadNumber];
      const isUntouched = state.untouched[metric];
      const score = state.scores[metric];
      
      const personItem = document.createElement('div');
      personItem.className = 'metric-item';
      
      let marksHtml = '';
      for (let i = 0; i <= 10; i++) marksHtml += `<span>${i}</span>`;
      
      const percent = (score / 10) * 100;
      const bgStyle = isUntouched ? '' : `style="background: linear-gradient(to right, #818cf8 ${percent}%, #e2e8f0 ${percent}%)"`;

      personItem.innerHTML = `
        <div class="metric-header">
          <div class="metric-name-wrapper">
            <span class="metric-name">${person.name}</span>
          </div>
          <span class="metric-score-display ${isUntouched ? 'untouched-score' : ''}" id="score_${person.squadNumber}_${metric}">${isUntouched ? '未評価' : score}</span>
        </div>
        <div class="slider-container">
          <input type="range" class="score-slider ${isUntouched ? 'untouched' : ''}" ${bgStyle} name="${person.squadNumber}_${metric}" min="0" max="10" step="1" value="${score}" oninput="updateSlider(this, '${person.squadNumber}', '${metric}')">
          <div class="slider-marks">${marksHtml}</div>
        </div>
      `;
      metricsGrid.appendChild(personItem);
    });

    body.appendChild(metricsGrid);
    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });

  const commentCard = document.createElement('div');
  commentCard.className = 'eval-card expanded';
  
  const cHeader = document.createElement('div');
  cHeader.className = 'eval-card-header';
  cHeader.onclick = () => toggleCard(commentCard);
  cHeader.innerHTML = `
    <div class="eval-card-title">定性コメント（自由記入）</div>
    <div class="toggle-icon">▼</div>
  `;
  
  const cBody = document.createElement('div');
  cBody.className = 'eval-card-body';
  
  evaluateesList.forEach(person => {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.marginBottom = '16px';
    group.innerHTML = `
      <label>${person.name}さんへのコメント</label>
      <textarea name="comment_${person.squadNumber}" placeholder="素晴らしい点や改善点をご記入ください..." oninput="updateComment(this, '${person.squadNumber}')">${evaluationState[person.squadNumber].comment}</textarea>
    `;
    cBody.appendChild(group);
  });
  
  commentCard.appendChild(cHeader);
  commentCard.appendChild(cBody);
  container.appendChild(commentCard);
}


window.toggleTooltip = function(element, event) {
  const isActive = element.classList.contains('tooltip-active');
  
  // 他の開いているツールチップをすべて閉じる
  document.querySelectorAll('.info-icon.tooltip-active').forEach(el => {
    el.classList.remove('tooltip-active');
  });

  if (!isActive) {
    element.classList.add('tooltip-active');
  }
  
  event.stopPropagation();
}

// ツールチップの外側をタップしたら閉じる
document.addEventListener('click', () => {
  document.querySelectorAll('.info-icon.tooltip-active').forEach(el => {
    el.classList.remove('tooltip-active');
  });
});

window.toggleCard = function(cardElement) {
  if (cardElement.classList.contains('expanded')) {
    cardElement.classList.remove('expanded');
  } else {
    cardElement.classList.add('expanded');
  }
}

window.checkCompletion = function(squadNumber) {
  const badge = document.getElementById(`badge-${squadNumber}`);
  if (!badge) return;
  const state = evaluationState[squadNumber];
  const allFilled = METRICS.every(m => !state.untouched[m]);

  if (allFilled) {
    badge.textContent = '入力完了';
    badge.classList.add('completed');
  } else {
    badge.textContent = '未入力';
    badge.classList.remove('completed');
  }
}

window.updateSlider = function(slider, squadNumber, metric) {
  slider.classList.remove('untouched');
  const display = document.getElementById(`score_${squadNumber}_${metric}`);
  if (display) {
    display.textContent = slider.value;
    display.classList.remove('untouched-score');
  }
  
  const percentage = (slider.value / 10) * 100;
  slider.style.background = `linear-gradient(to right, #818cf8 ${percentage}%, #e2e8f0 ${percentage}%)`;
  
  evaluationState[squadNumber].scores[metric] = parseInt(slider.value, 10);
  evaluationState[squadNumber].untouched[metric] = false;
  
  checkCompletion(squadNumber);
}

window.updateComment = function(textarea, squadNumber) {
  evaluationState[squadNumber].comment = textarea.value;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('formError');
  errorEl.textContent = '';

  let isValid = true;
  evaluateesList.forEach(person => {
    METRICS.forEach(metric => {
      if (evaluationState[person.squadNumber].untouched[metric]) {
        isValid = false;
      }
    });
  });

  if (!isValid) {
    errorEl.textContent = '未入力の評価項目があります。すべての項目のスライダーを操作して点数を決定してください。（5点の場合でも一度クリックしてください）';
    return;
  }

  const evaluations = [];
  evaluateesList.forEach(person => {
    evaluations.push({
      evaluateeId: person.squadNumber,
      commonAttributes: person.commonAttributes || [],
      scores: evaluationState[person.squadNumber].scores,
      comment: evaluationState[person.squadNumber].comment.trim()
    });
  });

  const payload = {
    evaluatorId: currentEvaluatorId,
    evaluations: evaluations
  };

  showLoader('データ送信中...');

  try {
    const res = await API.submitEvaluations(payload);
    hideLoader();

    if (res.error) {
      errorEl.textContent = res.error;
      return;
    }

    document.getElementById('evaluationSection').classList.add('hidden');
    document.getElementById('successSection').classList.remove('hidden');
    document.getElementById('userInfo').classList.add('hidden');
  } catch(err) {
    hideLoader();
    errorEl.textContent = err.message;
  }
}

function resetApp() {
  currentEvaluatorId = '';
  evaluateesList = [];
  document.getElementById('squadNumber').value = '';
  document.getElementById('loginError').textContent = '';
  
  document.getElementById('successSection').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
}
