// data-bridge.js - Handles data transformation for by-items tab

let currentChart = null;

const dimensionMeta = {
    '協調性': { icon: "👥", description: "自分だけという考えを持たず、仲間のために尽くせる人。" },
    '素直さ': { icon: "❤️", description: "人の意見をよく聞き、常に反省し、自分自身を見つめられる人。" },
    '積極性': { icon: "🚀", description: "原因を他人に求めず、できない理由をいうのではなく、どうしたらできるかを常に考える人。" },
    '明るさ': { icon: "☀️", description: "仕事上明るい人。(好奇心旺盛、すぐ声がでる、動作が機敏、目が輝いている)" },
    '礼儀正しさ': { icon: "🤝", description: "単に挨拶ができるだけでなく、気持ちのいい対応ができる人。" },
    '清潔さ': { icon: "🧹", description: "自分本位でなく、他人からどう見えているかを意識し行動できる人。" },
    '正確さ': { icon: "🎯", description: "決められたことは忠実に継続して守れる人。一つ一つのことがきっちりできる人。" },
    '懸命さ': { icon: "🔥", description: "なんにでも一生懸命に取り組める人。適当な仕事をしない人。" },
    '柔軟性': { icon: "🍃", description: "変化に対してやってみようと思える人。なんでも吸収しようとする人。" },
    'ホスピタリティー': { icon: "😊", description: "関わった人に幸せを与えられる人。「お蔭様」、「お互い様」という気持ちの持てる人。" }
};

let calculatedGrowData = {};
let globalEvaluations = [];
let globalMemberMap = {};
let availableMonths = [];
let currentGlobalMonth = 'all';

document.addEventListener('gasDataLoaded', (e) => {
    const apiData = e.detail;
    globalEvaluations = apiData.evaluations || [];
    const members = apiData.members || [];

    globalMemberMap = {};
    members.forEach(m => {
        const sq = String(m.squadNumber).trim();
        if (sq) {
            globalMemberMap[sq] = m.name || sq;
        }
    });

    // Extract available months
    const monthSet = new Set();
    globalEvaluations.forEach(r => {
        if (r.Target_Month) monthSet.add(r.Target_Month);
    });
    availableMonths = Array.from(monthSet).sort().reverse(); // newest first

    // Populate global month selector
    const globalMonthSelect = document.getElementById('globalMonthSelector');
    if (globalMonthSelect) {
        globalMonthSelect.innerHTML = '<option value="all">全期間 (All)</option>';
        availableMonths.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            globalMonthSelect.appendChild(opt);
        });
    }

    // Populate dist month select
    const distMonthSelect = document.getElementById('sc-dist-month-select');
    if (distMonthSelect) {
        distMonthSelect.innerHTML = '<option value="all">全期間 (All)</option>';
        availableMonths.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            distMonthSelect.appendChild(opt);
        });
    }

    // Populate radar checkboxes
    const radarCbContainer = document.getElementById('radar-month-checkboxes');
    if (radarCbContainer) {
        radarCbContainer.innerHTML = '';
        availableMonths.forEach((m, idx) => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '6px';
            label.style.color = '#f8fafc';
            label.style.fontSize = '0.8rem';
            label.style.cursor = 'pointer';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = m;
            cb.className = 'radar-month-cb';
            // Default check the first (newest) two months, or all if less than 2
            if (idx < 2) cb.checked = true;
            cb.onchange = () => { if(typeof scSelectedUserId !== 'undefined' && scSelectedUserId) renderScorecard(scSelectedUserId); };
            
            label.appendChild(cb);
            label.appendChild(document.createTextNode(m));
            radarCbContainer.appendChild(label);
        });
    }

    // データロード完了時に、まだ名前解決されていないログインユーザー情報があれば更新する
    if (typeof updateUserProfile === 'function') {
        updateUserProfile();
    }

    // Populate all chigiri feed
    const allChigiriContainer = document.getElementById('all-chigiri-container');
    if (allChigiriContainer) {
        allChigiriContainer.innerHTML = '';
        const membersWithChigiri = members.filter(m => m.chigiri && m.chigiri.trim() !== '');
        
        if (membersWithChigiri.length === 0) {
            allChigiriContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 10px;">契りを立てたメンバーはいません。</div>';
        } else {
            membersWithChigiri.forEach(m => {
                const card = document.createElement('div');
                card.style.background = 'rgba(255, 255, 255, 0.03)';
                card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                card.style.borderRadius = '8px';
                card.style.padding = '10px 12px';
                card.style.marginBottom = '6px';
                
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.gap = '8px';
                header.style.marginBottom = '6px';
                
                const nameStr = document.createElement('span');
                nameStr.style.fontWeight = 'bold';
                nameStr.style.color = 'var(--text-primary)';
                nameStr.style.fontSize = '0.9rem';
                nameStr.innerText = m.name;

                header.appendChild(nameStr);
                
                const chigiriText = document.createElement('div');
                chigiriText.style.color = 'var(--accent-amber)';
                chigiriText.style.fontSize = '0.85rem';
                chigiriText.style.lineHeight = '1.4';
                chigiriText.style.whiteSpace = 'pre-wrap';
                // HTML tags should be escaped, innerText does that
                chigiriText.innerText = m.chigiri;

                card.appendChild(header);
                card.appendChild(chigiriText);
                allChigiriContainer.appendChild(card);
            });
        }
    }

    // 初期計算
    recalculateGlobalStats('all');

    // Generate menu buttons for "by-items" tab
    const selectorGrid = document.getElementById('dim-selector-grid');
    if (selectorGrid) {
        selectorGrid.innerHTML = '';
        topics.forEach(topic => {
            const btn = document.createElement('button');
            btn.className = 'dim-btn';
            btn.style.padding = '8px 12px';
            btn.style.margin = '4px';
            btn.style.borderRadius = '8px';
            btn.style.border = '1px solid #334155';
            btn.style.background = '#1e293b';
            btn.style.color = '#94a3b8';
            btn.style.cursor = 'pointer';
            btn.innerHTML = `${dimensionMeta[topic].icon} ${topic}`;
            btn.onclick = () => {
                document.querySelectorAll('.dim-btn').forEach(b => {
                    b.style.color = '#94a3b8';
                    b.style.background = '#1e293b';
                });
                btn.style.color = '#fff';
                btn.style.background = '#38bdf8';
                renderByItemsTab(topic);
            };
            selectorGrid.appendChild(btn);
        });
    }

    // Default render if on by-items tab
    if (document.getElementById('tab-by-items').classList.contains('active')) {
        renderByItemsTab('協調性');
    }
});

window.onGlobalMonthChange = function() {
    const selector = document.getElementById('globalMonthSelector');
    if (selector) {
        currentGlobalMonth = selector.value;
        recalculateGlobalStats(currentGlobalMonth);
        
        // Refresh currently selected topic if in by-items tab
        const activeTopicBtn = document.querySelector('.dim-btn[style*="color: rgb(255, 255, 255)"]');
        let currentTopic = '協調性';
        if (activeTopicBtn) {
            currentTopic = activeTopicBtn.innerText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\s/g, '').trim(); // Remove icon
            // Make sure the topic actually matches the keys
            const validTopic = Object.keys(dimensionMeta).find(k => activeTopicBtn.innerText.includes(k));
            if(validTopic) currentTopic = validTopic;
        }
        renderByItemsTab(currentTopic);
    }
};

function recalculateGlobalStats(monthFilter) {
    const topics = Object.keys(dimensionMeta);
    const aggregated = {};

    globalEvaluations.forEach(row => {
        if (monthFilter !== 'all' && row.Target_Month !== monthFilter) return;

        const empId = String(row.Evaluatee_ID || '').trim();
        if (!empId) return;

        if (!aggregated[empId]) {
            aggregated[empId] = { empId, name: globalMemberMap[empId] || `背番号: ${empId}`, count: 0, scores: {} };
            topics.forEach(t => { aggregated[empId].scores[t] = 0; });
        }
        aggregated[empId].count += 1;
        topics.forEach(t => { aggregated[empId].scores[t] += (Number(row[t]) || 0); });
    });

    const resultList = Object.values(aggregated).map(emp => {
        const avgScores = {};
        topics.forEach(t => {
            avgScores[t] = Number((emp.scores[t] / emp.count).toFixed(2));
        });
        return { empId: emp.empId, name: emp.name, avgScores };
    });

    calculatedGrowData = {};
    topics.forEach((topic, idx) => {
        const scores = resultList.map(r => r.avgScores[topic]).filter(s => !isNaN(s));
        const totalUsers = scores.length;
        const average = totalUsers > 0 ? scores.reduce((a, b) => a + b, 0) / totalUsers : 0;
        
        // Distribution 1 to 10
        const distribution = Array(10).fill(0);
        scores.forEach(s => {
            const bucket = Math.min(Math.max(Math.floor(s) - 1, 0), 9);
            distribution[bucket]++;
        });

        // Ranking top 5
        const sorted = [...resultList].sort((a, b) => b.avgScores[topic] - a.avgScores[topic]);
        const ranking = sorted.slice(0, 5).map(r => ({ name: r.name, score: r.avgScores[topic] }));

        calculatedGrowData[topic] = {
            id: idx + 1,
            name: topic,
            icon: dimensionMeta[topic].icon,
            description: dimensionMeta[topic].description,
            average: average,
            totalUsers: totalUsers,
            distribution: distribution,
            ranking: ranking
        };
    });
}

window.renderByItemsTab = function(topic) {
    if (!calculatedGrowData[topic]) return;
    const data = calculatedGrowData[topic];

    const badge = document.getElementById('itemBadge');
    if(badge) badge.innerText = `GROW10 - 指針 ⑩-${data.id}`;
    
    const title = document.getElementById('itemTitle');
    if(title) title.innerText = data.name;
    
    const desc = document.getElementById('itemDescription');
    if(desc) desc.innerText = data.description;
    
    const avg = document.getElementById('statAverage');
    if(avg) avg.innerHTML = `${data.average.toFixed(1)} <span style="font-size: 16px; color: #94a3b8; font-weight: normal;">/ 10.0</span>`;
    
    const users = document.getElementById('statTotalUsers');
    if(users) users.innerHTML = `${data.totalUsers} <span style="font-size: 16px; color: #94a3b8; font-weight: normal;">人</span>`;

    const rankingBody = document.getElementById('rankingBody');
    if (rankingBody) {
        rankingBody.innerHTML = '';
        data.ranking.forEach((user, index) => {
            const rankNum = index + 1;
            let rankColor = '#334155';
            let rankTextColor = '#f8fafc';
            if (rankNum === 1) { rankColor = '#fbbf24'; rankTextColor = '#1e293b'; }
            else if (rankNum === 2) { rankColor = '#94a3b8'; rankTextColor = '#1e293b'; }
            else if (rankNum === 3) { rankColor = '#d97706'; rankTextColor = '#1e293b'; }

            const rankBadge = `<div style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; background-color: ${rankColor}; color: ${rankTextColor};">${rankNum}</div>`;
            rankingBody.innerHTML += `<tr><td style="padding: 14px 12px; border-bottom: 1px solid #334155;">${rankBadge}</td><td style="padding: 14px 12px; border-bottom: 1px solid #334155; color: #f8fafc;">${user.name}</td><td style="padding: 14px 12px; border-bottom: 1px solid #334155; text-align: right; font-weight: bold; color: #38bdf8;">${user.score.toFixed(1)}</td></tr>`;
        });
    }

    const ctx = document.getElementById('growChart');
    if (ctx) {
        if (currentChart) currentChart.destroy();
        currentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['1点', '2点', '3点', '4点', '5点', '6点', '7点', '8点', '9点', '10点'],
                datasets: [{ 
                    data: data.distribution, 
                    backgroundColor: '#38bdf8', 
                    hoverBackgroundColor: '#0ea5e9', 
                    borderRadius: 6 
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                }
            }
        });
    }
}

// ====== SCORECARD LOGIC ======
let scRadar = null;
let scDist = null;
let scTrend = null;

let scSelectedUserId = null;
let scOverallAverages = {};

document.addEventListener('gasDataLoaded', (e) => {
    const apiData = e.detail;
    const { evaluations = [], members = [] } = apiData;

    // Calculate overall averages for all dimensions
    const topics = Object.keys(dimensionMeta);
    const overallCounts = {};
    topics.forEach(t => { scOverallAverages[t] = 0; overallCounts[t] = 0; });
    let totalScoreSum = 0;
    let totalScoreCount = 0;

    evaluations.forEach(row => {
        topics.forEach(t => {
            const val = Number(row[t]);
            if (!isNaN(val)) {
                scOverallAverages[t] += val;
                overallCounts[t]++;
                totalScoreSum += val;
                totalScoreCount++;
            }
        });
    });

    topics.forEach(t => {
        if (overallCounts[t] > 0) scOverallAverages[t] /= overallCounts[t];
    });
    scOverallAverages['総合'] = totalScoreCount > 0 ? (totalScoreSum / totalScoreCount) : 0;

    // Populate dropdown
    const select = document.getElementById('scorecard-member-select');
    if (select) {
        select.innerHTML = '';
        const allowedCategories = ['member', 'assistant', 'chief', 'core'];
        const filteredMembers = members.filter(m => {
            const cat = String(m.category || '').toLowerCase().trim();
            return allowedCategories.includes(cat);
        });
        
        filteredMembers.forEach(m => {
            if (m.squadNumber) {
                const opt = document.createElement('option');
                opt.value = m.squadNumber;
                opt.text = `${m.name || m.squadNumber} (${m.squadNumber})`;
                select.appendChild(opt);
            }
        });
        if (filteredMembers.length > 0) {
            const userStr = sessionStorage.getItem('grow10_current_user');
            const currentUser = userStr ? JSON.parse(userStr) : null;
            let initialUser = filteredMembers[0].squadNumber;
            if (currentUser && filteredMembers.some(m => String(m.squadNumber) === String(currentUser.id))) {
                initialUser = currentUser.id;
            }
            scSelectedUserId = initialUser;
            select.value = scSelectedUserId;
            renderScorecard(scSelectedUserId);
        }
    }
});

window.onScorecardMemberChange = function() {
    const select = document.getElementById('scorecard-member-select');
    if (select) {
        scSelectedUserId = select.value;
        renderScorecard(scSelectedUserId);
    }
};

window.renderScorecard = function(userId) {
    if (!window.globalApiData) return;
    const { evaluations = [], members = [] } = window.globalApiData;
    const topics = Object.keys(dimensionMeta);

    const member = members.find(m => String(m.squadNumber) === String(userId)) || { name: 'Unknown', squadNumber: userId };
    
    // User stats
    const userEvals = evaluations.filter(r => String(r.Evaluatee_ID) === String(userId));
    
    // For distribution
    const allUserScores = [];
    const distTopicSelect = document.getElementById('sc-dist-topic-select');
    const selectedDistTopic = distTopicSelect ? distTopicSelect.value : '総合';
    const distMonthSelect = document.getElementById('sc-dist-month-select');
    const selectedDistMonth = distMonthSelect ? distMonthSelect.value : 'all';
    
    // For trend
    const trendDataByMonth = {};

    // For Radar Chart
    const radarDataByMonth = {};
    const selectedRadarMonths = Array.from(document.querySelectorAll('.radar-month-cb:checked')).map(cb => cb.value);

    userEvals.forEach(row => {
        const month = row.Target_Month || 'Unknown';
        
        // Accumulate trend data
        if (!trendDataByMonth[month]) trendDataByMonth[month] = { sum: 0, count: 0 };
        // Accumulate radar data
        if (!radarDataByMonth[month]) {
             radarDataByMonth[month] = { scores: {}, counts: {} };
             topics.forEach(t => { radarDataByMonth[month].scores[t] = 0; radarDataByMonth[month].counts[t] = 0; });
        }

        let rowSum = 0;
        let rowCount = 0;

        topics.forEach(t => {
            const val = Number(row[t]);
            if (!isNaN(val)) {
                radarDataByMonth[month].scores[t] += val;
                radarDataByMonth[month].counts[t]++;
                
                // ヒストグラム用のデータ収集
                if (selectedDistMonth === 'all' || selectedDistMonth === month) {
                    if (selectedDistTopic === '総合') {
                        allUserScores.push(val); 
                    } else if (selectedDistTopic === t) {
                        allUserScores.push(val); 
                    }
                }

                rowSum += val;
                rowCount++;
            }
        });

        if (rowCount > 0) {
            trendDataByMonth[month].sum += (rowSum / rowCount);
            trendDataByMonth[month].count++;
        }
    });

    // Radar Chart Datasets
    const radarDatasets = [];
    const colors = [
        { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' }, // Blue
        { border: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' }, // Green
        { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' }, // Amber
        { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' }, // Pink
        { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' }  // Violet
    ];

    selectedRadarMonths.forEach((m, idx) => {
        if (!radarDataByMonth[m]) return;
        const color = colors[idx % colors.length];
        const data = topics.map(t => radarDataByMonth[m].counts[t] > 0 ? (radarDataByMonth[m].scores[t] / radarDataByMonth[m].counts[t]) : 0);
        
        radarDatasets.push({
            label: m,
            data: data,
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 2,
            pointBackgroundColor: color.border,
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: color.border
        });
    });

    // Radar Chart
    const ctxRadar = document.getElementById('scChartRadar');
    if (ctxRadar) {
        if (scRadar) scRadar.destroy();
        scRadar = new Chart(ctxRadar.getContext('2d'), {
            type: 'radar',
            data: {
                labels: topics,
                datasets: radarDatasets
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0, max: 10,
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#f8fafc', font: { size: 12 } },
                        ticks: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#f8fafc' } }
                }
            }
        });
    }

    // Update Header
    document.getElementById('sc-user-name').innerText = member.name;
    document.getElementById('sc-user-id').innerText = member.squadNumber;
    
    // Update Table
    const tbody = document.getElementById('sc-details-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        let totalUSum = 0;
        let totalAvgSum = 0;
        let topicCount = 0;

        topics.forEach(t => {
            // Recalculate average for the specific topic based on selected radar months
            let uSum = 0;
            let uCnt = 0;
            selectedRadarMonths.forEach(m => {
                 if (radarDataByMonth[m] && radarDataByMonth[m].counts[t] > 0) {
                     uSum += radarDataByMonth[m].scores[t];
                     uCnt += radarDataByMonth[m].counts[t];
                 }
            });
            const uAvg = uCnt > 0 ? (uSum / uCnt) : 0;
            const globalAvg = scOverallAverages[t] || 0;
            
            totalUSum += uAvg;
            totalAvgSum += globalAvg;
            topicCount++;

            const diff = uAvg - globalAvg;
            const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
            const diffSign = diff > 0 ? '+' : '';
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #cbd5e1;">
                  <td style="padding: 12px 24px; border-right: 1px solid #cbd5e1; font-weight: bold;">${t}</td>
                  <td style="padding: 12px 24px; border-right: 1px solid #cbd5e1; font-size: 1.2rem; font-weight: bold; color: #0284c7;">${uAvg.toFixed(2)}</td>
                  <td style="padding: 12px 24px; font-weight: bold; color: ${diffColor};">${diffSign}${diff.toFixed(2)}</td>
                </tr>
            `;
        });

        if (topicCount > 0) {
            const overallUAvg = totalUSum / topicCount;
            const overallGAvg = totalAvgSum / topicCount;
            const overallDiff = overallUAvg - overallGAvg;
            const overallDiffColor = overallDiff >= 0 ? '#10b981' : '#ef4444';
            const overallDiffSign = overallDiff > 0 ? '+' : '';
            
            // Update the large score circle in the header
            const totalScoreEl = document.getElementById('sc-total-score');
            if (totalScoreEl) {
                totalScoreEl.innerText = overallUAvg.toFixed(1);
            }

            // Add "総合" as the top row (or bottom row, prepending it to be prominent)
            const overallHtml = `
                <tr style="border-bottom: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.05);">
                  <td style="padding: 14px 24px; border-right: 1px solid #cbd5e1; font-weight: 800; color: #38bdf8; font-size: 1.1rem;">★ 総合評価</td>
                  <td style="padding: 14px 24px; border-right: 1px solid #cbd5e1; font-size: 1.3rem; font-weight: 900; color: #0284c7;">${overallUAvg.toFixed(2)}</td>
                  <td style="padding: 14px 24px; font-weight: 900; font-size: 1.1rem; color: ${overallDiffColor};">${overallDiffSign}${overallDiff.toFixed(2)}</td>
                </tr>
            `;
            tbody.innerHTML = overallHtml + tbody.innerHTML;
        }
    }

    // Dist Chart
    const ctxDist = document.getElementById('scChartDist');
    if (ctxDist) {
        if (scDist) scDist.destroy();
        const dist = Array(10).fill(0);
        allUserScores.forEach(s => {
            const bucket = Math.min(Math.max(Math.floor(s) - 1, 0), 9);
            dist[bucket]++;
        });
        scDist = new Chart(ctxDist.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['1点', '2点', '3点', '4点', '5点', '6点', '7点', '8点', '9点', '10点'],
                datasets: [{ 
                    data: dist, 
                    backgroundColor: '#60a5fa', 
                    borderRadius: 4 
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
                    x: { grid: { display: false }, ticks: { color: '#64748b' } }
                }
            }
        });
    }

    // Trend Chart
    const ctxTrend = document.getElementById('scChartTrend');
    if (ctxTrend) {
        if (scTrend) scTrend.destroy();
        const months = Object.keys(trendDataByMonth).sort();
        const trendAverages = months.map(m => trendDataByMonth[m].sum / trendDataByMonth[m].count);

        scTrend = new Chart(ctxTrend.getContext('2d'), {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: '総合平均推移',
                    data: trendAverages,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.3,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6'
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 10, grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
                    x: { grid: { display: false }, ticks: { color: '#64748b' } }
                }
            }
        });
    }
};

window.onScorecardDistTopicChange = function() {
    if (scSelectedUserId) {
        renderScorecard(scSelectedUserId);
    }
};
