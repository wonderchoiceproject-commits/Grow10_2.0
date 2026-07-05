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

document.addEventListener('gasDataLoaded', (e) => {
    const apiData = e.detail;
    const { evaluations = [], members = [] } = apiData;

    const memberMap = {};
    members.forEach(m => {
        const sq = String(m.squadNumber).trim();
        if (sq) {
            memberMap[sq] = m.name || sq;
        }
    });

    // データロード完了時に、まだ名前解決されていないログインユーザー情報があれば更新する
    if (typeof updateUserProfile === 'function') {
        updateUserProfile();
    }

    const topics = Object.keys(dimensionMeta);
    const aggregated = {};

    evaluations.forEach(row => {
        const empId = String(row.Evaluatee_ID || '').trim();
        if (!empId) return;

        if (!aggregated[empId]) {
            aggregated[empId] = { empId, name: memberMap[empId] || `背番号: ${empId}`, count: 0, scores: {} };
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
    const userScores = {};
    const userCounts = {};
    let userTotalSum = 0;
    let userTotalCount = 0;

    // For distribution
    const allUserScores = [];
    const distTopicSelect = document.getElementById('sc-dist-topic-select');
    const selectedDistTopic = distTopicSelect ? distTopicSelect.value : '総合';
    
    // For trend
    const trendDataByMonth = {};

    topics.forEach(t => { userScores[t] = 0; userCounts[t] = 0; });

    userEvals.forEach(row => {
        const month = row.Target_Month || 'Unknown';
        if (!trendDataByMonth[month]) trendDataByMonth[month] = { sum: 0, count: 0 };

        let rowSum = 0;
        let rowCount = 0;

        topics.forEach(t => {
            const val = Number(row[t]);
            if (!isNaN(val)) {
                userScores[t] += val;
                userCounts[t]++;
                userTotalSum += val;
                userTotalCount++;
                
                // ヒストグラム用のデータ収集
                if (selectedDistTopic === '総合') {
                    allUserScores.push(val); // 総合の場合は全項目のスコアを全て入れる（または平均にする等の仕様があるが、既存に合わせて全スコアを入れる）
                } else if (selectedDistTopic === t) {
                    allUserScores.push(val); // 選択された項目のスコアだけを入れる
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

    const userAvg = {};
    topics.forEach(t => {
        userAvg[t] = userCounts[t] > 0 ? (userScores[t] / userCounts[t]) : 0;
    });
    const userTotalAvg = userTotalCount > 0 ? (userTotalSum / userTotalCount) : 0;

    // Update Header
    document.getElementById('sc-user-name').innerText = member.name;
    document.getElementById('sc-user-id').innerText = member.squadNumber;
    document.getElementById('sc-total-score').innerText = userTotalAvg.toFixed(2);
    document.getElementById('sc-user-chigiri').innerText = "自分自身の限界を超え、チームの成長に貢献する。"; // Mock

    // Update Table
    const tbody = document.getElementById('sc-details-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        topics.forEach(t => {
            const diff = userAvg[t] - scOverallAverages[t];
            const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
            const diffSign = diff > 0 ? '+' : '';
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #cbd5e1;">
                  <td style="padding: 12px 24px; border-right: 1px solid #cbd5e1; font-weight: bold;">${t}</td>
                  <td style="padding: 12px 24px; border-right: 1px solid #cbd5e1; font-size: 1.2rem; font-weight: bold; color: #0284c7;">${userAvg[t].toFixed(2)}</td>
                  <td style="padding: 12px 24px; font-weight: bold; color: ${diffColor};">${diffSign}${diff.toFixed(2)}</td>
                </tr>
            `;
        });
    }

    // Radar Chart
    const ctxRadar = document.getElementById('scChartRadar');
    if (ctxRadar) {
        if (scRadar) scRadar.destroy();
        scRadar = new Chart(ctxRadar.getContext('2d'), {
            type: 'radar',
            data: {
                labels: topics,
                datasets: [
                    {
                        label: '個人平均',
                        data: topics.map(t => userAvg[t]),
                        backgroundColor: 'rgba(56, 189, 248, 0.4)',
                        borderColor: '#38bdf8',
                        pointBackgroundColor: '#38bdf8',
                        borderWidth: 2
                    },
                    {
                        label: '全体平均',
                        data: topics.map(t => scOverallAverages[t]),
                        backgroundColor: 'rgba(148, 163, 184, 0.2)',
                        borderColor: '#94a3b8',
                        pointBackgroundColor: '#94a3b8',
                        borderWidth: 1,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 10,
                        ticks: { stepSize: 2, display: false },
                        grid: { color: '#e2e8f0' },
                        pointLabels: { font: { size: 12 }, color: '#475569' }
                    }
                }
            }
        });
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
                    y: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
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
                    y: { min: 0, max: 10, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
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
