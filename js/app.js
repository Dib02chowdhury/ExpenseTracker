/**
 * Expense Tracker & Smart Budget Manager - Core Frontend Application (v2 with Income support)
 * Coordinates view management, form actions, routing, Chart.js graphs, export functions, and UI helpers.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Global Application State
  const state = {
    expenses: [],
    income: [],
    categories: [],
    settings: {},
    dashboard: null,
    currentView: "landing",
    
    // Pagination for Expense Register
    expenseTable: {
      currentPage: 1,
      itemsPerPage: 10,
      selectedIds: [],
      filteredList: []
    },

    // Pagination for Income Register
    incomeTable: {
      currentPage: 1,
      itemsPerPage: 10,
      selectedIds: [],
      filteredList: []
    },

    // Active report configuration
    report: {
      range: "monthly",
      type: "expense"
    },

    // Chart.js references to prevent canvas memory leaks
    charts: {
      category: null,
      trend: null
    }
  };

  // Bootstrap Modals
  const expenseModal = new bootstrap.Modal(document.getElementById('expenseModal'));
  const incomeModal = new bootstrap.Modal(document.getElementById('incomeModal'));
  const categoryModal = new bootstrap.Modal(document.getElementById('categoryModal'));

  // ==========================================
  // INITIALIZATION
  // ==========================================
  
  async function init() {
    showLoadingState();
    
    // Load config and sync connection status UI
    await window.api.loadConfig();
    updateConnectionStatusUI();
    
    // Load default collections
    await loadInitialData();
    
    // Setup Router & Sidebar/Navbar Bindings
    setupRouter();
    setupEventBindings();
    
    // Default form dates
    resetExpenseFormDates();
    resetIncomeFormDates();

    hideLoadingState();
  }

  // Reload basic data packages
  async function loadInitialData() {
    try {
      const settingsRes = await window.api.call("getSettings");
      if (settingsRes.success) {
        state.settings = {};
        settingsRes.data.forEach(s => state.settings[s.Key] = s.Value);
        // Apply theme immediately
        applyTheme(state.settings.theme || "dark");
      }

      const categoriesRes = await window.api.call("getCategories");
      if (categoriesRes.success) {
        state.categories = categoriesRes.data;
        populateCategoryDropdowns();
      }
      
      populateIncomeSourceDropdowns();
    } catch (err) {
      showToast("Error loading base database. Check API configurations.", "error");
    }
  }

  // Update UI dot and text for Connection status
  function updateConnectionStatusUI() {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    
    if (window.api.mockMode) {
      dot.className = "fa-solid fa-circle text-warning me-1 blink";
      text.textContent = "Mock DB Mode";
      dot.parentElement.title = "Not connected. Running inside local storage cache.";
    } else {
      dot.className = "fa-solid fa-circle text-success me-1";
      text.textContent = "Connected Sheets";
      dot.parentElement.title = "Connected securely to Google Sheets backend.";
    }
  }

  // ==========================================
  // ROUTER (Single Page Application Hash-based)
  // ==========================================
  function setupRouter() {
    const handleRoute = () => {
      const hash = window.location.hash || "#landing";
      const viewName = hash.replace("#", "");
      
      // Update view visible sections
      switchView(viewName);
    };

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  }

  function switchView(viewName) {
    const views = ["landing", "dashboard", "expenses", "income", "reports", "categories", "settings"];
    
    if (!views.includes(viewName)) {
      viewName = "landing";
    }
    
    state.currentView = viewName;

    // Toggle DOM elements
    views.forEach(v => {
      const viewDom = document.getElementById(`${v}-view`);
      if (viewDom) {
        if (v === viewName) {
          viewDom.classList.remove("d-none");
        } else {
          viewDom.classList.add("d-none");
        }
      }

      // Sidebar menu focus
      const menuDom = document.getElementById(`nav-${v}`);
      if (menuDom) {
        if (v === viewName) {
          menuDom.classList.add("active");
        } else {
          menuDom.classList.remove("active");
        }
      }

      // Bottom Mobile Nav menu focus
      const bnavDom = document.getElementById(`bnav-${v}`);
      if (bnavDom) {
        if (v === viewName) {
          bnavDom.classList.add("active");
        } else {
          bnavDom.classList.remove("active");
        }
      }
    });

    // Update Topbar Title and Quick Action Button text
    const titleDom = document.getElementById("topbar-title");
    titleDom.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);

    const quickAddBtn = document.getElementById("quick-add-btn");
    if (viewName === "income") {
      quickAddBtn.innerHTML = `<i class="fa-solid fa-plus me-1"></i> Log Income`;
      quickAddBtn.className = "btn btn-brand bg-success border-0 text-white";
    } else {
      quickAddBtn.innerHTML = `<i class="fa-solid fa-plus me-1"></i> Add Expense`;
      quickAddBtn.className = "btn btn-brand";
    }

    // Refresh view data packet
    loadViewData(viewName);
  }

  async function loadViewData(viewName) {
    if (viewName === "dashboard") {
      await loadDashboard();
    } else if (viewName === "expenses") {
      await loadExpenseRegister();
    } else if (viewName === "income") {
      await loadIncomeRegister();
    } else if (viewName === "reports") {
      await loadReports(state.report.range);
    } else if (viewName === "categories") {
      renderCategoriesView();
    } else if (viewName === "settings") {
      renderSettingsView();
    }
  }

  // ==========================================
  // DASHBOARD VIEW LOGIC
  // ==========================================
  async function loadDashboard() {
    showLoadingState();
    try {
      const res = await window.api.call("getDashboard");
      if (res.success) {
        state.dashboard = res.data;
        state.settings = res.data.settings;
        state.categories = res.data.categories;
        
        renderDashboardMetrics();
        renderDashboardExpenses();
        populateCategoryDropdowns();
        populateIncomeSourceDropdowns();
      } else {
        showToast(res.message || "Failed to load dashboard data.", "error");
      }
    } catch (e) {
      showToast("Network error syncing dashboard.", "error");
    } finally {
      hideLoadingState();
    }
  }

  function renderDashboardMetrics() {
    const d = state.dashboard;
    const cur = state.settings.currency || "$";

    // Text metrics
    document.getElementById("card-today-budget").textContent = formatCurrency(d.todayBudget, cur);
    document.getElementById("card-carry-forward").textContent = formatCurrency(d.carryForward, cur);
    document.getElementById("card-adjusted-budget").textContent = formatCurrency(d.adjustedBudget, cur);
    document.getElementById("card-today-spending").textContent = formatCurrency(d.todaySpending, cur);
    document.getElementById("card-remaining-budget").textContent = formatCurrency(d.remainingBudget, cur);
    document.getElementById("card-tomorrow-budget").textContent = formatCurrency(d.tomorrowBudget, cur);
    document.getElementById("card-weekly-spending").textContent = formatCurrency(d.weeklySpending, cur);
    document.getElementById("card-monthly-spending").textContent = formatCurrency(d.monthlySpending, cur);
    
    // Income Additions
    document.getElementById("card-today-income").textContent = formatCurrency(d.todayIncome, cur);
    document.getElementById("card-weekly-income").textContent = formatCurrency(d.weeklyIncome, cur);
    document.getElementById("card-monthly-income").textContent = formatCurrency(d.monthlyIncome, cur);
    
    // Net Savings Card
    const savingsEl = document.getElementById("card-net-savings");
    savingsEl.textContent = formatCurrency(d.netSavings, cur);

    // Progress Bar computation
    const spent = d.todaySpending;
    const limit = d.adjustedBudget;
    const avail = d.remainingBudget;
    const warningThreshold = Number(state.settings.warning_threshold) || 20;

    let availPercent = 0;
    if (limit > 0) {
      availPercent = (avail / limit) * 100;
    }

    const barWidth = Math.min(100, Math.max(0, availPercent));
    const progressBar = document.getElementById("dashboard-progress-bar");
    
    progressBar.style.width = `${barWidth}%`;
    document.getElementById("progress-percent-badge").textContent = `${Math.round(availPercent)}% left`;
    document.getElementById("progress-spent-text").textContent = formatCurrency(spent, cur);
    document.getElementById("progress-avail-text").textContent = formatCurrency(avail, cur);
    document.getElementById("progress-warning-text").textContent = `${warningThreshold}%`;

    progressBar.className = "progress-bar-fill";
    if (availPercent <= 0) {
      progressBar.classList.add("bg-danger");
      document.getElementById("progress-avail-text").className = "text-danger";
    } else if (availPercent <= warningThreshold) {
      progressBar.classList.add("bg-warning");
      document.getElementById("progress-avail-text").className = "text-warning";
    } else {
      progressBar.classList.add("bg-success");
      document.getElementById("progress-avail-text").className = "text-success";
    }
  }

  function renderDashboardExpenses() {
    const listDom = document.getElementById("dashboard-expenses-body");
    listDom.innerHTML = "";
    const recent = state.dashboard.recentExpenses || [];
    const cur = state.settings.currency || "$";

    if (recent.length === 0) {
      listDom.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No recent expenses logged. Click "Add Expense" to start!</td></tr>`;
      return;
    }

    recent.forEach(exp => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatDateDisplay(exp.Date)}</td>
        <td>${formatTimeDisplay(exp.Time)}</td>
        <td class="fw-semibold">${escapeHtml(exp.Name)}${expenseCountsInBudget(exp) ? "" : ' <span class="badge bg-secondary-subtle text-muted ms-1">Off-budget</span>'}</td>
        <td><span class="badge-custom ${getCategoryBadgeClass(exp.Category)}">${escapeHtml(exp.Category)}</span></td>
        <td class="fw-bold">${formatCurrency(exp.Amount, cur)}</td>
        <td class="text-muted small text-truncate" style="max-width:150px;" title="${escapeHtml(exp.Notes)}">${escapeHtml(exp.Notes)}</td>
        <td class="text-end">
          <div class="d-flex gap-1 justify-content-end">
            <button class="btn btn-sm btn-secondary-custom btn-edit-exp" data-id="${exp.ID}" title="Edit"><i class="fa-solid fa-pen-to-square text-primary"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-duplicate-exp" data-id="${exp.ID}" title="Duplicate"><i class="fa-solid fa-copy text-info"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-delete-exp" data-id="${exp.ID}" title="Delete"><i class="fa-solid fa-trash text-danger"></i></button>
          </div>
        </td>
      `;
      listDom.appendChild(row);
    });
  }

  // ==========================================
  // TRANSACTION REGISTER (EXPENSES VIEW)
  // ==========================================
  async function loadExpenseRegister() {
    showLoadingState();
    try {
      const res = await window.api.call("getExpenses");
      if (res.success) {
        state.expenses = res.data;
        applyExpenseFilters();
      } else {
        showToast(res.message || "Failed to load expenses list.", "error");
      }
    } catch (e) {
      showToast("Network error syncing expenses.", "error");
    } finally {
      hideLoadingState();
    }
  }

  function applyExpenseFilters() {
    const searchVal = document.getElementById("filter-search").value.toLowerCase();
    const categoryVal = document.getElementById("filter-category").value;
    const startDateVal = document.getElementById("filter-start-date").value;
    const endDateVal = document.getElementById("filter-end-date").value;

    state.expenseTable.filteredList = state.expenses.filter(exp => {
      const nameMatch = exp.Name.toLowerCase().includes(searchVal) || (exp.Notes && exp.Notes.toLowerCase().includes(searchVal));
      const categoryMatch = !categoryVal || exp.Category === categoryVal;
      const dateGe = !startDateVal || exp.Date >= startDateVal;
      const dateLe = !endDateVal || exp.Date <= endDateVal;
      return nameMatch && categoryMatch && dateGe && dateLe;
    });

    state.expenseTable.currentPage = 1;
    state.expenseTable.selectedIds = [];
    document.getElementById("check-all-expenses").checked = false;
    updateBulkActionsUI();

    renderExpenseTable();
  }

  function renderExpenseTable() {
    const tbody = document.getElementById("expenses-table-body");
    tbody.innerHTML = "";
    
    const cur = state.settings.currency || "$";
    const { currentPage, itemsPerPage, filteredList } = state.expenseTable;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredList.length);
    const paginatedItems = filteredList.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No transactions found matching filters.</td></tr>`;
      document.getElementById("pagination-info").textContent = "Showing 0 to 0 of 0 entries";
      renderPagination(0);
      return;
    }

    paginatedItems.forEach(exp => {
      const isSelected = state.expenseTable.selectedIds.includes(exp.ID);
      const row = document.createElement("tr");
      row.className = isSelected ? "table-active" : "";
      row.innerHTML = `
        <td>
          <input type="checkbox" class="form-check-input select-expense-chk" data-id="${exp.ID}" ${isSelected ? "checked" : ""}>
        </td>
        <td>${formatDateDisplay(exp.Date)}</td>
        <td>${formatTimeDisplay(exp.Time)}</td>
        <td class="fw-semibold">${escapeHtml(exp.Name)}${expenseCountsInBudget(exp) ? "" : ' <span class="badge bg-secondary-subtle text-muted ms-1">Off-budget</span>'}</td>
        <td><span class="badge-custom ${getCategoryBadgeClass(exp.Category)}">${escapeHtml(exp.Category)}</span></td>
        <td class="fw-bold">${formatCurrency(exp.Amount, cur)}</td>
        <td class="text-muted small text-truncate" style="max-width:200px;" title="${escapeHtml(exp.Notes)}">${escapeHtml(exp.Notes)}</td>
        <td class="text-end">
          <div class="d-flex gap-1 justify-content-end">
            <button class="btn btn-sm btn-secondary-custom btn-edit-exp" data-id="${exp.ID}" title="Edit"><i class="fa-solid fa-pen-to-square text-primary"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-duplicate-exp" data-id="${exp.ID}" title="Duplicate"><i class="fa-solid fa-copy text-info"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-delete-exp" data-id="${exp.ID}" title="Delete"><i class="fa-solid fa-trash text-danger"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById("pagination-info").textContent = `Showing ${startIndex + 1} to ${endIndex} of ${filteredList.length} entries`;
    renderPagination(filteredList.length);
  }

  function renderPagination(totalItems) {
    const container = document.getElementById("expenses-pagination");
    container.innerHTML = "";
    const totalPages = Math.ceil(totalItems / state.expenseTable.itemsPerPage);

    if (totalPages <= 1) return;

    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${state.expenseTable.currentPage === 1 ? "disabled" : ""}`;
    prevLi.innerHTML = `<a class="page-link" href="#"><i class="fa-solid fa-angle-left"></i></a>`;
    prevLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.expenseTable.currentPage > 1) {
        state.expenseTable.currentPage--;
        renderExpenseTable();
      }
    });
    container.appendChild(prevLi);

    for (let i = 1; i <= totalPages; i++) {
      const pageLi = document.createElement("li");
      pageLi.className = `page-item ${state.expenseTable.currentPage === i ? "active" : ""}`;
      pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      pageLi.addEventListener("click", (e) => {
        e.preventDefault();
        state.expenseTable.currentPage = i;
        renderExpenseTable();
      });
      container.appendChild(pageLi);
    }

    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${state.expenseTable.currentPage === totalPages ? "disabled" : ""}`;
    nextLi.innerHTML = `<a class="page-link" href="#"><i class="fa-solid fa-angle-right"></i></a>`;
    nextLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.expenseTable.currentPage < totalPages) {
        state.expenseTable.currentPage++;
        renderExpenseTable();
      }
    });
    container.appendChild(nextLi);
  }

  function updateBulkActionsUI() {
    const group = document.getElementById("bulk-actions-group");
    if (state.expenseTable.selectedIds.length > 0) {
      group.classList.remove("d-none");
    } else {
      group.classList.add("d-none");
    }
  }

  // ==========================================
  // INCOME REGISTER VIEW LOGIC [NEW]
  // ==========================================
  async function loadIncomeRegister() {
    showLoadingState();
    try {
      const res = await window.api.call("getIncome");
      if (res.success) {
        state.income = res.data;
        applyIncomeFilters();
      } else {
        showToast(res.message || "Failed to load income list.", "error");
      }
    } catch (e) {
      showToast("Network error syncing income database.", "error");
    } finally {
      hideLoadingState();
    }
  }

  function applyIncomeFilters() {
    const searchVal = document.getElementById("income-filter-search").value.toLowerCase();
    const sourceVal = document.getElementById("income-filter-source").value;
    const startDateVal = document.getElementById("income-filter-start-date").value;
    const endDateVal = document.getElementById("income-filter-end-date").value;

    state.incomeTable.filteredList = state.income.filter(inc => {
      const nameMatch = inc.Name.toLowerCase().includes(searchVal) || (inc.Notes && inc.Notes.toLowerCase().includes(searchVal));
      const sourceMatch = !sourceVal || inc.Source === sourceVal;
      const dateGe = !startDateVal || inc.Date >= startDateVal;
      const dateLe = !endDateVal || inc.Date <= endDateVal;
      return nameMatch && sourceMatch && dateGe && dateLe;
    });

    state.incomeTable.currentPage = 1;
    state.incomeTable.selectedIds = [];
    document.getElementById("check-all-incomes").checked = false;
    updateIncomeBulkActionsUI();

    renderIncomeTable();
  }

  function renderIncomeTable() {
    const tbody = document.getElementById("income-table-body");
    tbody.innerHTML = "";
    
    const cur = state.settings.currency || "$";
    const { currentPage, itemsPerPage, filteredList } = state.incomeTable;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredList.length);
    const paginatedItems = filteredList.slice(startIndex, endIndex);

    if (paginatedItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No income records matching filters.</td></tr>`;
      document.getElementById("income-pagination-info").textContent = "Showing 0 to 0 of 0 entries";
      renderIncomePagination(0);
      return;
    }

    paginatedItems.forEach(inc => {
      const isSelected = state.incomeTable.selectedIds.includes(inc.ID);
      const row = document.createElement("tr");
      row.className = isSelected ? "table-active" : "";
      row.innerHTML = `
        <td>
          <input type="checkbox" class="form-check-input select-income-chk" data-id="${inc.ID}" ${isSelected ? "checked" : ""}>
        </td>
        <td>${formatDateDisplay(inc.Date)}</td>
        <td>${formatTimeDisplay(inc.Time)}</td>
        <td class="fw-semibold">${escapeHtml(inc.Name)}</td>
        <td><span class="badge-custom ${getIncomeSourceBadgeClass(inc.Source)}">${escapeHtml(inc.Source)}</span></td>
        <td class="fw-bold text-success">${formatCurrency(inc.Amount, cur)}</td>
        <td class="text-muted small text-truncate" style="max-width:200px;" title="${escapeHtml(inc.Notes)}">${escapeHtml(inc.Notes)}</td>
        <td class="text-end">
          <div class="d-flex gap-1 justify-content-end">
            <button class="btn btn-sm btn-secondary-custom btn-edit-inc" data-id="${inc.ID}" title="Edit"><i class="fa-solid fa-pen-to-square text-primary"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-duplicate-inc" data-id="${inc.ID}" title="Duplicate"><i class="fa-solid fa-copy text-info"></i></button>
            <button class="btn btn-sm btn-secondary-custom btn-delete-inc" data-id="${inc.ID}" title="Delete"><i class="fa-solid fa-trash text-danger"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById("income-pagination-info").textContent = `Showing ${startIndex + 1} to ${endIndex} of ${filteredList.length} entries`;
    renderIncomePagination(filteredList.length);
  }

  function renderIncomePagination(totalItems) {
    const container = document.getElementById("income-pagination");
    container.innerHTML = "";
    const totalPages = Math.ceil(totalItems / state.incomeTable.itemsPerPage);

    if (totalPages <= 1) return;

    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${state.incomeTable.currentPage === 1 ? "disabled" : ""}`;
    prevLi.innerHTML = `<a class="page-link" href="#"><i class="fa-solid fa-angle-left"></i></a>`;
    prevLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.incomeTable.currentPage > 1) {
        state.incomeTable.currentPage--;
        renderIncomeTable();
      }
    });
    container.appendChild(prevLi);

    for (let i = 1; i <= totalPages; i++) {
      const pageLi = document.createElement("li");
      pageLi.className = `page-item ${state.incomeTable.currentPage === i ? "active" : ""}`;
      pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      pageLi.addEventListener("click", (e) => {
        e.preventDefault();
        state.incomeTable.currentPage = i;
        renderIncomeTable();
      });
      container.appendChild(pageLi);
    }

    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${state.incomeTable.currentPage === totalPages ? "disabled" : ""}`;
    nextLi.innerHTML = `<a class="page-link" href="#"><i class="fa-solid fa-angle-right"></i></a>`;
    nextLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.incomeTable.currentPage < totalPages) {
        state.incomeTable.currentPage++;
        renderIncomeTable();
      }
    });
    container.appendChild(nextLi);
  }

  function updateIncomeBulkActionsUI() {
    const group = document.getElementById("bulk-income-actions-group");
    if (state.incomeTable.selectedIds.length > 0) {
      group.classList.remove("d-none");
    } else {
      group.classList.add("d-none");
    }
  }

  // ==========================================
  // REPORTS VIEW LOGIC
  // ==========================================
  async function loadReports(range) {
    showLoadingState();
    state.report.range = range;

    const type = document.getElementById("report-type-select").value;
    state.report.type = type;
    
    // Toggle selector boxes visibility
    const customPicker = document.getElementById("reports-custom-range-picker");
    const categoryPicker = document.getElementById("reports-category-picker");
    
    if (range === "custom") {
      customPicker.classList.remove("d-none");
      categoryPicker.classList.add("d-none");
    } else if (range === "category") {
      categoryPicker.classList.remove("d-none");
      customPicker.classList.add("d-none");
      populateReportCategorySelect(type);
    } else {
      customPicker.classList.add("d-none");
      categoryPicker.classList.add("d-none");
    }

    try {
      const params = { range, type };
      if (range === "custom") {
        params.startDate = document.getElementById("report-start-date").value;
        params.endDate = document.getElementById("report-end-date").value;
        if (!params.startDate || !params.endDate) {
          showToast("Please pick both Start and End dates.", "warning");
          hideLoadingState();
          return;
        }
      } else if (range === "category") {
        params.category = document.getElementById("report-category-select").value;
      }

      const res = await window.api.call("getReports", params);
      if (res.success) {
        state.reports = res.data;
        renderReportsData(type);
      } else {
        showToast(res.message || "Failed to load report analytics.", "error");
      }
    } catch (e) {
      showToast("Network error fetching report data.", "error");
    } finally {
      hideLoadingState();
    }
  }

  function renderReportsData(type) {
    const r = state.reports;
    const cur = state.settings.currency || "$";

    // Dynamic Title swaps
    const labelTotal = document.getElementById("report-label-total");
    const chartTitleDist = document.getElementById("report-chart-title-distribution");
    const chartTitleTrend = document.getElementById("report-chart-title-trend");
    const tableTitle = document.getElementById("report-table-title");
    const tableHeaders = document.getElementById("report-table-headers");

    if (type === "income") {
      labelTotal.textContent = "Total Income";
      chartTitleDist.textContent = "Income Source Split";
      chartTitleTrend.textContent = "Income Received Trend";
      tableTitle.textContent = "Logged Income Entries";
      tableHeaders.innerHTML = `<th>Date</th><th>Time</th><th>Description</th><th>Source Category</th><th>Amount</th><th>Notes</th>`;
    } else {
      labelTotal.textContent = "Total Spending";
      chartTitleDist.textContent = "Category Distribution";
      chartTitleTrend.textContent = "Spending vs Budget Trend";
      tableTitle.textContent = "Included Transactions";
      tableHeaders.innerHTML = `<th>Date</th><th>Time</th><th>Name</th><th>Category</th><th>Amount</th><th>Notes</th>`;
    }

    // Text Summary details
    document.getElementById("report-card-spending").textContent = formatCurrency(r.totalSpending, cur);
    document.getElementById("report-card-avg-budget").textContent = formatCurrency(r.avgDailyBudget, cur);
    document.getElementById("report-card-adj-budget").textContent = formatCurrency(r.totalAdjustedBudget, cur);
    document.getElementById("report-card-remaining").textContent = formatCurrency(r.remainingBudget, cur);

    // Color code remaining budget card
    const remCard = document.getElementById("report-card-remaining");
    if (r.remainingBudget < 0) {
      remCard.className = "stat-card-value text-danger";
    } else {
      remCard.className = "stat-card-value text-success";
    }

    // Included transactions log
    const tbody = document.getElementById("report-expenses-body");
    tbody.innerHTML = "";
    
    if (r.expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No records found inside this timeframe.</td></tr>`;
    } else {
      r.expenses.forEach(exp => {
        const row = document.createElement("tr");
        const categoryVal = type === "income" ? exp.Source : exp.Category;
        const badgeClass = type === "income" ? getIncomeSourceBadgeClass(categoryVal) : getCategoryBadgeClass(categoryVal);
        const amtColor = type === "income" ? "text-success" : "";

        row.innerHTML = `
          <td>${formatDateDisplay(exp.Date)}</td>
          <td>${formatTimeDisplay(exp.Time)}</td>
          <td class="fw-semibold">${escapeHtml(exp.Name)}</td>
          <td><span class="badge-custom ${badgeClass}">${escapeHtml(categoryVal)}</span></td>
          <td class="fw-bold ${amtColor}">${formatCurrency(exp.Amount, cur)}</td>
          <td class="text-muted small text-truncate" style="max-width:300px;">${escapeHtml(exp.Notes)}</td>
        `;
        tbody.appendChild(row);
      });
    }

    renderCharts(r, type);
  }

  function renderCharts(reportData, type) {
    const isDark = document.documentElement.getAttribute("data-bs-theme") === "dark";
    const textThemeColor = isDark ? "#94a3b8" : "#475569";
    const gridThemeColor = isDark ? "#1e293b" : "#e2e8f0";

    if (state.charts.category) state.charts.category.destroy();
    if (state.charts.trend) state.charts.trend.destroy();

    // 1. Doughnut Category Split
    const catCanvas = document.getElementById("report-category-chart");
    const catLabels = reportData.chartCategory.labels;
    const catValues = reportData.chartCategory.values;

    if (catLabels.length === 0) {
      const ctx = catCanvas.getContext("2d");
      ctx.clearRect(0, 0, catCanvas.width, catCanvas.height);
      ctx.fillStyle = textThemeColor;
      ctx.textAlign = "center";
      ctx.font = "14px Plus Jakarta Sans";
      ctx.fillText("No analytical data to plot in this range.", catCanvas.width / 2, catCanvas.height / 2);
    } else {
      state.charts.category = new Chart(catCanvas, {
        type: "doughnut",
        data: {
          labels: catLabels,
          datasets: [{
            data: catValues,
            backgroundColor: [
              "#10b981", // salary/success
              "#06b6d4", // freelance/info
              "#f59e0b", // food/warning
              "#8b5cf6", // shopping/purple
              "#ef4444", // movie/danger
              "#ec4899", // health/pink
              "#64748b"  // other/grey
            ],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? "#0f172a" : "#fff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
            }
          }
        }
      });
    }

    // 2. Trend Line Chart
    const trendCanvas = document.getElementById("report-trend-chart");
    const trendLabels = reportData.chartTrend.labels.map(l => formatDateDisplay(l));
    const trendValues = reportData.chartTrend.spending;
    const trendBudget = reportData.chartTrend.budget;

    const datasets = [];
    if (type === "income") {
      datasets.push({
        label: "Income Received",
        data: trendValues,
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.05)",
        tension: 0.3,
        fill: true
      });
    } else {
      datasets.push(
        {
          label: "Spending",
          data: trendValues,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.05)",
          tension: 0.3,
          fill: true
        },
        {
          label: "Adjusted Budget",
          data: trendBudget,
          borderColor: "#10b981",
          borderDash: [5, 5],
          backgroundColor: "transparent",
          tension: 0.1,
          fill: false
        }
      );
    }

    state.charts.trend = new Chart(trendCanvas, {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            grid: { color: gridThemeColor },
            ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
          },
          x: {
            grid: { display: false },
            ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } }
          }
        }
      }
    });
  }

  // ==========================================
  // CATEGORIES VIEW LOGIC
  // ==========================================
  function renderCategoriesView() {
    const listDom = document.getElementById("category-list-container");
    listDom.innerHTML = "";

    if (state.categories.length === 0) {
      listDom.innerHTML = `<div class="text-center text-muted py-4">No categories configured in your spreadsheet.</div>`;
      return;
    }

    state.categories.forEach((cat, index) => {
      const isEnabled = cat.Status === "Enabled";
      const div = document.createElement("div");
      div.className = "category-drag-item";
      div.setAttribute("draggable", "true");
      div.setAttribute("data-id", cat.ID);
      div.setAttribute("data-index", index);
      
      div.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <span class="drag-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
          <span class="badge-custom ${getCategoryBadgeClass(cat.Name)}">${index + 1}</span>
          <span class="fw-semibold">${escapeHtml(cat.Name)}</span>
          <span class="badge rounded-pill ${isEnabled ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"} small" style="font-size:0.65rem;">
            ${isEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div class="d-flex gap-1 align-items-center">
          <button class="btn btn-sm btn-secondary-custom btn-move-up" data-id="${cat.ID}" ${index === 0 ? "disabled" : ""} title="Move Up"><i class="fa-solid fa-arrow-up text-muted"></i></button>
          <button class="btn btn-sm btn-secondary-custom btn-move-down" data-id="${cat.ID}" ${index === state.categories.length - 1 ? "disabled" : ""} title="Move Down"><i class="fa-solid fa-arrow-down text-muted"></i></button>
          
          <button class="btn btn-sm btn-secondary-custom btn-toggle-cat" data-id="${cat.ID}" data-status="${cat.Status}" title="${isEnabled ? 'Disable' : 'Enable'}">
            <i class="fa-solid ${isEnabled ? 'fa-ban text-danger' : 'fa-circle-check text-success'}"></i>
          </button>
        </div>
      `;

      div.addEventListener("dragstart", handleDragStart);
      div.addEventListener("dragover", handleDragOver);
      div.addEventListener("drop", handleDrop);
      div.addEventListener("dragend", handleDragEnd);

      listDom.appendChild(div);
    });
  }

  // HTML5 Drag Reordering implementations
  let dragSourceEl = null;

  function handleDragStart(e) {
    this.style.opacity = '0.4';
    dragSourceEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-index'));
  }

  function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  async function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    if (dragSourceEl !== this) {
      const srcIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const targetIndex = parseInt(this.getAttribute('data-index'));

      const movedItem = state.categories.splice(srcIndex, 1)[0];
      state.categories.splice(targetIndex, 0, movedItem);

      state.categories.forEach((cat, index) => {
        cat.Order = (index + 1).toString();
      });

      renderCategoriesView();
      showLoadingState();

      try {
        for (let i = 0; i < state.categories.length; i++) {
          const item = state.categories[i];
          await window.api.call("updateCategory", { id: item.ID, order: item.Order });
        }
        showToast("Category order synced to Sheets", "success");
      } catch (err) {
        showToast("Error updating category orders in backend.", "error");
      } finally {
        hideLoadingState();
      }
    }
  }

  function handleDragEnd() {
    this.style.opacity = '1';
  }

  // ==========================================
  // SETTINGS VIEW LOGIC
  // ==========================================
  function renderSettingsView() {
    const s = state.settings;

    document.getElementById("setting-script-url").value = window.api.config.appsScriptUrl || "";
    document.getElementById("setting-sheet-id").value = window.api.config.sheetId || "";
    
    document.getElementById("setting-weekday-budget").value = s.weekday_budget || 50;
    document.getElementById("setting-weekend-budget").value = s.weekend_budget || 80;
    document.getElementById("setting-holiday-budget").value = s.holiday_budget || 120;
    document.getElementById("setting-holidays").value = s.holidays || "";
    document.getElementById("setting-warning-threshold").value = s.warning_threshold || 20;
    
    document.getElementById("setting-currency").value = s.currency || "$";
    document.getElementById("setting-theme").value = s.theme || "dark";
    document.getElementById("setting-date-format").value = s.date_format || "YYYY-MM-DD";
    document.getElementById("setting-time-format").value = s.time_format || "HH:mm";
    
    document.getElementById("setting-carry-forward").checked = s.carry_forward_enabled === "true";
    document.getElementById("setting-income-sources").value = s.income_sources || "Salary, Freelance, Investment, Gifts, Other";
  }

  async function saveSettings(e) {
    e.preventDefault();
    showLoadingState();

    const scriptUrl = document.getElementById("setting-script-url").value.trim();
    const sheetId = document.getElementById("setting-sheet-id").value.trim();

    await window.api.setConfig(sheetId, scriptUrl);
    updateConnectionStatusUI();

    const settingsPayload = {
      weekday_budget: document.getElementById("setting-weekday-budget").value,
      weekend_budget: document.getElementById("setting-weekend-budget").value,
      holiday_budget: document.getElementById("setting-holiday-budget").value,
      holidays: document.getElementById("setting-holidays").value.trim(),
      warning_threshold: document.getElementById("setting-warning-threshold").value,
      currency: document.getElementById("setting-currency").value.trim() || "$",
      theme: document.getElementById("setting-theme").value,
      date_format: document.getElementById("setting-date-format").value.trim(),
      time_format: document.getElementById("setting-time-format").value.trim(),
      carry_forward_enabled: document.getElementById("setting-carry-forward").checked ? "true" : "false",
      income_sources: document.getElementById("setting-income-sources").value.trim() || "Salary, Freelance, Investment, Gifts, Other"
    };

    applyTheme(settingsPayload.theme);

    try {
      const res = await window.api.call("updateSettings", { settings: settingsPayload });
      if (res.success) {
        showToast("Settings updated and synced successfully", "success");
        await loadInitialData();
        window.location.hash = "#dashboard";
      } else {
        showToast(res.message || "Failed to update configurations.", "error");
      }
    } catch (err) {
      showToast("Settings saved locally. Backend sync failed.", "warning");
    } finally {
      hideLoadingState();
    }
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function setupEventBindings() {
    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
    });

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-bs-theme");
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      
      state.settings.theme = nextTheme;
      window.api.call("updateSettings", { settings: { theme: nextTheme } }).catch(() => {});
    });

    // Smart Quick Add Action button
    document.getElementById("quick-add-btn").addEventListener("click", () => {
      if (state.currentView === "income") {
        openIncomeModal();
      } else {
        openExpenseModal();
      }
    });

    document.getElementById("add-expense-btn-register").addEventListener("click", () => {
      openExpenseModal();
    });

    // Reset expense modal form
    document.getElementById("reset-expense-form-btn").addEventListener("click", () => {
      resetExpenseFormDates();
      document.getElementById("expense-name").value = "";
      document.getElementById("expense-amount").value = "";
      document.getElementById("expense-notes").value = "";
      document.getElementById("expense-count-in-budget").checked = true;
    });

    document.getElementById("expense-form").addEventListener("submit", handleExpenseSubmit);

    // Reset Income modal form
    document.getElementById("reset-income-form-btn").addEventListener("click", () => {
      resetIncomeFormDates();
      document.getElementById("income-name").value = "";
      document.getElementById("income-amount").value = "";
      document.getElementById("income-notes").value = "";
    });

    document.getElementById("income-form").addEventListener("submit", handleIncomeSubmit);

    document.getElementById("refresh-dashboard-btn").addEventListener("click", async () => {
      await loadDashboard();
      showToast("Dashboard metrics re-synchronized", "success");
    });

    // Exps Table Inline Events
    document.addEventListener("click", handleTableActions);

    // Filters inputs in Expense Register
    document.getElementById("filter-search").addEventListener("input", applyExpenseFilters);
    document.getElementById("filter-category").addEventListener("change", applyExpenseFilters);
    document.getElementById("filter-start-date").addEventListener("change", applyExpenseFilters);
    document.getElementById("filter-end-date").addEventListener("change", applyExpenseFilters);

    // Check all expenses checkbox
    document.getElementById("check-all-expenses").addEventListener("change", (e) => {
      const checked = e.target.checked;
      const checkboxes = document.querySelectorAll("#expenses-table-body .select-expense-chk");
      
      state.expenseTable.selectedIds = [];
      checkboxes.forEach(chk => {
        chk.checked = checked;
        const row = chk.closest("tr");
        if (checked) {
          row.classList.add("table-active");
          state.expenseTable.selectedIds.push(chk.getAttribute("data-id"));
        } else {
          row.classList.remove("table-active");
        }
      });
      updateBulkActionsUI();
    });

    document.getElementById("bulk-delete-btn").addEventListener("click", handleBulkDelete);
    document.getElementById("bulk-export-btn").addEventListener("click", handleBulkExport);

    // INCOME EVENTS REGISTER
    document.getElementById("add-income-btn-register").addEventListener("click", () => {
      openIncomeModal();
    });

    document.getElementById("income-filter-search").addEventListener("input", applyIncomeFilters);
    document.getElementById("income-filter-source").addEventListener("change", applyIncomeFilters);
    document.getElementById("income-filter-start-date").addEventListener("change", applyIncomeFilters);
    document.getElementById("income-filter-end-date").addEventListener("change", applyIncomeFilters);

    // Check all incomes checkbox
    document.getElementById("check-all-incomes").addEventListener("change", (e) => {
      const checked = e.target.checked;
      const checkboxes = document.querySelectorAll("#income-table-body .select-income-chk");
      
      state.incomeTable.selectedIds = [];
      checkboxes.forEach(chk => {
        chk.checked = checked;
        const row = chk.closest("tr");
        if (checked) {
          row.classList.add("table-active");
          state.incomeTable.selectedIds.push(chk.getAttribute("data-id"));
        } else {
          row.classList.remove("table-active");
        }
      });
      updateIncomeBulkActionsUI();
    });

    document.getElementById("bulk-income-delete-btn").addEventListener("click", handleIncomeBulkDelete);
    document.getElementById("bulk-income-export-btn").addEventListener("click", handleIncomeBulkExport);

    // Reports switch tabs
    const reportTabs = document.querySelectorAll("#reports-tabs a");
    reportTabs.forEach(tab => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        reportTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const range = tab.getAttribute("data-range");
        loadReports(range);
      });
    });

    // Report Type Switch (Expense vs Income)
    document.getElementById("report-type-select").addEventListener("change", () => {
      loadReports(state.report.range);
    });

    document.getElementById("report-apply-custom-btn").addEventListener("click", () => loadReports("custom"));
    document.getElementById("report-apply-category-btn").addEventListener("click", () => loadReports("category"));

    // Category view Actions
    document.getElementById("add-category-btn").addEventListener("click", () => {
      document.getElementById("category-id").value = "";
      document.getElementById("category-name").value = "";
      document.getElementById("category-action").value = "add";
      document.getElementById("categoryModalLabel").textContent = "Create Category";
      categoryModal.show();
    });

    document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);

    // Settings actions
    document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
    document.getElementById("reset-settings-btn").addEventListener("click", handleSettingsReset);
    document.getElementById("reload-settings-btn").addEventListener("click", async () => {
      showLoadingState();
      await loadInitialData();
      renderSettingsView();
      hideLoadingState();
      showToast("Settings reloaded from database", "success");
    });

    document.getElementById("trigger-recalc-btn").addEventListener("click", handleManualRecalc);

    // Exports dropdown hooks
    document.getElementById("export-excel-btn").addEventListener("click", (e) => { e.preventDefault(); exportData("xlsx"); });
    document.getElementById("export-csv-btn").addEventListener("click", (e) => { e.preventDefault(); exportData("csv"); });
    document.getElementById("export-pdf-btn").addEventListener("click", (e) => { e.preventDefault(); window.print(); });
    
    document.getElementById("report-export-excel-btn").addEventListener("click", () => exportReportData());

    document.getElementById("dashboard-search-input").addEventListener("input", (e) => {
      const search = e.target.value.trim();
      document.getElementById("filter-search").value = search;
      window.location.hash = "#expenses";
    });
    
    document.getElementById("dashboard-category-filter").addEventListener("change", (e) => {
      const cat = e.target.value;
      document.getElementById("filter-category").value = cat;
      window.location.hash = "#expenses";
    });
  }

  // ==========================================
  // TRANSACTION SUBMITS & CRUD EDITORS
  // ==========================================
  
  function openExpenseModal(expenseData = null) {
    if (expenseData) {
      document.getElementById("expense-id").value = expenseData.ID;
      document.getElementById("expense-action").value = "edit";
      document.getElementById("expenseModalLabel").textContent = "Edit Expense Details";
      
      document.getElementById("expense-name").value = expenseData.Name;
      document.getElementById("expense-amount").value = expenseData.Amount;
      document.getElementById("expense-category").value = expenseData.Category;
      document.getElementById("expense-date").value = normalizeDateInput(expenseData.Date);
      document.getElementById("expense-time").value = normalizeTimeInput(expenseData.Time);
      document.getElementById("expense-notes").value = expenseData.Notes || "";
      document.getElementById("expense-count-in-budget").checked = expenseCountsInBudget(expenseData);
    } else {
      document.getElementById("expense-id").value = "";
      document.getElementById("expense-action").value = "add";
      document.getElementById("expenseModalLabel").textContent = "Log Expense Record";
      
      document.getElementById("expense-name").value = "";
      document.getElementById("expense-amount").value = "";
      document.getElementById("expense-notes").value = "";
      document.getElementById("expense-count-in-budget").checked = true;
      resetExpenseFormDates();
    }
    expenseModal.show();
  }

  function openIncomeModal(incomeData = null) {
    if (incomeData) {
      document.getElementById("income-id").value = incomeData.ID;
      document.getElementById("income-action").value = "edit";
      document.getElementById("incomeModalLabel").textContent = "Edit Income Entry";
      
      document.getElementById("income-name").value = incomeData.Name;
      document.getElementById("income-amount").value = incomeData.Amount;
      document.getElementById("income-source").value = incomeData.Source;
      document.getElementById("income-date").value = normalizeDateInput(incomeData.Date);
      document.getElementById("income-time").value = normalizeTimeInput(incomeData.Time);
      document.getElementById("income-notes").value = incomeData.Notes || "";
    } else {
      document.getElementById("income-id").value = "";
      document.getElementById("income-action").value = "add";
      document.getElementById("incomeModalLabel").textContent = "Log Income Entry";
      
      document.getElementById("income-name").value = "";
      document.getElementById("income-amount").value = "";
      document.getElementById("income-notes").value = "";
      resetIncomeFormDates();
    }
    incomeModal.show();
  }

  async function handleExpenseSubmit(e) {
    e.preventDefault();
    expenseModal.hide();
    showLoadingState();

    const isEdit = document.getElementById("expense-action").value === "edit";
    const id = document.getElementById("expense-id").value;
    
    const payload = {
      name: document.getElementById("expense-name").value.trim(),
      amount: parseFloat(document.getElementById("expense-amount").value),
      category: document.getElementById("expense-category").value,
      date: document.getElementById("expense-date").value,
      time: document.getElementById("expense-time").value,
      notes: document.getElementById("expense-notes").value.trim(),
      countInBudget: document.getElementById("expense-count-in-budget").checked
    };

    if (isEdit) payload.id = id;
    const action = isEdit ? "updateExpense" : "addExpense";

    try {
      const res = await window.api.call(action, payload);
      if (res.success) {
        showToast(isEdit ? "Expense record updated!" : "Expense logged successfully!", "success");
        await loadViewData(state.currentView);
        if (state.currentView !== "dashboard") {
          await loadInitialData();
        }
      } else {
        showToast(res.message || "Failed to commit record.", "error");
      }
    } catch (err) {
      showToast("Error updating database.", "error");
    } finally {
      hideLoadingState();
    }
  }

  async function handleIncomeSubmit(e) {
    e.preventDefault();
    incomeModal.hide();
    showLoadingState();

    const isEdit = document.getElementById("income-action").value === "edit";
    const id = document.getElementById("income-id").value;
    
    const payload = {
      name: document.getElementById("income-name").value.trim(),
      amount: parseFloat(document.getElementById("income-amount").value),
      source: document.getElementById("income-source").value,
      date: document.getElementById("income-date").value,
      time: document.getElementById("income-time").value,
      notes: document.getElementById("income-notes").value.trim()
    };

    if (isEdit) payload.id = id;
    const action = isEdit ? "updateIncome" : "addIncome";

    try {
      const res = await window.api.call(action, payload);
      if (res.success) {
        showToast(isEdit ? "Income entry updated!" : "Income logged successfully!", "success");
        await loadViewData(state.currentView);
        if (state.currentView !== "dashboard") {
          await loadInitialData();
        }
      } else {
        showToast(res.message || "Failed to commit income.", "error");
      }
    } catch (err) {
      showToast("Error updating database.", "error");
    } finally {
      hideLoadingState();
    }
  }

  async function handleTableActions(e) {
    // EXPENSES BUTTON HANDLERS
    const editBtn = e.target.closest(".btn-edit-exp");
    const duplicateBtn = e.target.closest(".btn-duplicate-exp");
    const deleteBtn = e.target.closest(".btn-delete-exp");

    // INCOME BUTTON HANDLERS
    const editIncBtn = e.target.closest(".btn-edit-inc");
    const duplicateIncBtn = e.target.closest(".btn-duplicate-inc");
    const deleteIncBtn = e.target.closest(".btn-delete-inc");

    // Checkboxes click events
    if (e.target.classList.contains("select-expense-chk")) {
      const chk = e.target;
      const id = chk.getAttribute("data-id");
      const row = chk.closest("tr");
      
      if (chk.checked) {
        row.classList.add("table-active");
        if (!state.expenseTable.selectedIds.includes(id)) {
          state.expenseTable.selectedIds.push(id);
        }
      } else {
        row.classList.remove("table-active");
        state.expenseTable.selectedIds = state.expenseTable.selectedIds.filter(item => item !== id);
      }
      updateBulkActionsUI();
      return;
    }

    if (e.target.classList.contains("select-income-chk")) {
      const chk = e.target;
      const id = chk.getAttribute("data-id");
      const row = chk.closest("tr");
      
      if (chk.checked) {
        row.classList.add("table-active");
        if (!state.incomeTable.selectedIds.includes(id)) {
          state.incomeTable.selectedIds.push(id);
        }
      } else {
        row.classList.remove("table-active");
        state.incomeTable.selectedIds = state.incomeTable.selectedIds.filter(item => item !== id);
      }
      updateIncomeBulkActionsUI();
      return;
    }

    if (editBtn) {
      const id = editBtn.getAttribute("data-id");
      const exp = findExpenseById(id);
      if (exp) openExpenseModal(exp);
    }

    if (duplicateBtn) {
      const id = duplicateBtn.getAttribute("data-id");
      const exp = findExpenseById(id);
      if (exp) {
        const today = new Date();
        const clone = {
          ...exp,
          ID: "",
          Date: window.api.getLocalDateString(today),
          Time: window.api.getLocalTimeString(today),
          Name: `${exp.Name} (Copy)`
        };
        openExpenseModal(clone);
      }
    }

    if (deleteBtn) {
      const id = deleteBtn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this expense record?")) {
        showLoadingState();
        try {
          const res = await window.api.call("deleteExpense", { id });
          if (res.success) {
            showToast("Expense deleted successfully", "success");
            await loadViewData(state.currentView);
          } else {
            showToast(res.message || "Failed to delete item.", "error");
          }
        } catch (err) {
          showToast("Network error deleting row.", "error");
        } finally {
          hideLoadingState();
        }
      }
    }

    // INCOME CRUD HANDLERS
    if (editIncBtn) {
      const id = editIncBtn.getAttribute("data-id");
      const inc = findIncomeById(id);
      if (inc) openIncomeModal(inc);
    }

    if (duplicateIncBtn) {
      const id = duplicateIncBtn.getAttribute("data-id");
      const inc = findIncomeById(id);
      if (inc) {
        const today = new Date();
        const clone = {
          ...inc,
          ID: "",
          Date: window.api.getLocalDateString(today),
          Time: window.api.getLocalTimeString(today),
          Name: `${inc.Name} (Copy)`
        };
        openIncomeModal(clone);
      }
    }

    if (deleteIncBtn) {
      const id = deleteIncBtn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this income entry?")) {
        showLoadingState();
        try {
          const res = await window.api.call("deleteIncome", { id });
          if (res.success) {
            showToast("Income entry deleted", "success");
            await loadViewData(state.currentView);
          } else {
            showToast(res.message || "Failed to delete income.", "error");
          }
        } catch (err) {
          showToast("Network error updating database.", "error");
        } finally {
          hideLoadingState();
        }
      }
    }

    // Category toggle
    const toggleCatBtn = e.target.closest(".btn-toggle-cat");
    const moveUpCatBtn = e.target.closest(".btn-move-up");
    const moveDownCatBtn = e.target.closest(".btn-move-down");

    if (toggleCatBtn) {
      const id = toggleCatBtn.getAttribute("data-id");
      const status = toggleCatBtn.getAttribute("data-status");
      const nextStatus = status === "Enabled" ? "Disabled" : "Enabled";
      showLoadingState();
      try {
        const res = await window.api.call("updateCategory", { id, status: nextStatus });
        if (res.success) {
          showToast(`Category ${nextStatus.toLowerCase()}`, "success");
          await loadInitialData();
          renderCategoriesView();
        }
      } catch (e) {
        showToast("Error updating category.", "error");
      } finally {
        hideLoadingState();
      }
    }

    if (moveUpCatBtn) {
      const id = moveUpCatBtn.getAttribute("data-id");
      await shiftCategoryPosition(id, -1);
    }
    
    if (moveDownCatBtn) {
      const id = moveDownCatBtn.getAttribute("data-id");
      await shiftCategoryPosition(id, 1);
    }
  }

  async function shiftCategoryPosition(id, direction) {
    const index = state.categories.findIndex(c => c.ID === id);
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < state.categories.length) {
      showLoadingState();
      const item = state.categories[index];
      const other = state.categories[targetIndex];
      
      const tempOrder = item.Order;
      item.Order = other.Order;
      other.Order = tempOrder;

      try {
        await window.api.call("updateCategory", { id: item.ID, order: item.Order });
        await window.api.call("updateCategory", { id: other.ID, order: other.Order });
        
        await loadInitialData();
        renderCategoriesView();
        showToast("Orders updated", "success");
      } catch (e) {
        showToast("Sync error.", "error");
      } finally {
        hideLoadingState();
      }
    }
  }

  async function handleBulkDelete() {
    const idsCount = state.expenseTable.selectedIds.length;
    if (idsCount === 0) return;

    if (confirm(`Are you sure you want to delete the ${idsCount} selected records?`)) {
      showLoadingState();
      try {
        let deletedCount = 0;
        for (let i = 0; i < idsCount; i++) {
          const res = await window.api.call("deleteExpense", { id: state.expenseTable.selectedIds[i] });
          if (res.success) deletedCount++;
        }
        showToast(`Successfully deleted ${deletedCount} of ${idsCount} records.`, "success");
        state.expenseTable.selectedIds = [];
        updateBulkActionsUI();
        await loadViewData(state.currentView);
      } catch (err) {
        showToast("Failed to complete bulk delete request.", "error");
      } finally {
        hideLoadingState();
      }
    }
  }

  async function handleIncomeBulkDelete() {
    const idsCount = state.incomeTable.selectedIds.length;
    if (idsCount === 0) return;

    if (confirm(`Are you sure you want to delete the ${idsCount} selected income entries?`)) {
      showLoadingState();
      try {
        let deletedCount = 0;
        for (let i = 0; i < idsCount; i++) {
          const res = await window.api.call("deleteIncome", { id: state.incomeTable.selectedIds[i] });
          if (res.success) deletedCount++;
        }
        showToast(`Deleted ${deletedCount} of ${idsCount} income entries.`, "success");
        state.incomeTable.selectedIds = [];
        updateIncomeBulkActionsUI();
        await loadViewData(state.currentView);
      } catch (err) {
        showToast("Bulk delete request failed.", "error");
      } finally {
        hideLoadingState();
      }
    }
  }

  async function handleBulkExport() {
    const ids = state.expenseTable.selectedIds;
    if (ids.length === 0) return;
    
    const itemsToExport = state.expenses.filter(e => ids.includes(e.ID));
    const dataRows = itemsToExport.map(e => ({
      Date: formatDateDisplay(e.Date),
      Time: e.Time,
      Name: e.Name,
      Category: e.Category,
      Amount: e.Amount,
      Notes: e.Notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Expenses");
    XLSX.writeFile(workbook, "selected_expenses.xlsx");
    
    showToast(`Exported ${ids.length} selected records`, "success");
  }

  async function handleIncomeBulkExport() {
    const ids = state.incomeTable.selectedIds;
    if (ids.length === 0) return;

    const itemsToExport = state.income.filter(i => ids.includes(i.ID));
    const dataRows = itemsToExport.map(i => ({
      Date: formatDateDisplay(i.Date),
      Time: i.Time,
      Description: i.Name,
      SourceCategory: i.Source,
      Amount: i.Amount,
      Notes: i.Notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Incomes");
    XLSX.writeFile(workbook, "selected_incomes.xlsx");
    showToast(`Exported ${ids.length} selected records`, "success");
  }

  async function handleCategorySubmit(e) {
    e.preventDefault();
    categoryModal.hide();
    showLoadingState();

    const name = document.getElementById("category-name").value.trim();
    try {
      const res = await window.api.call("addCategory", { name });
      if (res.success) {
        showToast("Category created successfully", "success");
        await loadInitialData();
        renderCategoriesView();
      } else {
        showToast(res.message || "Failed to create category.", "error");
      }
    } catch (e) {
      showToast("Error syncing categories", "error");
    } finally {
      hideLoadingState();
    }
  }

  async function handleSettingsReset() {
    if (confirm("Reset configurations to defaults? This will overwrite existing sheet key values.")) {
      showLoadingState();
      const defaultSettingsMap = {
        weekday_budget: "50",
        weekend_budget: "80",
        holiday_budget: "120",
        currency: "$",
        warning_threshold: "20",
        theme: "dark",
        date_format: "YYYY-MM-DD",
        time_format: "HH:mm",
        carry_forward_enabled: "true",
        holidays: "2026-01-01,2026-07-04,2026-12-25",
        income_sources: "Salary, Freelance, Investment, Gifts, Other"
      };

      try {
        const res = await window.api.call("updateSettings", { settings: defaultSettingsMap });
        if (res.success) {
          showToast("Reset defaults completed", "success");
          await loadInitialData();
          renderSettingsView();
        }
      } catch (e) {
        showToast("Error resetting defaults", "error");
      } finally {
        hideLoadingState();
      }
    }
  }

  async function handleManualRecalc() {
    const startDate = document.getElementById("recalc-start-date").value;
    if (!startDate) {
      showToast("Please choose a starting date for recalculations.", "warning");
      return;
    }

    showLoadingState();
    try {
      const res = await window.api.call("recalculateBudget", { startDate });
      if (res.success) {
        showToast("Budget engine calculation chain complete!", "success");
        await loadViewData(state.currentView);
      } else {
        showToast(res.message || "Calculation failed.", "error");
      }
    } catch (err) {
      showToast("Recalculation failed.", "error");
    } finally {
      hideLoadingState();
    }
  }

  // ==========================================
  // DATA EXPORTS LOGIC (CSV, XLSX)
  // ==========================================
  async function exportData(format = "xlsx") {
    showLoadingState();
    try {
      // Export either expenses or income depending on active view register
      const isIncome = state.currentView === "income";
      const action = isIncome ? "getIncome" : "getExpenses";
      
      const res = await window.api.call(action);
      if (!res.success || res.data.length === 0) {
        showToast("No data records available to export.", "warning");
        hideLoadingState();
        return;
      }

      let rows = [];
      if (isIncome) {
        rows = res.data.map(e => ({
          Date: e.Date,
          Time: e.Time,
          Description: e.Name,
          SourceCategory: e.Source,
          Amount: e.Amount,
          Notes: e.Notes,
          CreatedAt: e.CreatedAt
        }));
      } else {
        rows = res.data.map(e => ({
          Date: e.Date,
          Time: e.Time,
          Name: e.Name,
          Category: e.Category,
          Amount: e.Amount,
          Notes: e.Notes,
          CreatedAt: e.CreatedAt
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, isIncome ? "Income Register" : "Expenses Register");

      const filename = isIncome ? "income_master" : "expenses_master";
      if (format === "xlsx") {
        XLSX.writeFile(workbook, `${filename}.xlsx`);
        showToast("Excel spreadsheet generated and downloaded", "success");
      } else if (format === "csv") {
        XLSX.writeFile(workbook, `${filename}.csv`, { bookType: "csv" });
        showToast("CSV file generated and downloaded", "success");
      }
    } catch (e) {
      showToast("Export formatting failed.", "error");
    } finally {
      hideLoadingState();
    }
  }

  function exportReportData() {
    const r = state.reports;
    if (!r || !r.expenses || r.expenses.length === 0) {
      showToast("No report records to export.", "warning");
      return;
    }

    const isIncome = r.type === "income";
    let rows = [];
    if (isIncome) {
      rows = r.expenses.map(e => ({
        Date: e.Date,
        Time: e.Time,
        Description: e.Name,
        SourceCategory: e.Source,
        Amount: e.Amount,
        Notes: e.Notes
      }));
    } else {
      rows = r.expenses.map(e => ({
        Date: e.Date,
        Time: e.Time,
        Name: e.Name,
        Category: e.Category,
        Amount: e.Amount,
        Notes: e.Notes
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isIncome ? "Income Report" : "Expenses Report");
    XLSX.writeFile(workbook, `report_log_${r.type}_${r.range}.xlsx`);
    showToast("Report spreadsheet downloaded", "success");
  }

  // ==========================================
  // HELPERS AND COMPONENT DRAWERS
  // ==========================================
  
  function findExpenseById(id) {
    let exp = state.expenses.find(e => e.ID === id);
    if (!exp && state.dashboard && state.dashboard.recentExpenses) {
      exp = state.dashboard.recentExpenses.find(e => e.ID === id);
    }
    return exp;
  }

  function findIncomeById(id) {
    return state.income.find(i => i.ID === id);
  }

  function populateCategoryDropdowns() {
    const activeCats = state.categories.filter(c => c.Status === "Enabled");
    
    const formSelect = document.getElementById("expense-category");
    formSelect.innerHTML = "";
    activeCats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.Name;
      opt.textContent = c.Name;
      formSelect.appendChild(opt);
    });

    const regFilter = document.getElementById("filter-category");
    regFilter.innerHTML = `<option value="">All Categories</option>`;
    activeCats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.Name;
      opt.textContent = c.Name;
      regFilter.appendChild(opt);
    });

    const dashFilter = document.getElementById("dashboard-category-filter");
    dashFilter.innerHTML = `<option value="">All Categories</option>`;
    activeCats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.Name;
      opt.textContent = c.Name;
      dashFilter.appendChild(opt);
    });
  }

  function populateIncomeSourceDropdowns() {
    const sourcesStr = state.settings.income_sources || "Salary, Freelance, Investment, Gifts, Other";
    const sources = sourcesStr.split(",").map(s => s.trim());

    // 1. Income Form source
    const formSelect = document.getElementById("income-source");
    formSelect.innerHTML = "";
    sources.forEach(src => {
      const opt = document.createElement("option");
      opt.value = src;
      opt.textContent = src;
      formSelect.appendChild(opt);
    });

    // 2. Income Table Filter source
    const regFilter = document.getElementById("income-filter-source");
    regFilter.innerHTML = `<option value="">All Sources</option>`;
    sources.forEach(src => {
      const opt = document.createElement("option");
      opt.value = src;
      opt.textContent = src;
      regFilter.appendChild(opt);
    });
  }

  function populateReportCategorySelect(type) {
    const select = document.getElementById("report-category-select");
    select.innerHTML = "";
    
    if (type === "income") {
      const sourcesStr = state.settings.income_sources || "Salary, Freelance, Investment, Gifts, Other";
      const sources = sourcesStr.split(",").map(s => s.trim());
      sources.forEach(src => {
        const opt = document.createElement("option");
        opt.value = src;
        opt.textContent = src;
        select.appendChild(opt);
      });
    } else {
      state.categories.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.Name;
        opt.textContent = c.Name;
        select.appendChild(opt);
      });
    }
  }

  function resetExpenseFormDates() {
    const today = new Date();
    document.getElementById("expense-date").value = window.api.getLocalDateString(today);
    document.getElementById("expense-time").value = window.api.getLocalTimeString(today);
    document.getElementById("expense-count-in-budget").checked = true;
    
    const cur = state.settings.currency || "$";
    document.getElementById("expense-currency-addon").textContent = cur;
  }

  function resetIncomeFormDates() {
    const today = new Date();
    document.getElementById("income-date").value = window.api.getLocalDateString(today);
    document.getElementById("income-time").value = window.api.getLocalTimeString(today);
    
    const cur = state.settings.currency || "$";
    document.getElementById("income-currency-addon").textContent = cur;
  }

  function formatCurrency(amount, symbol = "$") {
    const amt = parseFloat(amount);
    if (isNaN(amt)) return `${symbol}0.00`;
    
    const sign = amt < 0 ? "-" : "";
    return `${sign}${symbol}${Math.abs(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function expenseCountsInBudget(exp) {
    return window.api.expenseCountsInBudget(exp);
  }

  function normalizeDateInput(value) {
    if (!value && value !== 0) return "";
    if (value instanceof Date && !isNaN(value.getTime())) {
      return window.api.getLocalDateString(value);
    }
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return window.api.getLocalDateString(parsed);
    return "";
  }

  function normalizeTimeInput(value) {
    if (!value && value !== 0) return "00:00";
    if (value instanceof Date && !isNaN(value.getTime())) {
      return window.api.getLocalTimeString(value);
    }
    if (typeof value === "number") {
      const totalMinutes = Math.round(value * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
      const mm = String(totalMinutes % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    const str = String(value).trim();
    if (/^\d{1,2}:\d{2}/.test(str)) {
      const parts = str.split(":");
      return `${parts[0].padStart(2, "0")}:${(parts[1] || "00").substring(0, 2).padStart(2, "0")}`;
    }
    if (str.includes("T")) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return window.api.getLocalTimeString(parsed);
    }
    return str || "00:00";
  }

  function formatTimeDisplay(timeValue) {
    const normalized = normalizeTimeInput(timeValue);
    return normalized || "--:--";
  }

  function formatDateDisplay(dateString) {
    const normalized = normalizeDateInput(dateString);
    if (!normalized) return "";
    try {
      const date = new Date(normalized + "T00:00:00");
      if (isNaN(date.getTime())) return normalized;
      const format = state.settings.date_format || "YYYY-MM-DD";
      
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();

      if (format === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
      if (format === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
      return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      return normalized;
    }
  }

  function getCategoryBadgeClass(category) {
    if (!category) return "bg-secondary text-light";
    const name = category.toLowerCase();
    if (name.includes("food") || name.includes("dining")) return "badge-food";
    if (name.includes("transport")) return "badge-transport";
    if (name.includes("util") || name.includes("bill")) return "badge-utilities";
    if (name.includes("entertainment") || name.includes("movie")) return "badge-entertainment";
    if (name.includes("shopping") || name.includes("clothes")) return "badge-shopping";
    return "bg-secondary-subtle text-muted";
  }

  function getIncomeSourceBadgeClass(source) {
    if (!source) return "badge-other";
    const name = source.toLowerCase();
    if (name.includes("salary") || name.includes("paycheck")) return "badge-salary";
    if (name.includes("freelance") || name.includes("consulting")) return "badge-freelance";
    if (name.includes("invest") || name.includes("stock")) return "badge-investment";
    if (name.includes("gift") || name.includes("bonus")) return "badge-gifts";
    return "badge-other";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
    const icon = document.getElementById("theme-icon");
    if (theme === "dark") {
      icon.className = "fa-solid fa-sun";
    } else {
      icon.className = "fa-solid fa-moon";
    }

    if (state.currentView === "reports" && state.reports) {
      renderCharts(state.reports, state.report.type);
    }
  }

  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast-custom ${type}`;
    
    let icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-exclamation";
    if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideInRight 0.3s reverse forwards";
      toast.addEventListener("animationend", () => {
        toast.remove();
      });
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showLoadingState() {
    document.body.classList.add("loading-active");
  }

  function hideLoadingState() {
    document.body.classList.remove("loading-active");
  }

  await init();
});
