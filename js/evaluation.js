// evaluation.js - 投票・評価タブのロジック

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

async function initEvaluationTab(evaluatorId) {
    const errorEl = document.getElementById('formError');
    if(errorEl) errorEl.textContent = '';
    
    const container = document.getElementById('evaluateesContainer');
    if(container) container.innerHTML = '<div style="text-align:center; padding: 40px; color:#64748b;">対象者を取得中...</div>';
    document.getElementById('evaluationForm').style.display = 'block';
    document.getElementById('successSection').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'block';

    try {
        if (!window.supabaseClient) throw new Error('Supabaseが初期化されていません。');

        // 最新の評価期間(open, close)をSupabaseから直接取得して検証
        const { data: periodSettings } = await window.supabaseClient.from('settings').select('*');
        if (periodSettings) {
            const openRow = periodSettings.find(row => row.key === 'open');
            const closeRow = periodSettings.find(row => row.key === 'close');
            
            const toDateVal = (val) => {
                if (!val) return '';
                const cleaned = String(val).replace(/[年月]/g, '-').replace(/\//g, '-').replace(/日/g, '').trim();
                const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
            };
            
            const openDate = openRow ? toDateVal(openRow.value) : '';
            const closeDate = closeRow ? toDateVal(closeRow.value) : '';
            
            if (openDate && closeDate) {
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;
                
                if (todayStr < openDate || todayStr > closeDate) {
                    if (container) {
                        container.innerHTML = `
                            <div style="text-align:center; padding: 40px 20px; color:#ef4444; font-weight:bold; font-size:1.15rem; border: 1px dashed #fca5a5; border-radius: 12px; background: #fef2f2; max-width: 500px; margin: 20px auto;">
                              現在は評価期間外です。<br>
                              <span style="font-size:0.9rem; font-weight:normal; color:#475569; margin-top:8px; display:inline-block;">評価可能期間： ${openDate} 〜 ${closeDate}</span>
                            </div>
                        `;
                    }
                    const submitBtn = document.getElementById('submitBtn');
                    if (submitBtn) submitBtn.style.display = 'none';
                    return;
                }
            }
        }

        const { data: deptData, error: deptErr } = await window.supabaseClient.from('departments').select('*');
        if (deptErr) throw deptErr;
        const deptNameMap = {};
        const validGrowIds = new Set();
        (deptData || []).forEach(d => {
            if (d.id && d.name) {
                deptNameMap[d.id] = d.name;
                const isFeature = d.feature === true || String(d.feature).toUpperCase() === 'TRUE' || d.feature === 1 || String(d.feature).trim() === '〇';
                if (isFeature) {
                    validGrowIds.add(d.id);
                }
            }
        });

        const { data: members, error: membersErr } = await window.supabaseClient.from('members').select('*');
        if (membersErr) throw membersErr;

        const mappedMembers = members.map(m => ({
            ...m,
            squadNumber: m.squad_number || m.squadNumber || m.ID || m.id,
            category: m.category || m.role || 'member',
            departmentIds: m.departmentIds || m.department_ids || ''
        }));

        const evaluator = mappedMembers.find(m => String(m.squadNumber).trim() === String(evaluatorId).trim());
        if (!evaluator) throw new Error('あなたのユーザー情報が見つかりません。');
        
        if (evaluator.answered === true || String(evaluator.answered).toUpperCase() === 'TRUE') {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color:#10b981; font-weight:bold;">今月の評価アンケートは回答済みです。ご協力ありがとうございました！</div>';
            document.getElementById('submitBtn').style.display = 'none';
            return;
        }

        const CATEGORY_RANKS = { 'member': 1, 'assistant': 2, 'assitant': 2, 'chief': 3, 'core': 4, 'admin': 5 };
        const rank = CATEGORY_RANKS[String(evaluator.category).toLowerCase()];
        if (!rank || rank < 1) {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444;">評価権限がありません（Memberランク以上が必要です）。</div>';
            document.getElementById('submitBtn').style.display = 'none';
            return;
        }

        const evaluatorAttributes = (evaluator.departmentIds || '').split(/[\s,]+/).filter(id => id && validGrowIds.has(id));
        const evaluatees = [];

        for (const member of mappedMembers) {
          if (String(member.squadNumber) === String(evaluator.squadNumber)) continue;
          const mRank = CATEGORY_RANKS[String(member.category).toLowerCase()];
          if (!mRank || mRank < 1) continue;

          const memberAttributes = (member.departmentIds || '').split(/[\s,]+/).filter(id => id && validGrowIds.has(id));
          const commonAttributes = evaluatorAttributes.filter(attr => memberAttributes.includes(attr));

          if (commonAttributes.length > 0) {
            const commonAttributeNames = commonAttributes.map(id => deptNameMap[id] || id);
            evaluatees.push({
              squadNumber: member.squadNumber,
              name: member.name,
              commonAttributes: commonAttributeNames
            });
          }
        }

        if (evaluatees.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color:#64748b;">あなたが評価すべき対象者は現在いません。</div>';
            document.getElementById('submitBtn').style.display = 'none';
            return;
        }

        evaluateesList = evaluatees;
        document.getElementById('submitBtn').style.display = 'inline-flex';

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
        if(container) container.innerHTML = `<div style="text-align:center; padding: 40px; color:#ef4444;">エラー: ${err.message}</div>`;
        document.getElementById('submitBtn').style.display = 'none';
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
  if(!container) return;
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
    commentGroup.style.marginTop = '20px';
    commentGroup.innerHTML = `
      <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">定性コメント（自由記入）</label>
      <textarea style="width: 100%; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: inherit; font-size: 1rem; transition: all 0.2s; background-color: #f8fafc; resize: vertical; min-height: 100px;" name="comment_${person.squadNumber}" placeholder="${person.name}さんの素晴らしい点や改善点をご記入ください..." oninput="updateComment(this, '${person.squadNumber}')">${state.comment}</textarea>
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
    group.style.marginBottom = '16px';
    group.innerHTML = `
      <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">${person.name}さんへのコメント</label>
      <textarea style="width: 100%; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: inherit; font-size: 1rem; transition: all 0.2s; background-color: #f8fafc; resize: vertical; min-height: 100px;" name="comment_${person.squadNumber}" placeholder="素晴らしい点や改善点をご記入ください..." oninput="updateComment(this, '${person.squadNumber}')">${evaluationState[person.squadNumber].comment}</textarea>
    `;
    cBody.appendChild(group);
  });
  
  commentCard.appendChild(cHeader);
  commentCard.appendChild(cBody);
  container.appendChild(commentCard);
}


window.toggleTooltip = function(element, event) {
  const isActive = element.classList.contains('tooltip-active');
  document.querySelectorAll('.info-icon.tooltip-active').forEach(el => {
    el.classList.remove('tooltip-active');
  });
  if (!isActive) element.classList.add('tooltip-active');
  event.stopPropagation();
}

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

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('evaluationForm');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = document.getElementById('formError');
            if(errorEl) errorEl.textContent = '';
            
            let isValid = true;
            evaluateesList.forEach(person => {
                METRICS.forEach(metric => {
                    if (evaluationState[person.squadNumber].untouched[metric]) {
                        isValid = false;
                    }
                });
            });

            if (!isValid) {
                if(errorEl) errorEl.textContent = '未入力の評価項目があります。すべての項目のスライダーを操作して点数を決定してください。（5点の場合でも一度クリックしてください）';
                return;
            }

            const btn = document.getElementById('submitBtn');
            const originalText = btn.innerText;
            btn.innerText = '送信中...';
            btn.disabled = true;

            try {
                const userStr = sessionStorage.getItem('grow10_current_user');
                if(!userStr) throw new Error("ログインしていません");
                const user = JSON.parse(userStr);

                // 送信時にも評価期間を再チェック
                const { data: periodCheck } = await window.supabaseClient.from('settings').select('*');
                if (periodCheck) {
                    const openRow = periodCheck.find(row => row.key === 'open');
                    const closeRow = periodCheck.find(row => row.key === 'close');
                    const toDateVal = (val) => {
                        if (!val) return '';
                        const cleaned = String(val).replace(/[年月]/g, '-').replace(/\//g, '-').replace(/日/g, '').trim();
                        const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                        return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
                    };
                    const openDate = openRow ? toDateVal(openRow.value) : '';
                    const closeDate = closeRow ? toDateVal(closeRow.value) : '';
                    if (openDate && closeDate) {
                        const today = new Date();
                        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                        if (todayStr < openDate || todayStr > closeDate) {
                            throw new Error(`現在は評価期間外です（評価可能期間: ${openDate} 〜 ${closeDate}）`);
                        }
                    }
                }

                const { data: settingsData, error: settingsErr } = await window.supabaseClient.from('settings').select('*');
                let targetMonth = '';
                if (!settingsErr && settingsData) {
                    const settingRow = settingsData.find(row => row.key === 'Current_Month' || row.key === 'Target_Month');
                    if (settingRow) {
                        targetMonth = settingRow.value;
                    }
                }

                const rowsToInsert = evaluateesList.map(person => {
                    const st = evaluationState[person.squadNumber];
                    return {
                        target_month: targetMonth,
                        evaluator_id: user.id,
                        evaluatee_id: person.squadNumber,
                        attributes: person.commonAttributes.join(', '),
                        score_cooperation: st.scores['協調性'],
                        score_honesty: st.scores['素直さ'],
                        score_proactivity: st.scores['積極性'],
                        score_cheerfulness: st.scores['明るさ'],
                        score_politeness: st.scores['礼儀正しさ'],
                        score_cleanliness: st.scores['清潔さ'],
                        score_accuracy: st.scores['正確さ'],
                        score_diligence: st.scores['懸命さ'],
                        score_flexibility: st.scores['柔軟性'],
                        score_hospitality: st.scores['ホスピタリティー'],
                        comment: st.comment
                    };
                });

                const { error: insertErr } = await window.supabaseClient.from('evaluations').insert(rowsToInsert);
                if (insertErr) throw new Error('評価の保存に失敗しました: ' + insertErr.message);

                const { error: updateErr } = await window.supabaseClient.from('members')
                    .update({ answered: true })
                    .eq('squad_number', user.id);
                if (updateErr) throw new Error('回答状態の更新に失敗しました: ' + updateErr.message);

                document.getElementById('evaluationForm').style.display = 'none';
                document.getElementById('successSection').classList.remove('hidden');
                document.getElementById('successSection').style.display = 'block';

            } catch (err) {
                if(errorEl) errorEl.textContent = '送信に失敗しました: ' + err.message;
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});

window.initEvaluationTab = initEvaluationTab;
