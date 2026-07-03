/**
 * Personal Expense Tracker & Smart Budget Manager - Backend API (v2 with Income Tracking)
 * Google Apps Script (Code.js)
 * 
 * Deployment Instructions:
 * 1. Open Google Sheets and copy the Spreadsheet ID.
 * 2. Click Extensions -> Apps Script.
 * 3. Replace the code in the editor with this content and click Save.
 * 4. Deploy -> New deployment -> Web app -> Me -> Anyone.
 * 5. Update Web App URL in your web app Settings.
 */

// Helper to get or create sheet and initialize headers if empty
function getOrCreateSheet(ss, name, headers, defaultData) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (defaultData && defaultData.length > 0) {
      for (var i = 0; i < defaultData.length; i++) {
        sheet.appendRow(defaultData[i]);
      }
    }
  }
  return sheet;
}

// Initialize database sheets if they don't exist
function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Settings Sheet
  var settingsHeaders = ["Key", "Value", "Description"];
  var settingsDefaults = [
    ["weekday_budget", "50", "Budget allocated for weekdays (Mon-Fri)"],
    ["weekend_budget", "80", "Budget allocated for weekends (Sat-Sun)"],
    ["holiday_budget", "120", "Budget allocated for designated holidays"],
    ["currency", "$", "Currency symbol (e.g. $, €, £, ₹)"],
    ["warning_threshold", "20", "Budget warning threshold percentage (0-100)"],
    ["theme", "dark", "Visual theme (light/dark)"],
    ["date_format", "YYYY-MM-DD", "Display format for dates"],
    ["time_format", "HH:mm", "Display format for times"],
    ["carry_forward_enabled", "true", "Whether unused budget carries forward to the next day"],
    ["feature_flags", "{\"income\":true,\"recurring\":false}", "JSON configurations for extra feature flags"],
    ["holidays", "2026-01-01,2026-07-04,2026-12-25", "Comma-separated list of holiday dates (YYYY-MM-DD)"],
    ["income_sources", "Salary, Freelance, Investment, Gifts, Other", "Comma-separated list of income source categories"]
  ];
  getOrCreateSheet(ss, "Settings", settingsHeaders, settingsDefaults);

  // 2. Categories Sheet (Expenses)
  var categoriesHeaders = ["ID", "Name", "Status", "Order"];
  var categoriesDefaults = [
    ["cat_1", "Food & Dining", "Enabled", "1"],
    ["cat_2", "Transportation", "Enabled", "2"],
    ["cat_3", "Utilities & Bills", "Enabled", "3"],
    ["cat_4", "Entertainment", "Enabled", "4"],
    ["cat_5", "Shopping", "Enabled", "5"],
    ["cat_6", "Healthcare", "Enabled", "6"],
    ["cat_7", "Miscellaneous", "Enabled", "7"]
  ];
  getOrCreateSheet(ss, "Categories", categoriesHeaders, categoriesDefaults);

  // 3. Expenses Sheet
  var expensesHeaders = ["ID", "Date", "Time", "Name", "Category", "Amount", "Notes", "CountInBudget", "CreatedAt"];
  var expensesSheet = getOrCreateSheet(ss, "Expenses", expensesHeaders, []);
  ensureExpenseSchema(expensesSheet);

  // 4. Budget History Sheet
  var budgetHeaders = ["Date", "Budget", "Spending", "Remaining", "CarryForward", "AdjustedBudget"];
  getOrCreateSheet(ss, "BudgetHistory", budgetHeaders, []);

  // 5. Income Sheet [NEW]
  var incomeHeaders = ["ID", "Date", "Time", "Name", "Source", "Amount", "Notes", "CreatedAt"];
  getOrCreateSheet(ss, "Income", incomeHeaders, []);
}

// Generate standard responses (GAS web apps allow cross-origin simple GET/POST without manual CORS headers)
function jsonResponse(success, message, data) {
  var result = {
    success: success,
    message: message,
    data: data || null,
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

// Helper to convert sheet data to array of objects
function sheetToJson(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var jsonArray = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    jsonArray.push(obj);
  }
  return jsonArray;
}

// Normalize Google Sheets date cells (Date objects / ISO strings) to YYYY-MM-DD
function normalizeSheetDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return getLocalDateString(value);
  }
  var str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return getLocalDateString(parsed);
  return str;
}

// Normalize Google Sheets time cells (Date with 1899 base / fractions) to HH:mm
function normalizeSheetTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return getLocalTimeString(value);
  }
  if (typeof value === "number") {
    var totalMinutes = Math.round(value * 24 * 60);
    var hh = String(Math.floor(totalMinutes / 60) % 24);
    var mm = String(totalMinutes % 60);
    if (hh.length < 2) hh = "0" + hh;
    if (mm.length < 2) mm = "0" + mm;
    return hh + ":" + mm;
  }
  var str = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(str)) {
    var parts = str.split(":");
    var h = parts[0].length < 2 ? "0" + parts[0] : parts[0];
    var m = (parts[1] || "00").substring(0, 2);
    if (m.length < 2) m = "0" + m;
    return h + ":" + m;
  }
  if (str.indexOf("T") !== -1) {
    var d = new Date(str);
    if (!isNaN(d.getTime())) return getLocalTimeString(d);
  }
  return str;
}

function expenseCountsInBudget(exp) {
  var flag = exp.CountInBudget;
  if (flag === undefined || flag === null || flag === "") return true;
  if (typeof flag === "boolean") return flag;
  var s = String(flag).toLowerCase();
  return s !== "false" && s !== "no" && s !== "0";
}

function ensureExpenseSchema(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var hasCountCol = false;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === "CountInBudget") hasCountCol = true;
  }
  if (!hasCountCol) {
    var createdAtCol = -1;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === "CreatedAt") createdAtCol = j + 1;
    }
    if (createdAtCol > 0) {
      sheet.insertColumnBefore(createdAtCol);
      sheet.getRange(1, createdAtCol).setValue("CountInBudget");
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, createdAtCol, lastRow - 1, 1).setValue("true");
      }
    } else {
      sheet.getRange(1, headers.length + 1).setValue("CountInBudget");
    }
  }
  var rows = sheet.getLastRow();
  if (rows >= 1) {
    sheet.getRange(1, 2, rows, 1).setNumberFormat("@");
    sheet.getRange(1, 3, rows, 1).setNumberFormat("@");
  }
}

function expensesToJson(sheet) {
  ensureExpenseSchema(sheet);
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var jsonArray = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj.Date = normalizeSheetDate(obj.Date);
    obj.Time = normalizeSheetTime(obj.Time);
    obj.CountInBudget = expenseCountsInBudget(obj) ? "true" : "false";
    jsonArray.push(obj);
  }
  return jsonArray;
}

function incomeToJson(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var jsonArray = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj.Date = normalizeSheetDate(obj.Date);
    obj.Time = normalizeSheetTime(obj.Time);
    jsonArray.push(obj);
  }
  var lastRow = sheet.getLastRow();
  if (lastRow >= 1) {
    sheet.getRange(1, 2, lastRow, 1).setNumberFormat("@");
    sheet.getRange(1, 3, lastRow, 1).setNumberFormat("@");
  }
  return jsonArray;
}

function getHeaderColumnMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) map[headers[i]] = i + 1;
  }
  return map;
}

function appendExpenseRow(sheet, data) {
  ensureExpenseSchema(sheet);
  var cols = getHeaderColumnMap(sheet);
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, cols.ID).setValue(data.id);
  sheet.getRange(row, cols.Date).setValue(data.date);
  sheet.getRange(row, cols.Time).setValue(data.time);
  sheet.getRange(row, cols.Name).setValue(data.name);
  sheet.getRange(row, cols.Category).setValue(data.category);
  sheet.getRange(row, cols.Amount).setValue(data.amount);
  sheet.getRange(row, cols.Notes).setValue(data.notes || "");
  if (cols.CountInBudget) {
    sheet.getRange(row, cols.CountInBudget).setValue(data.countInBudget !== false ? "true" : "false");
  }
  sheet.getRange(row, cols.CreatedAt).setValue(data.createdAt);
  sheet.getRange(row, cols.Date, 1, 2).setNumberFormat("@");
}

// Main GET Router
function doGet(e) {
  try {
    initDatabase();
    var action = e.parameter.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!action) {
      return jsonResponse(false, "Action parameter is missing");
    }

    if (action === "getDashboard") {
      return getDashboardData(ss);
    } else if (action === "getExpenses") {
      return getExpensesData(ss, e.parameter);
    } else if (action === "getIncome") {
      return getIncomeData(ss, e.parameter);
    } else if (action === "getCategories") {
      return getCategoriesData(ss);
    } else if (action === "getSettings") {
      return getSettingsData(ss);
    } else if (action === "getReports") {
      return getReportsData(ss, e.parameter);
    }

    return jsonResponse(false, "Unknown action: " + action);
  } catch (err) {
    return jsonResponse(false, "GET Error: " + err.toString());
  }
}


// Main POST Router (processes text/plain body to avoid preflight CORS)
function doPost(e) {
  try {
    initDatabase();
    var payload;
    
    // Parse contents from postData
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse(false, "No post data found");
    }

    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!action) {
      return jsonResponse(false, "Action is missing in payload");
    }

    if (action === "addExpense") {
      return addExpense(ss, payload);
    } else if (action === "updateExpense") {
      return updateExpense(ss, payload);
    } else if (action === "deleteExpense") {
      return deleteExpense(ss, payload);
    } else if (action === "addIncome") {
      return addIncome(ss, payload);
    } else if (action === "updateIncome") {
      return updateIncome(ss, payload);
    } else if (action === "deleteIncome") {
      return deleteIncome(ss, payload);
    } else if (action === "addCategory") {
      return addCategory(ss, payload);
    } else if (action === "updateCategory") {
      return updateCategory(ss, payload);
    } else if (action === "updateSettings") {
      return updateSettings(ss, payload);
    } else if (action === "recalculateBudget") {
      return triggerRecalculation(ss, payload);
    }

    return jsonResponse(false, "Unknown POST action: " + action);
  } catch (err) {
    return jsonResponse(false, "POST Error: " + err.toString());
  }
}

// ----------------------------------------------------
// READ ACTIONS HANDLERS
// ----------------------------------------------------

function getSettingsMap(ss) {
  var sheet = ss.getSheetByName("Settings");
  var rows = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < rows.length; i++) {
    settings[rows[i][0]] = rows[i][1];
  }
  return settings;
}

function getSettingsData(ss) {
  var sheet = ss.getSheetByName("Settings");
  var data = sheetToJson(sheet);
  return jsonResponse(true, "Settings loaded", data);
}

function getCategoriesData(ss) {
  var sheet = ss.getSheetByName("Categories");
  var data = sheetToJson(sheet);
  data.sort(function(a, b) { return Number(a.Order) - Number(b.Order); });
  return jsonResponse(true, "Categories loaded", data);
}

function getExpensesData(ss, params) {
  var sheet = ss.getSheetByName("Expenses");
  var data = expensesToJson(sheet);
  data.sort(function(a, b) {
    var dateA = new Date(a.Date + "T" + (a.Time || "00:00"));
    var dateB = new Date(b.Date + "T" + (b.Time || "00:00"));
    return dateB - dateA;
  });
  return jsonResponse(true, "Expenses loaded", data);
}

function getIncomeData(ss, params) {
  var sheet = ss.getSheetByName("Income");
  var data = incomeToJson(sheet);
  data.sort(function(a, b) {
    var dateA = new Date(a.Date + "T" + (a.Time || "00:00"));
    var dateB = new Date(b.Date + "T" + (b.Time || "00:00"));
    return dateB - dateA;
  });
  return jsonResponse(true, "Income entries loaded", data);
}

function getDashboardData(ss) {
  var settings = getSettingsMap(ss);
  var categoriesSheet = ss.getSheetByName("Categories");
  var expensesSheet = ss.getSheetByName("Expenses");
  var budgetHistorySheet = ss.getSheetByName("BudgetHistory");
  var incomeSheet = ss.getSheetByName("Income");
  
  var categories = sheetToJson(categoriesSheet);
  var expenses = expensesToJson(expensesSheet);
  var incomes = incomeToJson(incomeSheet);
  
  // Recalculate budget if history is empty
  var history = sheetToJson(budgetHistorySheet);
  if (history.length === 0 && expenses.length > 0) {
    recalculateBudgetHistory(ss);
    history = sheetToJson(budgetHistorySheet);
  }
  
  var todayStr = getLocalDateString(new Date());
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = getLocalDateString(tomorrow);
  
  var todayBudgetInfo = getBudgetInfoForDate(ss, todayStr, settings);
  var tomorrowBudgetInfo = getBudgetInfoForDate(ss, tomorrowStr, settings);
  
  var weeklySpending = 0;
  var monthlySpending = 0;
  var todayIncome = 0;
  var weeklyIncome = 0;
  var monthlyIncome = 0;
  
  var todayObj = new Date();
  var startOfWeek = new Date(todayObj);
  var day = startOfWeek.getDay();
  var diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  
  var startOfMonth = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
  
  expenses.forEach(function(exp) {
    if (!expenseCountsInBudget(exp)) return;
    var amt = Number(exp.Amount) || 0;
    var expDate = new Date(exp.Date + "T00:00:00");
    if (expDate >= startOfWeek && expDate <= todayObj) {
      weeklySpending += amt;
    }
    if (expDate >= startOfMonth && expDate <= todayObj) {
      monthlySpending += amt;
    }
  });

  incomes.forEach(function(inc) {
    var amt = Number(inc.Amount) || 0;
    var incDate = new Date(inc.Date + "T00:00:00");
    var incStr = inc.Date;
    
    if (incStr === todayStr) {
      todayIncome += amt;
    }
    if (incDate >= startOfWeek && incDate <= todayObj) {
      weeklyIncome += amt;
    }
    if (incDate >= startOfMonth && incDate <= todayObj) {
      monthlyIncome += amt;
    }
  });

  var sortedExpenses = expenses.slice().sort(function(a, b) {
    return new Date(b.Date + "T" + (b.Time || "00:00")) - new Date(a.Date + "T" + (a.Time || "00:00"));
  });
  
  var dashboardData = {
    todayBudget: todayBudgetInfo.budget,
    carryForward: todayBudgetInfo.carryForward,
    adjustedBudget: todayBudgetInfo.adjustedBudget,
    todaySpending: todayBudgetInfo.spending,
    remainingBudget: todayBudgetInfo.remaining,
    tomorrowBudget: tomorrowBudgetInfo.adjustedBudget,
    weeklySpending: weeklySpending,
    monthlySpending: monthlySpending,
    
    // Income Additions
    todayIncome: todayIncome,
    weeklyIncome: weeklyIncome,
    monthlyIncome: monthlyIncome,
    netSavings: (monthlyIncome - monthlySpending),
    
    recentExpenses: sortedExpenses.slice(0, 5),
    categories: categories,
    settings: settings
  };
  
  return jsonResponse(true, "Dashboard data loaded", dashboardData);
}

function getReportsData(ss, params) {
  var rangeType = params.range || "monthly";
  var reportType = params.type || "expense"; // expense or income
  var startDateStr = params.startDate;
  var endDateStr = params.endDate;
  var categoryFilter = params.category;
  
  var settings = getSettingsMap(ss);
  
  // Choose correct source sheet
  var items = [];
  var chartLabels = [];
  if (reportType === "income") {
    items = incomeToJson(ss.getSheetByName("Income"));
    chartLabels = (settings.income_sources || "Salary,Freelance,Investment,Gifts,Other").split(",").map(function(s) { return s.trim(); });
  } else {
    items = expensesToJson(ss.getSheetByName("Expenses"));
    var categories = sheetToJson(ss.getSheetByName("Categories"));
    categories.forEach(function(c) { chartLabels.push(c.Name); });
    chartLabels.push("Uncategorized");
  }
  
  var now = new Date();
  var start = new Date();
  var end = new Date();
  
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  if (rangeType === "today") {
    // Current day
  } else if (rangeType === "yesterday") {
    start.setDate(now.getDate() - 1);
    end.setDate(now.getDate() - 1);
  } else if (rangeType === "weekly") {
    var day = start.getDay();
    var diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
  } else if (rangeType === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (rangeType === "yearly") {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (rangeType === "custom" && startDateStr && endDateStr) {
    start = new Date(startDateStr + "T00:00:00");
    end = new Date(endDateStr + "T23:59:59");
  }
  
  var filteredItems = [];
  var totalAmount = 0;
  var groupMap = {};
  
  chartLabels.forEach(function(lbl) {
    groupMap[lbl] = 0;
  });
  if (groupMap["Uncategorized"] === undefined) groupMap["Uncategorized"] = 0;

  items.forEach(function(item) {
    var itemDate = new Date(item.Date + "T00:00:00");
    var isDateMatch = (itemDate >= start && itemDate <= end);
    
    // In Expenses sheet it is "Category", in Income sheet it is "Source"
    var catName = (reportType === "income") ? (item.Source || "Other") : (item.Category || "Uncategorized");
    var isCategoryMatch = !categoryFilter || catName === categoryFilter;
    
    if (isDateMatch && isCategoryMatch) {
      var countsInBudget = reportType === "income" || expenseCountsInBudget(item);
      if (countsInBudget) {
        filteredItems.push(item);
        var amt = Number(item.Amount) || 0;
        totalAmount += amt;
        if (groupMap[catName] !== undefined) {
          groupMap[catName] += amt;
        } else {
          groupMap[catName] = (groupMap[catName] || 0) + amt;
        }
      }
    }
  });
  
  filteredItems.sort(function(a, b) {
    var dateA = new Date(a.Date + "T" + (a.Time || "00:00"));
    var dateB = new Date(b.Date + "T" + (b.Time || "00:00"));
    return dateB - dateA;
  });

  // Calculate daily budget averages (relevant for expenses report)
  var budgetHistory = sheetToJson(ss.getSheetByName("BudgetHistory"));
  var rangeBudgets = budgetHistory.filter(function(h) {
    var hDate = new Date(normalizeSheetDate(h.Date) + "T00:00:00");
    return hDate >= start && hDate <= end;
  });
  
  var totalBudget = 0;
  var totalAdjustedBudget = 0;
  rangeBudgets.forEach(function(b) {
    totalBudget += Number(b.Budget) || 0;
    totalAdjustedBudget += Number(b.AdjustedBudget) || 0;
  });
  
  var count = rangeBudgets.length || 1;
  var avgDailyBudget = totalBudget / count;
  var remainingBudget = totalAdjustedBudget - totalAmount;

  // Group by category chart data
  var chartCategoryLabels = [];
  var chartCategoryValues = [];
  for (var key in groupMap) {
    if (groupMap[key] > 0) {
      chartCategoryLabels.push(key);
      chartCategoryValues.push(groupMap[key]);
    }
  }

  // Daily line chart trends
  var chartDailyLabels = [];
  var chartDailyAmount = [];
  var chartDailyBudget = [];
  
  var tempDate = new Date(start);
  while (tempDate <= end && tempDate <= now) {
    var dateStr = getLocalDateString(tempDate);
    chartDailyLabels.push(dateStr);
    
    var dayAmt = 0;
    filteredItems.forEach(function(item) {
      if (item.Date === dateStr) {
        dayAmt += Number(item.Amount) || 0;
      }
    });
    chartDailyAmount.push(dayAmt);
    
    var dayHistory = budgetHistory.find(function(h) { return normalizeSheetDate(h.Date) === dateStr; });
    var dayBudget = dayHistory ? Number(dayHistory.AdjustedBudget) : getBaseBudget(ss, tempDate, settings);
    chartDailyBudget.push(dayBudget);
    
    tempDate.setDate(tempDate.getDate() + 1);
  }

  var reportData = {
    range: rangeType,
    type: reportType,
    startDate: getLocalDateString(start),
    endDate: getLocalDateString(end),
    totalSpending: totalAmount, // labeled as total spending, but represents sum of selected type
    avgDailyBudget: avgDailyBudget,
    totalAdjustedBudget: totalAdjustedBudget,
    remainingBudget: remainingBudget,
    expenses: filteredItems, // labeled as expenses but stores either Expenses or Incomes
    chartCategory: {
      labels: chartCategoryLabels,
      values: chartCategoryValues
    },
    chartTrend: {
      labels: chartDailyLabels,
      spending: chartDailyAmount,
      budget: chartDailyBudget
    }
  };

  return jsonResponse(true, "Reports compiled successfully", reportData);
}

// ----------------------------------------------------
// WRITE ACTIONS HANDLERS
// ----------------------------------------------------

function addExpense(ss, payload) {
  var sheet = ss.getSheetByName("Expenses");
  var id = payload.id || "exp_" + Utilities.getUuid();
  var date = payload.date || getLocalDateString(new Date());
  var time = payload.time || getLocalTimeString(new Date());
  var name = payload.name;
  var category = payload.category;
  var amount = Number(payload.amount);
  var notes = payload.notes || "";
  var countInBudget = payload.countInBudget !== false;
  var createdAt = new Date().toISOString();
  
  if (!name || isNaN(amount) || amount <= 0) {
    return jsonResponse(false, "Validation error: Name is required and Amount must be positive.");
  }
  
  appendExpenseRow(sheet, {
    id: id,
    date: date,
    time: time,
    name: name,
    category: category,
    amount: amount,
    notes: notes,
    countInBudget: countInBudget,
    createdAt: createdAt
  });
  recalculateBudgetHistory(ss, date);
  return jsonResponse(true, "Expense added successfully", { id: id });
}

function updateExpense(ss, payload) {
  var sheet = ss.getSheetByName("Expenses");
  ensureExpenseSchema(sheet);
  var rows = sheet.getDataRange().getValues();
  var cols = getHeaderColumnMap(sheet);
  var id = payload.id;
  var date = payload.date;
  var time = payload.time;
  var name = payload.name;
  var category = payload.category;
  var amount = Number(payload.amount);
  var notes = payload.notes || "";
  var countInBudget = payload.countInBudget !== false;
  
  if (!id || !name || isNaN(amount) || amount <= 0) {
    return jsonResponse(false, "Validation error: ID, Name required and Amount must be positive.");
  }
  
  var rowIndex = -1;
  var oldDate = "";
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      rowIndex = i + 1;
      oldDate = normalizeSheetDate(rows[i][1]);
      break;
    }
  }
  
  if (rowIndex === -1) {
    return jsonResponse(false, "Expense not found with ID: " + id);
  }
  
  sheet.getRange(rowIndex, cols.Date).setValue(date);
  sheet.getRange(rowIndex, cols.Time).setValue(time);
  sheet.getRange(rowIndex, cols.Name).setValue(name);
  sheet.getRange(rowIndex, cols.Category).setValue(category);
  sheet.getRange(rowIndex, cols.Amount).setValue(amount);
  sheet.getRange(rowIndex, cols.Notes).setValue(notes);
  if (cols.CountInBudget) {
    sheet.getRange(rowIndex, cols.CountInBudget).setValue(countInBudget ? "true" : "false");
  }
  sheet.getRange(rowIndex, cols.Date, 1, 2).setNumberFormat("@");
  
  var earliestDate = oldDate;
  if (new Date(date) < new Date(oldDate)) {
    earliestDate = date;
  }
  recalculateBudgetHistory(ss, earliestDate);
  return jsonResponse(true, "Expense updated successfully");
}

function deleteExpense(ss, payload) {
  var sheet = ss.getSheetByName("Expenses");
  var rows = sheet.getDataRange().getValues();
  var id = payload.id;
  
  if (!id) {
    return jsonResponse(false, "ID is required to delete.");
  }
  
  var rowIndex = -1;
  var date = "";
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      rowIndex = i + 1;
      date = normalizeSheetDate(rows[i][1]);
      break;
    }
  }
  
  if (rowIndex === -1) {
    return jsonResponse(false, "Expense not found with ID: " + id);
  }
  
  sheet.deleteRow(rowIndex);
  recalculateBudgetHistory(ss, date);
  return jsonResponse(true, "Expense deleted successfully");
}

// INCOME WRITE ACTIONS
function addIncome(ss, payload) {
  var sheet = ss.getSheetByName("Income");
  var id = payload.id || "inc_" + Utilities.getUuid();
  var date = payload.date || getLocalDateString(new Date());
  var time = payload.time || getLocalTimeString(new Date());
  var name = payload.name;
  var source = payload.source; // equivalent of Category
  var amount = Number(payload.amount);
  var notes = payload.notes || "";
  var createdAt = new Date().toISOString();
  
  if (!name || isNaN(amount) || amount <= 0 || !source) {
    return jsonResponse(false, "Validation error: Name, Source, and positive Amount are required.");
  }
  
  sheet.appendRow([id, date, time, name, source, amount, notes, createdAt]);
  return jsonResponse(true, "Income logged successfully", { id: id });
}

function updateIncome(ss, payload) {
  var sheet = ss.getSheetByName("Income");
  var rows = sheet.getDataRange().getValues();
  var id = payload.id;
  var date = payload.date;
  var time = payload.time;
  var name = payload.name;
  var source = payload.source;
  var amount = Number(payload.amount);
  var notes = payload.notes || "";
  
  if (!id || !name || isNaN(amount) || amount <= 0 || !source) {
    return jsonResponse(false, "Validation error: ID, Name, Source, and positive Amount required.");
  }
  
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    return jsonResponse(false, "Income record not found.");
  }
  
  sheet.getRange(rowIndex, 2).setValue(date);
  sheet.getRange(rowIndex, 3).setValue(time);
  sheet.getRange(rowIndex, 4).setValue(name);
  sheet.getRange(rowIndex, 5).setValue(source);
  sheet.getRange(rowIndex, 6).setValue(amount);
  sheet.getRange(rowIndex, 7).setValue(notes);
  
  return jsonResponse(true, "Income record updated successfully");
}

function deleteIncome(ss, payload) {
  var sheet = ss.getSheetByName("Income");
  var rows = sheet.getDataRange().getValues();
  var id = payload.id;
  
  if (!id) {
    return jsonResponse(false, "ID is required.");
  }
  
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    return jsonResponse(false, "Income record not found.");
  }
  
  sheet.deleteRow(rowIndex);
  return jsonResponse(true, "Income record deleted successfully");
}

function addCategory(ss, payload) {
  var sheet = ss.getSheetByName("Categories");
  var name = payload.name;
  
  if (!name) {
    return jsonResponse(false, "Category name is required.");
  }
  
  var rows = sheet.getDataRange().getValues();
  var order = rows.length;
  var id = "cat_" + Utilities.getUuid();
  
  sheet.appendRow([id, name, "Enabled", order]);
  return jsonResponse(true, "Category added successfully", { id: id, name: name });
}

function updateCategory(ss, payload) {
  var sheet = ss.getSheetByName("Categories");
  var rows = sheet.getDataRange().getValues();
  var id = payload.id;
  var name = payload.name;
  var status = payload.status;
  var order = payload.order;
  
  if (!id) {
    return jsonResponse(false, "ID is required.");
  }
  
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    return jsonResponse(false, "Category not found.");
  }
  
  if (name) sheet.getRange(rowIndex, 2).setValue(name);
  if (status) sheet.getRange(rowIndex, 3).setValue(status);
  if (order !== undefined) sheet.getRange(rowIndex, 4).setValue(order);
  
  return jsonResponse(true, "Category updated successfully");
}

function updateSettings(ss, payload) {
  var sheet = ss.getSheetByName("Settings");
  var rows = sheet.getDataRange().getValues();
  var newSettings = payload.settings;
  
  if (!newSettings) {
    return jsonResponse(false, "Settings payload is empty.");
  }
  
  for (var key in newSettings) {
    var rowIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 2).setValue(newSettings[key].toString());
    } else {
      sheet.appendRow([key, newSettings[key].toString(), "Custom Setting"]);
    }
  }
  
  recalculateBudgetHistory(ss);
  return jsonResponse(true, "Settings saved and budget history updated");
}

function triggerRecalculation(ss, payload) {
  var startDate = payload.startDate;
  recalculateBudgetHistory(ss, startDate);
  return jsonResponse(true, "Budget history recalculated successfully");
}

// ----------------------------------------------------
// BUDGET ENGINE
// ----------------------------------------------------

function getBaseBudget(ss, dateObj, settings) {
  var holidaysStr = settings.holidays || "";
  var holidays = holidaysStr.split(",").map(function(s) { return s.trim(); });
  var dateStr = getLocalDateString(dateObj);
  
  if (holidays.indexOf(dateStr) !== -1) {
    return Number(settings.holiday_budget) || 120;
  }
  
  var dayOfWeek = dateObj.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return Number(settings.weekend_budget) || 80;
  }
  
  return Number(settings.weekday_budget) || 50;
}

function getBudgetInfoForDate(ss, dateStr, settings) {
  var historySheet = ss.getSheetByName("BudgetHistory");
  var historyRows = historySheet.getDataRange().getValues();
  
  for (var i = 1; i < historyRows.length; i++) {
    if (normalizeSheetDate(historyRows[i][0]) === dateStr) {
      return {
        date: dateStr,
        budget: Number(historyRows[i][1]),
        spending: Number(historyRows[i][2]),
        remaining: Number(historyRows[i][3]),
        carryForward: Number(historyRows[i][4]),
        adjustedBudget: Number(historyRows[i][5])
      };
    }
  }
  
  var dateObj = new Date(dateStr + "T00:00:00");
  var base = getBaseBudget(ss, dateObj, settings);
  
  var prevDate = new Date(dateObj);
  prevDate.setDate(prevDate.getDate() - 1);
  var prevDateStr = getLocalDateString(prevDate);
  
  var carryForward = 0;
  if (settings.carry_forward_enabled === "true") {
    for (var j = 1; j < historyRows.length; j++) {
      if (normalizeSheetDate(historyRows[j][0]) === prevDateStr) {
        carryForward = Number(historyRows[j][3]) || 0;
        break;
      }
    }
  }
  
  var expenses = expensesToJson(ss.getSheetByName("Expenses"));
  var spending = 0;
  expenses.forEach(function(exp) {
    if (exp.Date === dateStr && expenseCountsInBudget(exp)) {
      spending += Number(exp.Amount) || 0;
    }
  });
  
  var adjusted = base + carryForward;
  var remaining = adjusted - spending;
  
  return {
    date: dateStr,
    budget: base,
    spending: spending,
    remaining: remaining,
    carryForward: carryForward,
    adjustedBudget: adjusted
  };
}

function recalculateBudgetHistory(ss, startDateStr) {
  var expenses = expensesToJson(ss.getSheetByName("Expenses"));
  var settings = getSettingsMap(ss);
  
  var today = new Date();
  var minDate = new Date();
  
  if (expenses.length > 0) {
    expenses.forEach(function(exp) {
      var d = new Date(exp.Date + "T00:00:00");
      if (d < minDate) minDate = d;
    });
  } else {
    minDate.setDate(minDate.getDate() - 7);
  }
  
  if (startDateStr) {
    var reqStart = new Date(startDateStr + "T00:00:00");
    if (reqStart < minDate) {
      minDate = reqStart;
    } else {
      minDate = reqStart;
    }
  }
  
  minDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  var spendingByDate = {};
  expenses.forEach(function(exp) {
    if (!expenseCountsInBudget(exp)) return;
    var dStr = exp.Date;
    var amt = Number(exp.Amount) || 0;
    spendingByDate[dStr] = (spendingByDate[dStr] || 0) + amt;
  });
  
  var historySheet = ss.getSheetByName("BudgetHistory");
  var oldHistory = sheetToJson(historySheet);
  var historyMap = {};
  oldHistory.forEach(function(h) {
    historyMap[normalizeSheetDate(h.Date)] = h;
  });
  
  var calculatedHistory = [];
  var prevRemaining = 0;
  
  var dayBeforeMin = new Date(minDate);
  dayBeforeMin.setDate(dayBeforeMin.getDate() - 1);
  var dayBeforeMinStr = getLocalDateString(dayBeforeMin);
  
  if (settings.carry_forward_enabled === "true" && historyMap[dayBeforeMinStr]) {
    prevRemaining = Number(historyMap[dayBeforeMinStr].Remaining) || 0;
  }
  
  var curDate = new Date(minDate);
  while (curDate <= today) {
    var dateStr = getLocalDateString(curDate);
    var baseBudget = getBaseBudget(ss, curDate, settings);
    var carryForward = (settings.carry_forward_enabled === "true") ? prevRemaining : 0;
    var adjustedBudget = baseBudget + carryForward;
    var spending = spendingByDate[dateStr] || 0;
    var remaining = adjustedBudget - spending;
    
    calculatedHistory.push([
      dateStr,
      baseBudget,
      spending,
      remaining,
      carryForward,
      adjustedBudget
    ]);
    
    prevRemaining = remaining;
    curDate.setDate(curDate.getDate() + 1);
  }
  
  var historySheet = ss.getSheetByName("BudgetHistory");
  var historyRows = historySheet.getDataRange().getValues();
  var newHistoryRows = [historyRows[0]];
  
  for (var k = 1; k < historyRows.length; k++) {
    var rowDate = new Date(normalizeSheetDate(historyRows[k][0]) + "T00:00:00");
    if (rowDate < minDate) {
      newHistoryRows.push(historyRows[k]);
    }
  }
  
  calculatedHistory.forEach(function(row) {
    newHistoryRows.push(row);
  });
  
  historySheet.clearContents();
  historySheet.getRange(1, 1, newHistoryRows.length, 6).setValues(newHistoryRows);
}

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------

function getLocalDateString(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, '0');
  var dd = String(date.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function getLocalTimeString(date) {
  var hh = String(date.getHours()).padStart(2, '0');
  var mm = String(date.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}
