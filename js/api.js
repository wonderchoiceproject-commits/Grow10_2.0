// GASのWebアプリURL（デプロイ後にここを書き換える）
// ※ デプロイ時に「実行するユーザー: 自分」「アクセスできるユーザー: 全員」に設定すること
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyd8j1qnznWcpJstvheUPdQ4JBhdIbd3lO39lcYa8LkIBX6yVI3qovs91A9ltSkDEw/exec'; 

const API = {
  async fetchEvaluatees(evaluatorId) {
    try {
      const url = `${GAS_API_URL}?action=getEvaluatees&evaluatorId=${encodeURIComponent(evaluatorId)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('ネットワークエラーが発生しました。');
      return await response.json();
    } catch (e) {
      console.error(e);
      throw new Error('通信に失敗しました。URLが正しいか、CORS設定を確認してください。');
    }
  },

  async submitEvaluations(payload) {
    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain', // CORS回避のためtext/plainを使うのがGASでの定石
        },
        body: JSON.stringify({
          action: 'submitEvaluations',
          data: payload
        })
      });
      if (!response.ok) throw new Error('ネットワークエラーが発生しました。');
      return await response.json();
    } catch (e) {
      console.error(e);
      throw new Error('送信に失敗しました。');
    }
  },

  async fetchDashboardData() {
    try {
      const url = `${GAS_API_URL}?action=getDashboardData`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('ネットワークエラーが発生しました。');
      return await response.json();
    } catch (e) {
      console.error(e);
      throw new Error('データの取得に失敗しました。');
    }
  },

  async updateMonthlySettings(month, deadline) {
    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          action: 'updateMonthlySettings',
          data: { month, deadline }
        })
      });
      if (!response.ok) throw new Error('ネットワークエラーが発生しました。');
      return await response.json();
    } catch (e) {
      console.error(e);
      throw new Error('月次更新に失敗しました。');
    }
  }
};
