// app.js - UI logic for dashboard tabs and modals

function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    // Show selected tab
    const tab = document.getElementById('tab-' + tabId);
    if (tab) {
        tab.style.display = 'block';
        tab.classList.add('active');
    }

    // Update nav links
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const nav = document.getElementById('nav-' + tabId);
    if (nav) nav.classList.add('active');

    // If switching to by-items tab, optionally default to the first dimension if not already selected
    if (tabId === 'by-items' && typeof renderByItemsTab === 'function') {
        renderByItemsTab('協調性'); // default dimension
    }

    // スマホ時にタブを切り替えたらサイドバーを自動で閉じる
    const sidebar = document.querySelector('aside');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function closeModalOnOverlay(e, id) {
    if (e.target.id === id) {
        // もし強制ログイン中の場合は閉じさせない
        if (id === 'user-switcher-modal' && document.getElementById('user-switcher-modal').dataset.forced === 'true') {
            return;
        }
        closeModal(id);
    }
}

function openChigiriModal() {
    const el = document.getElementById('chigiri-modal');
    if (el) el.style.display = 'flex';
}

function skipChigiri() {
    closeModal('chigiri-modal');
}

function submitChigiri() {
    closeModal('chigiri-modal');
}

document.addEventListener('DOMContentLoaded', () => {
    // リロード等、毎回必ず選ばせるためにログイン状態を初期化
    sessionStorage.removeItem('grow10_current_user');

    // Make sure initial state is set
    document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    switchTab('dashboard'); // Default to dashboard
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    
    // Check login status on load
    updateUserProfile();

    // アクセス直後に強制的にログインモーダルを表示
    openUserSwitcherModal(true);

    // バックグラウンドでデータをフェッチ
    fetchDashboardData();
});

// ====== DATA FETCHING LOGIC ======
let isDataLoaded = false;
let pendingLoginUserId = null;
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyBKhGV3I7LuBMtHN7dvYFHOrddAChxRKig3rIq-EKYHYZS6bF1x0dHsZZumj9ampk/exec";

function fetchDashboardData() {
    const fetchUrl = GAS_WEBAPP_URL.includes('?') ? `${GAS_WEBAPP_URL}&action=getDashboardRawData` : `${GAS_WEBAPP_URL}?action=getDashboardRawData`;
    fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            isDataLoaded = true;
            window.globalApiData = data;
            document.dispatchEvent(new CustomEvent('gasDataLoaded', { detail: data }));

            // もしログインボタンが押されて待機中のユーザーがいれば、ログイン処理を続行
            if (pendingLoginUserId) {
                finalizeLogin(pendingLoginUserId);
                pendingLoginUserId = null;
            }
        })
        .catch(err => {
            console.error("Fetch error:", err);
            isDataLoaded = true; // エラーでも完了扱いにしてブロックを解除
            document.dispatchEvent(new CustomEvent('gasDataError', { detail: err }));
        });
}

// ====== LOGIN / USER SWITCHER LOGIC ======

// ユーザー切り替えモーダルを開く（強制ログインの場合は引数に true を渡す）
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
        document.querySelector('#user-switcher-modal .modal-title').innerText = '🔄 ユーザー切り替え';
    }
    
    el.style.display = 'flex';
}

function switchUser() {
    const input = document.getElementById('login-user-input');
    if (!input || !input.value.trim()) return;
    
    const userId = input.value.trim();
    const btn = document.getElementById('login-btn-submit');
    
    // データがロードされていなければ、ロードを待つ
    if (!isDataLoaded) {
        pendingLoginUserId = userId;
        if (btn) btn.innerText = "データを集計中... 少しお待ちください";
        return;
    }
    
    finalizeLogin(userId);
}

function finalizeLogin(userId) {
    const btn = document.getElementById('login-btn-submit');
    if (btn) btn.innerText = "このユーザーでログイン";

    // データロード前かもしれないので一旦 Loading... として保存
    const userData = { id: userId, name: "Loading..." };
    sessionStorage.setItem('grow10_current_user', JSON.stringify(userData));
    
    // モーダルを閉じる（強制フラグも解除）
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

            // もし globalApiData がロードされていれば、名前を引き当てる
            if (window.globalApiData && window.globalApiData.members) {
                const member = window.globalApiData.members.find(m => String(m.squadNumber) === String(user.id));
                if (member && member.name) {
                    displayName = member.name;
                    // 保存されている名前が古ければ更新
                    if (user.name !== displayName) {
                        user.name = displayName;
                        sessionStorage.setItem('grow10_current_user', JSON.stringify(user));
                    }
                } else {
                    displayName = "不明なユーザー";
                }
            }

            const nameEl = document.getElementById('current-user-name');
            if (nameEl) nameEl.innerText = displayName;
            
            const avatarEl = document.getElementById('current-user-avatar');
            if (avatarEl) {
                avatarEl.innerText = (displayName !== "Loading..." && displayName !== "不明なユーザー") ? displayName.charAt(0) : '👨‍💻';
            }
        } catch (e) {
            console.error('Failed to parse user data', e);
        }
    }
}

// Scorecard sub-tab switching
function switchScorecardSubtab(tabName) {
    const tabs = ['radar', 'dist', 'trend'];
    tabs.forEach(t => {
        const btn = document.getElementById('sc-nav-' + t);
        const pane = document.getElementById('sc-content-' + t);
        if (btn) {
            btn.classList.remove('active');
            btn.style.borderBottomColor = '#334155';
            btn.style.color = 'var(--text-secondary)';
        }
        if (pane) {
            pane.style.display = 'none';
            pane.classList.remove('active');
        }
    });

    const activeBtn = document.getElementById('sc-nav-' + tabName);
    const activePane = document.getElementById('sc-content-' + tabName);
    
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.borderBottomColor = '#38bdf8';
        activeBtn.style.color = 'var(--text-primary)';
    }
    if (activePane) {
        activePane.style.display = 'block';
        activePane.classList.add('active');
    }
}

// Mobile sidebar toggle
function toggleSidebar() {
    const sidebar = document.querySelector('aside');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.toggle('show');
    }
    if (overlay) {
        overlay.classList.toggle('show');
    }
}

