// SPREADSHEET_ID is no longer needed because we use getActiveSpreadsheet()

const CATEGORY_RANKS = {
  'member': 1,
  'assistant': 2,
  'assitant': 2,
  'chief': 3,
  'core': 4
};

function isEligibleCategory(category) {
  if (!category) return false;
  const rank = CATEGORY_RANKS[String(category).toLowerCase()];
  return rank && rank >= CATEGORY_RANKS['member'];
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// CORSプリフライトリクエスト用
function doOptions(e) {
  return jsonResponse({status: "ok"});
}

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getEvaluatees') {
    return jsonResponse(getEvaluatees(e.parameter.evaluatorId));
  }
  
  if (action === 'getDashboardData') {
    return jsonResponse(getDashboardData());
  }
  
  if (action === 'getDashboardRawData') {
    return jsonResponse(getDashboardRawData());
  }
  
  return jsonResponse({ error: 'Invalid action parameter.' });
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    
    if (action === 'submitEvaluations') {
      return jsonResponse(submitEvaluations(postData.data));
    }
    
    if (action === 'updateMonthlySettings') {
      return jsonResponse(updateMonthlySettings(postData.data));
    }
    
    if (action === 'updateMemberGoals') {
      return jsonResponse(updateMemberGoals(postData.data));
    }
    
    return jsonResponse({ error: 'Invalid action.' });
  } catch (error) {
    return jsonResponse({ error: 'システムエラー: ' + error.message });
  }
}

// --- Logic Functions ---

function getEvaluatees(evaluatorId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- 投票期間のチェック ---
    const settingsSheet = ss.getSheetByName('Setting') || ss.getSheetByName('Settings');
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      if (data.length >= 2) {
        const headers = data[0];
        const row = data[1];
        let openStr = '';
        let closeStr = '';
        let currentMonth = '';
        let deadline = '';
        headers.forEach((h, i) => {
          const key = String(h).trim();
          if (key === 'open') openStr = row[i];
          if (key === 'close') closeStr = row[i];
          if (key === 'Current_Month') currentMonth = row[i];
          if (key === 'Deadline') deadline = row[i];
        });
        
        openStr = openStr || currentMonth;
        closeStr = closeStr || deadline;
        
        if (!openStr || !closeStr) {
          return { error: '現在は評価期間外です。（期間が設定されていません）' };
        }
        
        const now = new Date();
        const openDate = new Date(openStr);
        const closeDate = new Date(closeStr);
        
        if (!isNaN(openDate) && !isNaN(closeDate)) {
          // 終了日はその日の終わりまでとする場合
          closeDate.setHours(23, 59, 59, 999);
          
          if (now < openDate || now > closeDate) {
            return { error: '現在は評価期間外です。' };
          }
        } else {
          return { error: '設定シートの期間の日付形式が正しくありません。' };
        }
      }
    }
    
    // --- departmentsシートから「grow」対象のidを抽出 ---
    const deptsSheet = ss.getSheetByName('departments');
    if (!deptsSheet) return { error: '「departments」シートが見つかりません。' };
    const deptsData = deptsSheet.getDataRange().getValues();
    if (deptsData.length <= 1) return { error: 'departmentsデータが存在しません。' };
    
    const deptsHeaders = deptsData[0];
    const idIdx = deptsHeaders.indexOf('id');
    const growIdx = deptsHeaders.indexOf('grow');
    const deptNameIdx = deptsHeaders.indexOf('name');
    
    if (idIdx === -1 || growIdx === -1) {
      return { error: 'departmentsシートに「id」または「grow」のヘッダーが見つかりません。' };
    }
    
    const validGrowIds = new Set();
    const deptNameMap = {};
    for (let i = 1; i < deptsData.length; i++) {
      const row = deptsData[i];
      const growVal = row[growIdx];
      // true, 'TRUE', 1, '〇' などを許容
      const isChecked = growVal === true || String(growVal).toUpperCase() === 'TRUE' || growVal === 1 || String(growVal).trim() === '〇';
      if (isChecked) {
        const idStr = String(row[idIdx]).trim();
        validGrowIds.add(idStr);
        deptNameMap[idStr] = deptNameIdx !== -1 ? String(row[deptNameIdx]).trim() : idStr;
      }
    }
    // ---------------------------------------------------

    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    if (!membersSheet) return { error: '「members」シートが見つかりません。' };

    const data = membersSheet.getDataRange().getValues();
    if (data.length <= 1) return { error: 'メンバーデータが存在しません。' };

    const membersHeaders = data[0];
    const squadNumberIdx = membersHeaders.indexOf('squadNumber');
    const nameIdx = membersHeaders.indexOf('name');
    const categoryIdx = membersHeaders.indexOf('category');
    const departmentIdsIdx = membersHeaders.indexOf('departmentIds');
    const answeredIdx = membersHeaders.indexOf('answered');

    if (squadNumberIdx === -1 || categoryIdx === -1 || departmentIdsIdx === -1) {
      return { error: 'membersシートに必須ヘッダー（squadNumber, category, departmentIds）が見つかりません。' };
    }

    const rows = data.slice(1);
    const members = rows.map(row => ({
      squadNumber: String(row[squadNumberIdx] || '').trim(),
      name: nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '',
      category: String(row[categoryIdx] || '').trim(),
      departmentIds: String(row[departmentIdsIdx] || '').trim(),
      answered: answeredIdx !== -1 ? (row[answeredIdx] === true || String(row[answeredIdx]).toUpperCase() === 'TRUE') : false
    }));

    const evaluator = members.find(m => m.squadNumber === String(evaluatorId).trim());
    if (!evaluator) return { error: '入力された背番号のメンバーが見つかりません。' };
    if (evaluator.answered) return { error: '回答は完了しています。' };
    if (!isEligibleCategory(evaluator.category)) return { error: '評価権限がありません（Memberランク以上が必要です）。' };

    // 評価者の属性を有効なIDでフィルタリング
    const evaluatorAttributes = evaluator.departmentIds.split(/[\s,]+/).filter(id => id && validGrowIds.has(id));

    const evaluatees = [];

    for (const member of members) {
      if (member.squadNumber === evaluator.squadNumber) continue;
      if (!isEligibleCategory(member.category)) continue;

      // 被評価者の属性を有効なIDでフィルタリング
      const memberAttributes = member.departmentIds.split(/[\s,]+/).filter(id => id && validGrowIds.has(id));

      // Intersection of attributes (共通する属性の抽出)
      const commonAttributes = evaluatorAttributes.filter(attr => memberAttributes.includes(attr));

      // 共通属性が1つでもあれば評価対象
      if (commonAttributes.length > 0) {
        // IDの配列をnameの配列に変換
        const commonAttributeNames = commonAttributes.map(id => deptNameMap[id] || id);
        
        evaluatees.push({
          squadNumber: member.squadNumber,
          name: member.name,
          commonAttributes: commonAttributeNames
        });
      }
    }

    if (evaluatees.length === 0) return { error: 'あなたが評価すべき対象者は現在いません。' };

    return { success: true, evaluatorName: evaluator.name, evaluatees: evaluatees };
  } catch (e) {
    return { error: 'システムエラー: ' + e.message };
  }
}

function submitEvaluations(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Settingsシートから対象月を取得
    const settingsSheet = ss.getSheetByName('Setting') || ss.getSheetByName('Settings');
    let targetMonth = '';
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      if (data.length >= 2) {
        const headers = data[0];
        const row = data[1];
        headers.forEach((h, i) => {
          if (String(h).trim() === 'Current_Month') {
            targetMonth = String(row[i]).trim();
          }
        });
      }
    }
    
    if (!targetMonth) {
      return { error: 'Settingsシートに対象月 (Current_Month) が設定されていません。' };
    }

    const sheetName = 'Evaluation_Responses_' + targetMonth;
    let responsesSheet = ss.getSheetByName(sheetName);
    
    if (!responsesSheet) {
      return { error: `対象月のシート (${sheetName}) が存在しません。管理者に「月次更新」を依頼してください。` };
    }

    const timestamp = new Date();
    const rowsToAppend = [];

    data.evaluations.forEach(eval => {
      rowsToAppend.push([
        timestamp,
        targetMonth,
        data.evaluatorId,
        eval.evaluateeId,
        (eval.commonAttributes || []).join(', '), // 共通属性をカンマ区切りで保存
        eval.scores['協調性'],
        eval.scores['素直さ'],
        eval.scores['積極性'],
        eval.scores['明るさ'],
        eval.scores['礼儀正しさ'],
        eval.scores['清潔さ'],
        eval.scores['正確さ'],
        eval.scores['懸命さ'],
        eval.scores['柔軟性'],
        eval.scores['ホスピタリティー'],
        eval.comment || ''
      ]);
    });

    if (rowsToAppend.length > 0) {
      const startRow = responsesSheet.getLastRow() + 1;
      responsesSheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    }

    // membersシートのanswered列をtrueにする
    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    if (membersSheet) {
      const membersData = membersSheet.getDataRange().getValues();
      const headers = membersData[0];
      const answeredIdx = headers.indexOf('answered');
      const squadNumIdx = headers.indexOf('squadNumber');
      
      if (answeredIdx !== -1 && squadNumIdx !== -1) {
        for (let i = 1; i < membersData.length; i++) {
          if (String(membersData[i][squadNumIdx]).trim() === String(data.evaluatorId).trim()) {
            membersSheet.getRange(i + 1, answeredIdx + 1).setValue(true);
            break;
          }
        }
      }
    }

    return { success: true };
  } catch (e) {
    return { error: '保存中にエラー: ' + e.message };
  }
}

function createNewMonthSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Settingsシートから対象月を取得
    const settingsSheet = ss.getSheetByName('Setting') || ss.getSheetByName('Settings');
    let targetMonth = '';
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      if (data.length >= 2) {
        const headers = data[0];
        const row = data[1];
        headers.forEach((h, i) => {
          if (String(h).trim() === 'Current_Month') {
            targetMonth = String(row[i]).trim();
          }
        });
      }
    }
    
    if (!targetMonth) {
      SpreadsheetApp.getUi().alert('エラー', 'Settingシートに Current_Month が設定されていません。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }

    const sheetName = 'Evaluation_Responses_' + targetMonth;
    let responsesSheet = ss.getSheetByName(sheetName);
    
    if (responsesSheet) {
      SpreadsheetApp.getUi().alert('お知らせ', `シート "${sheetName}" は既に存在します。`, SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }

    // 新しいシートを作成
    responsesSheet = ss.insertSheet(sheetName);
    const headers = [
      'Timestamp', 'Target_Month', 'Evaluator_ID', 'Evaluatee_ID', 'Attributes', '協調性', '素直さ', 
      '積極性', '明るさ', '礼儀正しさ', '清潔さ', '正確さ', '懸命さ', 
      '柔軟性', 'ホスピタリティー', 'Comment'
    ];
    responsesSheet.appendRow(headers);
    responsesSheet.setFrozenRows(1);
    responsesSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f1f5f9');
    
    SpreadsheetApp.getUi().alert('成功', `新しいシート "${sheetName}" を作成しました。`, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert('エラー', 'シートの作成中にエラーが発生しました: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function getDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const responsesSheet = ss.getSheetByName('Evaluation_Responses');
    if (!responsesSheet) return { error: '評価データがありません。' };
    
    const rData = responsesSheet.getDataRange().getValues();
    if (rData.length <= 1) return { error: '評価データがありません。' };
    
    const rRows = rData.slice(1);
    
    // ヘッダーからインデックスを動的に取得する（旧データと新データの互換性のため）
    const rHeaders = rData[0];
    const targetMonthIdx = rHeaders.indexOf('Target_Month');
    const hasTargetMonth = targetMonthIdx !== -1;
    
    const responses = rRows.map(row => {
      const offset = hasTargetMonth ? 1 : 0;
      return {
        timestamp: row[0],
        targetMonth: hasTargetMonth ? row[1] : '',
        evaluatorId: row[1 + offset],
        evaluateeId: row[2 + offset],
        attributes: String(row[3 + offset]).split(',').map(s=>s.trim()).filter(s=>s),
        scores: {
          '協調性': Number(row[4 + offset]) || 0,
          '素直さ': Number(row[5 + offset]) || 0,
          '積極性': Number(row[6 + offset]) || 0,
          '明るさ': Number(row[7 + offset]) || 0,
          '礼儀正しさ': Number(row[8 + offset]) || 0,
          '清潔さ': Number(row[9 + offset]) || 0,
          '正確さ': Number(row[10 + offset]) || 0,
          '懸命さ': Number(row[11 + offset]) || 0,
          '柔軟性': Number(row[12 + offset]) || 0,
          'ホスピタリティー': Number(row[13 + offset]) || 0
        },
        comment: row[14 + offset]
      };
    });
    
    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    const membersMap = {};
    if (membersSheet) {
      const mData = membersSheet.getDataRange().getValues();
      if (mData.length > 1) {
        const mHeaders = mData[0];
        const sNumIdx = mHeaders.indexOf('squadNumber');
        const nIdx = mHeaders.indexOf('name');
        
        // ヘッダーが見つからなかった場合のフォールバック（旧仕様対策）
        const finalSNumIdx = sNumIdx !== -1 ? sNumIdx : 0;
        const finalNIdx = nIdx !== -1 ? nIdx : 1;

        mData.slice(1).forEach(row => {
          membersMap[String(row[finalSNumIdx]).trim()] = String(row[finalNIdx]).trim();
        });
      }
    }

    return { success: true, responses: responses, membersMap: membersMap };
  } catch (e) {
    return { error: '集計データの取得エラー: ' + e.message };
  }
}

function updateMonthlySettings(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let settingsSheet = ss.getSheetByName('Settings');
    if (!settingsSheet) {
      settingsSheet = ss.insertSheet('Settings');
    }
    settingsSheet.getRange('A1').setValue('Current_Month');
    settingsSheet.getRange('B1').setValue(data.month);
    settingsSheet.getRange('A2').setValue('Deadline');
    settingsSheet.getRange('B2').setValue(data.deadline);

    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    if (membersSheet) {
      const membersData = membersSheet.getDataRange().getValues();
      if (membersData.length > 0) {
        const headers = membersData[0];
        const answeredIdx = headers.indexOf('answered');
        if (answeredIdx !== -1 && membersData.length > 1) {
          // ヘッダーを除く2行目から最終行までのanswered列をクリア
          membersSheet.getRange(2, answeredIdx + 1, membersData.length - 1, 1).clearContent();
        }
      }
    }

    return { success: true };
  } catch (e) {
    return { error: '設定更新中にエラー: ' + e.message };
  }
}

function updateMemberGoals(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    if (!membersSheet) return { error: 'Sheet "members" not found.' };

    const membersData = membersSheet.getDataRange().getValues();
    if (membersData.length <= 1) return { error: 'No member data.' };

    const headers = membersData[0];
    const squadNumIdx = headers.indexOf('squadNumber');
    
    // Ensure chigiri and monthly_goal headers exist
    let chigiriIdx = headers.indexOf('chigiri');
    if (chigiriIdx === -1) {
      chigiriIdx = headers.length;
      membersSheet.getRange(1, chigiriIdx + 1).setValue('chigiri');
      headers.push('chigiri');
    }
    
    let goalIdx = headers.indexOf('monthly_goal');
    if (goalIdx === -1) {
      goalIdx = headers.length;
      membersSheet.getRange(1, goalIdx + 1).setValue('monthly_goal');
      headers.push('monthly_goal');
    }

    let rowIndex = -1;
    for (let i = 1; i < membersData.length; i++) {
      if (String(membersData[i][squadNumIdx]).trim() === String(data.squadNumber).trim()) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return { error: 'Member not found.' };
    }

    if (data.chigiri !== undefined) {
      membersSheet.getRange(rowIndex, chigiriIdx + 1).setValue(data.chigiri);
    }
    if (data.monthlyGoal !== undefined) {
      membersSheet.getRange(rowIndex, goalIdx + 1).setValue(data.monthlyGoal);
    }

    return { success: true };
  } catch (e) {
    return { error: 'Error saving goals: ' + e.message };
  }
}

function getDashboardRawData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Setting (open/close period & Published_Month)
    const settingsObj = {};
    const settingsSheet = ss.getSheetByName('Setting') || ss.getSheetByName('Settings');
    let publishedMonth = '';
    
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      if (data.length >= 2) {
        const headers = data[0];
        const row = data[1];
        headers.forEach((h, i) => {
          if (h) {
            settingsObj[String(h).trim()] = row[i];
          }
        });
      }
      
      // Extract published month (Setting E2 by default if not found by header)
      publishedMonth = String(settingsObj['publish_month'] || settingsObj['Published_Month'] || settingsSheet.getRange('E2').getValue() || '').trim();
      
      // Extract overall goal and reason
      for (let i = 0; i < data.length; i++) {
        if (data[i] && data[i][0]) {
          const val = String(data[i][0]).trim();
          if (val === '今月の目標') {
             for(let j = i + 1; j < data.length; j++) {
                if (data[j] && data[j][0] && String(data[j][0]).trim() !== '理由') {
                   settingsObj['overall_goal'] = String(data[j][0]).trim();
                   break;
                }
             }
          } else if (val === '理由') {
             for(let j = i + 1; j < data.length; j++) {
                if (data[j] && data[j][0]) {
                   settingsObj['overall_goal_reason'] = String(data[j][0]).trim();
                   break;
                }
             }
          }
        }
      }
    }

    // 2. Evaluation_Responses (Aggregate multiple sheets)
    let evaluations = [];
    const allSheets = ss.getSheets();
    allSheets.forEach(sheet => {
      const sName = sheet.getName();
      if (sName.startsWith('Evaluation_Responses')) {
        let sheetMonth = '';
        if (sName === 'Evaluation_Responses') {
           // Fallback for original sheet without month suffix
           sheetMonth = '1900-01'; // Very old
        } else {
           sheetMonth = sName.replace('Evaluation_Responses_', '').trim();
        }
        
        // If there's a publishedMonth constraint, filter it
        if (!publishedMonth || sheetMonth <= publishedMonth) {
          const sheetData = _sheetToObjects(sheet);
          // Inject Target_Month from sheet name if it is not present or blank
          sheetData.forEach(row => {
             if (!row.Target_Month) {
                row.Target_Month = sheetMonth === '1900-01' ? 'Unknown' : sheetMonth;
             }
          });
          evaluations = evaluations.concat(sheetData);
        }
      }
    });

    // 2. members
    let members = [];
    const membersSheet = ss.getSheetByName('members') || ss.getSheetByName('member');
    if (membersSheet) members = _sheetToObjects(membersSheet);

    // 3. departments
    let featuredDepartments = [];
    const deptSheet = ss.getSheetByName('departments');
    if (deptSheet) {
      const departments = _sheetToObjects(deptSheet);
      featuredDepartments = departments
        .filter(d => d.feature === true || String(d.feature).toUpperCase() === 'TRUE')
        .map(d => ({
          id: String(d.id).trim(),
          name: String(d.name || d.id).trim()
        }));
    }
    


    return {
      success: true,
      evaluations: evaluations,
      members: members,
      featuredDepartments: featuredDepartments,
      settings: settingsObj
    };
      
  } catch (error) {
    return { error: error.toString() };
  }
}

// Helper: _sheetToObjects
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

