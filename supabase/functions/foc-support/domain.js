// Generated from gas/Code.gs. Server-only domain rules; no Google API calls.
// @ts-nocheck
export function createDomain(adapter){
const {SpreadsheetApp,PropertiesService,LockService,ContentService,Utilities,CacheService,Logger}=adapter;
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MKT CUSTOMER BUDGET MANAGEMENT - GOOGLE APPS SCRIPT WEB APP BACKEND
 * Spreadsheet ID: YOUR_SPREADSHEET_ID
 * Teams Supported: B1, B2, B3, B4, B5, B6, B7
 */

// Recommended: set SPREADSHEET_ID in Project Settings > Script Properties.
// This optional fallback may be set privately in Apps Script, never in public Git.
const SPREADSHEET_ID = "";

// Install this Code.gs ONLY. It includes initializeDatabase() and importExistingCustomerData().
// Full sync is a revision-guarded Admin upsert. Normal edits use MUTATE_BUSINESS; historical records are retained.
const SYNC_TABLES = [
  ['customers', 'CUSTOMERS', ['Customer Code','Customer Name','Team','MDE','Phone','Address','Province','Status','Created At','Contact Person','Updated At','Deleted At'], ['code','name','team','mde','phone','address','province','status','createdAt','contactPerson','updatedAt','deletedAt']],
  ['conditions', 'CUSTOMER_CONDITIONS', ['ID','Customer Code','Condition Quantity','Condition UOM','Product Description','Updated At','Price per Unit'], ['id','customerCode','conditionQuantity','conditionUOM','conditionProductDescription','updatedAt','pricePerUnit']],
  ['contracts', 'CONTRACTS', ['Contract ID','Customer Code','Customer Name','Team','Commencing On','Expiring On','Cycle Number','Status','Notes','Created At','Updated At'], ['id','customerCode','customerName','team','commencingOn','expiringOn','cycleNumber','status','notes','createdAt','updatedAt']],
  ['budgets', 'BUDGETS', ['Budget ID','Contract ID','Customer Code','Team','Annual Amount','Total Used','Remaining Amount','Utilization (%)','Status','Allow Exception','Exception Reason','Updated At','Budget Year','Period Start','Period End','Legacy Undated Used'], ['id','contractId','customerCode','team','annualAmount','totalUsed','remainingAmount','utilizationPercentage','status','allowException','exceptionReason','updatedAt','periodNumber','periodStart','periodEnd','unallocatedUsed']],
  ['transactions', 'BUDGET_TRANSACTIONS', ['Transaction ID','Date','Customer Code','Customer Name','Team','Contract ID','Budget ID','Category','Description','Amount','Invoice Ref','Created By','Created At','Status','Cancellation Reason','Cancelled By','Cancelled At'], ['id','date','customerCode','customerName','team','contractId','budgetId','category','description','amount','invoiceRef','createdBy','createdAt','status','cancellationReason','cancelledBy','cancelledAt']],
  ['logs', 'ACTIVITY_LOG', ['Log ID','Timestamp','User','Role','Team','Action','Details'], ['id','timestamp','user','role','team','action','details']],
  ['settingsRows', 'SETTINGS', ['Setting Key','Setting Value','Description','Updated At'], ['key','value','description','updatedAt']]
];

function syncCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('Non-finite number in sync payload');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') throw new Error('Only text, numbers and booleans can be synced');
  // Treat imported text as text, including strings that resemble Sheet formulas.
  return /^[=+@-]/.test(value) ? "'" + value : value;
}

function planSyncTable_(ss, table, records) {
  if (!Array.isArray(records)) throw new Error(table[0] + ' must be an array');
  const removed=deletedCustomerCodes_(ss);
  if(['customers','conditions','contracts','budgets','transactions'].indexOf(table[0])>=0)records=records.filter(function(record){return !removed.has(String(table[0]==='customers'?record.code:record.customerCode));});
  const sheet = ss.getSheetByName(table[1]);
  const existing = sheet && sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
  const formulas = existing.length ? sheet.getDataRange().getFormulas() : [];
  const headers = existing.length ? existing[0].map(String) : [];
  if (headers.length && headers[0] !== table[2][0]) {
    throw new Error(table[1] + ': unexpected ID column; existing sheet was not overwritten');
  }
  if (new Set(headers).size !== headers.length) throw new Error(table[1] + ': duplicate headers');
  table[2].forEach(function(header) { if (headers.indexOf(header) < 0) headers.push(header); });
  const rows = existing.slice(1).map(function(row, i) {
    return headers.map(function(_, col) {
      return formulas[i + 1] && formulas[i + 1][col] || (row[col] === undefined ? '' : row[col]);
    });
  });
  const index = new Map();
  rows.forEach(function(row, i) {
    if (row[0] === '') return;
    const key = String(row[0]);
    if (index.has(key)) throw new Error(table[1] + ': duplicate existing ID ' + key);
    index.set(key, i);
  });
  const seen = new Set();
  let inserted = 0, updated = 0;
  records.forEach(function(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record in ' + table[1]);
    const id = record[table[3][0]];
    if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') throw new Error('Missing ID in ' + table[1]);
    const key = String(id);
    if (seen.has(key)) throw new Error('Duplicate incoming ID in ' + table[1] + ': ' + key);
    seen.add(key);
    let row;
    if (index.has(key)) { row = rows[index.get(key)]; updated++; }
    else { row = headers.map(function() { return ''; }); index.set(key, rows.length); rows.push(row); inserted++; }
    table[3].forEach(function(field, i) {
      if (Object.prototype.hasOwnProperty.call(record, field)) row[headers.indexOf(table[2][i])] = syncCell_(record[field]);
    });
  });
  return { sheetName: table[1], headers: headers, rows: rows, inserted: inserted, updated: updated, received: records.length };
}

function handleBulkSync(p) {
  if (!p || typeof p !== 'object') throw new Error('Missing sync payload');
  const ss = getSpreadsheet();
  const spreadsheetId = ss.getId();
  if (p.spreadsheetId && p.spreadsheetId !== 'YOUR_SPREADSHEET_ID' && p.spreadsheetId !== spreadsheetId) throw new Error('Spreadsheet ID does not match the configured backend. Click Test in Settings to load its ID.');
  const data = Object.assign({}, p);
  if(Array.isArray(data.contracts)&&Array.isArray(data.budgets)&&Array.isArray(data.transactions)){
    const annual=projectAnnualBudgets(data.contracts,data.budgets,data.transactions);
    data.budgets=annual.budgets;data.transactions=annual.transactions;
  }
  if (p.settings !== undefined) {
    if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) throw new Error('settings must be an object');
    normalizeSharedSettings_(p.settings);
    const allowed = ['dashboardTheme','spreadsheetId','appsScriptUrl','currencyCode','currencySymbol','currencyPosition','pricePerCrate','contractAlertDays','warningThresholdPercent','syncMode','language'];
    data.settingsRows = allowed.filter(function(key) { return Object.prototype.hasOwnProperty.call(p.settings, key); }).map(function(key) {
      return { key: key, value: key === 'spreadsheetId' ? spreadsheetId : p.settings[key], description: 'Synced from MKT app', updatedAt: new Date().toISOString() };
    });
  }
  // Validate every table before writing any business data.
  const plans = SYNC_TABLES.filter(function(table) { return data[table[0]] !== undefined; }).map(function(table) {
    return planSyncTable_(ss, table, data[table[0]]);
  });
  if (!plans.length) throw new Error('No supported data supplied');
  const counts = {}, appliedSheets = [];
  try {
    plans.forEach(function(plan) {
      const sheet = ss.getSheetByName(plan.sheetName) || ss.insertSheet(plan.sheetName);
      const values = [plan.headers].concat(plan.rows);
      if (sheet.getMaxColumns() < plan.headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), plan.headers.length - sheet.getMaxColumns());
      if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
      sheet.getRange(1, 1, values.length, plan.headers.length).setValues(values);
      appliedSheets.push(plan.sheetName);
      counts[plan.sheetName] = { received: plan.received, inserted: plan.inserted, updated: plan.updated };
    });
    SpreadsheetApp.flush();
  } catch (error) {
    return { success: false, error: String(error), message: 'Sync incomplete. Some writes may have completed; retry is safe by ID.', appliedSheets: appliedSheets, counts: counts };
  }
  const total = plans.reduce(function(sum, plan) { return sum + plan.received; }, 0);
  return { success: true, syncVersion: 2, annualBudgetVersion: 1, message: 'Saved ' + total + ' records across ' + plans.length + ' sheets (upsert by ID).', counts: counts, spreadsheetId: spreadsheetId, syncedAt: new Date().toISOString() };
}

function getSpreadsheet() {
  if(spreadsheetCache_)return spreadsheetCache_;
  const configured=String(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||SPREADSHEET_ID).trim();
  let source;
  if(configured&&configured!=='YOUR_SPREADSHEET_ID'){
    const match=configured.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/),id=match?match[1]:configured;
    if(!/^[A-Za-z0-9_-]{20,}$/.test(id))throw new Error('Invalid SPREADSHEET_ID in Script Properties.');
    source=SpreadsheetApp.openById(id);
  }else source=SpreadsheetApp.getActiveSpreadsheet();
  if(!source)throw new Error('Set SPREADSHEET_ID in Script Properties, then deploy the Web App.');
  spreadsheetCache_=resolvePrimaryDatabase_(source);return spreadsheetCache_;
}

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  spreadsheetCache_=null;
  try {
    const action = (e && e.parameter && e.parameter.action) || "ping";

    if (action === "ping") {
      return jsonResponse({
        success: true,
        message: "MKT Customer Budget Management Web App Backend Active",
        timestamp: new Date().toISOString(),
        spreadsheetId: getSpreadsheet().getId()
      });
    }

    if (action === "getCustomers") {
      return jsonResponse({success:false,message:"Sign in and use POST GET_BUSINESS_DATA to load your team's data."});
    }

    return jsonResponse({ success: false, message: "Unknown action" });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle HTTP POST Requests with Concurrency Lock
 */
function doPost(e) {
  spreadsheetCache_=null;
  const lock = LockService.getScriptLock();
  try {
    // Wait up to 10 seconds to prevent concurrent write collisions
    lock.waitLock(10000);
    databaseLockHeld_=true;

    let postData = {};
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse({ success: false, message: "No post data received" });
    }

    const action = postData.action;
    const payload = postData.payload || {};
    if(action==='SAVE_BROWSER_RECOVERY')return jsonResponse(saveBrowserRecovery_(payload,postData.authToken));
    if(action==='BACKUP_DATABASE'){const ss=userTables_(),actor=requireSession_(ss,postData.authToken,true),id='MANUAL-'+Utilities.getUuid(),tables={};CORE_DATABASE_SHEETS_.forEach(function(name){const sheet=ss.getSheetByName(name);if(sheet)tables[name]=backupValues_(sheet);});storeArchive_(ss,'DATABASE_BACKUPS',id,actor,'ADMIN_MANUAL',{version:1,spreadsheetId:ss.getId(),tables:tables,excluded:['SESSIONS']});return jsonResponse({success:true,backupId:id,spreadsheetId:ss.getId(),message:'All database tables and users backed up; sessions excluded.'});}
    if(action==='MUTATE_BUSINESS')return jsonResponse(mutateBusiness_(payload,postData.authToken));
    if(['GET_BUSINESS_DATA','SYNC_BULK_DATA','ADD_TRANSACTION','CANCEL_TRANSACTION','NEW_CONTRACT_CYCLE','UPDATE_BUDGET'].indexOf(action)>=0){requireSession_(userTables_(),postData.authToken,false);recoverBusinessWrites_();}
    if (action === 'GET_BUSINESS_DATA') return jsonResponse(readBusinessData_(postData.authToken));
    if (action === 'GET_SHARED_SETTINGS') { const ss=userTables_(),actor=requireSession_(ss,postData.authToken,false);return jsonResponse({success:true,settingsVersion:1,settings:readSharedSettings_(ss),user:publicUser_(actor)}); }
    if (action === 'SAVE_SHARED_SETTINGS') return jsonResponse(saveSharedSettings_(payload,postData.authToken));
    if (action === 'SYNC_BULK_DATA') {if(payload.settingsRows!==undefined)throw new Error('Use the allowlisted settings object; database routing is owner-controlled.');requireSession_(userTables_(),postData.authToken,true);if(payload.expectedBusinessRevision!==readBusinessData_(postData.authToken).businessRevision)return jsonResponse({success:false,message:'Sheet changed on another device. Back up local edits, load the latest Sheet and retry.'});}
    if (action==='ADD_TRANSACTION'||action==='CANCEL_TRANSACTION') return jsonResponse(handleAnnualTransaction_(action,payload,postData.authToken));
    if (['NEW_CONTRACT_CYCLE','UPDATE_BUDGET'].indexOf(action)>=0) authorizeLegacyBusiness_(action,payload,postData.authToken);
    const userActions = ['AUTH_LOGIN','AUTH_ME','AUTH_LOGOUT','GET_USERS','SYNC_USERS','ADD_USER','UPDATE_USER','RESET_USER_PASSWORD','DELETE_USER','UPDATE_PROFILE'];
    if (userActions.indexOf(action) >= 0) return jsonResponse(handleUserAction_(action,payload,postData.authToken));

    let result = { success: false, message: "Unknown action" };

    switch (action) {
      case "ADD_TRANSACTION":
        result = handleAddTransaction(payload);
        break;
      case "CANCEL_TRANSACTION":
        result = handleCancelTransaction(payload);
        break;
      case "NEW_CONTRACT_CYCLE":
        result = handleNewContractCycle(payload);
        break;
      case "UPDATE_BUDGET":
        result = handleUpdateBudget(payload);
        break;
      case "SYNC_BULK_DATA":
        {const ss=userTables_(),actor=requireSession_(ss,postData.authToken,true),before=readBusinessData_(postData.authToken).snapshot;ensureDailyDatabaseBackup_(ss,actor);
        result=handleBulkSync(payload);
        if(result.success){const read=readBusinessData_(postData.authToken);result.businessRevision=read.businessRevision;appendChangeHistory_(ss,'BULK-'+Utilities.getUuid(),actor,'SYNC_BULK_DATA',businessChanges_(before,read.snapshot));}}
        break;
      default:
        result = { success: false, message: "Unsupported action: " + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
    databaseLockHeld_=false;
  }
}

function handleAddTransaction(p) {
  const ss = getSpreadsheet();
  const txnSheet = ss.getSheetByName("BUDGET_TRANSACTIONS");
  const budgetSheet = ss.getSheetByName("BUDGETS");
  const logSheet = ss.getSheetByName("ACTIVITY_LOG");

  if (!txnSheet) return { success: false, message: "BUDGET_TRANSACTIONS sheet not found" };

  txnSheet.appendRow([
    p.id,
    p.date,
    p.customerCode,
    p.customerName,
    p.team,
    p.contractId,
    p.budgetId,
    p.category,
    p.description,
    p.amount,
    p.invoiceRef || "",
    p.createdBy,
    new Date(),
    "ACTIVE",
    ""
  ]);

  if (logSheet) {
    logSheet.appendRow([
      "LOG-" + Date.now(),
      new Date(),
      p.createdBy,
      "USER",
      p.team,
      "ADD_TRANSACTION",
      "Recorded " + p.amount + " for " + p.customerName + " (" + p.category + ")"
    ]);
  }

  return { success: true, message: "Transaction added successfully", id: p.id };
}

function handleCancelTransaction(p) {
  const ss = getSpreadsheet();
  const txnSheet = ss.getSheetByName("BUDGET_TRANSACTIONS");
  const logSheet = ss.getSheetByName("ACTIVITY_LOG");
  if (!txnSheet) return { success: false, message: "Sheet not found" };

  const data = txnSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.txnId)) {
      txnSheet.getRange(i + 1, 14).setValue("CANCELLED");
      txnSheet.getRange(i + 1, 15).setValue(p.reason || "Cancelled by user");
      
      if (logSheet) {
        logSheet.appendRow([
          "LOG-" + Date.now(),
          new Date(),
          p.cancelledBy || "user",
          "USER",
          p.team || "ALL",
          "CANCEL_TRANSACTION",
          "Cancelled transaction " + p.txnId + " - Reason: " + (p.reason || "None")
        ]);
      }
      return { success: true, message: "Transaction cancelled" };
    }
  }

  return { success: false, message: "Transaction ID not found" };
}

function handleNewContractCycle(p) {
  const ss = getSpreadsheet();
  const contractSheet = ss.getSheetByName("CONTRACTS");
  const budgetSheet = ss.getSheetByName("BUDGETS");
  const logSheet = ss.getSheetByName("ACTIVITY_LOG");

  if (!contractSheet || !budgetSheet) {
    return { success: false, message: "Required sheets not found" };
  }

  const contractId = "CNT-" + p.customerCode + "-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  const budgetId = "BDG-" + p.customerCode + "-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");

  contractSheet.appendRow([
    contractId,
    p.customerCode,
    p.customerName,
    p.team,
    p.commencingOn,
    p.expiringOn,
    p.cycleNumber || 2,
    "ACTIVE",
    p.notes || "New contract cycle",
    new Date()
  ]);

  budgetSheet.appendRow([
    budgetId,
    contractId,
    p.customerCode,
    p.team,
    p.annualAmount || 0,
    0,
    p.annualAmount || 0,
    0,
    "NORMAL",
    false,
    "",
    new Date()
  ]);

  if (logSheet) {
    logSheet.appendRow([
      "LOG-" + Date.now(),
      new Date(),
      p.createdBy || "admin",
      "ADMIN",
      p.team,
      "NEW_CONTRACT_CYCLE",
      "Created cycle for " + p.customerName + " with annual budget " + p.annualAmount
    ]);
  }

  return { success: true, message: "Contract cycle activated", contractId, budgetId };
}

function handleUpdateBudget(p) {
  const ss = getSpreadsheet();
  const budgetSheet = ss.getSheetByName("BUDGETS");
  if (!budgetSheet) return { success: false, message: "BUDGETS sheet not found" };

  const data = budgetSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.budgetId)) {
      budgetSheet.getRange(i + 1, 5).setValue(p.newAmount);
      const used = Number(data[i][5]) || 0;
      const rem = Number(p.newAmount) - used;
      budgetSheet.getRange(i + 1, 7).setValue(rem);
      budgetSheet.getRange(i + 1, 8).setValue(p.newAmount > 0 ? (used / p.newAmount) * 100 : 0);
      budgetSheet.getRange(i + 1, 12).setValue(new Date());
      return { success: true, message: "Budget updated" };
    }
  }

  return { success: false, message: "Budget ID not found" };
}


function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// Database initialization and optional legacy customer import: included in this file.
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ONE-CLICK GOOGLE SHEETS DATABASE INITIALIZATION
 * Creates all 10 required sheets with exact columns and styling:
 * 1. CUSTOMERS
 * 2. CUSTOMER_CONDITIONS
 * 3. CONTRACTS
 * 4. BUDGETS
 * 5. BUDGET_TRANSACTIONS
 * 6. USERS
 * 7. CATEGORIES
 * 8. ACTIVITY_LOG
 * 9. SETTINGS
 * 10. SESSIONS
 */

function initializeDatabase() {
  const ss = getSpreadsheet();

  const schema = {
    "CUSTOMERS": [
      "Customer Code", "Customer Name", "Team", "MDE", "Phone", "Address", "Province", "Status", "Created At"
    ],
    "CUSTOMER_CONDITIONS": [
      "ID", "Customer Code", "Condition Quantity", "Condition UOM", "Product Description", "Updated At"
    ],
    "CONTRACTS": [
      "Contract ID", "Customer Code", "Customer Name", "Team", "Commencing On", "Expiring On", "Cycle Number", "Status", "Notes", "Created At"
    ],
    "BUDGETS": [
      "Budget ID", "Contract ID", "Customer Code", "Team", "Annual Amount", "Total Used", "Remaining Amount", "Utilization (%)", "Status", "Allow Exception", "Exception Reason", "Updated At"
    ],
    "BUDGET_TRANSACTIONS": [
      "Transaction ID", "Date", "Customer Code", "Customer Name", "Team", "Contract ID", "Budget ID", "Category", "Description", "Amount", "Invoice Ref", "Created By", "Created At", "Status", "Cancellation Reason"
    ],
    "USERS": [
      "User ID", "Username", "Password Hash", "Full Name", "Email", "Role", "Assigned Team", "Is Active", "Created At", "Last Login"
    ],
    "CATEGORIES": [
      "Category ID", "Name Lao", "Name English", "Code", "Description"
    ],
    "ACTIVITY_LOG": [
      "Log ID", "Timestamp", "User", "Role", "Team", "Action", "Details"
    ],
    "SETTINGS": [
      "Setting Key", "Setting Value", "Description", "Updated At"
    ],
    "SESSIONS": [
      "Session ID", "Username", "Token", "Expires At", "Created At"
    ]
  };

  for (const [sheetName, headers] of Object.entries(schema)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // Clear and set headers if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }

    // Apply corporate header styling
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // Pre-seed default Categories if empty
  const catSheet = ss.getSheetByName("CATEGORIES");
  if (catSheet.getLastRow() === 1) {
    const defaultCategories = [
      ["CAT-01", "ປ້າຍໂຄສະນາ ແລະ POSM", "POSM / Signboard", "POSM", "Signboards, display units, menu stands"],
      ["CAT-02", "ງານອີເວັ້ນ ແລະ ສະໜັບສະໜູນ", "Event & Sponsorship", "EVENT", "Local events, sports, festival sponsorships"],
      ["CAT-03", "ໂປຣໂມຊັ່ນການຄ້າ", "Trade Promotion", "PROMO", "Trade incentive discounts and bundles"],
      ["CAT-04", "ແຈກຊີມ ແລະ ກິດຈະກຳລູກຄ້າ", "Sampling & Activation", "SAMPLING", "On-ground customer activation"],
      ["CAT-05", "ສ່ວນຫຼຸດພິເສດ", "Rebate & Discount", "REBATE", "Quarterly and annual contract rebates"],
      ["CAT-06", "ສື່ດິຈິຕອນ ແລະ ໂຄສະນາ", "Media & Digital", "MEDIA", "Social media, billboard, radio advertising"],
      ["CAT-07", "ລາງວັນ ແລະ ແຮງຈູງໃຈລູກຄ້າ", "Customer Incentive", "INCENTIVE", "Customer loyalty trips and gifts"]
    ];
    defaultCategories.forEach(row => catSheet.appendRow(row));
  }

  initializeUsers_();

  Logger.log("✅ Initialization complete! All 10 sheets configured with styling.");
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CUSTOMER DATA IMPORT SCRIPT
 * Reads existing Excel data columns:
 * 1. MDE
 * 2. Customer Code
 * 3. Customer Name
 * 4. Condition Quantity
 * 5. Condition UOM
 * 6. Condition Product Code Description
 * 7. Commencing On
 * 8. Expiring On
 * 
 * Maps MDE-B1..B7 to B1..B7 and initializes contract cycles without overwriting history.
 */

function importExistingCustomerData() {
  const ss = getSpreadsheet();

  // Source sheet containing raw customer columns
  const sourceSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("RawCustomers") || ss.getSheets()[0];
  const targetCust = ss.getSheetByName("CUSTOMERS");
  const targetCond = ss.getSheetByName("CUSTOMER_CONDITIONS");
  const targetCont = ss.getSheetByName("CONTRACTS");
  const targetBdg = ss.getSheetByName("BUDGETS");

  if (!sourceSheet || !targetCust) {
    Logger.log("Please run initializeDatabase() first.");
    return;
  }

  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log("No data rows found in source sheet.");
    return;
  }

  // Build existing codes set to prevent duplicate overwriting
  const existingCustCodes = new Set();
  const custData = targetCust.getDataRange().getValues();
  for (let c = 1; c < custData.length; c++) {
    existingCustCodes.add(String(custData[c][0]).trim());
  }

  let importedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const mde = String(row[0] || "").trim();
    const customerCode = String(row[1] || "").trim();
    const customerName = String(row[2] || "").trim();
    const condQty = Number(row[3]) || 0;
    const condUom = String(row[4] || "Cartons").trim();
    const condDesc = String(row[5] || "").trim();
    
    let commencingOn = "2026-01-01";
    if (row[6]) {
      try {
        commencingOn = Utilities.formatDate(new Date(row[6]), "GMT+7", "yyyy-MM-dd");
      } catch (e) {}
    }

    let expiringOn = "2026-12-31";
    if (row[7]) {
      try {
        expiringOn = Utilities.formatDate(new Date(row[7]), "GMT+7", "yyyy-MM-dd");
      } catch (e) {}
    }

    if (!customerCode || !customerName) continue;

    // Team mapping: MDE-B1 -> B1, MDE-B2 -> B2, etc.
    const teamMatch = mde.match(/B[1-7]/i);
    const team = teamMatch ? teamMatch[0].toUpperCase() : "B1";

    if (!existingCustCodes.has(customerCode)) {
      // 1. Add CUSTOMER
      targetCust.appendRow([
        customerCode,
        customerName,
        team,
        `MDE-${team}`,
        "",
        "",
        "Vientiane",
        "ACTIVE",
        new Date()
      ]);
      existingCustCodes.add(customerCode);

      // 2. Add CUSTOMER_CONDITIONS
      targetCond.appendRow([
        "CND-" + customerCode,
        customerCode,
        condQty,
        condUom,
        condDesc,
        new Date()
      ]);

      // 3. Add CONTRACT Cycle 1
      const contractId = "CNT-" + customerCode + "-01";
      const budgetId = "BDG-" + customerCode + "-01";

      targetCont.appendRow([
        contractId,
        customerCode,
        customerName,
        team,
        commencingOn,
        expiringOn,
        1,
        "ACTIVE",
        "Initial Excel import",
        new Date()
      ]);

      // 4. Add BUDGET (Default annual amount 30,000,000 LAK)
      const defaultBudget = 30000000;
      targetBdg.appendRow([
        budgetId,
        contractId,
        customerCode,
        team,
        defaultBudget,
        0,
        defaultBudget,
        0,
        "NORMAL",
        false,
        "",
        new Date()
      ]);

      importedCount++;
    }
  }

  Logger.log("✅ Successfully imported " + importedCount + " customers across teams B1-B7!");
}

// User credentials are hashed only on the backend. Bootstrap password is a Script Property.
function userTables_() {
  const ss = getSpreadsheet();
  const specs = [
    ['USERS', ['User ID','Username','Password Hash','Full Name','Email','Role','Assigned Team','Is Active','Created At','Last Login','Status','Updated At','Deleted At']],
    ['SESSIONS', ['Session ID','Username','Token','Expires At','Created At','User ID','Password Version']]
  ];
  specs.forEach(function(spec) {
    const sheet = ss.getSheetByName(spec[0]) || ss.insertSheet(spec[0]);
    if (!sheet.getLastRow()) sheet.appendRow(spec[1]);
    else {
      const headers = sheet.getRange(1,1,1,spec[1].length).getValues()[0];
      spec[1].forEach(function(h,i) { if (headers[i] && headers[i] !== h) throw new Error('Unexpected column in ' + spec[0] + ': ' + h); });
      if(spec[1].some(function(header,index){return headers[index]!==header;}))sheet.getRange(1,1,1,spec[1].length).setValues([spec[1]]);
    }
  });
  const users=ss.getSheetByName('USERS');if(users.getLastRow()>1){const rows=users.getDataRange().getValues().slice(1);if(rows.some(function(row){return !row[10];}))users.getRange(2,11,rows.length,1).setValues(rows.map(function(row){return [row[10]||(row[7]===true||row[7]==='TRUE'?'ACTIVE':'INACTIVE')];}));}
  return ss;
}
function digest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text)).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function newToken_() { return Utilities.getUuid() + Utilities.getUuid(); }
function hashPassword_(password) {
  password = String(password || '');
  if (password.length < 8 || password.length > 72 || /^CHANGE_ME_/.test(password)) throw new Error('Use a password of 8–72 characters and replace setup placeholders.');
  if (bcrypt.truncates(password)) throw new Error('Password exceeds 72 UTF-8 bytes.');
  return bcrypt.hashSync(password, 10);
}
function publicUser_(row) {
  return { id:String(row[0]), username:String(row[1]), fullName:String(row[3] || ''), email:String(row[4] || ''), role:row[5], team:row[6], isActive:row[7] === true || row[7] === 'TRUE', createdAt:String(row[8] || ''), lastLogin:String(row[9] || ''),status:String(row[10]||(row[7]===true?'ACTIVE':'INACTIVE')),updatedAt:String(row[11]||''),deletedAt:String(row[12]||'') };
}
function userRows_(ss) { return ss.getSheetByName('USERS').getDataRange().getValues().slice(1).filter(function(r) { return r[0]&&r[10]!=='DELETED'; }); }
function findUser_(ss, id) { return userRows_(ss).find(function(r) { return String(r[0]) === String(id); }); }
function writeUser_(ss,row,actorLabel,eventAction) {
  const sheet=ss.getSheetByName('USERS'),rows=sheet.getDataRange().getValues(),index=rows.findIndex(function(r,i){return i>0&&String(r[0])===String(row[0]);});
  const previous=index<0?null:rows[index];
  row=row.slice(0,13);while(row.length<13)row.push('');
  row[10]=row[10]==='DELETED'?'DELETED':row[7]===true?'ACTIVE':'INACTIVE';row[11]=eventAction==='LOGIN'?(previous&&previous[11]||''):new Date().toISOString();
  const actor=[String(row[0]),actorLabel||'system'];ensureDailyDatabaseBackup_(ss,actor);
  if(index<0)sheet.appendRow(row);else sheet.getRange(index+1,1,1,13).setValues([row]);
  appendChangeHistory_(ss,'USER-'+Utilities.getUuid(),actor,eventAction||(row[10]==='DELETED'?'DELETE_USER':index<0?'ADD_USER':'UPDATE_USER'),[{table:'USERS',id:String(row[0]),before:previous,after:row}]);
}

function userSession_(ss, row) {
  const token = newToken_(), now = new Date(), expiresAt = new Date(now.getTime()+4*60*60*1000).toISOString();
  ss.getSheetByName('SESSIONS').appendRow([Utilities.getUuid(), row[1], digest_(token), expiresAt, now.toISOString(), row[0], digest_(row[2])]);
  return { token:token, expiresAt:expiresAt, user:publicUser_(row) };
}
function requireSession_(ss, token, admin) {
  if (!token || typeof token !== 'string' || token.length > 200) throw new Error('Sign in to the Sheets backend first.');
  const hash = digest_(token);
  const session = ss.getSheetByName('SESSIONS').getDataRange().getValues().slice(1).find(function(r) { return r[2] === hash; });
  const row = session && findUser_(ss, session[5]);
  if (!row || !publicUser_(row).isActive || Date.parse(session[3]) <= Date.now() || !Number.isFinite(Date.parse(session[3])) || session[6] !== digest_(row[2])) throw new Error('Session expired. Sign in again.');
  if (admin && row[5] !== 'ADMIN') throw new Error('Admin permission required.');
  return row;
}
function initializeUsers_() {
  const ss = userTables_(), rows = userRows_(ss);
  const initialPassword = PropertiesService.getScriptProperties().getProperty('INITIAL_ADMIN_PASSWORD');
  let admin = rows.find(function(r) { return r[5] === 'ADMIN' && publicUser_(r).isActive; });
  if (!admin) {
    if (!initialPassword) throw new Error('Set INITIAL_ADMIN_PASSWORD in Script Properties, then run initializeDatabase() again.');
    admin = ['USR-001','admin',hashPassword_(initialPassword),'Admin','','ADMIN','ALL',true,new Date().toISOString(),''];
    writeUser_(ss,admin);
  }
  // Migrate legacy plaintext credentials once; placeholder accounts require a reset.
  userRows_(ss).forEach(function(row) {
    if (/^\$2[aby]\$/.test(String(row[2]))) return;
    const plain = row[5] === 'ADMIN' && /^CHANGE_ME_/.test(String(row[2])) ? initialPassword : row[2];
    if (!plain || /^CHANGE_ME_/.test(String(plain))) {
      if (row[5] === 'ADMIN') throw new Error('Set INITIAL_ADMIN_PASSWORD in Script Properties and run initializeDatabase().');
      row[2] = ''; row[7] = false;
    } else {
      row[2] = bcrypt.hashSync(String(plain),10);
    }
    writeUser_(ss,row);
  });
}
function saveRemoteUser_(ss, data, existing, actor, selfOnly) {
  if (!data || typeof data !== 'object') throw new Error('Missing user data');
  const row = existing ? existing.slice(0,10) : ['USR-'+Utilities.getUuid(),'','','','','TEAM_USER','B1',true,new Date().toISOString(),''];
  const username = String(data.username === undefined ? row[1] : data.username).trim();
  if (!/^[\p{L}\p{N}_.@-]{2,80}$/u.test(username)) throw new Error('Username must contain 2–80 letters, digits, dots, @, hyphens or underscores.');
  if (userRows_(ss).some(function(r) { return r[0] !== row[0] && String(r[1]).toLowerCase() === username.toLowerCase(); })) throw new Error('Duplicate username');
  row[1] = username;
  ['fullName','email'].forEach(function(key,i) { if (data[key] !== undefined) row[3+i] = String(data[key]).trim(); });
  if (!row[3]) throw new Error('Full name is required');
  if (!selfOnly) {
    if (data.role !== undefined) row[5] = data.role;
    if (data.team !== undefined) row[6] = data.team;
    if (data.isActive !== undefined) { if (typeof data.isActive !== 'boolean') throw new Error('Invalid active status'); row[7] = data.isActive; }
  }
  if (row[5] !== 'ADMIN' && row[5] !== 'TEAM_USER') throw new Error('Invalid role');
  if (row[5] === 'ADMIN') row[6] = 'ALL';
  else if (!/^B[1-7]$/.test(String(row[6]))) throw new Error('Choose team B1–B7');
  if (actor[0] === row[0] && (row[5] !== 'ADMIN' && actor[5] === 'ADMIN' || row[7] !== true)) throw new Error('Cannot disable or demote your current account');
  if (data.password !== undefined && data.password !== '') row[2] = hashPassword_(data.password);
  if (!String(row[2]).startsWith('native:') && !/^\$2[aby]\$/.test(String(row[2]))) throw new Error('Set a new password for this user');
  writeUser_(ss,row,actor[1],selfOnly?'UPDATE_PROFILE':!existing?'ADD_USER':data.password?'RESET_USER_PASSWORD':'UPDATE_USER');
  return row;
}
function handleUserAction_(action, p, token) {
  const ss = userTables_();
  if (action === 'AUTH_LOGIN') {
    const username = String(p.username || '').trim().toLowerCase(), password = String(p.password || '');
    const cache = CacheService.getScriptCache(), key = 'login:'+digest_(username), attempts = Number(cache.get(key) || 0);
    if (attempts >= 10) throw new Error('Too many attempts. Try again in 10 minutes.');
    cache.put(key,String(attempts+1),600);
    const row = userRows_(ss).find(function(r) { return String(r[1]).toLowerCase() === username; });
    if (!row || !publicUser_(row).isActive || !/^\$2[aby]\$/.test(String(row[2])) || !bcrypt.compareSync(password,String(row[2]))) throw new Error('Incorrect username/password, disabled account, or backend setup not completed.');
    cache.remove(key); row[9] = new Date().toISOString(); writeUser_(ss,row,row[1],'LOGIN');
    return { success:true, ...userSession_(ss,row) };
  }
  const actor = requireSession_(ss,token,false), isAdmin = actor[5] === 'ADMIN';
  if (action === 'AUTH_ME') return {success:true,user:publicUser_(actor)};
  if (action === 'AUTH_LOGOUT') {
    const sheet = ss.getSheetByName('SESSIONS'), rows=sheet.getDataRange().getValues();
    const index=rows.findIndex(function(r,i) {return i>0 && r[2]===digest_(token);});
    if(index>0) sheet.getRange(index+1,4).setValue(new Date(0).toISOString());
    return {success:true};
  }
  if (action === 'UPDATE_PROFILE') {
    const row = saveRemoteUser_(ss,p,actor,actor,true);
    return {success:true,...userSession_(ss,row)};
  }
  if (!isAdmin) throw new Error('Admin permission required');
  if (action === 'GET_USERS') return {success:true,users:userRows_(ss).map(publicUser_)};
  if (action === 'SYNC_USERS') {
    if (!Array.isArray(p.users)) throw new Error('Missing users array');
    let saved=0, skipped=0;
    p.users.forEach(function(data) {
      const existing=userRows_(ss).find(function(r) {return String(r[1]).toLowerCase()===String(data.username).toLowerCase();});
      // Placeholder passwords are never installed; keep existing hashes when possible.
      const copy=Object.assign({},data); if (/^CHANGE_ME_/.test(String(copy.password||''))) { skipped++; return; }
      saveRemoteUser_(ss,copy,existing,actor,false); saved++;
    });
    return {success:true,users:userRows_(ss).map(publicUser_),...userSession_(ss,findUser_(ss,actor[0])),message:'Saved '+saved+' users to USERS; skipped '+skipped+' setup placeholders. Passwords stored as bcrypt hashes.'};
  }
  const existing = p.id ? findUser_(ss,p.id) : null;
  if (action === 'ADD_USER') {
    saveRemoteUser_(ss,p,null,actor,false);
  } else if (action === 'UPDATE_USER' || action === 'RESET_USER_PASSWORD') {
    if (!existing) throw new Error('User not found');
    saveRemoteUser_(ss,p,existing,actor,false);
  } else if (action === 'DELETE_USER') {
    if (!existing) throw new Error('User not found');
    if (existing[0]===actor[0]) throw new Error('Cannot delete your current account');
    const deleted=existing.slice();deleted[7]=false;deleted[10]='DELETED';deleted[12]=new Date().toISOString();writeUser_(ss,deleted,actor[1]);
  } else throw new Error('Unknown user action');
  return {success:true,users:userRows_(ss).map(publicUser_),...userSession_(ss,findUser_(ss,actor[0])),message:'User saved to USERS. Passwords stored as bcrypt hashes.'};
}


/* Bundled bcryptjs 3.0.3 license:
bcrypt.js
---------
Copyright (c) 2012 Nevins Bartolomeo <nevins.bartolomeo@gmail.com>
Copyright (c) 2012 Shane Girish <shaneGirish@gmail.com>
Copyright (c) 2025 Daniel Wirtz <dcode@dcode.io>

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
// GENERATED FILE. DO NOT EDIT.
(function (global, factory) {
  function preferDefault(exports) {
    return exports.default || exports;
  }
  if (typeof define === "function" && define.amd) {
    define(["crypto"], function (_crypto) {
      var exports = {};
      factory(exports, _crypto);
      return preferDefault(exports);
    });
  } else if (typeof exports === "object") {
    factory(exports, require("crypto"));
    if (typeof module === "object") module.exports = preferDefault(exports);
  } else {
    (function () {
      var exports = {};
      factory(exports, global.crypto);
      global.bcrypt = preferDefault(exports);
    })();
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
      ? self
      : this,
  function (_exports, _crypto) {
    "use strict";

    Object.defineProperty(_exports, "__esModule", {
      value: true,
    });
    _exports.compare = compare;
    _exports.compareSync = compareSync;
    _exports.decodeBase64 = decodeBase64;
    _exports.default = void 0;
    _exports.encodeBase64 = encodeBase64;
    _exports.genSalt = genSalt;
    _exports.genSaltSync = genSaltSync;
    _exports.getRounds = getRounds;
    _exports.getSalt = getSalt;
    _exports.hash = hash;
    _exports.hashSync = hashSync;
    _exports.setRandomFallback = setRandomFallback;
    _exports.truncates = truncates;
    _crypto = _interopRequireDefault(_crypto);
    function _interopRequireDefault(e) {
      return e && e.__esModule ? e : { default: e };
    }
    /*
   Copyright (c) 2012 Nevins Bartolomeo <nevins.bartolomeo@gmail.com>
   Copyright (c) 2012 Shane Girish <shaneGirish@gmail.com>
   Copyright (c) 2025 Daniel Wirtz <dcode@dcode.io>
  
   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:
   1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
   3. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.
  
   THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
   IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
   OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
   IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
   INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
   NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
   DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
   THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
   (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
   THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */

    // The Node.js crypto module is used as a fallback for the Web Crypto API. When
    // building for the browser, inclusion of the crypto module should be disabled,
    // which the package hints at in its package.json for bundlers that support it.

    /**
     * The random implementation to use as a fallback.
     * @type {?function(number):!Array.<number>}
     * @inner
     */
    var randomFallback = null;

    /**
     * Generates cryptographically secure random bytes.
     * @function
     * @param {number} len Bytes length
     * @returns {!Array.<number>} Random bytes
     * @throws {Error} If no random implementation is available
     * @inner
     */
    function randomBytes(len) {
      // Web Crypto API. Globally available in the browser and in Node.js >=23.
      try {
        return crypto.getRandomValues(new Uint8Array(len));
      } catch {}
      // Node.js crypto module for non-browser environments.
      try {
        return _crypto.default.randomBytes(len);
      } catch {}
      // Custom fallback specified with `setRandomFallback`.
      if (!randomFallback) {
        throw Error(
          "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative",
        );
      }
      return randomFallback(len);
    }

    /**
     * Sets the pseudo random number generator to use as a fallback if neither node's `crypto` module nor the Web Crypto
     *  API is available. Please note: It is highly important that the PRNG used is cryptographically secure and that it
     *  is seeded properly!
     * @param {?function(number):!Array.<number>} random Function taking the number of bytes to generate as its
     *  sole argument, returning the corresponding array of cryptographically secure random byte values.
     * @see http://nodejs.org/api/crypto.html
     * @see http://www.w3.org/TR/WebCryptoAPI/
     */
    function setRandomFallback(random) {
      randomFallback = random;
    }

    /**
     * Synchronously generates a salt.
     * @param {number=} rounds Number of rounds to use, defaults to 10 if omitted
     * @param {number=} seed_length Not supported.
     * @returns {string} Resulting salt
     * @throws {Error} If a random fallback is required but not set
     */
    function genSaltSync(rounds, seed_length) {
      rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof rounds !== "number")
        throw Error(
          "Illegal arguments: " + typeof rounds + ", " + typeof seed_length,
        );
      if (rounds < 4) rounds = 4;
      else if (rounds > 31) rounds = 31;
      var salt = [];
      salt.push("$2b$");
      if (rounds < 10) salt.push("0");
      salt.push(rounds.toString());
      salt.push("$");
      salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN)); // May throw
      return salt.join("");
    }

    /**
     * Asynchronously generates a salt.
     * @param {(number|function(Error, string=))=} rounds Number of rounds to use, defaults to 10 if omitted
     * @param {(number|function(Error, string=))=} seed_length Not supported.
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting salt
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function genSalt(rounds, seed_length, callback) {
      if (typeof seed_length === "function")
        (callback = seed_length), (seed_length = undefined); // Not supported.
      if (typeof rounds === "function")
        (callback = rounds), (rounds = undefined);
      if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
      else if (typeof rounds !== "number")
        throw Error("illegal arguments: " + typeof rounds);
      function _async(callback) {
        nextTick(function () {
          // Pretty thin, but salting is fast enough
          try {
            callback(null, genSaltSync(rounds));
          } catch (err) {
            callback(err);
          }
        });
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Synchronously generates a hash for the given password.
     * @param {string} password Password to hash
     * @param {(number|string)=} salt Salt length to generate or salt to use, default to 10
     * @returns {string} Resulting hash
     */
    function hashSync(password, salt) {
      if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof salt === "number") salt = genSaltSync(salt);
      if (typeof password !== "string" || typeof salt !== "string")
        throw Error(
          "Illegal arguments: " + typeof password + ", " + typeof salt,
        );
      return _hash(password, salt);
    }

    /**
     * Asynchronously generates a hash for the given password.
     * @param {string} password Password to hash
     * @param {number|string} salt Salt length to generate or salt to use
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting hash
     * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
     *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function hash(password, salt, callback, progressCallback) {
      function _async(callback) {
        if (typeof password === "string" && typeof salt === "number")
          genSalt(salt, function (err, salt) {
            _hash(password, salt, callback, progressCallback);
          });
        else if (typeof password === "string" && typeof salt === "string")
          _hash(password, salt, callback, progressCallback);
        else
          nextTick(
            callback.bind(
              this,
              Error(
                "Illegal arguments: " + typeof password + ", " + typeof salt,
              ),
            ),
          );
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Compares two strings of the same length in constant time.
     * @param {string} known Must be of the correct length
     * @param {string} unknown Must be the same length as `known`
     * @returns {boolean}
     * @inner
     */
    function safeStringCompare(known, unknown) {
      var diff = known.length ^ unknown.length;
      for (var i = 0; i < known.length; ++i) {
        diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
      }
      return diff === 0;
    }

    /**
     * Synchronously tests a password against a hash.
     * @param {string} password Password to compare
     * @param {string} hash Hash to test against
     * @returns {boolean} true if matching, otherwise false
     * @throws {Error} If an argument is illegal
     */
    function compareSync(password, hash) {
      if (typeof password !== "string" || typeof hash !== "string")
        throw Error(
          "Illegal arguments: " + typeof password + ", " + typeof hash,
        );
      if (hash.length !== 60) return false;
      return safeStringCompare(
        hashSync(password, hash.substring(0, hash.length - 31)),
        hash,
      );
    }

    /**
     * Asynchronously tests a password against a hash.
     * @param {string} password Password to compare
     * @param {string} hashValue Hash to test against
     * @param {function(Error, boolean)=} callback Callback receiving the error, if any, otherwise the result
     * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
     *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function compare(password, hashValue, callback, progressCallback) {
      function _async(callback) {
        if (typeof password !== "string" || typeof hashValue !== "string") {
          nextTick(
            callback.bind(
              this,
              Error(
                "Illegal arguments: " +
                  typeof password +
                  ", " +
                  typeof hashValue,
              ),
            ),
          );
          return;
        }
        if (hashValue.length !== 60) {
          nextTick(callback.bind(this, null, false));
          return;
        }
        hash(
          password,
          hashValue.substring(0, 29),
          function (err, comp) {
            if (err) callback(err);
            else callback(null, safeStringCompare(comp, hashValue));
          },
          progressCallback,
        );
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Gets the number of rounds used to encrypt the specified hash.
     * @param {string} hash Hash to extract the used number of rounds from
     * @returns {number} Number of rounds used
     * @throws {Error} If `hash` is not a string
     */
    function getRounds(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      return parseInt(hash.split("$")[2], 10);
    }

    /**
     * Gets the salt portion from a hash. Does not validate the hash.
     * @param {string} hash Hash to extract the salt from
     * @returns {string} Extracted salt part
     * @throws {Error} If `hash` is not a string or otherwise invalid
     */
    function getSalt(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      if (hash.length !== 60)
        throw Error("Illegal hash length: " + hash.length + " != 60");
      return hash.substring(0, 29);
    }

    /**
     * Tests if a password will be truncated when hashed, that is its length is
     * greater than 72 bytes when converted to UTF-8.
     * @param {string} password The password to test
     * @returns {boolean} `true` if truncated, otherwise `false`
     */
    function truncates(password) {
      if (typeof password !== "string")
        throw Error("Illegal arguments: " + typeof password);
      return utf8Length(password) > 72;
    }

    /**
     * Continues with the callback after yielding to the event loop.
     * @function
     * @param {function(...[*])} callback Callback to execute
     * @inner
     */
    var nextTick =
      typeof setImmediate === "function"
        ? setImmediate
        : typeof scheduler === "object" &&
            typeof scheduler.postTask === "function"
          ? scheduler.postTask.bind(scheduler)
          : typeof setTimeout === "function" ? setTimeout : function() { throw new Error('Use synchronous bcrypt APIs in Apps Script.'); };

    /** Calculates the byte length of a string encoded as UTF8. */
    function utf8Length(string) {
      var len = 0,
        c = 0;
      for (var i = 0; i < string.length; ++i) {
        c = string.charCodeAt(i);
        if (c < 128) len += 1;
        else if (c < 2048) len += 2;
        else if (
          (c & 0xfc00) === 0xd800 &&
          (string.charCodeAt(i + 1) & 0xfc00) === 0xdc00
        ) {
          ++i;
          len += 4;
        } else len += 3;
      }
      return len;
    }

    /** Converts a string to an array of UTF8 bytes. */
    function utf8Array(string) {
      var offset = 0,
        c1,
        c2;
      var buffer = new Array(utf8Length(string));
      for (var i = 0, k = string.length; i < k; ++i) {
        c1 = string.charCodeAt(i);
        if (c1 < 128) {
          buffer[offset++] = c1;
        } else if (c1 < 2048) {
          buffer[offset++] = (c1 >> 6) | 192;
          buffer[offset++] = (c1 & 63) | 128;
        } else if (
          (c1 & 0xfc00) === 0xd800 &&
          ((c2 = string.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
        ) {
          c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff);
          ++i;
          buffer[offset++] = (c1 >> 18) | 240;
          buffer[offset++] = ((c1 >> 12) & 63) | 128;
          buffer[offset++] = ((c1 >> 6) & 63) | 128;
          buffer[offset++] = (c1 & 63) | 128;
        } else {
          buffer[offset++] = (c1 >> 12) | 224;
          buffer[offset++] = ((c1 >> 6) & 63) | 128;
          buffer[offset++] = (c1 & 63) | 128;
        }
      }
      return buffer;
    }

    // A base64 implementation for the bcrypt algorithm. This is partly non-standard.

    /**
     * bcrypt's own non-standard base64 dictionary.
     * @type {!Array.<string>}
     * @const
     * @inner
     **/
    var BASE64_CODE =
      "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
        "",
      );

    /**
     * @type {!Array.<number>}
     * @const
     * @inner
     **/
    var BASE64_INDEX = [
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 54, 55, 56, 57, 58, 59, 60,
      61, 62, 63, -1, -1, -1, -1, -1, -1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, -1, -1,
      -1, -1, -1, -1, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
      42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, -1, -1, -1, -1, -1,
    ];

    /**
     * Encodes a byte array to base64 with up to len bytes of input.
     * @param {!Array.<number>} b Byte array
     * @param {number} len Maximum input length
     * @returns {string}
     * @inner
     */
    function base64_encode(b, len) {
      var off = 0,
        rs = [],
        c1,
        c2;
      if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
      while (off < len) {
        c1 = b[off++] & 0xff;
        rs.push(BASE64_CODE[(c1 >> 2) & 0x3f]);
        c1 = (c1 & 0x03) << 4;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 0x3f]);
          break;
        }
        c2 = b[off++] & 0xff;
        c1 |= (c2 >> 4) & 0x0f;
        rs.push(BASE64_CODE[c1 & 0x3f]);
        c1 = (c2 & 0x0f) << 2;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 0x3f]);
          break;
        }
        c2 = b[off++] & 0xff;
        c1 |= (c2 >> 6) & 0x03;
        rs.push(BASE64_CODE[c1 & 0x3f]);
        rs.push(BASE64_CODE[c2 & 0x3f]);
      }
      return rs.join("");
    }

    /**
     * Decodes a base64 encoded string to up to len bytes of output.
     * @param {string} s String to decode
     * @param {number} len Maximum output length
     * @returns {!Array.<number>}
     * @inner
     */
    function base64_decode(s, len) {
      var off = 0,
        slen = s.length,
        olen = 0,
        rs = [],
        c1,
        c2,
        c3,
        c4,
        o,
        code;
      if (len <= 0) throw Error("Illegal len: " + len);
      while (off < slen - 1 && olen < len) {
        code = s.charCodeAt(off++);
        c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        code = s.charCodeAt(off++);
        c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c1 == -1 || c2 == -1) break;
        o = (c1 << 2) >>> 0;
        o |= (c2 & 0x30) >> 4;
        rs.push(String.fromCharCode(o));
        if (++olen >= len || off >= slen) break;
        code = s.charCodeAt(off++);
        c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c3 == -1) break;
        o = ((c2 & 0x0f) << 4) >>> 0;
        o |= (c3 & 0x3c) >> 2;
        rs.push(String.fromCharCode(o));
        if (++olen >= len || off >= slen) break;
        code = s.charCodeAt(off++);
        c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        o = ((c3 & 0x03) << 6) >>> 0;
        o |= c4;
        rs.push(String.fromCharCode(o));
        ++olen;
      }
      var res = [];
      for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
      return res;
    }

    /**
     * @type {number}
     * @const
     * @inner
     */
    var BCRYPT_SALT_LEN = 16;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var GENSALT_DEFAULT_LOG2_ROUNDS = 10;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var BLOWFISH_NUM_ROUNDS = 16;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var MAX_EXECUTION_TIME = 100;

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var P_ORIG = [
      0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0,
      0x082efa98, 0xec4e6c89, 0x452821e6, 0x38d01377, 0xbe5466cf, 0x34e90c6c,
      0xc0ac29b7, 0xc97c50dd, 0x3f84d5b5, 0xb5470917, 0x9216d5d9, 0x8979fb1b,
    ];

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var S_ORIG = [
      0xd1310ba6, 0x98dfb5ac, 0x2ffd72db, 0xd01adfb7, 0xb8e1afed, 0x6a267e96,
      0xba7c9045, 0xf12c7f99, 0x24a19947, 0xb3916cf7, 0x0801f2e2, 0x858efc16,
      0x636920d8, 0x71574e69, 0xa458fea3, 0xf4933d7e, 0x0d95748f, 0x728eb658,
      0x718bcd58, 0x82154aee, 0x7b54a41d, 0xc25a59b5, 0x9c30d539, 0x2af26013,
      0xc5d1b023, 0x286085f0, 0xca417918, 0xb8db38ef, 0x8e79dcb0, 0x603a180e,
      0x6c9e0e8b, 0xb01e8a3e, 0xd71577c1, 0xbd314b27, 0x78af2fda, 0x55605c60,
      0xe65525f3, 0xaa55ab94, 0x57489862, 0x63e81440, 0x55ca396a, 0x2aab10b6,
      0xb4cc5c34, 0x1141e8ce, 0xa15486af, 0x7c72e993, 0xb3ee1411, 0x636fbc2a,
      0x2ba9c55d, 0x741831f6, 0xce5c3e16, 0x9b87931e, 0xafd6ba33, 0x6c24cf5c,
      0x7a325381, 0x28958677, 0x3b8f4898, 0x6b4bb9af, 0xc4bfe81b, 0x66282193,
      0x61d809cc, 0xfb21a991, 0x487cac60, 0x5dec8032, 0xef845d5d, 0xe98575b1,
      0xdc262302, 0xeb651b88, 0x23893e81, 0xd396acc5, 0x0f6d6ff3, 0x83f44239,
      0x2e0b4482, 0xa4842004, 0x69c8f04a, 0x9e1f9b5e, 0x21c66842, 0xf6e96c9a,
      0x670c9c61, 0xabd388f0, 0x6a51a0d2, 0xd8542f68, 0x960fa728, 0xab5133a3,
      0x6eef0b6c, 0x137a3be4, 0xba3bf050, 0x7efb2a98, 0xa1f1651d, 0x39af0176,
      0x66ca593e, 0x82430e88, 0x8cee8619, 0x456f9fb4, 0x7d84a5c3, 0x3b8b5ebe,
      0xe06f75d8, 0x85c12073, 0x401a449f, 0x56c16aa6, 0x4ed3aa62, 0x363f7706,
      0x1bfedf72, 0x429b023d, 0x37d0d724, 0xd00a1248, 0xdb0fead3, 0x49f1c09b,
      0x075372c9, 0x80991b7b, 0x25d479d8, 0xf6e8def7, 0xe3fe501a, 0xb6794c3b,
      0x976ce0bd, 0x04c006ba, 0xc1a94fb6, 0x409f60c4, 0x5e5c9ec2, 0x196a2463,
      0x68fb6faf, 0x3e6c53b5, 0x1339b2eb, 0x3b52ec6f, 0x6dfc511f, 0x9b30952c,
      0xcc814544, 0xaf5ebd09, 0xbee3d004, 0xde334afd, 0x660f2807, 0x192e4bb3,
      0xc0cba857, 0x45c8740f, 0xd20b5f39, 0xb9d3fbdb, 0x5579c0bd, 0x1a60320a,
      0xd6a100c6, 0x402c7279, 0x679f25fe, 0xfb1fa3cc, 0x8ea5e9f8, 0xdb3222f8,
      0x3c7516df, 0xfd616b15, 0x2f501ec8, 0xad0552ab, 0x323db5fa, 0xfd238760,
      0x53317b48, 0x3e00df82, 0x9e5c57bb, 0xca6f8ca0, 0x1a87562e, 0xdf1769db,
      0xd542a8f6, 0x287effc3, 0xac6732c6, 0x8c4f5573, 0x695b27b0, 0xbbca58c8,
      0xe1ffa35d, 0xb8f011a0, 0x10fa3d98, 0xfd2183b8, 0x4afcb56c, 0x2dd1d35b,
      0x9a53e479, 0xb6f84565, 0xd28e49bc, 0x4bfb9790, 0xe1ddf2da, 0xa4cb7e33,
      0x62fb1341, 0xcee4c6e8, 0xef20cada, 0x36774c01, 0xd07e9efe, 0x2bf11fb4,
      0x95dbda4d, 0xae909198, 0xeaad8e71, 0x6b93d5a0, 0xd08ed1d0, 0xafc725e0,
      0x8e3c5b2f, 0x8e7594b7, 0x8ff6e2fb, 0xf2122b64, 0x8888b812, 0x900df01c,
      0x4fad5ea0, 0x688fc31c, 0xd1cff191, 0xb3a8c1ad, 0x2f2f2218, 0xbe0e1777,
      0xea752dfe, 0x8b021fa1, 0xe5a0cc0f, 0xb56f74e8, 0x18acf3d6, 0xce89e299,
      0xb4a84fe0, 0xfd13e0b7, 0x7cc43b81, 0xd2ada8d9, 0x165fa266, 0x80957705,
      0x93cc7314, 0x211a1477, 0xe6ad2065, 0x77b5fa86, 0xc75442f5, 0xfb9d35cf,
      0xebcdaf0c, 0x7b3e89a0, 0xd6411bd3, 0xae1e7e49, 0x00250e2d, 0x2071b35e,
      0x226800bb, 0x57b8e0af, 0x2464369b, 0xf009b91e, 0x5563911d, 0x59dfa6aa,
      0x78c14389, 0xd95a537f, 0x207d5ba2, 0x02e5b9c5, 0x83260376, 0x6295cfa9,
      0x11c81968, 0x4e734a41, 0xb3472dca, 0x7b14a94a, 0x1b510052, 0x9a532915,
      0xd60f573f, 0xbc9bc6e4, 0x2b60a476, 0x81e67400, 0x08ba6fb5, 0x571be91f,
      0xf296ec6b, 0x2a0dd915, 0xb6636521, 0xe7b9f9b6, 0xff34052e, 0xc5855664,
      0x53b02d5d, 0xa99f8fa1, 0x08ba4799, 0x6e85076a, 0x4b7a70e9, 0xb5b32944,
      0xdb75092e, 0xc4192623, 0xad6ea6b0, 0x49a7df7d, 0x9cee60b8, 0x8fedb266,
      0xecaa8c71, 0x699a17ff, 0x5664526c, 0xc2b19ee1, 0x193602a5, 0x75094c29,
      0xa0591340, 0xe4183a3e, 0x3f54989a, 0x5b429d65, 0x6b8fe4d6, 0x99f73fd6,
      0xa1d29c07, 0xefe830f5, 0x4d2d38e6, 0xf0255dc1, 0x4cdd2086, 0x8470eb26,
      0x6382e9c6, 0x021ecc5e, 0x09686b3f, 0x3ebaefc9, 0x3c971814, 0x6b6a70a1,
      0x687f3584, 0x52a0e286, 0xb79c5305, 0xaa500737, 0x3e07841c, 0x7fdeae5c,
      0x8e7d44ec, 0x5716f2b8, 0xb03ada37, 0xf0500c0d, 0xf01c1f04, 0x0200b3ff,
      0xae0cf51a, 0x3cb574b2, 0x25837a58, 0xdc0921bd, 0xd19113f9, 0x7ca92ff6,
      0x94324773, 0x22f54701, 0x3ae5e581, 0x37c2dadc, 0xc8b57634, 0x9af3dda7,
      0xa9446146, 0x0fd0030e, 0xecc8c73e, 0xa4751e41, 0xe238cd99, 0x3bea0e2f,
      0x3280bba1, 0x183eb331, 0x4e548b38, 0x4f6db908, 0x6f420d03, 0xf60a04bf,
      0x2cb81290, 0x24977c79, 0x5679b072, 0xbcaf89af, 0xde9a771f, 0xd9930810,
      0xb38bae12, 0xdccf3f2e, 0x5512721f, 0x2e6b7124, 0x501adde6, 0x9f84cd87,
      0x7a584718, 0x7408da17, 0xbc9f9abc, 0xe94b7d8c, 0xec7aec3a, 0xdb851dfa,
      0x63094366, 0xc464c3d2, 0xef1c1847, 0x3215d908, 0xdd433b37, 0x24c2ba16,
      0x12a14d43, 0x2a65c451, 0x50940002, 0x133ae4dd, 0x71dff89e, 0x10314e55,
      0x81ac77d6, 0x5f11199b, 0x043556f1, 0xd7a3c76b, 0x3c11183b, 0x5924a509,
      0xf28fe6ed, 0x97f1fbfa, 0x9ebabf2c, 0x1e153c6e, 0x86e34570, 0xeae96fb1,
      0x860e5e0a, 0x5a3e2ab3, 0x771fe71c, 0x4e3d06fa, 0x2965dcb9, 0x99e71d0f,
      0x803e89d6, 0x5266c825, 0x2e4cc978, 0x9c10b36a, 0xc6150eba, 0x94e2ea78,
      0xa5fc3c53, 0x1e0a2df4, 0xf2f74ea7, 0x361d2b3d, 0x1939260f, 0x19c27960,
      0x5223a708, 0xf71312b6, 0xebadfe6e, 0xeac31f66, 0xe3bc4595, 0xa67bc883,
      0xb17f37d1, 0x018cff28, 0xc332ddef, 0xbe6c5aa5, 0x65582185, 0x68ab9802,
      0xeecea50f, 0xdb2f953b, 0x2aef7dad, 0x5b6e2f84, 0x1521b628, 0x29076170,
      0xecdd4775, 0x619f1510, 0x13cca830, 0xeb61bd96, 0x0334fe1e, 0xaa0363cf,
      0xb5735c90, 0x4c70a239, 0xd59e9e0b, 0xcbaade14, 0xeecc86bc, 0x60622ca7,
      0x9cab5cab, 0xb2f3846e, 0x648b1eaf, 0x19bdf0ca, 0xa02369b9, 0x655abb50,
      0x40685a32, 0x3c2ab4b3, 0x319ee9d5, 0xc021b8f7, 0x9b540b19, 0x875fa099,
      0x95f7997e, 0x623d7da8, 0xf837889a, 0x97e32d77, 0x11ed935f, 0x16681281,
      0x0e358829, 0xc7e61fd6, 0x96dedfa1, 0x7858ba99, 0x57f584a5, 0x1b227263,
      0x9b83c3ff, 0x1ac24696, 0xcdb30aeb, 0x532e3054, 0x8fd948e4, 0x6dbc3128,
      0x58ebf2ef, 0x34c6ffea, 0xfe28ed61, 0xee7c3c73, 0x5d4a14d9, 0xe864b7e3,
      0x42105d14, 0x203e13e0, 0x45eee2b6, 0xa3aaabea, 0xdb6c4f15, 0xfacb4fd0,
      0xc742f442, 0xef6abbb5, 0x654f3b1d, 0x41cd2105, 0xd81e799e, 0x86854dc7,
      0xe44b476a, 0x3d816250, 0xcf62a1f2, 0x5b8d2646, 0xfc8883a0, 0xc1c7b6a3,
      0x7f1524c3, 0x69cb7492, 0x47848a0b, 0x5692b285, 0x095bbf00, 0xad19489d,
      0x1462b174, 0x23820e00, 0x58428d2a, 0x0c55f5ea, 0x1dadf43e, 0x233f7061,
      0x3372f092, 0x8d937e41, 0xd65fecf1, 0x6c223bdb, 0x7cde3759, 0xcbee7460,
      0x4085f2a7, 0xce77326e, 0xa6078084, 0x19f8509e, 0xe8efd855, 0x61d99735,
      0xa969a7aa, 0xc50c06c2, 0x5a04abfc, 0x800bcadc, 0x9e447a2e, 0xc3453484,
      0xfdd56705, 0x0e1e9ec9, 0xdb73dbd3, 0x105588cd, 0x675fda79, 0xe3674340,
      0xc5c43465, 0x713e38d8, 0x3d28f89e, 0xf16dff20, 0x153e21e7, 0x8fb03d4a,
      0xe6e39f2b, 0xdb83adf7, 0xe93d5a68, 0x948140f7, 0xf64c261c, 0x94692934,
      0x411520f7, 0x7602d4f7, 0xbcf46b2e, 0xd4a20068, 0xd4082471, 0x3320f46a,
      0x43b7d4b7, 0x500061af, 0x1e39f62e, 0x97244546, 0x14214f74, 0xbf8b8840,
      0x4d95fc1d, 0x96b591af, 0x70f4ddd3, 0x66a02f45, 0xbfbc09ec, 0x03bd9785,
      0x7fac6dd0, 0x31cb8504, 0x96eb27b3, 0x55fd3941, 0xda2547e6, 0xabca0a9a,
      0x28507825, 0x530429f4, 0x0a2c86da, 0xe9b66dfb, 0x68dc1462, 0xd7486900,
      0x680ec0a4, 0x27a18dee, 0x4f3ffea2, 0xe887ad8c, 0xb58ce006, 0x7af4d6b6,
      0xaace1e7c, 0xd3375fec, 0xce78a399, 0x406b2a42, 0x20fe9e35, 0xd9f385b9,
      0xee39d7ab, 0x3b124e8b, 0x1dc9faf7, 0x4b6d1856, 0x26a36631, 0xeae397b2,
      0x3a6efa74, 0xdd5b4332, 0x6841e7f7, 0xca7820fb, 0xfb0af54e, 0xd8feb397,
      0x454056ac, 0xba489527, 0x55533a3a, 0x20838d87, 0xfe6ba9b7, 0xd096954b,
      0x55a867bc, 0xa1159a58, 0xcca92963, 0x99e1db33, 0xa62a4a56, 0x3f3125f9,
      0x5ef47e1c, 0x9029317c, 0xfdf8e802, 0x04272f70, 0x80bb155c, 0x05282ce3,
      0x95c11548, 0xe4c66d22, 0x48c1133f, 0xc70f86dc, 0x07f9c9ee, 0x41041f0f,
      0x404779a4, 0x5d886e17, 0x325f51eb, 0xd59bc0d1, 0xf2bcc18f, 0x41113564,
      0x257b7834, 0x602a9c60, 0xdff8e8a3, 0x1f636c1b, 0x0e12b4c2, 0x02e1329e,
      0xaf664fd1, 0xcad18115, 0x6b2395e0, 0x333e92e1, 0x3b240b62, 0xeebeb922,
      0x85b2a20e, 0xe6ba0d99, 0xde720c8c, 0x2da2f728, 0xd0127845, 0x95b794fd,
      0x647d0862, 0xe7ccf5f0, 0x5449a36f, 0x877d48fa, 0xc39dfd27, 0xf33e8d1e,
      0x0a476341, 0x992eff74, 0x3a6f6eab, 0xf4f8fd37, 0xa812dc60, 0xa1ebddf8,
      0x991be14c, 0xdb6e6b0d, 0xc67b5510, 0x6d672c37, 0x2765d43b, 0xdcd0e804,
      0xf1290dc7, 0xcc00ffa3, 0xb5390f92, 0x690fed0b, 0x667b9ffb, 0xcedb7d9c,
      0xa091cf0b, 0xd9155ea3, 0xbb132f88, 0x515bad24, 0x7b9479bf, 0x763bd6eb,
      0x37392eb3, 0xcc115979, 0x8026e297, 0xf42e312d, 0x6842ada7, 0xc66a2b3b,
      0x12754ccc, 0x782ef11c, 0x6a124237, 0xb79251e7, 0x06a1bbe6, 0x4bfb6350,
      0x1a6b1018, 0x11caedfa, 0x3d25bdd8, 0xe2e1c3c9, 0x44421659, 0x0a121386,
      0xd90cec6e, 0xd5abea2a, 0x64af674e, 0xda86a85f, 0xbebfe988, 0x64e4c3fe,
      0x9dbc8057, 0xf0f7c086, 0x60787bf8, 0x6003604d, 0xd1fd8346, 0xf6381fb0,
      0x7745ae04, 0xd736fccc, 0x83426b33, 0xf01eab71, 0xb0804187, 0x3c005e5f,
      0x77a057be, 0xbde8ae24, 0x55464299, 0xbf582e61, 0x4e58f48f, 0xf2ddfda2,
      0xf474ef38, 0x8789bdc2, 0x5366f9c3, 0xc8b38e74, 0xb475f255, 0x46fcd9b9,
      0x7aeb2661, 0x8b1ddf84, 0x846a0e79, 0x915f95e2, 0x466e598e, 0x20b45770,
      0x8cd55591, 0xc902de4c, 0xb90bace1, 0xbb8205d0, 0x11a86248, 0x7574a99e,
      0xb77f19b6, 0xe0a9dc09, 0x662d09a1, 0xc4324633, 0xe85a1f02, 0x09f0be8c,
      0x4a99a025, 0x1d6efe10, 0x1ab93d1d, 0x0ba5a4df, 0xa186f20f, 0x2868f169,
      0xdcb7da83, 0x573906fe, 0xa1e2ce9b, 0x4fcd7f52, 0x50115e01, 0xa70683fa,
      0xa002b5c4, 0x0de6d027, 0x9af88c27, 0x773f8641, 0xc3604c06, 0x61a806b5,
      0xf0177a28, 0xc0f586e0, 0x006058aa, 0x30dc7d62, 0x11e69ed7, 0x2338ea63,
      0x53c2dd94, 0xc2c21634, 0xbbcbee56, 0x90bcb6de, 0xebfc7da1, 0xce591d76,
      0x6f05e409, 0x4b7c0188, 0x39720a3d, 0x7c927c24, 0x86e3725f, 0x724d9db9,
      0x1ac15bb4, 0xd39eb8fc, 0xed545578, 0x08fca5b5, 0xd83d7cd3, 0x4dad0fc4,
      0x1e50ef5e, 0xb161e6f8, 0xa28514d9, 0x6c51133c, 0x6fd5c7e7, 0x56e14ec4,
      0x362abfce, 0xddc6c837, 0xd79a3234, 0x92638212, 0x670efa8e, 0x406000e0,
      0x3a39ce37, 0xd3faf5cf, 0xabc27737, 0x5ac52d1b, 0x5cb0679e, 0x4fa33742,
      0xd3822740, 0x99bc9bbe, 0xd5118e9d, 0xbf0f7315, 0xd62d1c7e, 0xc700c47b,
      0xb78c1b6b, 0x21a19045, 0xb26eb1be, 0x6a366eb4, 0x5748ab2f, 0xbc946e79,
      0xc6a376d2, 0x6549c2c8, 0x530ff8ee, 0x468dde7d, 0xd5730a1d, 0x4cd04dc6,
      0x2939bbdb, 0xa9ba4650, 0xac9526e8, 0xbe5ee304, 0xa1fad5f0, 0x6a2d519a,
      0x63ef8ce2, 0x9a86ee22, 0xc089c2b8, 0x43242ef6, 0xa51e03aa, 0x9cf2d0a4,
      0x83c061ba, 0x9be96a4d, 0x8fe51550, 0xba645bd6, 0x2826a2f9, 0xa73a3ae1,
      0x4ba99586, 0xef5562e9, 0xc72fefd3, 0xf752f7da, 0x3f046f69, 0x77fa0a59,
      0x80e4a915, 0x87b08601, 0x9b09e6ad, 0x3b3ee593, 0xe990fd5a, 0x9e34d797,
      0x2cf0b7d9, 0x022b8b51, 0x96d5ac3a, 0x017da67d, 0xd1cf3ed6, 0x7c7d2d28,
      0x1f9f25cf, 0xadf2b89b, 0x5ad6b472, 0x5a88f54c, 0xe029ac71, 0xe019a5e6,
      0x47b0acfd, 0xed93fa9b, 0xe8d3c48d, 0x283b57cc, 0xf8d56629, 0x79132e28,
      0x785f0191, 0xed756055, 0xf7960e44, 0xe3d35e8c, 0x15056dd4, 0x88f46dba,
      0x03a16125, 0x0564f0bd, 0xc3eb9e15, 0x3c9057a2, 0x97271aec, 0xa93a072a,
      0x1b3f6d9b, 0x1e6321f5, 0xf59c66fb, 0x26dcf319, 0x7533d928, 0xb155fdf5,
      0x03563482, 0x8aba3cbb, 0x28517711, 0xc20ad9f8, 0xabcc5167, 0xccad925f,
      0x4de81751, 0x3830dc8e, 0x379d5862, 0x9320f991, 0xea7a90c2, 0xfb3e7bce,
      0x5121ce64, 0x774fbe32, 0xa8b6e37e, 0xc3293d46, 0x48de5369, 0x6413e680,
      0xa2ae0810, 0xdd6db224, 0x69852dfd, 0x09072166, 0xb39a460a, 0x6445c0dd,
      0x586cdecf, 0x1c20c8ae, 0x5bbef7dd, 0x1b588d40, 0xccd2017f, 0x6bb4e3bb,
      0xdda26a7e, 0x3a59ff45, 0x3e350a44, 0xbcb4cdd5, 0x72eacea8, 0xfa6484bb,
      0x8d6612ae, 0xbf3c6f47, 0xd29be463, 0x542f5d9e, 0xaec2771b, 0xf64e6370,
      0x740e0d8d, 0xe75b1357, 0xf8721671, 0xaf537d5d, 0x4040cb08, 0x4eb4e2cc,
      0x34d2466a, 0x0115af84, 0xe1b00428, 0x95983a1d, 0x06b89fb4, 0xce6ea048,
      0x6f3f3b82, 0x3520ab82, 0x011a1d4b, 0x277227f8, 0x611560b1, 0xe7933fdc,
      0xbb3a792b, 0x344525bd, 0xa08839e1, 0x51ce794b, 0x2f32c9b7, 0xa01fbac9,
      0xe01cc87e, 0xbcc7d1f6, 0xcf0111c3, 0xa1e8aac7, 0x1a908749, 0xd44fbd9a,
      0xd0dadecb, 0xd50ada38, 0x0339c32a, 0xc6913667, 0x8df9317c, 0xe0b12b4f,
      0xf79e59b7, 0x43f5bb3a, 0xf2d519ff, 0x27d9459c, 0xbf97222c, 0x15e6fc2a,
      0x0f91fc71, 0x9b941525, 0xfae59361, 0xceb69ceb, 0xc2a86459, 0x12baa8d1,
      0xb6c1075e, 0xe3056a0c, 0x10d25065, 0xcb03a442, 0xe0ec6e0e, 0x1698db3b,
      0x4c98a0be, 0x3278e964, 0x9f1f9532, 0xe0d392df, 0xd3a0342b, 0x8971f21e,
      0x1b0a7441, 0x4ba3348c, 0xc5be7120, 0xc37632d8, 0xdf359f8d, 0x9b992f2e,
      0xe60b6f47, 0x0fe3f11d, 0xe54cda54, 0x1edad891, 0xce6279cf, 0xcd3e7e6f,
      0x1618b166, 0xfd2c1d05, 0x848fd2c5, 0xf6fb2299, 0xf523f357, 0xa6327623,
      0x93a83531, 0x56cccd02, 0xacf08162, 0x5a75ebb5, 0x6e163697, 0x88d273cc,
      0xde966292, 0x81b949d0, 0x4c50901b, 0x71c65614, 0xe6c6c7bd, 0x327a140a,
      0x45e1d006, 0xc3f27b9a, 0xc9aa53fd, 0x62a80f00, 0xbb25bfe2, 0x35bdd2f6,
      0x71126905, 0xb2040222, 0xb6cbcf7c, 0xcd769c2b, 0x53113ec0, 0x1640e3d3,
      0x38abbd60, 0x2547adf0, 0xba38209c, 0xf746ce76, 0x77afa1c5, 0x20756060,
      0x85cbfe4e, 0x8ae88dd8, 0x7aaaf9b0, 0x4cf9aa7e, 0x1948c25c, 0x02fb8a8c,
      0x01c36ae4, 0xd6ebe1f9, 0x90d4f869, 0xa65cdea0, 0x3f09252d, 0xc208e69f,
      0xb74e6132, 0xce77e25b, 0x578fdfe3, 0x3ac372e6,
    ];

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var C_ORIG = [
      0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274,
    ];

    /**
     * @param {Array.<number>} lr
     * @param {number} off
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @returns {Array.<number>}
     * @inner
     */
    function _encipher(lr, off, P, S) {
      // This is our bottleneck: 1714/1905 ticks / 90% - see profile.txt
      var n,
        l = lr[off],
        r = lr[off + 1];
      l ^= P[0];

      /*
      for (var i=0, k=BLOWFISH_NUM_ROUNDS-2; i<=k;)
          // Feistel substitution on left word
          n  = S[l >>> 24],
          n += S[0x100 | ((l >> 16) & 0xff)],
          n ^= S[0x200 | ((l >> 8) & 0xff)],
          n += S[0x300 | (l & 0xff)],
          r ^= n ^ P[++i],
          // Feistel substitution on right word
          n  = S[r >>> 24],
          n += S[0x100 | ((r >> 16) & 0xff)],
          n ^= S[0x200 | ((r >> 8) & 0xff)],
          n += S[0x300 | (r & 0xff)],
          l ^= n ^ P[++i];
      */

      //The following is an unrolled version of the above loop.
      //Iteration 0
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[1];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[2];
      //Iteration 1
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[3];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[4];
      //Iteration 2
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[5];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[6];
      //Iteration 3
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[7];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[8];
      //Iteration 4
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[9];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[10];
      //Iteration 5
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[11];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[12];
      //Iteration 6
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[13];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[14];
      //Iteration 7
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[15];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[16];
      lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
      lr[off + 1] = l;
      return lr;
    }

    /**
     * @param {Array.<number>} data
     * @param {number} offp
     * @returns {{key: number, offp: number}}
     * @inner
     */
    function _streamtoword(data, offp) {
      for (var i = 0, word = 0; i < 4; ++i)
        (word = (word << 8) | (data[offp] & 0xff)),
          (offp = (offp + 1) % data.length);
      return {
        key: word,
        offp: offp,
      };
    }

    /**
     * @param {Array.<number>} key
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @inner
     */
    function _key(key, P, S) {
      var offset = 0,
        lr = [0, 0],
        plen = P.length,
        slen = S.length,
        sw;
      for (var i = 0; i < plen; i++)
        (sw = _streamtoword(key, offset)),
          (offset = sw.offp),
          (P[i] = P[i] ^ sw.key);
      for (i = 0; i < plen; i += 2)
        (lr = _encipher(lr, 0, P, S)), (P[i] = lr[0]), (P[i + 1] = lr[1]);
      for (i = 0; i < slen; i += 2)
        (lr = _encipher(lr, 0, P, S)), (S[i] = lr[0]), (S[i + 1] = lr[1]);
    }

    /**
     * Expensive key schedule Blowfish.
     * @param {Array.<number>} data
     * @param {Array.<number>} key
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @inner
     */
    function _ekskey(data, key, P, S) {
      var offp = 0,
        lr = [0, 0],
        plen = P.length,
        slen = S.length,
        sw;
      for (var i = 0; i < plen; i++)
        (sw = _streamtoword(key, offp)),
          (offp = sw.offp),
          (P[i] = P[i] ^ sw.key);
      offp = 0;
      for (i = 0; i < plen; i += 2)
        (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[0] ^= sw.key),
          (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[1] ^= sw.key),
          (lr = _encipher(lr, 0, P, S)),
          (P[i] = lr[0]),
          (P[i + 1] = lr[1]);
      for (i = 0; i < slen; i += 2)
        (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[0] ^= sw.key),
          (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[1] ^= sw.key),
          (lr = _encipher(lr, 0, P, S)),
          (S[i] = lr[0]),
          (S[i + 1] = lr[1]);
    }

    /**
     * Internaly crypts a string.
     * @param {Array.<number>} b Bytes to crypt
     * @param {Array.<number>} salt Salt bytes to use
     * @param {number} rounds Number of rounds
     * @param {function(Error, Array.<number>=)=} callback Callback receiving the error, if any, and the resulting bytes. If
     *  omitted, the operation will be performed synchronously.
     *  @param {function(number)=} progressCallback Callback called with the current progress
     * @returns {!Array.<number>|undefined} Resulting bytes if callback has been omitted, otherwise `undefined`
     * @inner
     */
    function _crypt(b, salt, rounds, callback, progressCallback) {
      var cdata = C_ORIG.slice(),
        clen = cdata.length,
        err;

      // Validate
      if (rounds < 4 || rounds > 31) {
        err = Error("Illegal number of rounds (4-31): " + rounds);
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      if (salt.length !== BCRYPT_SALT_LEN) {
        err = Error(
          "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN,
        );
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      rounds = (1 << rounds) >>> 0;
      var P,
        S,
        i = 0,
        j;

      //Use typed arrays when available - huge speedup!
      if (typeof Int32Array === "function") {
        P = new Int32Array(P_ORIG);
        S = new Int32Array(S_ORIG);
      } else {
        P = P_ORIG.slice();
        S = S_ORIG.slice();
      }
      _ekskey(salt, b, P, S);

      /**
       * Calcualtes the next round.
       * @returns {Array.<number>|undefined} Resulting array if callback has been omitted, otherwise `undefined`
       * @inner
       */
      function next() {
        if (progressCallback) progressCallback(i / rounds);
        if (i < rounds) {
          var start = Date.now();
          for (; i < rounds; ) {
            i = i + 1;
            _key(b, P, S);
            _key(salt, P, S);
            if (Date.now() - start > MAX_EXECUTION_TIME) break;
          }
        } else {
          for (i = 0; i < 64; i++)
            for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
          var ret = [];
          for (i = 0; i < clen; i++)
            ret.push(((cdata[i] >> 24) & 0xff) >>> 0),
              ret.push(((cdata[i] >> 16) & 0xff) >>> 0),
              ret.push(((cdata[i] >> 8) & 0xff) >>> 0),
              ret.push((cdata[i] & 0xff) >>> 0);
          if (callback) {
            callback(null, ret);
            return;
          } else return ret;
        }
        if (callback) nextTick(next);
      }

      // Async
      if (typeof callback !== "undefined") {
        next();

        // Sync
      } else {
        var res;
        while (true)
          if (typeof (res = next()) !== "undefined") return res || [];
      }
    }

    /**
     * Internally hashes a password.
     * @param {string} password Password to hash
     * @param {?string} salt Salt to use, actually never null
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting hash. If omitted,
     *  hashing is performed synchronously.
     *  @param {function(number)=} progressCallback Callback called with the current progress
     * @returns {string|undefined} Resulting hash if callback has been omitted, otherwise `undefined`
     * @inner
     */
    function _hash(password, salt, callback, progressCallback) {
      var err;
      if (typeof password !== "string" || typeof salt !== "string") {
        err = Error("Invalid string / salt: Not a string");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }

      // Validate the salt
      var minor, offset;
      if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
        err = Error("Invalid salt version: " + salt.substring(0, 2));
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      if (salt.charAt(2) === "$")
        (minor = String.fromCharCode(0)), (offset = 3);
      else {
        minor = salt.charAt(2);
        if (
          (minor !== "a" && minor !== "b" && minor !== "y") ||
          salt.charAt(3) !== "$"
        ) {
          err = Error("Invalid salt revision: " + salt.substring(2, 4));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else throw err;
        }
        offset = 4;
      }

      // Extract number of rounds
      if (salt.charAt(offset + 2) > "$") {
        err = Error("Missing salt rounds");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10,
        r2 = parseInt(salt.substring(offset + 1, offset + 2), 10),
        rounds = r1 + r2,
        real_salt = salt.substring(offset + 3, offset + 25);
      password += minor >= "a" ? "\x00" : "";
      var passwordb = utf8Array(password),
        saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);

      /**
       * Finishes hashing.
       * @param {Array.<number>} bytes Byte array
       * @returns {string}
       * @inner
       */
      function finish(bytes) {
        var res = [];
        res.push("$2");
        if (minor >= "a") res.push(minor);
        res.push("$");
        if (rounds < 10) res.push("0");
        res.push(rounds.toString());
        res.push("$");
        res.push(base64_encode(saltb, saltb.length));
        res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
        return res.join("");
      }

      // Sync
      if (typeof callback == "undefined")
        return finish(_crypt(passwordb, saltb, rounds));
      // Async
      else {
        _crypt(
          passwordb,
          saltb,
          rounds,
          function (err, bytes) {
            if (err) callback(err, null);
            else callback(null, finish(bytes));
          },
          progressCallback,
        );
      }
    }

    /**
     * Encodes a byte array to base64 with up to len bytes of input, using the custom bcrypt alphabet.
     * @function
     * @param {!Array.<number>} bytes Byte array
     * @param {number} length Maximum input length
     * @returns {string}
     */
    function encodeBase64(bytes, length) {
      return base64_encode(bytes, length);
    }

    /**
     * Decodes a base64 encoded string to up to len bytes of output, using the custom bcrypt alphabet.
     * @function
     * @param {string} string String to decode
     * @param {number} length Maximum output length
     * @returns {!Array.<number>}
     */
    function decodeBase64(string, length) {
      return base64_decode(string, length);
    }
    var _default = (_exports.default = {
      setRandomFallback,
      genSaltSync,
      genSalt,
      hashSync,
      hash,
      compareSync,
      compare,
      getRounds,
      getSalt,
      truncates,
      encodeBase64,
      decodeBase64,
    });
  },
);

bcrypt.setRandomFallback(function(length) {
  const bytes=[];
  while(bytes.length<length) {
    const hex=Utilities.getUuid().replace(/-/g,'');
    for(let i=0;i<hex.length && bytes.length<length;i+=2) bytes.push(parseInt(hex.slice(i,i+2),16));
  }
  return bytes;
});

// Authenticated read model for the business tables. Never accepts a caller's team.
function readBusinessData_(token) {
  const ss = userTables_(), actor = requireSession_(ss,token,false);
  const scope = actor[5] === 'ADMIN' ? 'ALL' : String(actor[6]);
  if (actor[5] !== 'ADMIN' && !/^B[1-7]$/.test(scope)) throw new Error('Invalid assigned team');
  function read(table) {
    const sheet = ss.getSheetByName(table[1]);
    if (!sheet) { if (table[0] === 'customers') throw new Error('CUSTOMERS sheet not found'); return []; }
    const rows = sheet.getDataRange().getValues();
    if (!rows.length) return [];
    const headers = rows[0].map(function(value) {return String(value).trim();});
    const keyColumn = headers.indexOf(table[2][0]);
    if (keyColumn < 0) throw new Error(table[1]+': missing '+table[2][0]+' header');
    return rows.slice(1).filter(function(row) {return String(row[keyColumn] || '').trim();}).map(function(row) {
      const record={};
      table[3].forEach(function(field,index) {
        const column=headers.indexOf(table[2][index]); let value=column < 0 ? '' : row[column];
        if (Object.prototype.toString.call(value) === '[object Date]') value=Utilities.formatDate(value,ss.getSpreadsheetTimeZone(),(['date','commencingOn','expiringOn','periodStart','periodEnd'].indexOf(field)>=0 || field==='createdAt' && table[0]==='customers') ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX");
        if (['conditionQuantity','pricePerUnit','cycleNumber','annualAmount','totalUsed','remainingAmount','utilizationPercentage','amount','periodNumber','unallocatedUsed'].indexOf(field)>=0) {
          if (value === '' && (field === 'pricePerUnit'||field==='periodNumber'||field==='unallocatedUsed')) return;
          value=Number(typeof value==='string' ? value.replace(/,/g,'').trim() : value);
          if (!isFinite(value)) throw new Error(table[1]+': invalid '+field);
        } else if (field==='allowException') value=value===true || String(value).toUpperCase()==='TRUE';
        else value=String(value == null ? '' : value);
        record[field]=value;
      });
      return record;
    });
  }
  const snapshot={}; SYNC_TABLES.slice(0,5).forEach(function(table){snapshot[table[0]]=read(table);});
  const removedCustomers=deletedCustomerCodes_(ss);
  snapshot.customers=snapshot.customers.filter(function(customer){return !removedCustomers.has(String(customer.code))&&(scope==='ALL' || customer.team===scope);}).map(function(customer){
    if (!/^B[1-7]$/.test(customer.team)) throw new Error('CUSTOMERS: invalid Team for '+customer.code);
    customer.status=customer.status || 'ACTIVE'; customer.mde=customer.mde || 'MDE-'+customer.team;
    return customer;
  });
  const codes=new Set(snapshot.customers.map(function(customer){return customer.code;}));
  snapshot.conditions=snapshot.conditions.filter(function(row){return codes.has(row.customerCode);});
  snapshot.contracts=snapshot.contracts.filter(function(row){return codes.has(row.customerCode) && (scope==='ALL' || !row.team || row.team===scope);});
  const contractIds=new Set(snapshot.contracts.map(function(row){return row.id;}));
  snapshot.budgets=snapshot.budgets.filter(function(row){return codes.has(row.customerCode) && (!row.contractId || contractIds.has(row.contractId)) && (scope==='ALL' || !row.team || row.team===scope);});
  snapshot.transactions=snapshot.transactions.filter(function(row){return codes.has(row.customerCode) && (!row.contractId || contractIds.has(row.contractId)) && (scope==='ALL' || !row.team || row.team===scope);});
  ['contracts','budgets','transactions'].forEach(function(key){snapshot[key].forEach(function(row){if(!row.team) row.team=snapshot.customers.find(function(c){return c.code===row.customerCode;}).team;});});
  snapshot.transactions.forEach(function(row){row.status=row.status || 'ACTIVE';});
  const annual=projectAnnualBudgets(snapshot.contracts,snapshot.budgets,snapshot.transactions);
  snapshot.budgets=annual.budgets;snapshot.transactions=annual.transactions;
  return {success:true,deletionVersion:1,migratedFromSpreadsheetId:databaseSetting_(ss,'migrationSourceId'),businessRevision:digest_(JSON.stringify(snapshot)),annualBudgetVersion:1,dataVersion:1,settingsVersion:1,settings:readSharedSettings_(ss),user:publicUser_(actor),scope:scope,snapshot:snapshot,spreadsheetId:ss.getId(),loadedAt:new Date().toISOString()};
}


const COMMON_SETTING_KEYS_=['currencyCode','currencySymbol','currencyPosition','pricePerCrate','contractAlertDays','warningThresholdPercent','language','dashboardTheme'];
function normalizeSharedSettings_(settings){
 if(!settings || typeof settings!=='object' || Array.isArray(settings))throw new Error('Invalid shared settings');
 const result={},options={currencyCode:['LAK','USD','THB'],currencyPosition:['before','after'],language:['lo','en'],dashboardTheme:['glass','executive','neon','minimal','luxury']};
 COMMON_SETTING_KEYS_.forEach(function(key){
  if(settings[key]===undefined)return;let value=settings[key];
  if(options[key] && options[key].indexOf(value)<0)throw new Error('Invalid shared setting: '+key);
  if(key==='currencySymbol' && (typeof value!=='string'||!value.length||value.length>8))throw new Error('Invalid currency symbol');
  if(['pricePerCrate','contractAlertDays','warningThresholdPercent'].indexOf(key)>=0){
   value=Number(value);
   if(!isFinite(value)||value<0||key!=='contractAlertDays'&&value===0||key==='warningThresholdPercent'&&value>100||key==='contractAlertDays'&&value>3650)throw new Error('Invalid shared number: '+key);
  }
  result[key]=value;
 });return result;
}
function readSharedSettings_(ss){
 const sheet=ss.getSheetByName('SETTINGS'),raw={};
 if(sheet){const rows=sheet.getDataRange().getValues(),headers=rows[0]||[],key=headers.indexOf('Setting Key'),value=headers.indexOf('Setting Value');
  if(key<0||value<0)throw new Error('SETTINGS: missing key/value headers');
  rows.slice(1).forEach(function(row){if(COMMON_SETTING_KEYS_.indexOf(row[key])>=0)raw[row[key]]=row[value];});
 }
 return normalizeSharedSettings_(raw);
}
function saveSharedSettings_(payload,token){
 const ss=userTables_(),actor=requireSession_(ss,token,true),before=readSharedSettings_(ss);ensureDailyDatabaseBackup_(ss,actor);
 const settings=normalizeSharedSettings_(payload.settings),result=handleBulkSync({settings:settings});if(!result.success)return result;
 const after=readSharedSettings_(ss);if(JSON.stringify(before)!==JSON.stringify(after))appendChangeHistory_(ss,'SETTINGS-'+Utilities.getUuid(),actor,'UPDATE_SETTINGS',[{table:'SETTINGS',id:'COMMON',before:before,after:after}]);
 return {success:true,settingsVersion:1,settings:after,message:'Admin settings published to the shared Sheet.'};
}

function authorizeLegacyBusiness_(action,payload,token){
 const ss=userTables_(),actor=requireSession_(ss,token,action==='NEW_CONTRACT_CYCLE'||action==='UPDATE_BUDGET');
 if(actor[5]==='ADMIN')return;
 if(!/^B[1-7]$/.test(String(actor[6])))throw new Error('Invalid assigned team');
 let team;
 if(action==='ADD_TRANSACTION'){
  const sheet=ss.getSheetByName('CUSTOMERS'),rows=sheet?sheet.getDataRange().getValues():[];
  const row=rows.slice(1).find(function(row){return String(row[0])===String(payload.customerCode);});
  if(!row||row[7]==='DELETED')throw new Error('Customer not found');team=row[2];
  const contracts=ss.getSheetByName('CONTRACTS'),budgets=ss.getSheetByName('BUDGETS');
  const contract=contracts&&contracts.getDataRange().getValues().slice(1).find(function(r){return String(r[0])===String(payload.contractId);});
  const budget=budgets&&budgets.getDataRange().getValues().slice(1).find(function(r){return String(r[0])===String(payload.budgetId);});
  if(!contract||String(contract[1])!==String(payload.customerCode)||contract[3]&&contract[3]!==team||!budget||String(budget[1])!==String(payload.contractId)||String(budget[2])!==String(payload.customerCode)||budget[3]&&budget[3]!==team)throw new Error('Invalid transaction customer/contract/budget references');
  const amount=Number(payload.amount);if(!isFinite(amount)||amount<=0)throw new Error('Invalid transaction amount');
  payload.amount=amount;payload.customerName=row[1];payload.id='TXN-'+Utilities.getUuid();
  payload.date=payload.date||Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)))throw new Error('Invalid transaction date');
  ['category','description','invoiceRef'].forEach(function(key){payload[key]=syncCell_(String(payload[key]||''));});
 }else if(action==='CANCEL_TRANSACTION'){
  const sheet=ss.getSheetByName('BUDGET_TRANSACTIONS'),rows=sheet?sheet.getDataRange().getValues():[];
  const row=rows.slice(1).find(function(row){return String(row[0])===String(payload.txnId);});
  if(!row)throw new Error('Transaction not found');team=row[4];
  payload.reason=syncCell_(String(payload.reason||'Cancelled by user'));
 }
 if(team!==actor[6])throw new Error('Permission denied for this team');
 payload.team=team;payload.createdBy=actor[1];payload.cancelledBy=actor[1];
}

// BEGIN SHARED ANNUAL BUDGET RULES (src/services/annualBudgets.js)
// Shared calendar and annual-budget rules. The exact functions below are also
// embedded in Code.gs; regression tests enforce parity with the browser.
function businessToday() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
}

function isCalendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function anniversary(start, offset) {
  const year = Number(start.slice(0, 4)) + offset;
  const month = Number(start.slice(5, 7));
  const day = Math.min(Number(start.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** @param {import('../types').Contract} contract */
function annualPeriods(contract) {
  const start = contract.commencingOn, end = contract.expiringOn;
  if (!isCalendarDate(start) || !isCalendarDate(end) || end < start) return [];
  const periods = [];
  for (let offset = 0; offset <= 100; offset++) {
    const periodStart = anniversary(start, offset);
    if (periodStart > end) return periods;
    if (offset === 100) throw Error('Contract exceeds 100 annual budget periods');
    const next = anniversary(start, offset + 1);
    const previousDay = new Date(Date.parse(next) - 86400000).toISOString().slice(0, 10);
    periods.push({periodNumber: offset + 1, periodStart, periodEnd: previousDay < end ? previousDay : end});
  }
  return periods;
}

/** @param {import('../types').Budget} budget */
function refreshBudgetTotals(budget) {
  budget.remainingAmount = budget.annualAmount - budget.totalUsed;
  budget.utilizationPercentage = budget.annualAmount > 0 ? Math.round(budget.totalUsed / budget.annualAmount * 1000) / 10 : 0;
  budget.status = budget.totalUsed > budget.annualAmount ? 'EXCEEDED' : budget.utilizationPercentage >= 100 ? 'CRITICAL_100' : budget.utilizationPercentage >= 80 ? 'WARNING_80' : 'NORMAL';
  return budget;
}

/**
 * Derive separate budgets for each anniversary year without removing history.
 * Legacy spending not represented by transactions stays in its original year.
 * @param {import('../types').Contract[]} contracts
 * @param {import('../types').Budget[]} budgets
 * @param {import('../types').BudgetTransaction[]} transactions
 */
function projectAnnualBudgets(contracts, budgets, transactions) {
  let result = budgets.map(budget => ({...budget}));
  const txns = transactions.map(transaction => ({...transaction}));
  for (const contract of contracts) {
    const periods = annualPeriods(contract);
    const stored = result.filter(budget => budget.contractId === contract.id && budget.customerCode === contract.customerCode);
    if (!periods.length || !stored.length) continue;
    for(const budget of stored){
      if(budget.periodNumber!==undefined&&(!Number.isInteger(budget.periodNumber)||budget.periodNumber<1||budget.periodNumber>100))throw Error('Invalid annual budget year');
      if(budget.unallocatedUsed!==undefined&&(!Number.isFinite(budget.unallocatedUsed)||budget.unallocatedUsed<0))throw Error('Invalid legacy spending amount');
    }
    const base = stored.find(budget => budget.periodNumber === 1) || stored[0];
    const linked = txns.filter(transaction => transaction.contractId === contract.id && transaction.customerCode === contract.customerCode);
    const residual = new Map();
    for (const budget of stored) {
      const recorded = linked.filter(transaction => (transaction.budgetId === budget.id || !transaction.budgetId && budget.id === base.id) && transaction.status === 'ACTIVE').reduce((sum, transaction) => sum + transaction.amount, 0);
      residual.set(budget.id, Number.isFinite(budget.unallocatedUsed) ? budget.unallocatedUsed : Math.max(0, budget.totalUsed - recorded));
    }
    const years = periods.map(period => {
      const existing = stored.find(budget => (budget.periodNumber || 1) === period.periodNumber);
      const previous = stored.filter(budget => (budget.periodNumber || 1) < period.periodNumber).sort((a,b) => (b.periodNumber || 1) - (a.periodNumber || 1))[0] || base;
      const budget = existing ? {...existing} : {
        ...base, id: `${base.id}-Y${period.periodNumber}`, annualAmount: previous.annualAmount,
        allowException: false, exceptionReason: ''
      };
      return {...budget, ...period, unallocatedUsed: residual.get(budget.id) || 0, totalUsed: residual.get(budget.id) || 0};
    });
    // Keep historical budgets even if Admin shortens a contract later.
    const historical = stored.filter(budget => !years.some(year => year.id === budget.id)).map(budget => ({...budget, unallocatedUsed: residual.get(budget.id) || 0, totalUsed: residual.get(budget.id) || 0}));
    for (const transaction of linked) {
      const year = years.find(budget => isCalendarDate(transaction.date) && transaction.date >= budget.periodStart && transaction.date <= budget.periodEnd) ||
        [...years, ...historical].find(budget => budget.id === transaction.budgetId) || years[0];
      transaction.budgetId = year.id;
      if (transaction.status === 'ACTIVE') year.totalUsed += transaction.amount;
    }
    const replacements = [...years, ...historical].map(refreshBudgetTotals);
    result = result.filter(budget => !stored.some(old => old.id === budget.id)).concat(replacements);
  }
  return {budgets: result, transactions: txns};
}

/** @param {import('../types').Budget[]} budgets */
function selectAnnualBudget(budgets, date = businessToday(), clamp = true) {
  const sorted = [...budgets].sort((a,b) => (a.periodNumber || 1) - (b.periodNumber || 1));
  const exact = sorted.find(budget => budget.periodStart && date >= budget.periodStart && date <= budget.periodEnd);
  if (exact || !clamp) return exact;
  if (sorted[0]?.periodStart && date < sorted[0].periodStart) return sorted[0];
  return sorted[sorted.length - 1];
}

// END SHARED ANNUAL BUDGET RULES

// Authenticated, date-aware transaction writes. Annual balances are updated
// together with transaction rows under doPost's existing script lock.
function handleAnnualTransaction_(action,p,token){
 const ss=userTables_(),actor=requireSession_(ss,token,false),read=readBusinessData_(token),data=read.snapshot;
 let txn,budget;
 if(action==='ADD_TRANSACTION'){
  const customer=data.customers.find(function(c){return c.code===p.customerCode&&c.status!=='DELETED';});
  const date=p.date||businessToday(),amount=Number(p.amount);
  if(!customer||!isCalendarDate(date)||!isFinite(amount)||amount<=0)throw new Error('Invalid customer, date or amount');
  const contract=data.contracts.find(function(c){return c.id===p.contractId&&c.customerCode===customer.code&&date>=c.commencingOn&&date<=c.expiringOn;});
  if(!contract)throw new Error('Transaction date is outside the selected contract');
  budget=selectAnnualBudget(data.budgets.filter(function(b){return b.contractId===contract.id&&b.customerCode===customer.code;}),date,false);
  if(!budget || p.budgetId && p.budgetId!==budget.id)throw new Error('Invalid transaction budget period');
  const transactionId='TXN-'+digest_(String(actor[0])+':'+String(p.id||Utilities.getUuid()));
  const existing=data.transactions.find(function(t){return t.id===transactionId;});
  if(existing){
   if(existing.customerCode!==customer.code||existing.contractId!==contract.id||existing.date!==date||existing.amount!==amount)throw new Error('Transaction request ID was already used');
   return {success:true,id:existing.id,budgetId:existing.budgetId,annualBudgetVersion:1,message:'Transaction already saved'};
  }
  if(actor[5]!=='ADMIN'&&amount>budget.remainingAmount)throw new Error('Annual budget exceeded; Admin approval required');
  txn={id:transactionId,date:date,customerCode:customer.code,customerName:customer.name,team:customer.team,contractId:contract.id,budgetId:budget.id,category:String(p.category||'Other'),description:String(p.description||''),amount:amount,invoiceRef:String(p.invoiceRef||''),createdBy:actor[1],createdAt:new Date().toISOString(),status:'ACTIVE'};
  data.transactions.push(txn);budget.totalUsed+=amount;
 }else{
  txn=data.transactions.find(function(t){return t.id===p.txnId;});
  if(!txn||txn.status==='CANCELLED')throw new Error('Transaction not found or already cancelled');
  budget=data.budgets.find(function(b){return b.id===txn.budgetId;});
  if(!budget)throw new Error('Original annual budget not found');
  budget.totalUsed=Math.max(0,budget.totalUsed-txn.amount);
  txn.status='CANCELLED';txn.cancellationReason=String(p.reason||'Cancelled by user');txn.cancelledBy=actor[1];txn.cancelledAt=new Date().toISOString();
 }
 refreshBudgetTotals(budget);budget.updatedAt=new Date().toISOString();
 const result=handleBulkSync({budgets:data.budgets,transactions:data.transactions,logs:[{id:'LOG-'+Utilities.getUuid(),timestamp:new Date().toISOString(),user:actor[1],role:actor[5],team:txn.team,action:action,details:txn.id+' / '+txn.budgetId}]});
 if(!result.success)return result;
 return {success:true,id:txn.id,budgetId:txn.budgetId,annualBudgetVersion:1,message:action==='ADD_TRANSACTION'?'Transaction added successfully':'Transaction cancelled'};
}


// Recoverable, authenticated incremental writes. Only server-built row plans
// enter the journal; replays use absolute upserts and cannot double-charge.
const WRITE_JOURNAL_HEADERS_=['Operation ID','Actor ID','Request Hash','Plan Hash','State','Chunk Number','Chunk Count','Plan JSON','Updated At'];
function writeJournal_(){
 const ss=getSpreadsheet();let sheet=ss.getSheetByName('APP_WRITES');
 if(!sheet){sheet=ss.insertSheet('APP_WRITES');sheet.getRange(1,1,1,9).setValues([WRITE_JOURNAL_HEADERS_]);}
 const headers=sheet.getRange(1,1,1,9).getValues()[0];
 if(JSON.stringify(headers)!==JSON.stringify(WRITE_JOURNAL_HEADERS_))throw new Error('APP_WRITES: invalid journal headers');
 return sheet;
}
function journalOperations_(sheet,onlyId,pendingOnly){
 const groups=new Map(),last=sheet.getLastRow();if(last<2)return groups;
 // Scan metadata without downloading the potentially large historical plans.
 const metadata=sheet.getRange(2,1,last-1,7).getValues(),indices=new Map();
 metadata.forEach(function(row,index){if(!row[0]||onlyId&&String(row[0])!==onlyId)return;const id=String(row[0]);if(!indices.has(id))indices.set(id,[]);indices.get(id).push({row:row,index:index+2});});
 indices.forEach(function(parts,id){
  if(pendingOnly&&parts.every(function(part){return part.row[4]==='DONE';}))return;
  const start=parts[0].index,end=parts[parts.length-1].index;
  const rows=sheet.getRange(start,1,end-start+1,9).getValues();
  groups.set(id,rows.map(function(row,index){return {row:row,index:start+index};}).filter(function(part){return String(part.row[0])===id;}));
 });return groups;
}
function replayBusinessWrite_(sheet,parts){
 const first=parts[0].row;if(parts.every(function(part){return part.row[4]==='DONE';}))return;
 if(parts.length!==Number(first[6]))throw new Error('Incomplete APP_WRITES journal; contact Admin');
 const text=parts.slice().sort(function(a,b){return Number(a.row[5])-Number(b.row[5]);}).map(function(p){return p.row[7];}).join('');
 if(digest_(text)!==first[3])throw new Error('APP_WRITES checksum mismatch; contact Admin');
 const plan=JSON.parse(text);
 if(plan.deletion)applyCustomerDeletion_(getSpreadsheet(),String(first[0]),plan.actor,plan.deletion);
 const result=handleBulkSync(plan.tables);
 if(!result.success)throw new Error(result.error||result.message||'Sheet write incomplete; retry the same operation');
 if(plan.changes)appendChangeHistory_(getSpreadsheet(),String(first[0]),plan.actor||[String(first[1]),'user'],plan.action||'WRITE',plan.changes);
 const sorted=parts.slice().sort(function(a,b){return a.index-b.index;});
 if(sorted.every(function(part,index){return part.index===sorted[0].index+index;}))sheet.getRange(sorted[0].index,5,sorted.length,1).setValues(sorted.map(function(){return ['DONE'];}));
 else sorted.forEach(function(part){sheet.getRange(part.index,5).setValue('DONE');});SpreadsheetApp.flush();
}
function recoverBusinessWrites_(){
 const ss=getSpreadsheet(),sheet=ss.getSheetByName('APP_WRITES');if(!sheet)return;
 journalOperations_(writeJournal_(),null,true).forEach(function(parts){replayBusinessWrite_(sheet,parts);});
}
function writeText_(value,name,max){const text=String(value==null?'':value).trim();if(!text||text.length>(max||2000))throw new Error('Invalid '+name);return text;}
function writeNumber_(value,name){const number=Number(value);if(!isFinite(number)||number<0)throw new Error('Invalid '+name);return number;}
function writeDates_(data){if(!isCalendarDate(data.commencingOn)||!isCalendarDate(data.expiringOn)||data.expiringOn<data.commencingOn)throw new Error('Invalid contract dates');}
function writePatch_(snapshot,codes){
 const set=new Set(codes),patch={};['customers','conditions','contracts','budgets','transactions'].forEach(function(key){patch[key]=snapshot[key].filter(function(row){return set.has(key==='customers'?row.code:row.customerCode);});});return patch;
}
function buildBusinessWrite_(kind,p,actor,snapshot,id,onlyCodes){
 const original=JSON.parse(JSON.stringify(snapshot));
 const admin=actor[5]==='ADMIN',now=new Date().toISOString(),tables={},codes=[],result={};
 function requireAdmin(){if(!admin)throw new Error('Admin permission required');}
 function customer(code){const c=snapshot.customers.find(function(c){return c.code===code;});if(!c||c.status==='DELETED')throw new Error('Customer not found or deleted');return c;}
 function budgetRow(contract,amount){return {id:'BDG-'+contract.id,contractId:contract.id,customerCode:contract.customerCode,team:contract.team,annualAmount:amount,totalUsed:0,remainingAmount:amount,utilizationPercentage:0,status:'NORMAL',updatedAt:now};}
 if(kind==='ADD_CUSTOMER'){
  const code=writeText_(p.code,'customer code',80).toUpperCase(),team=String(p.team),name=writeText_(p.name,'customer name',300);writeDates_(p);if(!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(code))throw new Error('Invalid customer code');
  if(!/^B[1-7]$/.test(team)||!admin&&team!==String(actor[6]))throw new Error('Permission denied for this team');
  // Check the whole ID namespace without returning another team's records.
  const sheet=getSpreadsheet().getSheetByName('CUSTOMERS'),rows=sheet?sheet.getDataRange().getValues():[];
  if(deletedCustomerCodes_(getSpreadsheet()).has(code))throw new Error('This customer code was deleted; use a new code to add a new store');
  if(rows.slice(1).some(function(r){return String(r[0]).trim().toUpperCase()===code;}))throw new Error('Duplicate Customer Code');
  const c={code:code,name:name,team:team,mde:'MDE-'+team,phone:String(p.phone||''),address:String(p.address||''),province:String(p.province||''),status:'ACTIVE',createdAt:businessToday(),updatedAt:now,deletedAt:''};
  const quantity=writeNumber_(p.conditionQty,'condition quantity'),price=readSharedSettings_(getSpreadsheet()).pricePerCrate||240000;
  const amount=admin?writeNumber_(p.annualBudget,'annual budget'):quantity*price;
  const contract={id:'CNT-'+id,customerCode:code,customerName:name,team:team,commencingOn:p.commencingOn,expiringOn:p.expiringOn,cycleNumber:1,status:'ACTIVE',createdAt:now,updatedAt:now};
  const annual=projectAnnualBudgets([contract],[budgetRow(contract,amount)],[]);
  tables.customers=[c];tables.conditions=[{id:'CND-'+id,customerCode:code,conditionQuantity:quantity,conditionUOM:String(p.conditionUOM||'CAS'),conditionProductDescription:String(p.conditionProductDescription||''),pricePerUnit:price,updatedAt:now}];tables.contracts=[contract];tables.budgets=annual.budgets;codes.push(code);result.entityId=code;
 }else if(kind==='UPDATE_CUSTOMER'){
  const code=String(p.code),c=customer(code),team=String(p.team||c.team);if(!/^B[1-7]$/.test(team)||!admin&&team!==c.team)throw new Error('Permission denied for this team');
  const condition=snapshot.conditions.find(function(row){return row.customerCode===code;});
  const contracts=snapshot.contracts.filter(function(row){return row.customerCode===code;}).sort(function(a,b){return b.cycleNumber-a.cycleNumber;});
  const contract=contracts.find(function(row){return businessToday()>=row.commencingOn&&businessToday()<=row.expiringOn;})||contracts[0];
  const current=contract&&selectAnnualBudget(snapshot.budgets.filter(function(b){return b.contractId===contract.id;}));
  if(contract&&(p.commencingOn!==undefined&&p.commencingOn!==contract.commencingOn||p.expiringOn!==undefined&&p.expiringOn!==contract.expiringOn))throw new Error('Use contract renewal to change contract dates');
  if(!admin&&condition&&(p.conditionQty!==undefined&&Number(p.conditionQty)!==condition.conditionQuantity||p.conditionProductDescription!==undefined&&p.conditionProductDescription!==condition.conditionProductDescription||p.conditionUOM!==undefined&&p.conditionUOM!==condition.conditionUOM||p.annualBudget!==undefined&&current&&Number(p.annualBudget)!==current.annualAmount))throw new Error('Only Admin can change contract conditions or budgets');
  tables.customers=[Object.assign({},c,{name:writeText_(p.name,'customer name',300),team:team,mde:'MDE-'+team,phone:String(p.phone||''),address:String(p.address||''),province:String(p.province||''),updatedAt:now})];
  if(condition){const updated=Object.assign({},condition,{updatedAt:now});if(admin){if(p.conditionQty!==undefined)updated.conditionQuantity=writeNumber_(p.conditionQty,'condition quantity');if(p.conditionUOM!==undefined)updated.conditionUOM=String(p.conditionUOM);if(p.conditionProductDescription!==undefined)updated.conditionProductDescription=String(p.conditionProductDescription);}tables.conditions=[updated];}
  tables.contracts=contracts.map(function(row){return Object.assign({},row,{customerName:tables.customers[0].name,team:team,updatedAt:now});});
  tables.budgets=snapshot.budgets.filter(function(b){return b.customerCode===code;}).map(function(b){b.team=team;if(admin&&current&&p.annualBudget!==undefined&&b.contractId===current.contractId&&(b.periodNumber||1)>=(current.periodNumber||1)){b.annualAmount=writeNumber_(p.annualBudget,'annual budget');b.updatedAt=now;refreshBudgetTotals(b);}return b;});
  tables.transactions=snapshot.transactions.filter(function(t){return t.customerCode===code;}).map(function(t){return Object.assign({},t,{customerName:tables.customers[0].name,team:team});});codes.push(code);result.entityId=code;
 }else if(kind==='DELETE_CUSTOMER'){
  const code=String(p.customerCode),c=snapshot.customers.find(function(row){return row.code===code;});if(!c)throw new Error('Customer not found');codes.push(code);result.entityId=code;
 }else if(kind==='DELETE_ALL_CUSTOMERS'){
  requireAdmin();snapshot.customers.forEach(function(c){if(!onlyCodes||onlyCodes.indexOf(c.code)>=0)codes.push(c.code);});
 }else if(kind==='ADD_TRANSACTION'){
  const code=String(p.customerCode),c=customer(code),date=p.date||businessToday(),amount=writeNumber_(p.amount,'transaction amount');
  if(!isCalendarDate(date)||amount<=0)throw new Error('Invalid transaction date or amount');
  const contract=snapshot.contracts.filter(function(c){return c.customerCode===code&&date>=c.commencingOn&&date<=c.expiringOn;}).sort(function(a,b){return b.cycleNumber-a.cycleNumber;})[0];
  if(!contract)throw new Error('Transaction date is outside the contract');
  const budget=selectAnnualBudget(snapshot.budgets.filter(function(b){return b.contractId===contract.id;}),date,false);
  if(!budget)throw new Error('Annual budget not found');
  if(!admin&&amount>budget.remainingAmount)throw new Error('Annual budget exceeded; Admin approval required');
  budget.totalUsed+=amount;refreshBudgetTotals(budget);budget.updatedAt=now;
  if(budget.status==='EXCEEDED'){budget.allowException=true;budget.exceptionReason=String(p.exceptionReason||'Admin approved');}
  const txn={id:'TXN-'+id,date:date,customerCode:code,customerName:c.name,team:c.team,contractId:contract.id,budgetId:budget.id,category:writeText_(p.category,'category',120),description:writeText_(p.description,'description',2000),amount:amount,invoiceRef:String(p.invoiceRef||''),createdBy:actor[1],createdAt:now,status:'ACTIVE'};
  // Include normalized legacy annual rows/references on the first write.
  tables.budgets=snapshot.budgets.filter(function(b){return b.customerCode===code;});tables.transactions=snapshot.transactions.filter(function(t){return t.customerCode===code;}).concat([txn]);codes.push(code);result.entityId=txn.id;
 }else if(kind==='CANCEL_TRANSACTION'){
  const txn=snapshot.transactions.find(function(t){return t.id===p.txnId;});if(!txn||txn.status!=='ACTIVE')throw new Error('Transaction not found or already cancelled');
  const budget=snapshot.budgets.find(function(b){return b.id===txn.budgetId;});if(!budget)throw new Error('Original annual budget not found');
  txn.status='CANCELLED';txn.cancellationReason=writeText_(p.reason,'cancellation reason',2000);txn.cancelledBy=actor[1];txn.cancelledAt=now;
  budget.totalUsed=Math.max(0,budget.totalUsed-txn.amount);refreshBudgetTotals(budget);budget.updatedAt=now;
  tables.budgets=snapshot.budgets.filter(function(b){return b.customerCode===txn.customerCode;});tables.transactions=snapshot.transactions.filter(function(t){return t.customerCode===txn.customerCode;});codes.push(txn.customerCode);result.entityId=txn.id;
 }else if(kind==='NEW_CONTRACT'){
  requireAdmin();const code=String(p.customerCode),c=customer(code);writeDates_(p);
  if(snapshot.contracts.some(function(contract){return contract.customerCode===code&&p.commencingOn<=contract.expiringOn&&p.expiringOn>=contract.commencingOn;}))throw new Error('Contract dates overlap an existing cycle');
  const cycle=snapshot.contracts.filter(function(contract){return contract.customerCode===code;}).reduce(function(max,c){return Math.max(max,c.cycleNumber);},0)+1;
  const contract={id:'CNT-'+id,customerCode:code,customerName:c.name,team:c.team,commencingOn:p.commencingOn,expiringOn:p.expiringOn,cycleNumber:cycle,status:'ACTIVE',notes:String(p.notes||''),createdAt:now,updatedAt:now};
  tables.contracts=[contract];tables.budgets=projectAnnualBudgets([contract],[budgetRow(contract,writeNumber_(p.annualBudget,'annual budget'))],[]).budgets;codes.push(code);result.entityId=contract.id;
 }else if(kind==='UPDATE_BUDGET'){
  requireAdmin();const budget=snapshot.budgets.find(function(b){return b.id===p.budgetId;});if(!budget)throw new Error('Budget not found');customer(budget.customerCode);
  const amount=writeNumber_(p.newAmount,'annual budget');tables.budgets=snapshot.budgets.filter(function(b){return b.contractId===budget.contractId&&(b.periodNumber||1)>=(budget.periodNumber||1);}).map(function(b){b.annualAmount=amount;b.updatedAt=now;return refreshBudgetTotals(b);});codes.push(budget.customerCode);result.entityId=budget.id;
 }else if(kind==='REPRICE'){
  requireAdmin();const price=writeNumber_(p.price,'crate price');if(price<=0)throw new Error('Invalid crate price');tables.settings={pricePerCrate:price};
  if(p.recalculate===true){
   tables.conditions=[];tables.budgets=[];tables.transactions=[];
   snapshot.customers.filter(function(c){return c.status!=='DELETED';}).forEach(function(c){
    const condition=snapshot.conditions.find(function(row){return row.customerCode===c.code;});if(!condition)return;
    condition.pricePerUnit=price;condition.updatedAt=now;tables.conditions.push(condition);codes.push(c.code);
    const contract=snapshot.contracts.filter(function(row){return row.customerCode===c.code;}).sort(function(a,b){return b.cycleNumber-a.cycleNumber;}).find(function(row){return businessToday()>=row.commencingOn&&businessToday()<=row.expiringOn;});
    const current=contract&&selectAnnualBudget(snapshot.budgets.filter(function(b){return b.contractId===contract.id;}));
    snapshot.budgets.filter(function(b){return b.customerCode===c.code;}).forEach(function(b){if(current&&b.contractId===current.contractId&&(b.periodNumber||1)>=(current.periodNumber||1)){b.annualAmount=condition.conditionQuantity*price;refreshBudgetTotals(b);b.updatedAt=now;}tables.budgets.push(b);});
    tables.transactions=tables.transactions.concat(snapshot.transactions.filter(function(t){return t.customerCode===c.code;}));
   });
  }
 }else throw new Error('Unsupported business write');
 tables.logs=[{id:'LOG-'+id,timestamp:now,user:actor[1],role:actor[5],team:admin?'ALL':actor[6],action:kind,details:codes.join(', ')}];
 // Validate all affected tables before recording a recoverable plan.
 SYNC_TABLES.filter(function(table){return tables[table[0]]!==undefined;}).forEach(function(table){planSyncTable_(getSpreadsheet(),table,tables[table[0]]);});
 const plan={tables:tables,codes:codes,result:result,actor:[String(actor[0]),String(actor[1])],action:kind,changes:businessChanges_(original,tables)};
 if(kind==='DELETE_CUSTOMER'||kind==='DELETE_ALL_CUSTOMERS'){
  plan.deletion=captureCustomerDeletion_(getSpreadsheet(),codes,now);
  ['customers','conditions','contracts','budgets','transactions'].forEach(function(key){original[key].filter(function(row){return codes.indexOf(key==='customers'?row.code:row.customerCode)>=0;}).forEach(function(row){plan.changes.push({table:key,id:String(key==='customers'?row.code:row.id),before:row,after:null});});});
 }
 return plan;
}
function mutateBusiness_(payload,token,onlyCodes){
 const ss=userTables_(),actor=requireSession_(ss,token,false);recoverBusinessWrites_();ensureDailyDatabaseBackup_(ss,actor);
 const id=String(payload.id||''),kind=String(payload.kind||''),data=payload.data;
 if(!/^OP-[A-Za-z0-9-]{8,100}$/.test(id)||!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid business write request');
 const sheet=writeJournal_(),hash=digest_(JSON.stringify({kind:kind,data:data}));let parts=journalOperations_(sheet,id).get(id);
 if(parts){if(String(parts[0].row[1])!==String(actor[0])||parts[0].row[2]!==hash)throw new Error('Operation ID was already used');}
 else {
  let plan;try{plan=buildBusinessWrite_(kind,data,actor,readBusinessData_(token).snapshot,id,onlyCodes);}catch(error){return {success:false,writeVersion:1,retryable:false,message:String(error)};}
  const text=JSON.stringify(plan),chunks=[];for(let n=0;n<text.length;){let end=Math.min(n+28000,text.length);const last=text.charCodeAt(end-1);if(end<text.length&&last>=0xD800&&last<=0xDBFF)end--;chunks.push(text.slice(n,end));n=end;}
  const now=new Date().toISOString(),rows=chunks.map(function(chunk,index){return [id,String(actor[0]),hash,digest_(text),'PREPARED',index,chunks.length,chunk,now];});
  const start=sheet.getLastRow()+1;
  if(sheet.getMaxRows()<start+rows.length-1)sheet.insertRowsAfter(sheet.getMaxRows(),start+rows.length-1-sheet.getMaxRows());
  sheet.getRange(start,1,rows.length,9).setValues(rows);SpreadsheetApp.flush();parts=rows.map(function(row,index){return {row:row,index:start+index};});
 }
 replayBusinessWrite_(sheet,parts);
 const planText=parts.slice().sort(function(a,b){return a.row[5]-b.row[5];}).map(function(p){return p.row[7];}).join(''),plan=JSON.parse(planText),read=readBusinessData_(token);
 if((kind==='DELETE_CUSTOMER'||kind==='DELETE_ALL_CUSTOMERS')&&!plan.deletion){
  const upgraded=mutateBusiness_({id:'OP-PHYSICAL-'+digest_(id).slice(0,40),kind:kind,data:data},token,plan.codes);return Object.assign({},upgraded,{mutationId:id});
 }
 const patch=writePatch_(read.snapshot,plan.codes);
 return {success:true,deletionVersion:1,writeVersion:1,mutationId:id,scope:read.scope,user:read.user,customerCodes:plan.codes,patch:patch,snapshot:read.snapshot,businessRevision:read.businessRevision,entityId:plan.result.entityId,message:'Saved to Google Sheet'};
}


// The primary database is selected by private Script Properties and an owner-
// controlled SETTINGS routing row. No private spreadsheet ID is shipped in Git.
const CORE_DATABASE_SHEETS_=['CUSTOMERS','CUSTOMER_CONDITIONS','CONTRACTS','BUDGETS','BUDGET_TRANSACTIONS','USERS','CATEGORIES','ACTIVITY_LOG','SETTINGS','MKT_MASTER','DELETED_CUSTOMERS'];
let spreadsheetCache_=null;
let databaseLockHeld_=false;
function databaseSetting_(ss,key){const s=ss.getSheetByName('SETTINGS');if(!s)return '';const rows=s.getDataRange().getValues();const row=rows.slice(1).find(function(r){return r[0]===key;});return row?String(row[1]):'';}
function setDatabaseSetting_(ss,key,value){let s=ss.getSheetByName('SETTINGS');if(!s){s=ss.insertSheet('SETTINGS');s.appendRow(['Setting Key','Setting Value','Description','Updated At']);}const rows=s.getDataRange().getValues(),index=rows.findIndex(function(r,i){return i>0&&r[0]===key;});const row=[key,value,'Database routing / migration',new Date().toISOString()];if(index<0)s.appendRow(row);else s.getRange(index+1,1,1,4).setValues([row]);}
function retireLegacyDatabaseAccess_(source){
 if(databaseSetting_(source,'legacyAccessRetired')==='true')return;
 const users=source.getSheetByName('USERS');if(users&&users.getLastRow()>1)users.getRange(2,8,users.getLastRow()-1,1).setValues(Array.from({length:users.getLastRow()-1},function(){return [false];}));
 const sessions=source.getSheetByName('SESSIONS');if(sessions&&sessions.getLastRow()>1)sessions.getRange(2,4,sessions.getLastRow()-1,1).setValues(Array.from({length:sessions.getLastRow()-1},function(){return [new Date(0).toISOString()];}));
 setDatabaseSetting_(source,'legacyAccessRetired','true');
}
function activateRoutedDatabase_(source,target){
 // This runs under the shared script lock. Refresh the source at cutover so
 // writes made after the initial connector copy are included as well.
 const names=CORE_DATABASE_SHEETS_.concat(['APP_WRITES','BROWSER_RECOVERY','CHANGE_HISTORY','DATABASE_BACKUPS']);
 names.forEach(function(name){const sheet=source.getSheetByName(name);if(!sheet)return;const previous=target.getSheetByName(name);if(previous)previous.setName(('PRE_CUTOVER_'+Utilities.getUuid().slice(0,8)+'_'+name).slice(0,100));sheet.copyTo(target).setName(name);});
 // Never migrate session credentials. The target has a fresh session table.
 let sessions=target.getSheetByName('SESSIONS');if(!sessions){sessions=target.insertSheet('SESSIONS');sessions.appendRow(['Session ID','Username','Token','Expires At','Created At','User ID','Password Version']);}
 SpreadsheetApp.flush();
 names.forEach(function(name){const sheet=source.getSheetByName(name);if(sheet&&JSON.stringify(sheet.getDataRange().getValues())!==JSON.stringify(target.getSheetByName(name).getDataRange().getValues()))throw new Error('Cutover verification failed: '+name);});
 setDatabaseSetting_(target,'spreadsheetId',target.getId());setDatabaseSetting_(target,'primaryDatabaseId',target.getId());setDatabaseSetting_(target,'databaseRouteState','ACTIVE');setDatabaseSetting_(target,'migrationSourceId',source.getId());
 // Mark routing active before retiring old access. If retirement is interrupted,
 // later requests resume it without copying disabled accounts into the target.
 spreadsheetCache_=target;recoverBusinessWrites_();
 setDatabaseSetting_(source,'databaseRouteState','ACTIVE');
 retireLegacyDatabaseAccess_(source);
 const info=target.getSheetByName('MIGRATION_INFO');if(info)info.getRange(2,2).setValue('ACTIVE — '+new Date().toISOString());
}
function resolvePrimaryDatabase_(source){
 const id=databaseSetting_(source,'primaryDatabaseId');if(!id||id===source.getId())return source;
 if(!/^[A-Za-z0-9_-]{20,}$/.test(id))throw new Error('Invalid primary database routing ID');
 const target=SpreadsheetApp.openById(id),lock=LockService.getScriptLock(),acquire=!databaseLockHeld_;
 if(acquire){lock.waitLock(10000);databaseLockHeld_=true;}
 try{const state=databaseSetting_(source,'databaseRouteState');if(state==='PENDING')activateRoutedDatabase_(source,target);else if(state!=='ACTIVE')throw new Error('Database routing has not been activated');else retireLegacyDatabaseAccess_(source);}finally{if(acquire){lock.releaseLock();databaseLockHeld_=false;}}
 return target;
}
function safeJsonChunks_(value){const text=typeof value==='string'?value:JSON.stringify(value),chunks=[];for(let i=0;i<text.length;){let end=Math.min(i+28000,text.length);const c=text.charCodeAt(end-1);if(end<text.length&&c>=0xD800&&c<=0xDBFF)end--;chunks.push(text.slice(i,end));i=end;}return {text:text,chunks:chunks,checksum:digest_(text)};}
function archiveTable_(ss,name){let sheet=ss.getSheetByName(name);if(!sheet){sheet=ss.insertSheet(name);sheet.appendRow(['Archive ID','Created At','Actor ID','Actor','Reason','Chunk','Chunks','Checksum','Data JSON']);}return sheet;}
function storeArchive_(ss,name,id,actor,reason,data){
 const sheet=archiveTable_(ss,name),packed=safeJsonChunks_(data),existing=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues().filter(function(r){return r[0]===id;}):[];
 if(existing.length){if(existing[0][2]!==String(actor[0])||existing[0][7]!==packed.checksum||existing.length!==packed.chunks.length)throw new Error('Backup ID conflict');return id;}
 const now=new Date().toISOString(),rows=packed.chunks.map(function(chunk,i){return [id,now,String(actor[0]),String(actor[1]),String(reason),i,packed.chunks.length,packed.checksum,chunk];});
 if(sheet.getMaxRows()<sheet.getLastRow()+rows.length)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length);
 sheet.getRange(sheet.getLastRow()+1,1,rows.length,9).setValues(rows);SpreadsheetApp.flush();return id;
}
function backupValues_(sheet){return sheet.getDataRange().getValues().map(function(row){return row.map(function(value){return Object.prototype.toString.call(value)==='[object Date]'?{$date:value.toISOString()}:value;});});}
function ensureDailyDatabaseBackup_(ss,actor){
 const id='DAILY-'+businessToday(),sheet=ss.getSheetByName('DATABASE_BACKUPS');if(sheet&&sheet.getLastRow()>1&&sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().some(function(r){return r[0]===id;}))return id;
 const tables={};CORE_DATABASE_SHEETS_.forEach(function(name){const sheet=ss.getSheetByName(name);if(sheet)tables[name]=backupValues_(sheet);});
 // User records/hashes are backed up; active session credentials are excluded.
 return storeArchive_(ss,'DATABASE_BACKUPS',id,actor,'AUTOMATIC_DAILY',{version:1,spreadsheetId:ss.getId(),createdAt:new Date().toISOString(),tables:tables,excluded:['SESSIONS']});
}
function businessChanges_(before,tables){const changes=[];['customers','conditions','contracts','budgets','transactions'].forEach(function(key){if(!tables[key])return;tables[key].forEach(function(record){const id=key==='customers'?record.code:record.id,previous=(before[key]||[]).find(function(row){return (key==='customers'?row.code:row.id)===id;})||null;if(JSON.stringify(previous)!==JSON.stringify(record))changes.push({table:key,id:String(id),before:previous,after:record});});});return changes;}
function appendChangeHistory_(ss,operation,actor,action,changes){
 if(!changes.length)return;let sheet=ss.getSheetByName('CHANGE_HISTORY');if(!sheet){sheet=ss.insertSheet('CHANGE_HISTORY');sheet.appendRow(['Event ID','Timestamp','Actor','Action','Table','Record ID','Operation ID','Chunk','Chunks','Checksum','Before / After JSON']);}
 const known=new Set((sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues():[]).map(function(row){return row[0]+':'+row[7];})),rows=[],now=new Date().toISOString();
 changes.forEach(function(change,index){const id='EV-'+digest_(operation+':'+change.table+':'+change.id+':'+index),packed=safeJsonChunks_({before:change.before,after:change.after});packed.chunks.forEach(function(chunk,i){if(!known.has(id+':'+i))rows.push([id,now,String(actor[1]),action,change.table,change.id,operation,i,packed.chunks.length,packed.checksum,chunk]);});});
 if(rows.length){if(sheet.getMaxRows()<sheet.getLastRow()+rows.length)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length);sheet.getRange(sheet.getLastRow()+1,1,rows.length,11).setValues(rows);SpreadsheetApp.flush();}
}
function safeRecovery_(raw,actor){
 if(!raw||!/^REC-[A-Za-z0-9-]{8,100}$/.test(String(raw.id))||!raw.business)throw new Error('Invalid browser recovery');
 const admin=actor[5]==='ADMIN',team=String(actor[6]),input=raw.business,customers=(Array.isArray(input.customers)?input.customers:[]).filter(function(row){return admin||row.team===team;}),codes=new Set(customers.map(function(row){return row.code;})),business={customers:customers};
 ['conditions','contracts','budgets','transactions'].forEach(function(key){business[key]=(Array.isArray(input[key])?input[key]:[]).filter(function(row){return codes.has(row.customerCode)&&(key==='conditions'||admin||row.team===team);});});
 const users=(Array.isArray(raw.users)?raw.users:[]).filter(function(user){return admin||user.id===String(actor[0]);}).map(function(user){const safe={};['id','username','fullName','email','role','team','isActive','createdAt','lastLogin','status','updatedAt','deletedAt'].forEach(function(key){if(user[key]!==undefined)safe[key]=user[key];});return safe;});
 return {version:1,id:String(raw.id),createdAt:String(raw.createdAt||''),actorId:String(actor[0]),spreadsheetId:getSpreadsheet().getId(),reason:String(raw.reason||'LEGACY_CACHE'),business:business,users:users,settings:normalizeSharedSettings_(raw.settings||{}),logs:(Array.isArray(raw.logs)?raw.logs:[]).filter(function(row){return admin||row.team===team&&row.user===actor[1];})};
}
function saveBrowserRecovery_(payload,token){
 const ss=userTables_(),actor=requireSession_(ss,token,false);recoverBusinessWrites_();const recovery=safeRecovery_(payload.recovery,actor);
 ensureDailyDatabaseBackup_(ss,actor);storeArchive_(ss,'BROWSER_RECOVERY',recovery.id,actor,recovery.reason,recovery);
 const read=readBusinessData_(token);
 return Object.assign({},read,{success:true,recoveryVersion:1,recoveryId:recovery.id,users:actor[5]==='ADMIN'?userRows_(ss).map(publicUser_):[publicUser_(actor)],message:'Browser data backed up; authoritative Sheet data loaded.'});
}


// Customer deletion removes live rows only after a recoverable archive exists.
const DELETED_CUSTOMER_HEADERS_=['Customer Code','Deleted At','Deleted By','Operation ID','Backup ID'];
function deletedCustomerCodes_(ss){
 const sheet=ss.getSheetByName('DELETED_CUSTOMERS');if(!sheet)return new Set();
 const rows=sheet.getDataRange().getValues();
 if(JSON.stringify(rows[0].slice(0,5))!==JSON.stringify(DELETED_CUSTOMER_HEADERS_))throw new Error('DELETED_CUSTOMERS: invalid headers');
 return new Set(rows.slice(1).filter(function(row){return row[0];}).map(function(row){return String(row[0]);}));
}
function captureCustomerDeletion_(ss,codes,now){
 const selected=new Set(codes),tables={};
 SYNC_TABLES.slice(0,5).forEach(function(table){
  const sheet=ss.getSheetByName(table[1]);if(!sheet)return;
  const values=backupValues_(sheet),headers=values[0],column=headers.indexOf('Customer Code');
  if(column<0)throw new Error(table[1]+': missing Customer Code header');
  const formulas=sheet.getDataRange().getFormulas(),rows=[],savedFormulas=[];
  values.slice(1).forEach(function(row,index){if(selected.has(String(row[column]))){rows.push(row);savedFormulas.push(formulas[index+1]);}});
  tables[table[1]]={headers:headers,rows:rows,formulas:savedFormulas};
 });
 return {version:1,codes:codes,deletedAt:now,tables:tables};
}
function applyCustomerDeletion_(ss,operation,actor,deletion){
 const backupId='DELETE-'+operation;
 storeArchive_(ss,'DATABASE_BACKUPS',backupId,actor,'BEFORE_CUSTOMER_DELETE',deletion);
 let registry=ss.getSheetByName('DELETED_CUSTOMERS');if(!registry){registry=ss.insertSheet('DELETED_CUSTOMERS');registry.appendRow(DELETED_CUSTOMER_HEADERS_);}
 const known=deletedCustomerCodes_(ss);
 const registryRows=[];deletion.codes.forEach(function(code){if(!known.has(code)){registryRows.push([code,deletion.deletedAt,String(actor[1]),operation,backupId]);known.add(code);}});
 if(registryRows.length){const start=registry.getLastRow()+1;if(registry.getMaxRows()<start+registryRows.length-1)registry.insertRowsAfter(registry.getMaxRows(),start+registryRows.length-1-registry.getMaxRows());registry.getRange(start,1,registryRows.length,5).setValues(registryRows);}
 SpreadsheetApp.flush();
 // Delete bottom-up so shifted row indices never select a different store.
 const selected=new Set(deletion.codes);
 Object.keys(deletion.tables).forEach(function(name){
  const sheet=ss.getSheetByName(name);if(!sheet)return;
  const headers=sheet.getRange(1,1,1,deletion.tables[name].headers.length).getValues()[0],column=headers.indexOf('Customer Code'),count=sheet.getLastRow()-1;
  if(column<0)throw new Error(name+': missing Customer Code header');
  if(count<1)return;
  const codes=sheet.getRange(2,column+1,count,1).getValues();
  for(let end=codes.length-1;end>=0;){
   if(!selected.has(String(codes[end][0]))){end--;continue;}
   let start=end;while(start>0&&selected.has(String(codes[start-1][0])))start--;
   sheet.deleteRows(start+2,end-start+1);end=start-1;
  }
 });
 SpreadsheetApp.flush();
}

ensureDailyDatabaseBackup_=()=>null;
return {handle:doPost,publicUser:publicUser_,userRows:userRows_,writeUser:writeUser_,findUser:findUser_,readBusiness:readBusinessData_,requireSession:requireSession_,
prepareUser(data,existing,actor,selfOnly){const original=writeUser_;writeUser_=()=>{};try{return saveRemoteUser_(adapter.spreadsheet,data,existing,actor,selfOnly);}finally{writeUser_=original;}},
};
}
