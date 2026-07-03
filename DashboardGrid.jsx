import React, { useMemo, useState, useEffect } from 'react';

// ▼▼▼ ここにGASでデプロイした「ウェブアプリのURL」を貼り付けてください ▼▼▼
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyBKhGV3I7LuBMtHN7dvYFHOrddAChxRKig3rIq-EKYHYZS6bF1x0dHsZZumj9ampk/exec";
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
          isLowScore: false // 後で判定・上書き
        };
        
        previousScore = emp.avgScores[topic];
      });

      // ワースト順位の計算 (昇順ソート)
      const sortedAsc = [...resultList].sort((a, b) => a.avgScores[topic] - b.avgScores[topic]);
      
      let bottomRank = 1;
      let bottomPrevScore = null;
      
      sortedAsc.forEach((emp, index) => {
        if (emp.avgScores[topic] !== bottomPrevScore) {
          bottomRank = index + 1;
        }
        
        const target = resultList.find(e => e.empId === emp.empId);
        // 3.0未満の場合にフラグを付与
        if (emp.avgScores[topic] < 3.0) {
          target.flags[topic].isLowScore = true;
        } else {
          target.flags[topic].isLowScore = false;
        }
        bottomPrevScore = emp.avgScores[topic];
      });
    });

    // 背番号で昇順ソートして返す
    return resultList.sort((a, b) => a.empId.localeCompare(b.empId));
  }, [rawData]);

  
  // 【描画 (View)】
  
  if (isLoading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600 font-medium">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-8 font-sans bg-slate-950 min-h-screen text-slate-200">
      
      {error && (
        <div className="max-w-[95vw] mx-auto mb-4 bg-red-950/50 border-l-4 border-red-500 p-4 rounded-r-lg">
          <p className="text-sm text-red-400">{error}</p>
          <p className="text-xs text-red-500/80 mt-1">※ 現在はモックデータを表示しています。</p>
        </div>
      )}

      <div className="mb-5 flex items-center justify-between max-w-[95vw] mx-auto">
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 font-syne">360度評価 集計ダッシュボード</h2>
        <span className="text-sm font-medium text-slate-300 bg-slate-900/60 px-4 py-1.5 rounded-full border border-slate-700/50 shadow-lg backdrop-blur">
          対象メンバー: {processedData.length} 名
        </span>
      </div>

      <div className="mb-4 flex items-center space-x-6 max-w-[95vw] mx-auto text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-cyan-900/40 border border-cyan-600/30"></span>1位</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-blue-900/40 border border-blue-600/30"></span>上位3位</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-950/60 border border-red-600/30"></span>3.0未満</span>
      </div>

      {/* テーブルラッパー */}
      <div className="overflow-auto w-full max-w-[95vw] mx-auto max-h-[75vh] border border-slate-800/80 rounded-xl shadow-2xl bg-slate-900/50 backdrop-blur-md relative scroll-smooth ring-1 ring-white/5">
        <table className="min-w-max w-full border-collapse text-sm text-slate-200">
          
          <thead className="sticky top-0 z-40">
            <tr>
              {/* Sticky 列: 背番号 */}
              <th rowSpan={2} className="px-5 py-4 border-b border-r border-slate-700/50 bg-slate-900/95 backdrop-blur text-blue-300 sticky left-0 z-50 w-20 min-w-[5rem] align-middle font-semibold uppercase tracking-wider text-xs">
                ID
              </th>
              {/* Sticky 列: 名前 */}
              <th rowSpan={2} className="px-5 py-4 border-b border-r border-slate-700/50 bg-slate-900/95 backdrop-blur text-blue-300 sticky left-20 z-50 w-36 min-w-[9rem] align-middle font-semibold uppercase tracking-wider text-xs shadow-[4px_0_15px_-5px_rgba(0,0,0,0.6)]">
                Name
              </th>
              
              {topics.map(topic => (
                <th key={topic} colSpan={2} className="px-4 py-3 border-b border-r border-slate-700/50 bg-slate-900/95 backdrop-blur text-slate-200 text-center whitespace-nowrap font-medium tracking-wide">
                  {topic}
                </th>
              ))}
            </tr>
            <tr>
              {topics.map(topic => (
                <React.Fragment key={`${topic}-sub`}>
                  <th className="px-3 py-2 border-b border-r border-slate-700/50 bg-slate-800/90 backdrop-blur text-slate-400 text-center font-normal text-xs whitespace-nowrap">
                    評価
                  </th>
                  <th className="px-3 py-2 border-b border-r border-slate-700/50 bg-slate-800/90 backdrop-blur text-slate-400 text-center font-normal text-xs whitespace-nowrap">
                    順位
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="bg-transparent">
            {processedData.map((row) => (
              <tr key={row.empId} className="hover:bg-slate-800/70 border-b border-slate-800/50 transition-all duration-200 group">
                <td className="px-5 py-3 border-r border-slate-800/50 sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800/90 font-mono text-slate-400 font-medium transition-colors">
                  {row.empId}
                </td>
                <td className="px-5 py-3 border-r border-slate-800/50 sticky left-20 z-20 bg-slate-900 group-hover:bg-slate-800/90 font-bold text-slate-200 shadow-[4px_0_15px_-5px_rgba(0,0,0,0.6)] transition-colors">
                  {row.name}
                </td>
                
                {topics.map(topic => {
                  const flags = row.flags[topic];
                  
                  // セルの基本スタイル
                  let cellClass = "px-3 py-3 border-r border-slate-800/50 text-center transition-colors duration-200 ";
                  let scoreClass = cellClass;
                  let rankClass = cellClass;
                  
                  // フラグに基づく条件付き書式の適用
                  if (flags.isTop1) {
                    scoreClass += "bg-cyan-900/30 text-cyan-300 font-bold shadow-[inset_0_0_12px_rgba(34,211,238,0.2)] ";
                    rankClass  += "bg-cyan-900/30 text-cyan-300 font-bold shadow-[inset_0_0_12px_rgba(34,211,238,0.2)] ";
                  } else if (flags.isTop3) {
                    scoreClass += "bg-blue-900/20 text-blue-300 font-bold ";
                    rankClass  += "bg-blue-900/20 text-blue-300 font-bold ";
                  } else if (flags.isLowScore) {
                    scoreClass += "bg-red-950/40 text-red-400/90 font-medium ";
                    rankClass  += "bg-red-950/40 text-red-400/90 font-medium ";
                  } else {
                    scoreClass += "text-slate-300 ";
                    rankClass  += "text-slate-500 ";
                  }
                  
                  return (
                    <React.Fragment key={topic}>
                      <td className={scoreClass}>{row.avgScores[topic].toFixed(2)}</td>
                      <td className={rankClass}>{row.ranks[topic]}位</td>
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
