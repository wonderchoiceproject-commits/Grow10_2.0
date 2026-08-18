function renderDashboardGoals(user) {
    if (!window.globalApiData || !window.globalApiData.members) return;
    const member = window.globalApiData.members.find(m => String(m.squadNumber) === String(user.id));
    
    const container = document.getElementById('monthly-goal-items-container');
    if (!container) return;
    
    if (container.innerHTML.trim() === '' && typeof dimensionMeta !== 'undefined') {
        const topics = Object.keys(dimensionMeta);
        topics.forEach(t => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '4px';
            label.style.fontSize = '0.85rem';
            label.style.color = '#e2e8f0';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = t;
            
            label.appendChild(cb);
            label.appendChild(document.createTextNode(t));
            container.appendChild(label);
        });
    }
    
    if (member) {
        document.getElementById('monthly-goal-text').value = member.monthly_goal || member.monthlyGoal || '';
        const chigiriStr = member.chigiri || '';
        const chigiriArr = chigiriStr.split(',').map(s => s.trim());
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = chigiriArr.includes(cb.value);
        });
    }
}

function saveMonthlyGoal() {
    const userStr = sessionStorage.getItem('grow10_current_user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    
    const container = document.getElementById('monthly-goal-items-container');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const chigiri = [];
    checkboxes.forEach(cb => {
        if (cb.checked) chigiri.push(cb.value);
    });
    
    const goalText = document.getElementById('monthly-goal-text').value;
    const btn = document.querySelector('button[onclick="saveMonthlyGoal()"]');
    const originalText = btn.innerText;
    btn.innerText = '保存中...';
    btn.disabled = true;
    
    window.supabaseClient
        .from('members')
        .update({ chigiri: chigiri.join(','), monthly_goal: goalText })
        .eq('squad_number', user.id)
        .then(res => {
            btn.innerText = originalText;
            btn.disabled = false;
            if (res.error) throw new Error(res.error.message);
            alert('目標を保存しました。');
            
            const m = window.globalApiData.members.find(x => String(x.squadNumber) === String(user.id));
            if (m) {
                m.chigiri = chigiri.join(',');
                m.monthly_goal = goalText;
            }
        })
        .catch(err => {
            btn.innerText = originalText;
            btn.disabled = false;
            alert('エラーが発生しました: ' + err.message);
        });
}
