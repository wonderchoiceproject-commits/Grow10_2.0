// ====== DATA FETCHING LOGIC ======
let isDataLoaded = false;
let pendingLoginUserId = null;

async function fetchDashboardData() {
    try {
        if (!window.supabaseClient) throw new Error("Supabase is not initialized");

        // 1. Fetch settings
        const { data: settingsData, error: settingsErr } = await window.supabaseClient.from('settings').select('*');
        if (settingsErr) throw settingsErr;
        const settingsObj = {};
        if (settingsData) {
            settingsData.forEach(row => {
                if (row.key) {
                    settingsObj[row.key] = row.value;
                }
            });
        }
        
        // Dynamically update overall goal on the dashboard
        const titleEl = document.getElementById('overall-goal-title');
        const reasonEl = document.getElementById('overall-goal-reason');
        if (titleEl && settingsObj['overall_goal']) {
            titleEl.innerText = settingsObj['overall_goal'];
        }
        if (reasonEl && settingsObj['overall_goal_reason']) {
            reasonEl.innerText = settingsObj['overall_goal_reason'];
        }

        let publishedMonth = settingsObj['publish_month'] || settingsObj['Publish_Month'] || '';

        // 2. Fetch evaluations
        let allEvalData = [];
        let evalPage = 0;
        const limit = 1000;
        while (true) {
            let evalQuery = window.supabaseClient.from('evaluations').select('*').range(evalPage * limit, (evalPage + 1) * limit - 1);
            if (publishedMonth) {
                 evalQuery = evalQuery.lte('target_month', publishedMonth);
            }
            const { data: pageData, error: pageErr } = await evalQuery;
            if (pageErr) throw pageErr;
            if (pageData && pageData.length > 0) {
                allEvalData = allEvalData.concat(pageData);
            }
            if (!pageData || pageData.length < limit) break;
            evalPage++;
        }
        
        const mappedEvaluations = allEvalData.map(ev => ({
            ...ev,
            Target_Month: ev.target_month || ev.Target_Month,
            Evaluator_ID: ev.evaluator_id || ev.Evaluator_ID,
            Evaluatee_ID: ev.evaluatee_id || ev.Evaluatee_ID,
            Attributes: ev.attributes || ev.Attributes,
            '協調性': ev.score_cooperation !== undefined ? ev.score_cooperation : ev['協調性'],
            '素直さ': ev.score_honesty !== undefined ? ev.score_honesty : ev['素直さ'],
            '積極性': ev.score_proactivity !== undefined ? ev.score_proactivity : ev['積極性'],
            '明るさ': ev.score_cheerfulness !== undefined ? ev.score_cheerfulness : ev['明るさ'],
            '礼儀正しさ': ev.score_politeness !== undefined ? ev.score_politeness : ev['礼儀正しさ'],
            '清潔さ': ev.score_cleanliness !== undefined ? ev.score_cleanliness : ev['清潔さ'],
            '正確さ': ev.score_accuracy !== undefined ? ev.score_accuracy : ev['正確さ'],
            '懸命さ': ev.score_diligence !== undefined ? ev.score_diligence : ev['懸命さ'],
            '柔軟性': ev.score_flexibility !== undefined ? ev.score_flexibility : ev['柔軟性'],
            'ホスピタリティー': ev.score_hospitality !== undefined ? ev.score_hospitality : ev['ホスピタリティー']
        }));

        // 3. Fetch members
        const { data: membersData, error: membersErr } = await window.supabaseClient.from('members').select('*');
        if (membersErr) throw membersErr;

        // 4. Fetch departments
        const { data: deptData, error: deptErr } = await window.supabaseClient.from('departments').select('*');
        if (deptErr) throw deptErr;

        const featuredDepartments = (deptData || [])
            .filter(d => d.feature === true || String(d.feature).toUpperCase() === 'TRUE' || d.feature === 1 || String(d.feature).trim() === '〇')
            .map(d => ({
              id: String(d.id).trim(),
              name: String(d.name || d.id).trim()
            }));

        const mappedMembers = (membersData || []).map(m => ({
            ...m,
            squadNumber: m.squad_number || m.squadNumber || m.ID || m.id,
            category: m.category || m.role || 'member',
            departmentIds: m.department_ids || m.departmentIds || ''
        }));

        const data = {
            success: true,
            evaluations: mappedEvaluations,
            members: mappedMembers,
            featuredDepartments: featuredDepartments,
            departments: deptData || [],
            settings: settingsObj
        };

        window.globalApiData = data;
        isDataLoaded = true;
        document.dispatchEvent(new CustomEvent('gasDataLoaded', { detail: data }));

        if (pendingLoginUserId) {
            const input = document.getElementById('login-user-input');
            if (input) input.value = pendingLoginUserId;
            pendingLoginUserId = null;
            switchUser();
        }

        // Render Dashboard parts if active
        const tabDeptDashboard = document.getElementById('tab-dept-dashboard');
        if (tabDeptDashboard && tabDeptDashboard.style.display !== 'none') {
            renderDepartmentDashboard();
        }

    } catch (err) {
        console.error("Fetch error:", err);
        isDataLoaded = true;
        document.dispatchEvent(new CustomEvent('gasDataError', { detail: err }));
    }
}

// ====== UI RENDERING =====
function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));

    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) targetPane.style.display = 'block';

    const targetNav = document.getElementById('nav-' + tabId);
    if (targetNav) targetNav.classList.add('active');

    // Dynamically render on switch
    if (tabId === 'admin') {
        renderMainAdminMembers();
    } else if (tabId === 'grow10-admin') {
        renderGrow10Settings();
    } else if (tabId === 'dept-dashboard') {
        switchDeptSubtab('list');
    } else if (tabId === 'scorecard') {
        const select = document.getElementById('scorecard-member-select');
        if (select && select.value && typeof window.renderScorecard === 'function') {
            window.scSelectedUserId = select.value;
            window.renderScorecard(select.value);
        }
    } else if (tabId === 'voting') {
        const userStr = sessionStorage.getItem('grow10_current_user');
        if (userStr && typeof window.initEvaluationTab === 'function') {
            const user = JSON.parse(userStr);
            window.initEvaluationTab(user.id);
        }
    }
}

function switchDeptSubtab(subtabId) {
    document.querySelectorAll('.dept-sub-pane').forEach(pane => pane.style.display = 'none');
    const listBtn = document.getElementById('btn-dept-sub-list');
    const adminBtn = document.getElementById('btn-dept-sub-admin');
    if (listBtn) {
        listBtn.className = "px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 cursor-pointer transition-all duration-200";
    }
    if (adminBtn) {
        adminBtn.className = "px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 cursor-pointer transition-all duration-200";
    }

    if (subtabId === 'list') {
        const listPane = document.getElementById('dept-pane-list');
        if (listPane) listPane.style.display = 'block';
        if (listBtn) {
            listBtn.className = "px-4 py-2 rounded-lg text-sm font-semibold bg-blue-100 border border-blue-200 text-blue-700 shadow-sm cursor-pointer transition-all duration-200";
        }
        renderDepartmentDashboard();
    } else if (subtabId === 'admin') {
        const adminPane = document.getElementById('dept-pane-admin');
        if (adminPane) adminPane.style.display = 'block';
        if (adminBtn) {
            adminBtn.className = "px-4 py-2 rounded-lg text-sm font-semibold bg-blue-100 border border-blue-200 text-blue-700 shadow-sm cursor-pointer transition-all duration-200";
        }
        renderDepartments();
    }
}

function renderMainAdminMembers() {
    const tbody = document.getElementById('mainAdminMembersTbody');
    if (!tbody || !window.globalApiData || !window.globalApiData.members) return;
    tbody.innerHTML = '';
    
    const depts = window.globalApiData.departments || [];

    window.globalApiData.members.forEach((member, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';
        
        const cat = String(member.category || '').toLowerCase().trim();
        const deptIdsArr = String(member.departmentIds || '').split(',').map(s => s.trim()).filter(s => s !== '');
        
        const selectedDeptsNames = depts
            .filter(d => deptIdsArr.includes(d.id))
            .map(d => d.name || d.id);
        const selectedDeptsText = selectedDeptsNames.length > 0 ? selectedDeptsNames.join(', ') : '所属なし';

        let checkboxesHtml = '';
        depts.forEach(d => {
            const isChecked = deptIdsArr.includes(d.id) ? 'checked' : '';
            checkboxesHtml += `
              <label style="display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 0.8rem; color: #334155; cursor: pointer;">
                <input type="checkbox" value="${d.id}" ${isChecked} onchange="updateDeptDisplayText(${idx})">
                ${d.name || d.id}
              </label>
            `;
        });

        tr.innerHTML = `
          <td style="padding: 12px; color: #0f172a; font-weight: 500;">${member.squadNumber}</td>
          <td style="padding: 12px; color: #334155;">${member.name || ''}</td>
          <td style="padding: 12px;">
            <select id="main_admin_cat_${idx}" onchange="updateMemberCategory(${idx})" style="width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff; font-size: 0.85rem; color: #334155;">
              <option value="beginner" ${cat === 'beginner' ? 'selected' : ''}>Beginner</option>
              <option value="member" ${cat === 'member' ? 'selected' : ''}>Member</option>
              <option value="admin" ${cat === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </td>
          <td style="padding: 12px; position: relative;">
            <div class="dept-dropdown-container" style="position: relative; display: inline-block; width: 100%;">
              <button type="button" onclick="toggleDeptDropdown(event, ${idx})" style="width: 100%; text-align: left; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 0.85rem; color: #334155; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                <span id="dept_display_${idx}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${selectedDeptsText}</span>
                <span>▼</span>
              </button>
              <div id="dept_dropdown_list_${idx}" class="dept-dropdown-list hidden" style="position: absolute; z-index: 50; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-top: 4px; padding: 8px; width: 100%; max-height: 200px; overflow-y: auto; box-sizing: border-box; top: 100%; left: 0;">
                ${checkboxesHtml}
              </div>
            </div>
          </td>
          <td style="padding: 12px; text-align: center;">
            <button onclick="deleteMember('${member.squadNumber}', '${member.name || ''}')" style="background: #ef4444; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">削除</button>
          </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleDeptDropdown(event, idx) {
    event.stopPropagation();
    const dropdown = document.getElementById(`dept_dropdown_list_${idx}`);
    if (!dropdown) return;
    
    document.querySelectorAll('.dept-dropdown-list').forEach(el => {
        if (el.id !== `dept_dropdown_list_${idx}`) {
            el.classList.add('hidden');
        }
    });
    
    dropdown.classList.toggle('hidden');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

async function updateMemberField(squadNumber, fields) {
    try {
        const { data, error } = await window.supabaseClient.from('members')
            .update(fields)
            .eq('squad_number', squadNumber)
            .select();
            
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('更新対象のメンバーが見つからないか、権限がありません。');
        }
        
        const m = window.globalApiData.members.find(x => String(x.squadNumber) === String(squadNumber));
        if (m) {
            if (fields.role !== undefined) m.category = fields.role;
            if (fields.department_ids !== undefined) m.departmentIds = fields.department_ids;
        }
        
        showToast('メンバー情報を更新しました。');
    } catch (err) {
        alert('メンバー情報の更新に失敗しました: ' + err.message);
    }
}

async function updateMemberCategory(idx) {
    if (!window.globalApiData || !window.globalApiData.members) return;
    const member = window.globalApiData.members[idx];
    const select = document.getElementById(`main_admin_cat_${idx}`);
    if (!select || !member) return;
    const newCat = select.value.trim();
    
    await updateMemberField(member.squadNumber, { role: newCat });
}

async function updateDeptDisplayText(idx) {
    const list = document.getElementById(`dept_dropdown_list_${idx}`);
    if (!list || !window.globalApiData || !window.globalApiData.departments) return;
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    const selectedDepts = [];
    const selectedDeptIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const dept = window.globalApiData.departments.find(d => d.id === cb.value);
            selectedDepts.push(dept ? (dept.name || dept.id) : cb.value);
            selectedDeptIds.push(cb.value);
        }
    });
    const display = document.getElementById(`dept_display_${idx}`);
    if (display) {
        display.innerText = selectedDepts.length > 0 ? selectedDepts.join(', ') : '所属なし';
    }

    const member = window.globalApiData.members[idx];
    if (member) {
        const newDeptIdsStr = selectedDeptIds.join(',');
        await updateMemberField(member.squadNumber, { department_ids: newDeptIdsStr });
    }
}

async function addMember() {
    const squadInput = document.getElementById('new-member-squad');
    const nameInput = document.getElementById('new-member-name');
    if (!squadInput || !nameInput) return;

    const squadNumber = squadInput.value.trim();
    const name = nameInput.value.trim();

    if (!squadNumber || !name) {
        alert('背番号と氏名を入力してください。');
        return;
    }

    const exists = window.globalApiData.members.some(m => String(m.squadNumber) === String(squadNumber));
    if (exists) {
        alert('その背番号は既に登録されています。');
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('members')
            .insert([{ squad_number: squadNumber, name: name, role: 'beginner' }])
            .select();

        if (error) throw error;

        alert('メンバーを追加しました。');
        squadInput.value = '';
        nameInput.value = '';

        await fetchDashboardData();
        renderMainAdminMembers();
    } catch (err) {
        alert('メンバーの追加に失敗しました: ' + err.message);
    }
}

async function deleteMember(squadNumber, name) {
    if (!confirm(`メンバー「${name}」(背番号: ${squadNumber}) を削除しますか？\n※この操作は取り消せません。`)) {
        return;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('members')
            .delete()
            .eq('squad_number', squadNumber);
            
        if (error) throw error;
        
        showToast('メンバーを削除しました。');
        await fetchDashboardData();
        renderMainAdminMembers();
    } catch (err) {
        alert('メンバーの削除に失敗しました: ' + err.message);
    }
}

// ====== DEPARTMENTS MANAGEMENT =====
function renderDepartments() {
    const tbody = document.getElementById('mainAdminDeptsTbody');
    if (!tbody || !window.globalApiData || !window.globalApiData.departments) return;
    tbody.innerHTML = '';

    window.globalApiData.departments.forEach((dept) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';
        tr.innerHTML = `
          <td style="padding: 12px; color: #334155;">${dept.name || ''}</td>
          <td style="padding: 12px;">
            <input type="checkbox" ${dept.feature === true || String(dept.feature).toUpperCase() === 'TRUE' || dept.feature === 1 || String(dept.feature).trim() === '〇' ? 'checked' : ''} onchange="toggleDepartmentFeature('${dept.id}', this.checked)" style="cursor: pointer;">
          </td>
          <td style="padding: 12px; text-align: center;">
            <button onclick="deleteDepartment('${dept.id}')" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; font-weight: bold; cursor: pointer;">削除</button>
          </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addDepartment() {
    const nameInput = document.getElementById('new-dept-name');
    const featureInput = document.getElementById('new-dept-feature');
    if (!nameInput || !featureInput) return;

    const name = nameInput.value.trim();
    const feature = featureInput.checked;

    if (!name) {
        alert('部署名を入力してください。');
        return;
    }

    // Auto-generate department ID dynamically
    const id = typeof crypto.randomUUID === 'function' 
        ? 'dept_' + crypto.randomUUID().substring(0, 8) 
        : 'dept_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    try {
        const { data, error } = await window.supabaseClient
            .from('departments')
            .insert([{ id, name, feature }])
            .select();

        if (error) throw error;

        alert('部署を追加しました。');
        nameInput.value = '';
        featureInput.checked = true;

        await fetchDashboardData();
        renderDepartments();
    } catch (err) {
        alert('エラーが発生しました: ' + err.message);
    }
}

async function deleteDepartment(id) {
    if (!confirm(`本当に部署を削除しますか？\n（所属するメンバーの割り当て情報は自動的には削除されません）`)) return;

    try {
        const { error } = await window.supabaseClient
            .from('departments')
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert('部署を削除しました。');
        await fetchDashboardData();
        renderDepartments();
    } catch (err) {
        alert('エラーが発生しました: ' + err.message);
    }
}

async function toggleDepartmentFeature(id, isFeature) {
    try {
        const { error } = await window.supabaseClient
            .from('departments')
            .update({ feature: isFeature })
            .eq('id', id);

        if (error) throw error;

        const dept = window.globalApiData.departments.find(d => d.id === id);
        if (dept) dept.feature = isFeature;
    } catch (err) {
        alert('エラーが発生しました: ' + err.message);
        await fetchDashboardData();
        renderDepartments();
    }
}

// ====== DEPARTMENTS DASHBOARD =====
function renderDepartmentDashboard() {
    const grid = document.getElementById('deptDashboardGrid');
    if (!grid || !window.globalApiData || !window.globalApiData.departments || !window.globalApiData.members) return;
    
    // Set style to flex horizontal scrolling row
    grid.style.display = 'flex';
    grid.style.gap = '20px';
    grid.style.overflowX = 'auto';
    grid.style.paddingBottom = '12px';
    grid.innerHTML = '';

    const depts = window.globalApiData.departments;
    const members = window.globalApiData.members;

    // Filter to active depts only (where feature is checked)
    const activeDepts = depts.filter(d => d.feature === true || String(d.feature).toUpperCase() === 'TRUE' || d.feature === 1 || String(d.feature).trim() === '〇');

    const deptMembersMap = {};
    activeDepts.forEach(d => {
        deptMembersMap[d.id] = [];
    });
    const noDeptMembers = [];

    // Filter out Beginners
    const activeMembers = members.filter(m => String(m.category).toLowerCase().trim() !== 'beginner');

    activeMembers.forEach(m => {
        const deptIds = String(m.departmentIds || '').split(',').map(s => s.trim()).filter(s => s !== '');
        
        // Find which checked departments this member belongs to
        const activeDeptIdsForMember = deptIds.filter(id => activeDepts.some(d => d.id === id));

        if (activeDeptIdsForMember.length === 0) {
            noDeptMembers.push(m);
        } else {
            activeDeptIdsForMember.forEach(id => {
                if (deptMembersMap[id]) {
                    deptMembersMap[id].push(m);
                }
            });
        }
    });

    // Render department cards
    activeDepts.forEach(d => {
        const belongs = deptMembersMap[d.id] || [];
        const card = document.createElement('div');
        card.style.flex = '0 0 320px';
        card.style.padding = '20px';
        card.style.background = '#ffffff';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)';
        card.style.boxSizing = 'border-box';
        
        let membersListHtml = '';
        if (belongs.length === 0) {
            membersListHtml = '<p style="font-size: 0.85rem; color: #94a3b8; text-align: center; padding: 10px 0;">所属メンバーはいません。</p>';
        } else {
            belongs.forEach(m => {
                membersListHtml += `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #f1f5f9;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div style="width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: #475569;">
                        ${(m.name || '').charAt(0)}
                      </div>
                      <span style="font-size: 0.85rem; font-weight: 600; color: #334155;">${m.name || 'Unknown'}</span>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                      <span style="font-size: 0.75rem; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px;">#${m.squadNumber}</span>
                    </div>
                  </div>
                `;
            });
        }

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            <h3 style="font-size: 1.1rem; font-weight: bold; color: #0f172a; margin: 0;">${d.name || d.id}</h3>
            <span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; font-weight: bold;">${belongs.length} 人</span>
          </div>
          <div style="display: flex; flex-direction: column;">
            ${membersListHtml}
          </div>
        `;
        grid.appendChild(card);
    });

    if (noDeptMembers.length > 0) {
        const card = document.createElement('div');
        card.style.flex = '0 0 320px';
        card.style.padding = '20px';
        card.style.background = '#f8fafc';
        card.style.border = '1px dashed #cbd5e1';
        card.style.borderRadius = '12px';
        card.style.boxSizing = 'border-box';
        
        let membersListHtml = '';
        noDeptMembers.forEach(m => {
            membersListHtml += `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background: #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: #475569;">
                    ${(m.name || '').charAt(0)}
                  </div>
                  <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">${m.name || 'Unknown'}</span>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                </div>
              </div>
            `;
        });

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px dashed #cbd5e1; padding-bottom: 8px;">
            <h3 style="font-size: 1.1rem; font-weight: bold; color: #475569; margin: 0;">所属なし</h3>
            <span style="font-size: 0.75rem; background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 9999px; font-weight: bold;">${noDeptMembers.length} 人</span>
          </div>
          <div style="display: flex; flex-direction: column;">
            ${membersListHtml}
          </div>
        `;
        grid.appendChild(card);
    }
}

// ====== GROW10 SETTINGS MANAGEMENT =====
function renderGrow10Settings() {
    if (!window.globalApiData || !window.globalApiData.settings) return;
    const settings = window.globalApiData.settings;
    
    const goalInput = document.getElementById('settings-overall-goal');
    const reasonInput = document.getElementById('settings-overall-goal-reason');
    const publishInput = document.getElementById('settings-publish-month');
    const currentInput = document.getElementById('settings-current-month');
    const openInput = document.getElementById('settings-open-date');
    const closeInput = document.getElementById('settings-close-date');

    const toMonthVal = (val) => {
        if (!val) return '';
        const cleaned = String(val).replace(/[年月]/g, '-').replace(/\//g, '-').trim();
        const match = cleaned.match(/^(\d{4})-(\d{1,2})/);
        return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
    };

    const toDateVal = (val) => {
        if (!val) return '';
        const cleaned = String(val).replace(/[年月]/g, '-').replace(/\//g, '-').replace(/日/g, '').trim();
        const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    };

    if (goalInput) goalInput.value = settings['overall_goal'] || '';
    if (reasonInput) reasonInput.value = settings['overall_goal_reason'] || '';
    if (publishInput) publishInput.value = toMonthVal(settings['publish_month'] || settings['Publish_Month']);
    if (currentInput) currentInput.value = toMonthVal(settings['Current_Month']);
    if (openInput) openInput.value = toDateVal(settings['open']);
    if (closeInput) closeInput.value = toDateVal(settings['close']);
}

async function saveGrow10Settings() {
    const goal = document.getElementById('settings-overall-goal').value.trim();
    const reason = document.getElementById('settings-overall-goal-reason').value.trim();
    const publish = document.getElementById('settings-publish-month').value.trim();
    const current = document.getElementById('settings-current-month').value.trim();
    const openDate = document.getElementById('settings-open-date').value.trim();
    const closeDate = document.getElementById('settings-close-date').value.trim();

    const updates = [
        { key: 'overall_goal', value: goal },
        { key: 'overall_goal_reason', value: reason },
        { key: 'publish_month', value: publish },
        { key: 'Publish_Month', value: publish },
        { key: 'Current_Month', value: current },
        { key: 'open', value: openDate },
        { key: 'close', value: closeDate }
    ];

    const btn = document.querySelector('button[onclick="saveGrow10Settings()"]');
    const originalText = btn.innerText;
    btn.innerText = '保存中...';
    btn.disabled = true;

    try {
        for (const u of updates) {
            const { data: checkData } = await window.supabaseClient
                .from('settings')
                .select('*')
                .eq('key', u.key);
                
            if (checkData && checkData.length > 0) {
                const { error } = await window.supabaseClient
                    .from('settings')
                    .update({ value: u.value })
                    .eq('key', u.key);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient
                    .from('settings')
                    .insert([{ key: u.key, value: u.value }]);
                if (error) throw error;
            }
        }

        alert('設定を保存しました。');
        await fetchDashboardData();
    } catch (err) {
        alert('設定の保存中にエラーが発生しました: ' + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// ====== LOGIN / USER SWITCHER ======
function openUserSwitcherModal(isForced = false) {
    const el = document.getElementById('user-switcher-modal');
    if (!el) return;
    const closeBtn = document.getElementById('user-switcher-close-btn');
    if (isForced) {
        el.dataset.forced = 'true';
        if (closeBtn) closeBtn.style.display = 'none';
        document.querySelector('#user-switcher-modal .modal-title').innerText = '最初にログインしてください';
    } else {
        el.dataset.forced = 'false';
        if (closeBtn) closeBtn.style.display = 'flex';
        document.querySelector('#user-switcher-modal .modal-title').innerText = 'ユーザー切り替え';
    }
    el.style.display = 'flex';
}

function switchUser() {
    const input = document.getElementById('login-user-input');
    const errorMsg = document.getElementById('login-error-msg');
    if (errorMsg) errorMsg.style.display = 'none';
    if (!input || !input.value.trim()) return;
    
    const userId = input.value.trim();
    const btn = document.getElementById('login-btn-submit');
    
    if (!isDataLoaded) {
        pendingLoginUserId = userId;
        if (btn) btn.innerText = "データを集計中... 少しお待ちください";
        return;
    }
    
    if (window.globalApiData && window.globalApiData.members) {
        const member = window.globalApiData.members.find(m => String(m.squadNumber) === String(userId));
        if (!member) {
            if (errorMsg) {
                errorMsg.innerText = "入力された背番号のメンバーが見つかりません。";
                errorMsg.style.display = 'block';
            } else {
                alert("入力された背番号のメンバーが見つかりません。");
            }
            if (btn) btn.innerText = "このユーザーでログイン";
            return;
        }

        const CATEGORY_RANKS = { 'beginner': 1, 'member': 2, 'assistant': 2, 'chief': 3, 'core': 4, 'admin': 5 };
        const rank = CATEGORY_RANKS[String(member.category).toLowerCase()];
        const isEligible = rank && rank >= CATEGORY_RANKS['beginner'];
        
        if (!isEligible) {
            if (errorMsg) {
                errorMsg.innerText = "ログイン権限がありません（Beginnerランク以上が必要です）。";
                errorMsg.style.display = 'block';
            } else {
                alert("ログイン権限がありません（Beginnerランク以上が必要です）。");
            }
            if (btn) btn.innerText = "このユーザーでログイン";
            return;
        }
    }
    finalizeLogin(userId);
}

function finalizeLogin(userId) {
    const btn = document.getElementById('login-btn-submit');
    if (btn) btn.innerText = "このユーザーでログイン";
    const userData = { id: userId, name: "Loading..." };
    sessionStorage.setItem('grow10_current_user', JSON.stringify(userData));
    const el = document.getElementById('user-switcher-modal');
    if (el) {
        el.dataset.forced = 'false';
        closeModal('user-switcher-modal');
    }
    updateUserProfile();
}

function updateUserProfile() {
    const userStr = sessionStorage.getItem('grow10_current_user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            let displayName = user.name || user.id;

            if (window.globalApiData && window.globalApiData.members) {
                const member = window.globalApiData.members.find(m => String(m.squadNumber) === String(user.id));
                if (member && member.name) {
                    displayName = member.name;
                    if (user.name !== displayName) {
                        user.name = displayName;
                        sessionStorage.setItem('grow10_current_user', JSON.stringify(user));
                    }
                    
                    const isAdmin = String(member.category).toLowerCase().trim() === 'admin';
                    const adminNav = document.getElementById('nav-admin');
                    const growAdminNav = document.getElementById('nav-grow10-admin');
                    const btnDeptSubAdmin = document.getElementById('btn-dept-sub-admin');
                    if (adminNav) adminNav.style.display = isAdmin ? 'block' : 'none';
                    if (growAdminNav) growAdminNav.style.display = isAdmin ? 'block' : 'none';
                    if (btnDeptSubAdmin) btnDeptSubAdmin.style.display = isAdmin ? 'block' : 'none';
                } else {
                    displayName = "不明なユーザー";
                }
            }

            const nameEl = document.getElementById('current-user-name');
            if (nameEl) nameEl.innerText = displayName;
            const avatarEl = document.getElementById('current-user-avatar');
            if (avatarEl) avatarEl.innerText = (displayName !== "Loading..." && displayName !== "不明なユーザー") ? displayName.charAt(0) : '?';
            
            if (window.globalApiData && window.globalApiData.members) {
                const select = document.getElementById('scorecard-member-select');
                if (select) {
                    const options = Array.from(select.options);
                    if (options.some(opt => String(opt.value) === String(user.id))) {
                        select.value = user.id;
                        window.scSelectedUserId = user.id;
                        if (typeof window.renderScorecard === 'function') window.renderScorecard(user.id);
                    }
                }
            }
            renderDashboardGoals(user);

            // もし現在評価タブが開かれているなら、被評価者リストを更新する
            const votingTab = document.getElementById('tab-voting');
            if (votingTab && votingTab.style.display !== 'none' && typeof window.initEvaluationTab === 'function') {
                window.initEvaluationTab(user.id);
            }
        } catch (e) {
            console.error('Failed to parse user data', e);
        }
    }
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

function closeModalOnOverlay(e, modalId) {
    const el = document.getElementById(modalId);
    if (el && el.dataset.forced === 'true') return;
    if (e.target.id === modalId) {
        closeModal(modalId);
    }
}

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
        
        const chigiriText = document.getElementById('current-chigiri-text');
        if (chigiriText) {
            chigiriText.innerText = member.chigiri || 'まだ契りが立てられていません。';
        }
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

// Global click listener to close dropdowns
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dept-dropdown-container')) {
        document.querySelectorAll('.dept-dropdown-list').forEach(el => el.classList.add('hidden'));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    updateUserProfile();
    openUserSwitcherModal(true);
    fetchDashboardData();
});
