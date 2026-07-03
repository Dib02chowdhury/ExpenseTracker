/**
 * Expense Tracker & Smart Budget Manager - API Connection Layer (v2 with Income support)
 * Handles live API requests with retry logic, CORS-bypass, and falls back to LocalStorage Mock DB.
 */

class ExpenseTrackerAPI {
  constructor() {
    this.config = {
      sheetId: "",
      appsScriptUrl: ""
    };
    this.mockMode = true;
    this.initMockDB();
  }

  // Load configuration from config.json or localStorage (Silent error handling to prevent browser CORS logs)
  async loadConfig() {
    // 1. Try to fetch config.json from root quietly
    try {
      const response = await fetch('config.json');
      if (response.ok) {
        const fileConfig = await response.json();
        if (fileConfig.appsScriptUrl) {
          this.config.appsScriptUrl = fileConfig.appsScriptUrl;
          this.config.sheetId = fileConfig.sheetId || "";
          this.mockMode = false;
          console.log("BudgetFlow: Loaded configurations from config.json");
          return;
        }
      }
    } catch (e) {
      // Quiet fail to prevent browser logging block tracebacks on double-click
    }

    // 2. Try loading from localStorage
    const localConfig = localStorage.getItem("expense_tracker_config");
    if (localConfig) {
      try {
        const parsed = JSON.parse(localConfig);
        if (parsed.appsScriptUrl) {
          this.config.appsScriptUrl = parsed.appsScriptUrl;
          this.config.sheetId = parsed.sheetId || "";
          this.mockMode = false;
          console.log("BudgetFlow: Connected via web app configuration.");
          return;
        }
      } catch (err) {
        // Quiet parse fail
      }
    }

    // Fall back to Mock Mode
    this.mockMode = true;
    console.log("BudgetFlow: No configurations detected. Running in offline Mock DB Mode.");
  }

  // Set new configuration and write to localStorage
  async setConfig(sheetId, appsScriptUrl) {
    this.config.sheetId = sheetId || "";
    this.config.appsScriptUrl = appsScriptUrl || "";
    
    if (appsScriptUrl) {
      this.mockMode = false;
      localStorage.setItem("expense_tracker_config", JSON.stringify(this.config));
    } else {
      this.mockMode = true;
      localStorage.removeItem("expense_tracker_config");
    }
    
    return { success: true, message: this.mockMode ? "Switched to Mock Mode" : "Configured backend successfully" };
  }

  // Main Call Dispatcher (implements retries for live API)
  async call(action, payload = {}, retries = 3, delay = 500) {
    if (this.mockMode) {
      return this.handleMockCall(action, payload);
    }

    const isPost = ["addExpense", "updateExpense", "deleteExpense", "addIncome", "updateIncome", "deleteIncome", "addCategory", "updateCategory", "updateSettings", "recalculateBudget"].includes(action);
    const url = this.config.appsScriptUrl;

    let response;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (isPost) {
          // text/plain avoids CORS preflight; GAS doPost reads e.postData.contents as JSON
          response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action, ...payload })
          });
        } else {
          // Simple GET (no custom headers) avoids OPTIONS preflight that GAS cannot answer
          const queryParams = new URLSearchParams({ action, ...payload });
          response = await fetch(`${url}?${queryParams.toString()}`, {
            method: "GET"
          });
        }

        if (response.ok) {
          const json = await response.json();
          return json;
        } else {
          throw new Error(`HTTP Error Status: ${response.status}`);
        }
      } catch (err) {
        lastError = err;
        console.warn(`API call attempt ${attempt} failed: ${err.message}. Retrying...`);
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, delay * attempt));
        }
      }
    }

    return {
      success: false,
      message: `Failed to connect to Google Sheets backend. Error: ${lastError.message}`,
      data: null,
      timestamp: new Date().toISOString()
    };
  }

  // ----------------------------------------------------
  // LOCALSTORAGE MOCK DATABASE SIMULATOR (v2 with Income)
  // ----------------------------------------------------

  initMockDB() {
    // 1. Settings Init
    if (!localStorage.getItem("mock_settings")) {
      const defaultSettings = [
        { Key: "weekday_budget", Value: "50", Description: "Budget allocated for weekdays (Mon-Fri)" },
        { Key: "weekend_budget", Value: "80", Description: "Budget allocated for weekends (Sat-Sun)" },
        { Key: "holiday_budget", Value: "120", Description: "Budget allocated for designated holidays" },
        { Key: "currency", Value: "$", Description: "Currency symbol" },
        { Key: "warning_threshold", Value: "20", Description: "Budget warning threshold percentage" },
        { Key: "theme", Value: "dark", Description: "Visual theme (light/dark)" },
        { Key: "date_format", Value: "YYYY-MM-DD", Description: "Display format for dates" },
        { Key: "time_format", Value: "HH:mm", Description: "Display format for times" },
        { Key: "carry_forward_enabled", Value: "true", Description: "Whether unused budget carries forward" },
        { Key: "feature_flags", Value: '{"income":true,"recurring":false}', Description: "Feature flags" },
        { Key: "holidays", Value: "2026-01-01,2026-07-04,2026-12-25", Description: "Designated holiday dates" },
        { Key: "income_sources", Value: "Salary, Freelance, Investment, Gifts, Other", Description: "List of income categories" }
      ];
      localStorage.setItem("mock_settings", JSON.stringify(defaultSettings));
    }

    // 2. Categories Init (Expenses)
    if (!localStorage.getItem("mock_categories")) {
      const defaultCategories = [
        { ID: "cat_1", Name: "Food & Dining", Status: "Enabled", Order: "1" },
        { ID: "cat_2", Name: "Transportation", Status: "Enabled", Order: "2" },
        { ID: "cat_3", Name: "Utilities & Bills", Status: "Enabled", Order: "3" },
        { ID: "cat_4", Name: "Entertainment", Status: "Enabled", Order: "4" },
        { ID: "cat_5", Name: "Shopping", Status: "Enabled", Order: "5" },
        { ID: "cat_6", Name: "Healthcare", Status: "Enabled", Order: "6" },
        { ID: "cat_7", Name: "Miscellaneous", Status: "Enabled", Order: "7" }
      ];
      localStorage.setItem("mock_categories", JSON.stringify(defaultCategories));
    }

    // 3. Expenses Init
    if (!localStorage.getItem("mock_expenses")) {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const defaultExpenses = [
        { ID: "exp_1", Date: this.getLocalDateString(today), Time: "13:15", Name: "Lunch at Cafe", Category: "Food & Dining", Amount: 18.5, Notes: "Weekly team lunch", CountInBudget: "true", CreatedAt: today.toISOString() },
        { ID: "exp_2", Date: this.getLocalDateString(today), Time: "08:45", Name: "Bus ticket", Category: "Transportation", Amount: 2.75, Notes: "", CountInBudget: "true", CreatedAt: today.toISOString() },
        { ID: "exp_3", Date: this.getLocalDateString(yesterday), Time: "20:00", Name: "Cinema Movie", Category: "Entertainment", Amount: 15.0, Notes: "Sci-fi film", CountInBudget: "true", CreatedAt: yesterday.toISOString() },
        { ID: "exp_4", Date: this.getLocalDateString(yesterday), Time: "18:30", Name: "Grocery shopping", Category: "Food & Dining", Amount: 32.4, Notes: "Weekly supplies", CountInBudget: "true", CreatedAt: yesterday.toISOString() },
        { ID: "exp_5", Date: this.getLocalDateString(twoDaysAgo), Time: "10:15", Name: "Electricity bill", Category: "Utilities & Bills", Amount: 45.0, Notes: "Monthly payment", CountInBudget: "true", CreatedAt: twoDaysAgo.toISOString() }
      ];
      localStorage.setItem("mock_expenses", JSON.stringify(defaultExpenses));
    }

    // 4. Income Init [NEW]
    if (!localStorage.getItem("mock_income")) {
      const today = new Date();
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 5);

      const defaultIncome = [
        { ID: "inc_1", Date: this.getLocalDateString(today), Time: "09:00", Name: "Monthly Salary Pay", Source: "Salary", Amount: 2500.0, Notes: "Primary job", CreatedAt: today.toISOString() },
        { ID: "inc_2", Date: this.getLocalDateString(lastWeek), Time: "15:30", Name: "Freelance Project", Source: "Freelance", Amount: 450.0, Notes: "Web design consulting", CreatedAt: lastWeek.toISOString() }
      ];
      localStorage.setItem("mock_income", JSON.stringify(defaultIncome));
    }

    this.mockRecalculateBudgetHistory();
  }

  // Handle Mock Operations
  handleMockCall(action, payload) {
    const response = {
      success: true,
      message: "",
      data: null,
      timestamp: new Date().toISOString()
    };

    const getSettings = () => JSON.parse(localStorage.getItem("mock_settings") || "[]");
    const getCategories = () => JSON.parse(localStorage.getItem("mock_categories") || "[]");
    const getExpenses = () => JSON.parse(localStorage.getItem("mock_expenses") || "[]");
    const getIncome = () => JSON.parse(localStorage.getItem("mock_income") || "[]");
    const getHistory = () => JSON.parse(localStorage.getItem("mock_budget_history") || "[]");

    const setSettings = (data) => localStorage.setItem("mock_settings", JSON.stringify(data));
    const setCategories = (data) => localStorage.setItem("mock_categories", JSON.stringify(data));
    const setExpenses = (data) => localStorage.setItem("mock_expenses", JSON.stringify(data));
    const setIncome = (data) => localStorage.setItem("mock_income", JSON.stringify(data));

    switch (action) {
      case "getSettings":
        response.data = getSettings();
        response.message = "Settings loaded (Mock)";
        break;

      case "getCategories":
        response.data = getCategories();
        response.message = "Categories loaded (Mock)";
        break;

      case "getExpenses":
        response.data = getExpenses().sort((a, b) => new Date(b.Date + "T" + b.Time) - new Date(a.Date + "T" + a.Time));
        response.message = "Expenses loaded (Mock)";
        break;

      case "getIncome":
        response.data = getIncome().sort((a, b) => new Date(b.Date + "T" + b.Time) - new Date(a.Date + "T" + a.Time));
        response.message = "Income loaded (Mock)";
        break;

      case "getDashboard":
        {
          const settingsMap = {};
          getSettings().forEach(s => settingsMap[s.Key] = s.Value);

          const expenses = getExpenses();
          const incomes = getIncome();
          const history = getHistory();
          const todayStr = this.getLocalDateString(new Date());
          
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = this.getLocalDateString(tomorrow);

          const todayInfo = this.mockGetBudgetInfoForDate(todayStr, settingsMap, history, expenses);
          const tomorrowInfo = this.mockGetBudgetInfoForDate(tomorrowStr, settingsMap, history, expenses);

          // Calculate Weekly and Monthly spending
          const now = new Date();
          const startOfWeek = new Date(now);
          const day = startOfWeek.getDay();
          const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
          startOfWeek.setDate(diff);
          startOfWeek.setHours(0, 0, 0, 0);

          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          let weeklySpending = 0;
          let monthlySpending = 0;
          let todayIncome = 0;
          let weeklyIncome = 0;
          let monthlyIncome = 0;

          expenses.forEach(exp => {
            if (!this.expenseCountsInBudget(exp)) return;
            const amt = Number(exp.Amount) || 0;
            const expDate = new Date(exp.Date + "T00:00:00");
            if (expDate >= startOfWeek && expDate <= now) {
              weeklySpending += amt;
            }
            if (expDate >= startOfMonth && expDate <= now) {
              monthlySpending += amt;
            }
          });

          incomes.forEach(inc => {
            const amt = Number(inc.Amount) || 0;
            const incDate = new Date(inc.Date + "T00:00:00");
            const incStr = inc.Date;
            
            if (incStr === todayStr) {
              todayIncome += amt;
            }
            if (incDate >= startOfWeek && incDate <= now) {
              weeklyIncome += amt;
            }
            if (incDate >= startOfMonth && incDate <= now) {
              monthlyIncome += amt;
            }
          });

          const sortedExpenses = expenses.slice().sort((a, b) => new Date(b.Date + "T" + (b.Time || "00:00")) - new Date(a.Date + "T" + (a.Time || "00:00")));

          response.data = {
            todayBudget: todayInfo.budget,
            carryForward: todayInfo.carryForward,
            adjustedBudget: todayInfo.adjustedBudget,
            todaySpending: todayInfo.spending,
            remainingBudget: todayInfo.remaining,
            tomorrowBudget: tomorrowInfo.adjustedBudget,
            weeklySpending,
            monthlySpending,
            
            // Income variables
            todayIncome,
            weeklyIncome,
            monthlyIncome,
            netSavings: (monthlyIncome - monthlySpending),
            
            recentExpenses: sortedExpenses.slice(0, 5),
            categories: getCategories(),
            settings: settingsMap
          };
          response.message = "Dashboard loaded (Mock)";
        }
        break;

      case "getReports":
        {
          const rangeType = payload.range || "monthly";
          const reportType = payload.type || "expense";
          const settingsMap = {};
          getSettings().forEach(s => settingsMap[s.Key] = s.Value);

          const categories = getCategories();
          const now = new Date();
          let start = new Date();
          let end = new Date();

          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);

          if (rangeType === "today") {
            // Already set
          } else if (rangeType === "yesterday") {
            start.setDate(now.getDate() - 1);
            end.setDate(now.getDate() - 1);
          } else if (rangeType === "weekly") {
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
          } else if (rangeType === "monthly") {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
          } else if (rangeType === "yearly") {
            start = new Date(now.getFullYear(), 0, 1);
          } else if (rangeType === "custom" && payload.startDate && payload.endDate) {
            start = new Date(payload.startDate + "T00:00:00");
            end = new Date(payload.endDate + "T23:59:59");
          }

          // Choose correct dataset
          let rawItems = [];
          let sourceLabels = [];
          if (reportType === "income") {
            rawItems = getIncome();
            sourceLabels = (settingsMap.income_sources || "Salary,Freelance,Investment,Gifts,Other").split(",").map(s => s.trim());
          } else {
            rawItems = getExpenses();
            categories.forEach(c => sourceLabels.push(c.Name));
            sourceLabels.push("Uncategorized");
          }

          const filteredItems = [];
          let totalAmount = 0;
          const groupMap = {};

          sourceLabels.forEach(lbl => groupMap[lbl] = 0);
          if (groupMap["Uncategorized"] === undefined) groupMap["Uncategorized"] = 0;

          rawItems.forEach(item => {
            const itemDate = new Date(item.Date + "T00:00:00");
            const isDateMatch = (itemDate >= start && itemDate <= end);
            const catName = (reportType === "income") ? (item.Source || "Other") : (item.Category || "Uncategorized");
            const isCategoryMatch = !payload.category || catName === payload.category;

            if (isDateMatch && isCategoryMatch) {
              const countsInBudget = reportType === "income" || this.expenseCountsInBudget(item);
              if (!countsInBudget) return;
              filteredItems.push(item);
              const amt = Number(item.Amount) || 0;
              totalAmount += amt;
              groupMap[catName] = (groupMap[catName] || 0) + amt;
            }
          });

          filteredItems.sort((a, b) => new Date(b.Date + "T" + b.Time) - new Date(a.Date + "T" + a.Time));

          // Budget history range calculations
          const history = getHistory();
          const rangeHist = history.filter(h => {
            const hDate = new Date(h.Date + "T00:00:00");
            return hDate >= start && hDate <= end;
          });

          let totalBudget = 0;
          let totalAdjustedBudget = 0;
          rangeHist.forEach(b => {
            totalBudget += Number(b.Budget) || 0;
            totalAdjustedBudget += Number(b.AdjustedBudget) || 0;
          });

          const count = rangeHist.length || 1;
          const avgDailyBudget = totalBudget / count;
          const remainingBudget = totalAdjustedBudget - totalAmount;

          const chartCategoryLabels = [];
          const chartCategoryValues = [];
          for (let cat in groupMap) {
            if (groupMap[cat] > 0) {
              chartCategoryLabels.push(cat);
              chartCategoryValues.push(groupMap[cat]);
            }
          }

          // Daily line trends
          const chartDailyLabels = [];
          const chartDailyAmount = [];
          const chartDailyBudget = [];

          const temp = new Date(start);
          while (temp <= end && temp <= now) {
            const dateStr = this.getLocalDateString(temp);
            chartDailyLabels.push(dateStr);

            let dayAmt = 0;
            filteredItems.forEach(item => {
              if (item.Date === dateStr) {
                dayAmt += Number(item.Amount) || 0;
              }
            });
            chartDailyAmount.push(dayAmt);

            const dayHist = history.find(h => h.Date === dateStr);
            const dayBudget = dayHist ? Number(dayHist.AdjustedBudget) : this.mockGetBaseBudget(temp, settingsMap);
            chartDailyBudget.push(dayBudget);

            temp.setDate(temp.getDate() + 1);
          }

          response.data = {
            range: rangeType,
            type: reportType,
            startDate: this.getLocalDateString(start),
            endDate: this.getLocalDateString(end),
            totalSpending: totalAmount, // aggregate mapping
            avgDailyBudget,
            totalAdjustedBudget,
            remainingBudget,
            expenses: filteredItems,
            chartCategory: { labels: chartCategoryLabels, values: chartCategoryValues },
            chartTrend: { labels: chartDailyLabels, spending: chartDailyAmount, budget: chartDailyBudget }
          };
          response.message = "Reports generated (Mock)";
        }
        break;

      case "addExpense":
        {
          const expenses = getExpenses();
          const newExp = {
            ID: payload.id || "exp_" + Math.random().toString(36).substr(2, 9),
            Date: payload.date || this.getLocalDateString(new Date()),
            Time: payload.time || this.getLocalTimeString(new Date()),
            Name: payload.name,
            Category: payload.category,
            Amount: Number(payload.amount),
            Notes: payload.notes || "",
            CountInBudget: payload.countInBudget !== false ? "true" : "false",
            CreatedAt: new Date().toISOString()
          };

          if (!newExp.Name || isNaN(newExp.Amount) || newExp.Amount <= 0) {
            return { success: false, message: "Validation error" };
          }

          expenses.push(newExp);
          setExpenses(expenses);
          
          this.mockRecalculateBudgetHistory(newExp.Date);
          response.data = { id: newExp.ID };
          response.message = "Expense added (Mock)";
        }
        break;

      case "updateExpense":
        {
          const expenses = getExpenses();
          const index = expenses.findIndex(exp => exp.ID === payload.id);
          if (index === -1) return { success: false, message: "Not found" };

          const oldDate = expenses[index].Date;
          expenses[index].Date = payload.date;
          expenses[index].Time = payload.time;
          expenses[index].Name = payload.name;
          expenses[index].Category = payload.category;
          expenses[index].Amount = Number(payload.amount);
          expenses[index].Notes = payload.notes || "";
          expenses[index].CountInBudget = payload.countInBudget !== false ? "true" : "false";

          setExpenses(expenses);
          const earliestDate = new Date(payload.date) < new Date(oldDate) ? payload.date : oldDate;
          this.mockRecalculateBudgetHistory(earliestDate);
          response.message = "Expense updated (Mock)";
        }
        break;

      case "deleteExpense":
        {
          const expenses = getExpenses();
          const index = expenses.findIndex(exp => exp.ID === payload.id);
          if (index === -1) return { success: false, message: "Not found" };

          const date = expenses[index].Date;
          expenses.splice(index, 1);
          setExpenses(expenses);

          this.mockRecalculateBudgetHistory(date);
          response.message = "Expense deleted (Mock)";
        }
        break;

      // INCOME MOCK ACTIONS
      case "addIncome":
        {
          const income = getIncome();
          const newInc = {
            ID: payload.id || "inc_" + Math.random().toString(36).substr(2, 9),
            Date: payload.date || this.getLocalDateString(new Date()),
            Time: payload.time || this.getLocalTimeString(new Date()),
            Name: payload.name,
            Source: payload.source,
            Amount: Number(payload.amount),
            Notes: payload.notes || "",
            CreatedAt: new Date().toISOString()
          };

          if (!newInc.Name || isNaN(newInc.Amount) || newInc.Amount <= 0 || !newInc.Source) {
            return { success: false, message: "Validation error: Name, Source, and positive Amount required" };
          }

          income.push(newInc);
          setIncome(income);
          response.data = { id: newInc.ID };
          response.message = "Income logged successfully (Mock)";
        }
        break;

      case "updateIncome":
        {
          const income = getIncome();
          const index = income.findIndex(inc => inc.ID === payload.id);
          if (index === -1) return { success: false, message: "Income record not found" };

          income[index].Date = payload.date;
          income[index].Time = payload.time;
          income[index].Name = payload.name;
          income[index].Source = payload.source;
          income[index].Amount = Number(payload.amount);
          income[index].Notes = payload.notes || "";

          if (!payload.name || isNaN(income[index].Amount) || income[index].Amount <= 0 || !payload.source) {
            return { success: false, message: "Validation error" };
          }

          setIncome(income);
          response.message = "Income record updated (Mock)";
        }
        break;

      case "deleteIncome":
        {
          const income = getIncome();
          const index = income.findIndex(inc => inc.ID === payload.id);
          if (index === -1) return { success: false, message: "Income record not found" };

          income.splice(index, 1);
          setIncome(income);
          response.message = "Income record deleted (Mock)";
        }
        break;

      case "addCategory":
        {
          const categories = getCategories();
          const newCat = {
            ID: "cat_" + Math.random().toString(36).substr(2, 9),
            Name: payload.name,
            Status: "Enabled",
            Order: (categories.length + 1).toString()
          };
          categories.push(newCat);
          setCategories(categories);
          response.data = newCat;
          response.message = "Category added (Mock)";
        }
        break;

      case "updateCategory":
        {
          const categories = getCategories();
          const index = categories.findIndex(c => c.ID === payload.id);
          if (index === -1) return { success: false, message: "Not found" };
          if (payload.name) categories[index].Name = payload.name;
          if (payload.status) categories[index].Status = payload.status;
          if (payload.order !== undefined) categories[index].Order = payload.order.toString();
          setCategories(categories);
          response.message = "Category updated (Mock)";
        }
        break;

      case "updateSettings":
        {
          const settings = getSettings();
          const newSet = payload.settings;
          for (let key in newSet) {
            const index = settings.findIndex(s => s.Key === key);
            if (index !== -1) {
              settings[index].Value = newSet[key].toString();
            } else {
              settings.push({ Key: key, Value: newSet[key].toString(), Description: "Custom Setting" });
            }
          }
          setSettings(settings);
          this.mockRecalculateBudgetHistory();
          response.message = "Settings saved (Mock)";
        }
        break;

      case "recalculateBudget":
        this.mockRecalculateBudgetHistory(payload.startDate);
        response.message = "Budget recalculated (Mock)";
        break;

      default:
        response.success = false;
        response.message = "Action not supported";
    }

    return response;
  }

  mockGetBaseBudget(dateObj, settingsMap) {
    const holidaysStr = settingsMap.holidays || "";
    const holidays = holidaysStr.split(",").map(s => s.trim());
    const dateStr = this.getLocalDateString(dateObj);

    if (holidays.includes(dateStr)) {
      return Number(settingsMap.holiday_budget) || 120;
    }

    const day = dateObj.getDay();
    if (day === 0 || day === 6) {
      return Number(settingsMap.weekend_budget) || 80;
    }

    return Number(settingsMap.weekday_budget) || 50;
  }

  expenseCountsInBudget(exp) {
    const flag = exp.CountInBudget;
    if (flag === undefined || flag === null || flag === "") return true;
    const s = String(flag).toLowerCase();
    return s !== "false" && s !== "no" && s !== "0";
  }

  mockGetBudgetInfoForDate(dateStr, settingsMap, history, expenses) {
    const hist = history.find(h => h.Date === dateStr);
    if (hist) {
      return {
        date: hist.Date,
        budget: Number(hist.Budget),
        spending: Number(hist.Spending),
        remaining: Number(hist.Remaining),
        carryForward: Number(hist.CarryForward),
        adjustedBudget: Number(hist.AdjustedBudget)
      };
    }

    const dateObj = new Date(dateStr + "T00:00:00");
    const base = this.mockGetBaseBudget(dateObj, settingsMap);
    
    const prev = new Date(dateObj);
    prev.setDate(prev.getDate() - 1);
    const prevStr = this.getLocalDateString(prev);
    const prevHist = history.find(h => h.Date === prevStr);
    const carryForward = (settingsMap.carry_forward_enabled === "true" && prevHist) ? Number(prevHist.Remaining) : 0;

    let spending = 0;
    expenses.forEach(e => {
      if (e.Date === dateStr && this.expenseCountsInBudget(e)) spending += Number(e.Amount) || 0;
    });

    const adjusted = base + carryForward;
    return {
      date: dateStr,
      budget: base,
      spending,
      remaining: adjusted - spending,
      carryForward,
      adjustedBudget: adjusted
    };
  }

  mockRecalculateBudgetHistory(startDateStr) {
    const settings = JSON.parse(localStorage.getItem("mock_settings") || "[]");
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.Key] = s.Value);

    const expenses = JSON.parse(localStorage.getItem("mock_expenses") || "[]");
    
    let minDate = new Date();
    if (expenses.length > 0) {
      expenses.forEach(exp => {
        const d = new Date(exp.Date + "T00:00:00");
        if (d < minDate) minDate = d;
      });
    } else {
      minDate.setDate(minDate.getDate() - 7);
    }

    if (startDateStr) {
      const reqStart = new Date(startDateStr + "T00:00:00");
      if (reqStart < minDate) minDate = reqStart;
    }

    minDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const spendingByDate = {};
    expenses.forEach(exp => {
      if (!this.expenseCountsInBudget(exp)) return;
      spendingByDate[exp.Date] = (spendingByDate[exp.Date] || 0) + Number(exp.Amount);
    });

    const history = JSON.parse(localStorage.getItem("mock_budget_history") || "[]");
    const historyMap = {};
    history.forEach(h => historyMap[h.Date] = h);

    const newHistory = [];
    let prevRemaining = 0;

    const dayBeforeMin = new Date(minDate);
    dayBeforeMin.setDate(dayBeforeMin.getDate() - 1);
    const dayBeforeMinStr = this.getLocalDateString(dayBeforeMin);

    if (settingsMap.carry_forward_enabled === "true" && historyMap[dayBeforeMinStr]) {
      prevRemaining = Number(historyMap[dayBeforeMinStr].Remaining) || 0;
    }

    const cur = new Date(minDate);
    while (cur <= today) {
      const dateStr = this.getLocalDateString(cur);
      const base = this.mockGetBaseBudget(cur, settingsMap);
      const carryForward = (settingsMap.carry_forward_enabled === "true") ? prevRemaining : 0;
      const adjusted = base + carryForward;
      const spending = spendingByDate[dateStr] || 0;
      const remaining = adjusted - spending;

      newHistory.push({
        Date: dateStr,
        Budget: base,
        Spending: spending,
        Remaining: remaining,
        CarryForward: carryForward,
        AdjustedBudget: adjusted
      });

      prevRemaining = remaining;
      cur.setDate(cur.getDate() + 1);
    }

    const finalHistory = history.filter(h => new Date(h.Date + "T00:00:00") < minDate);
    newHistory.forEach(row => finalHistory.push(row));

    localStorage.setItem("mock_budget_history", JSON.stringify(finalHistory));
  }

  getLocalDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  getLocalTimeString(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

window.api = new ExpenseTrackerAPI();
