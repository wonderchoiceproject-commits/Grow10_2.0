import React, { useMemo, useState, useEffect } from 'react';

// ▼▼▼ ここにGASでデプロイした「ウェブアプリのURL」を貼り付けてください ▼▼▼
// 例: "https://script.google.com/macros/s/XXXXXX/exec?action=getDashboardRawData"
const GAS_WEBAPP_URL = "ここにURLを貼り付けてください?action=getDashboardRawData";
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲


// === モックデータの生成 (テスト用/URL未設定時のフォールバック用) ===
const nameMap = {
  'E001': '山田 太郎', 'E002': '佐藤 花子', 'E003': '鈴木 一郎',
  'E004': '田中 次郎', 'E005': '高橋 三郎', 'E006': '伊藤 四郎',
  'E007': '渡辺 五郎', 'E008': '小林 六郎', 'E009': '加藤 七郎',
  'E010': '吉田 八郎'
};

const topics = [
  '協調性', '素直さ', '積極性', '明るさ', '礼儀正しさ', 
  '清潔さ', '正確さ', '懸命さ', '柔軟性', 'ホスピタリティー'
];

const MOCK_RAW_DATA = [];
for (let i = 0; i < 50; i++) {
  const empIdNum = (i % 10) + 1;
  const empId = `E${empIdNum.toString().padStart(3, '0')}`;
  const randomScore = () => Math.floor(Math.random() * 5) + 1;
  
  MOCK_RAW_DATA.push({
    Timestamp: new Date().toISOString(),
    Target_Month: '2026-06',
    Evaluator_ID: 'ADMIN',
    Evaluatee_ID: empId,
    Attributes: 'General',
    '協調性': randomScore(),
    '素直さ': randomScore(),
    '積極性': randomScore(),
    '明るさ': randomScore(),
    '礼儀正しさ': randomScore(),
    '清潔さ': randomScore(),
    '正確さ': randomScore(),
    '懸命さ': randomScore(),
    '柔軟性': randomScore(),
    'ホスピタリティー': randomScore(),
    Comment: 'テストコメント'
  });
}


// === メインコンポーネント ===
export default function DashboardGrid({ initialData = null }) {
  const [rawData, setRawData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState(null);

  // 初回マウント時にGASのURLからデータを取得する処理
  useEffect(() => {
    if (initialData) return; // Propでデータが渡されている場合はスキップ

    // URLが設定されていない（デフォルトのまま）場合はモックデータを使用する
    if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL.includes("ここにURLを貼り付けてください")) {
      setRawData(MOCK_RAW_DATA);
      setIsLoading(false);
      return;
    }

    // GASウェブアプリからJSONを取得
    fetch(GAS_WEBAPP_URL)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        
        // Evaluatee_ID が存在する有効な行のみを抽出
        const validData = data.filter(row => row.Evaluatee_ID && String(row.Evaluatee_ID).trim() !== "");
        setRawData(validData);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setError("データの読み込みに失敗しました。URLが正しいか、またはGASのデプロイ設定（アクセスできるユーザー）を確認してください。詳細: " + err.message);
        setIsLoading(false);
        setRawData(MOCK_RAW_DATA); // エラー時はモックデータにフォールバック
      });
  }, [initialData]);
  
  // 【責務の分離】データの集計・順位計算（初回マウント時・データ変更時のみ実行）
  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // --- Step 1: 集計 (Evaluatee_IDごとに平均を算出) ---
    const aggregated = {};
    rawData.forEach(row => {
      const empId = String(row.Evaluatee_ID).trim();
      if (!empId) return;

      if (!aggregated[empId]) {
        aggregated[empId] = {
          empId,
          // nameMapにない場合は背番号を表示
          name: nameMap[empId] || `背番号: ${empId}`,
          count: 0,
          scores: {}
        };
        topics.forEach(t => { aggregated[empId].scores[t] = 0; });
      }
      
      aggregated[empId].count += 1;
      topics.forEach(t => {
        aggregated[empId].scores[t] += (Number(row[t]) || 0);
      });
    });

    const resultList = Object.values(aggregated).map(emp => {
      const avgScores = {};
      topics.forEach(t => {
        // 小数点第2位まで丸める
        avgScores[t] = Number((emp.scores[t] / emp.count).toFixed(2));
      });
      return {
        empId: emp.empId,
        name: emp.name,
        avgScores,
        ranks: {},
        flags: {}
      };
    });

    // --- Step 2 & Step 3: 順位計算とフラグ付与 (項目ごとに処理) ---
    topics.forEach(topic => {
      // トップ順位の計算 (降順ソート)
      const sortedDesc = [...resultList].sort((a, b) => b.avgScores[topic] - a.avgScores[topic]);
      
      let currentRank = 1;
      let previousScore = null;
      
      sortedDesc.forEach((emp, index) => {
        if (emp.avgScores[topic] !== previousScore) {
          currentRank = index + 1; // 同点の場合は順位をスキップ（1位, 1位, 3位）
        }
        
        const target = resultList.find(e => e.empId === emp.empId);
        target.ranks[topic] = currentRank;
        
        target.flags[topic] = {
          isTop1: currentRank === 1,
          isTop3: currentRank > 1 && currentRank <= 3,
          isUnder3: emp.avgScores[topic] < 3.0
        };
        
        previousScore = emp.avgScores[topic];
      });
    });

    // 背番号で昇順ソートして返す
    return resultList.sort((a, b) => a.empId.localeCompare(b.empId));
  }, [rawData]);

  
  // 【描画 (View)】
  
  if (isLoading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-6 drop-shadow-md"></div>
        <p className="text-slate-600 font-medium tracking-wide animate-pulse">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-8 font-sans bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen text-slate-800">
      
      {error && (
        <div className="max-w-[95vw] mx-auto mb-6 bg-red-50/80 backdrop-blur-sm border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
          <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </p>
          <p className="text-xs text-red-600 mt-1.5 ml-7">※ 現在はモックデータを表示しています。</p>
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between max-w-[95vw] mx-auto gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600">
            360度評価 集計ダッシュボード
          </h2>
          <p className="text-sm text-slate-500 mt-1.5 font-medium">メンバー別の評価スコアとランキングを可視化</p>
        </div>
        <div className="inline-flex items-center text-sm font-semibold text-indigo-700 bg-white px-5 py-2.5 rounded-full shadow-[0_2px_15px_-3px_rgba(79,70,229,0.15)] border border-indigo-50/50">
          <svg className="w-4 h-4 mr-2.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          対象メンバー: <span className="ml-1 text-indigo-600 font-bold">{processedData.length}</span> 名
        </div>
      </div>

      {/* テーブルラッパー */}
      <div className="overflow-auto w-full max-w-[95vw] mx-auto max-h-[75vh] border border-slate-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl relative scroll-smooth ring-1 ring-slate-900/5">
        <table className="min-w-max w-full border-collapse text-sm">
          
          <thead className="sticky top-0 z-30">
            <tr>
              {/* Sticky 列: 背番号 */}
              <th rowSpan={2} className="px-5 py-4 border-b border-slate-200 bg-white/95 backdrop-blur text-slate-500 sticky left-0 z-40 w-24 min-w-[6rem] align-middle font-bold text-xs tracking-wider uppercase shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                背番号
              </th>
              {/* Sticky 列: 名前 */}
              <th rowSpan={2} className="px-5 py-4 border-b border-slate-200 bg-white/95 backdrop-blur text-slate-500 sticky left-24 z-40 w-32 min-w-[8rem] align-middle font-bold text-xs tracking-wider uppercase shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                名前
              </th>
              
              {topics.map(topic => (
                <th key={topic} colSpan={2} className="px-4 py-3 border-b border-slate-200 bg-slate-50/95 backdrop-blur text-slate-700 text-center font-bold text-sm">
                  {topic}
                </th>
              ))}
            </tr>
            <tr>
              {topics.map(topic => (
                <React.Fragment key={`${topic}-sub`}>
                  <th className="px-3 py-2 border-b border-slate-200 bg-slate-50/95 backdrop-blur text-slate-400 text-center font-semibold text-[11px] uppercase tracking-wider">
                    評価
                  </th>
                  <th className="px-3 py-2 border-b border-slate-200 bg-slate-50/95 backdrop-blur text-slate-400 text-center font-semibold text-[11px] uppercase tracking-wider">
                    順位
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="bg-white/50">
            {processedData.map((row) => (
              <tr key={row.empId} className="hover:bg-indigo-50/40 border-b border-slate-100 transition-all duration-150 group">
                <td className="px-5 py-4 border-r border-slate-100 sticky left-0 z-20 bg-white/95 group-hover:bg-indigo-50/95 font-mono text-slate-400 font-medium text-xs shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] transition-colors">
                  {row.empId}
                </td>
                <td className="px-5 py-4 border-r border-slate-100 sticky left-24 z-20 bg-white/95 group-hover:bg-indigo-50/95 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] transition-colors">
                  {row.name}
                </td>
                
                {topics.map(topic => {
                  const flags = row.flags[topic];
                  
                  // セルの基本スタイル
                  let cellClass = "px-3 py-3 border-r border-slate-100/50 text-center transition-colors ";
                  let scoreClass = cellClass;
                  let rankClass = cellClass;
                  
                  // フラグに基づく条件付き書式の適用
                  if (flags.isTop1) {
                    scoreClass += "bg-amber-50/70 text-amber-600 font-bold ";
                    rankClass  += "bg-amber-50/70 text-amber-600 font-bold ";
                  } else if (flags.isTop3) {
                    scoreClass += "bg-emerald-50/60 font-bold text-emerald-600 ";
                    rankClass  += "bg-emerald-50/60 font-bold text-emerald-600 ";
                  } else if (flags.isUnder3) {
                    scoreClass += "bg-rose-50/70 text-rose-600 font-semibold ";
                    rankClass  += "bg-rose-50/70 text-rose-600 font-semibold ";
                  } else {
                    scoreClass += "text-slate-600 font-medium ";
                    rankClass  += "text-slate-400 ";
                  }
                  
                  return (
                    <React.Fragment key={topic}>
                      <td className={scoreClass}>{row.avgScores[topic].toFixed(2)}</td>
                      <td className={rankClass}>
                        {flags.isTop1 ? (
                          <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 w-6 h-6 rounded-full text-xs shadow-sm ring-1 ring-amber-200 font-bold">1</span>
                        ) : (
                          `${row.ranks[topic]}位`
                        )}
                      </td>
                    </React.Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>

        </table>
      </div>
    </div>
  );
}
