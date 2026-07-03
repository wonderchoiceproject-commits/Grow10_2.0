/**
 * 360度評価 集計ダッシュボード用 API
 * 
 * 3つのシートからデータを取得して統合レスポンスを返します:
 *   - Evaluation_Responses: 評価データ
 *   - members: メンバー情報（背番号→名前マッピング, 所属部署）
 *   - departments: 部署情報（feature フラグ）
 * 
 * デプロイ: 「新しいデプロイ」->「ウェブアプリ」
 * アクセスできるユーザー: 「全員」に設定してください
 */

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'getDashboardRawData') {
    return getDashboardRawData();
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    error: 'Invalid action parameter. Please provide ?action=getDashboardRawData'
  })).setMimeType(ContentService.MimeType.JSON);
}


function getDashboardRawData() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // ========================================
    // 1. Evaluation_Responses シートの読み取り
    // ========================================
    const evalSheet = spreadsheet.getSheetByName('Evaluation_Responses');
    if (!evalSheet) {
      return _jsonResponse({ error: 'Sheet "Evaluation_Responses" not found.' });
    }
    const evaluations = _sheetToObjects(evalSheet);

    // ========================================
    // 2. members シートの読み取り
    //    ヘッダー: squadNumber, name, category, departmentIds, answered
    // ========================================
    const membersSheet = spreadsheet.getSheetByName('members');
    if (!membersSheet) {
      return _jsonResponse({ error: 'Sheet "members" not found.' });
    }
    const members = _sheetToObjects(membersSheet);

    // ========================================
    // 3. departments シートの読み取り
    //    ヘッダー: id, name, grow, feature
    //    feature が TRUE のものを抽出
    // ========================================
    const deptSheet = spreadsheet.getSheetByName('departments');
    if (!deptSheet) {
      return _jsonResponse({ error: 'Sheet "departments" not found.' });
    }
    const departments = _sheetToObjects(deptSheet);
    
    // feature が true（チェックボックスON）の部署を {id, name} 形式で抽出
    const featuredDepartments = departments
      .filter(d => d.feature === true || d.feature === 'TRUE' || d.feature === 'true')
      .map(d => ({
        id: String(d.id).trim(),
        name: String(d.name || d.id).trim()
      }));

    // ========================================
    // 統合レスポンスを返却
    // ========================================
    return _jsonResponse({
      evaluations: evaluations,
      members: members,
      featuredDepartments: featuredDepartments
    });
      
  } catch (error) {
    return _jsonResponse({ error: error.toString() });
  }
}


// --- ヘルパー関数 ---

/** シートの全データをオブジェクト配列に変換する */
function _sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  const result = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j] && String(headers[j]).trim() !== '') {
        obj[String(headers[j]).trim()] = row[j];
      }
    }
    result.push(obj);
  }
  return result;
}

/** JSONレスポンスを生成する */
function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
