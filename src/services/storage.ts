import {makeBrowserRecovery,type BrowserRecovery} from './legacyRecovery';
import {businessWriteKey,newBusinessWriteId,type PendingBusinessWrite,type BusinessWriteKind,type BusinessWriteResult,type BusinessWriteState} from './businessWrites';
import {businessToday, isCalendarDate, projectAnnualBudgets, selectAnnualBudget, refreshBudgetTotals} from './annualBudgets';
import { accountRequest, clearRemoteSession, remoteSession, remoteSessionId, type AccountResponse } from './remoteAccounts';
import { resolveBackendUrl, isRetiredBackend, DEPLOYED_BACKEND_URL, RETIRED_BACKENDS } from '../config/backend';
import { businessFingerprint, validateBusinessSnapshot, type BusinessSnapshot } from './businessData';
import {sharedSettings, sharedSettingKeys} from './sharedSettings';
/**
 * Local Data Storage and Business Logic Engine
 * Manages Persistence, Access Permissions, Budget Calculations, and Audit Logging
 */

import {
  Customer,
  CustomerCondition,
  Contract,
  Budget,
  BudgetTransaction,
  User,
  ActivityLog,
  AppSettings,
  Team,
  DashboardMetrics,
  ContractStatus,
  BudgetStatus
} from '../types';
import { generateSeedData, INITIAL_SETTINGS, INITIAL_USERS } from '../data/seedData';
import {encodeSheetPublication,decodeSheetPublication,type PendingSheetPublish} from './sheetPublish';

const STORAGE_KEYS = {
  CUSTOMERS: 'mkt_customers_v1',
  CONDITIONS: 'mkt_conditions_v1',
  CONTRACTS: 'mkt_contracts_v1',
  BUDGETS: 'mkt_budgets_v1',
  TRANSACTIONS: 'mkt_transactions_v1',
  USERS: 'mkt_users_v1',
  LOGS: 'mkt_activity_logs_v1',
  SETTINGS: 'mkt_settings_v1',
  AUTH: 'mkt_current_user_v1'
};

const memoryCache: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const item = window.localStorage.getItem(key);
      if (item !== null) return item;
    }
  } catch (e) {
    console.warn(`localStorage.getItem failed for ${key}, using memory cache`, e);
  }
  return memoryCache[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    memoryCache[key] = value;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`localStorage.setItem failed for ${key}, saved in memory only`, e);
  }
}

function safeRemoveItem(key: string): void {
  try {
    delete memoryCache[key];
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`localStorage.removeItem failed for ${key}`, e);
  }
}

class StorageService {
  private customers: Customer[] = [];
  private conditions: CustomerCondition[] = [];
  private contracts: Contract[] = [];
  private budgets: Budget[] = [];
  private transactions: BudgetTransaction[] = [];
  private users: User[] = [];
  private logs: ActivityLog[] = [];
  private settings: AppSettings = INITIAL_SETTINGS;
  private currentUser: User | null = null;
  private listeners: (() => void)[] = [];
  private sheetLoadSequence = 0;
  private deletionSupport:{endpoint:string;actorId:string;token:string}|null=null;
  private rememberDeletionSupport(result:AccountResponse,endpoint:string,actorId:string,token:string){this.deletionSupport=result.deletionVersion===1?{endpoint,actorId,token}:null;}
  private sheetPublishMessage='';
  private sheetPublishCache:{key:string;text:string;value:PendingSheetPublish}|null=null;
  private sheetPublishKey(endpoint=this.settings.appsScriptUrl){return this.currentUser?'foc-pending-publish-v1:'+this.currentUser.id+':'+endpoint:'';}
  public getPendingSheetPublish(endpoint=this.settings.appsScriptUrl):import('./sheetPublish').PendingSheetPublish|null {
    try{const key=this.sheetPublishKey(endpoint),text=safeGetItem(key);if(!text)return null;const value=this.sheetPublishCache?.key===key&&this.sheetPublishCache.text===text?this.sheetPublishCache.value:decodeSheetPublication(text);if(value?.actorId!==this.currentUser?.id||value.endpoint!==endpoint||!value.payload||!Array.isArray(value.payload.customers))return null;this.sheetPublishCache={key,text,value};return value;}catch{return null;}
  }
  public savePendingSheetPublish(endpoint:string,payload:Record<string,unknown>,source:import('./sheetPublish').SheetPublishSource={}){
    if(!this.canManageSettings())throw Error('Admin permission required');
    const value:import('./sheetPublish').PendingSheetPublish={...source,id:newBusinessWriteId(),actorId:this.currentUser!.id,endpoint,payload,createdAt:new Date().toISOString()};
    const key=this.sheetPublishKey(endpoint),text=encodeSheetPublication(value);
    try{window.localStorage.setItem(key,text);if(window.localStorage.getItem(key)!==text)throw Error('Storage unavailable');}catch{throw Error('Browser storage is full or unavailable. Download a backup before publishing.');}
    safeSetItem(key,text);this.sheetPublishCache={key,text,value};this.sheetPublishMessage='';this.notify();return value;
  }
  public completeSheetPublish(endpoint:string,id:string){
    const pending=this.getPendingSheetPublish(endpoint);if(pending?.id!==id)return;
    for(const oldEndpoint of pending.previousEndpoints||[]){const previous=this.getPendingSheetPublish(oldEndpoint);if(previous?.id===id)safeRemoveItem(this.sheetPublishKey(oldEndpoint));}
    safeRemoveItem(this.sheetPublishKey(endpoint));this.sheetPublishMessage='';this.notify();
  }
  private migratePendingSheetPublish(confirmedSheetId:string,migratedFrom=''):boolean {
    if(!this.canManageSettings()||!confirmedSheetId||this.getPendingSheetPublish())return false;
    const endpoint=this.settings.appsScriptUrl;
    for(const oldEndpoint of RETIRED_BACKENDS){
      const pending=this.getPendingSheetPublish(oldEndpoint);if(!pending)continue;
      const source=String(pending.payload.spreadsheetId||'');
      if(!source||source==='YOUR_SPREADSHEET_ID'||source!==confirmedSheetId&&source!==migratedFrom)continue;
      const value={...pending,endpoint,previousEndpoints:[...new Set([...(pending.previousEndpoints||[]),oldEndpoint])],payload:{...pending.payload,spreadsheetId:confirmedSheetId}};
      const key=this.sheetPublishKey(endpoint),text=encodeSheetPublication(value);
      try{window.localStorage.setItem(key,text);if(window.localStorage.getItem(key)!==text)return false;}catch{return false;}
      safeSetItem(key,text);this.sheetPublishCache={key,text,value};this.settings.spreadsheetId=confirmedSheetId;safeSetItem(STORAGE_KEYS.SETTINGS,JSON.stringify(this.settings));
      this.sheetPublishMessage='ຍ້າຍລາຍການລໍສົ່ງມາລິ້ງໃໝ່ແລ້ວ. ກົດລອງສົ່ງໄປ Sheet ອີກຄັ້ງ.';return true;
    }
    return false;
  }
  public setSheetPublishMessage(message:string){this.sheetPublishMessage=message;this.notify();}
  public getSheetPublishState(){return {pending:this.getPendingSheetPublish(),saving:this.bulkPublishing,message:this.sheetPublishMessage};}
  public discardPendingSheetPublish(){
    const pending=this.getPendingSheetPublish();if(!pending||this.bulkPublishing||!this.canManageSettings())return false;
    const key='foc-saved-publish-v1:'+pending.id,text=encodeSheetPublication(pending);
    try{window.localStorage.setItem(key,text);if(window.localStorage.getItem(key)!==text)return false;}catch{return false;}
    this.completeSheetPublish(pending.endpoint,pending.id);return true;
  }
  private businessWriteFlight:Promise<BusinessWriteResult>|null=null;
  private writeFeedback:{key:string;status:BusinessWriteState['status'];message:string}|null=null;
  private recoveryFlight:Promise<BusinessWriteResult>|null=null;
  private recoveryPointer(){return 'foc-recovery-latest:'+this.currentWriteKey();}
  public getLocalRecoveryBackup():BrowserRecovery|null {try{const key=safeGetItem(this.recoveryPointer());return key?JSON.parse(safeGetItem(key)||'null'):null;}catch{return null;}}
  public async recoverLegacyCache(reason='LOAD_SHEET'):Promise<BusinessWriteResult>{
    if(this.getPendingSheetPublish())return {success:false,message:'Finish or cancel the pending Sheet publication first. Uploaded data is retained.'};
    if(this.recoveryFlight)return this.recoveryFlight;
    const actor=this.currentUser,endpoint=this.settings.appsScriptUrl,token=remoteSessionId(endpoint);
    if(!actor||!token)return {success:false,message:'Login again to back up local data.'};
    if(this.businessWriteFlight||this.bulkPublishing)return {success:false,message:'Wait for the current Sheet save to finish.'};
    ++this.sheetLoadSequence;
    const before=businessFingerprint(this.businessSnapshot());
    const recovery=makeBrowserRecovery(this.businessSnapshot(),this.users,this.settings,this.logs,actor,reason);
    const key='foc-recovery-v1:'+recovery.id;safeSetItem(key,JSON.stringify(recovery));safeSetItem(this.recoveryPointer(),key);
    const run=async():Promise<BusinessWriteResult>=>{
      this.sheetDataState={status:'loading',message:'ກຳລັງສຳຮອງຂໍ້ມູນເກົ່າລົງ Sheet ແລະໂຫຼດຂໍ້ມູນຫຼ້າສຸດ…'};this.notify();
      const result=await accountRequest(endpoint,'SAVE_BROWSER_RECOVERY',{recovery});
      if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint)){this.setCurrentUser(null);return {success:false,message:'Login again after the database migration. Local backup retained.'};}
      if(this.currentUser?.id!==actor.id||this.settings.appsScriptUrl!==endpoint||remoteSessionId(endpoint)!==token)return {success:false,message:'Account changed; local backup retained.'};
      try{
        if(!result.success||result.recoveryVersion!==1||result.recoveryId!==recovery.id)throw Error(result.message||'Update Code.gs and deploy a new version to back up old browser data automatically.');
        const user=result.user;if(!user||user.id!==actor.id||!['ADMIN','TEAM_USER'].includes(user.role)||user.role!=='ADMIN'&&!/^B[1-7]$/.test(user.team))throw Error('Invalid backup account');
        const scope=user.role==='ADMIN'?'ALL':user.team;if(result.scope!==scope)throw Error('Invalid backup scope');
        const data=validateBusinessSnapshot(result.snapshot,scope);
        if(before!==businessFingerprint(this.businessSnapshot()))throw Error('Local data changed during backup. Retry to capture the latest edits.');
        if(user.role==='ADMIN'&&typeof result.businessRevision==='string'&&this.migratePendingSheetPublish(result.spreadsheetId||'',result.migratedFromSpreadsheetId||'')){this.sheetDataState={status:'local',message:this.sheetPublishMessage};this.notify();return {success:false,message:this.sheetPublishMessage};}
        this.rememberDeletionSupport(result,endpoint,actor.id,token);
        this.applySharedResponse(result,actor);this.settings={...this.settings,...sharedSettings(result.settings)};safeRemoveItem('mkt_shared_settings_pending_v1');
        if(result.spreadsheetId)this.settings.spreadsheetId=result.spreadsheetId;
        this.customers=data.customers;this.conditions=data.conditions;this.contracts=data.contracts;this.budgets=data.budgets;this.transactions=data.transactions;
        this.users=user.role==='ADMIN'&&result.users?result.users:[user];
        this.persistAll();this.recalculateContractStatuses();this.markBusinessSynced(endpoint,this.businessSnapshot(),result.businessRevision);
        this.sheetDataState={status:'loaded',message:'ສຳຮອງຂໍ້ມູນເກົ່າລົງ Sheet ແລ້ວ. ຂໍ້ມູນໃນແອັບກົງກັບ Sheet; ເພີ່ມ/ແກ້ໄຂ/ລົບໄດ້.'};this.notify();
        return {success:true,message:'Old browser data backed up; shared Sheet data loaded.'};
      }catch(error){if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint))this.setCurrentUser(null);const message=error instanceof Error?error.message:String(error);this.sheetDataState={status:'error',message};this.notify();return {success:false,message};}
    };
    this.recoveryFlight=run();try{return await this.recoveryFlight;}finally{this.recoveryFlight=null;}
  }
  private bulkPublishing=false;
  private businessBaselineText:string|null=null;
  private storeBusinessBaseline(value:{endpoint:string;fingerprint:string;revision?:string}){this.businessBaselineText=JSON.stringify(value);safeSetItem('mkt_sheet_business_baseline_v1',this.businessBaselineText);}
  private currentWriteKey(){return this.currentUser?businessWriteKey(this.currentUser.id,this.settings.appsScriptUrl):'';}
  public getPendingBusinessWrite():PendingBusinessWrite|null {
    const key=this.currentWriteKey();if(!key)return null;
    try{const pending=JSON.parse(safeGetItem(key)||'null');return pending?.actorId===this.currentUser?.id&&pending.endpoint===this.settings.appsScriptUrl?pending:null;}catch{return null;}
  }
  private migratePendingBusinessWrite(confirmedSheetId:string,previousSheetId:string,migratedFrom=''):boolean {
    const actor=this.currentUser,endpoint=this.settings.appsScriptUrl;
    if(!actor||this.getPendingBusinessWrite()||!confirmedSheetId)return false;
    for(const oldEndpoint of RETIRED_BACKENDS){
      const oldKey=businessWriteKey(actor.id,oldEndpoint);
      let pending:PendingBusinessWrite;try{pending=JSON.parse(safeGetItem(oldKey)||'null');}catch{continue;}
      if(!pending||pending.actorId!==actor.id||pending.endpoint!==oldEndpoint)continue;
      const savedSheet=pending.spreadsheetId||previousSheetId;
      if(!savedSheet||savedSheet==='YOUR_SPREADSHEET_ID'||savedSheet!==confirmedSheetId&&savedSheet!==migratedFrom)continue;
      const moved={...pending,endpoint,spreadsheetId:confirmedSheetId,previousEndpoint:oldEndpoint};
      const key=businessWriteKey(actor.id,endpoint),text=JSON.stringify(moved);
      try{window.localStorage.setItem(key,text);if(window.localStorage.getItem(key)!==text)return false;}catch{return false;}
      safeSetItem(key,text);return true;
    }
    return false;
  }
  public getBusinessWriteState():BusinessWriteState {
    const pending=Boolean(this.getPendingBusinessWrite()),feedback=this.writeFeedback?.key===this.currentWriteKey()?this.writeFeedback:null;
    return {status:feedback?.status||(pending?'error':'idle'),message:feedback?.message||(pending?'ມີການບັນທຶກທີ່ລໍສົ່ງໄປ Sheet (Pending Sheet save)':''),pending};
  }
  public beginBulkPublish(){if(this.getPendingBusinessWrite()||this.businessWriteFlight||this.recoveryFlight||this.bulkPublishing)throw Error('Finish the pending Sheet save before importing or publishing a full snapshot.');this.bulkPublishing=true;}
  public endBulkPublish(){this.bulkPublishing=false;this.notify();}
  public async commitBusinessChange(kind:BusinessWriteKind,data:Record<string,unknown>):Promise<BusinessWriteResult>{
    if(!this.currentUser)return {success:false,message:'Sign in first'};
    if(this.getPendingSheetPublish())return {success:false,message:'Finish or cancel the pending Sheet publication first. Uploaded data is retained.'};
    if(!this.settings.appsScriptUrl){
      switch(kind){
        case 'ADD_CUSTOMER':return this.addCustomer(data as Parameters<StorageService['addCustomer']>[0]);
        case 'UPDATE_CUSTOMER':{const customer=this.getCustomerByCode(String(data.code));if(!customer||!this.canEditCustomer(customer.team))return {success:false,message:'Permission denied'};customer.name=String(data.name);customer.phone=String(data.phone||'');customer.address=String(data.address||'');customer.province=String(data.province||'');customer.updatedAt=new Date().toISOString();this.persistAll();this.notify();return {success:true,message:'Updated locally'};}
        case 'DELETE_CUSTOMER':return this.deleteCustomer(String(data.customerCode));
        case 'DELETE_ALL_CUSTOMERS':return this.clearAllCustomers();
        case 'ADD_TRANSACTION':return this.addTransaction(data as Parameters<StorageService['addTransaction']>[0]);
        case 'CANCEL_TRANSACTION':return this.cancelTransaction(String(data.txnId),String(data.reason));
        case 'NEW_CONTRACT':return this.addNewContractCycle(data as Parameters<StorageService['addNewContractCycle']>[0]);
        case 'UPDATE_BUDGET':return this.updateBudget(String(data.budgetId),Number(data.newAmount),String(data.notes||''));
        case 'REPRICE':this.updateSettings({pricePerCrate:Number(data.price)});if(data.recalculate)this.recalculateBudgetsByPricePerCrate(Number(data.price));return {success:true,message:'Saved locally'};
      }
    }
    if(this.bulkPublishing)return {success:false,message:'Wait for the Excel/Sheet publication to finish.'};
    if(!this.hasRemoteUserSession())return {success:false,message:'Login again to save to Sheet.'};
    const originalCustomer=kind==='DELETE_CUSTOMER'?this.getCustomerByCode(String(data.customerCode)):undefined;
    if(originalCustomer&&!this.canDeleteCustomer(originalCustomer.code))return {success:false,message:'Permission denied for this team'};
    if(this.hasUnsyncedBusinessData()){const recovered=await this.recoverLegacyCache(kind);if(!recovered.success)return recovered;}
    if(kind==='DELETE_CUSTOMER'&&originalCustomer&&(this.currentUser?.role==='ADMIN'||originalCustomer.team===this.currentUser?.team)&&(!this.getCustomerByCode(originalCustomer.code)||this.getCustomerByCode(originalCustomer.code)?.status==='DELETED'))return {success:true,message:'ຮ້ານນີ້ບໍ່ຢູ່ໃນລາຍຊື່ Sheet ແລ້ວ; ຂໍ້ມູນເກົ່າສຳຮອງໄວ້ແລ້ວ.'};
    const old=this.getPendingBusinessWrite();
    if(this.businessWriteFlight&&!old)return {success:false,message:'Wait for the current Sheet save to finish.'};
    if(old){if(old.kind!==kind||JSON.stringify(old.data)!==JSON.stringify(data))return {success:false,message:'ກະລຸນາລອງສົ່ງລາຍການທີ່ຄ້າງກ່ອນ (Retry the pending Sheet save first).'};return this.retryPendingBusinessWrite();}
    this.ensureAnnualBudgets();
    if(this.hasUnsyncedBusinessData())return {success:false,message:'Local data changed while preparing the save. Try again.'};
    const pending:PendingBusinessWrite={id:newBusinessWriteId(),kind,data:JSON.parse(JSON.stringify(data)),actorId:this.currentUser.id,endpoint:this.settings.appsScriptUrl,createdAt:new Date().toISOString(),spreadsheetId:this.settings.spreadsheetId};
    // Persist the operation ID before sending; a lost response can be retried
    // after Reload without creating duplicate stores or expenses.
    const key=this.currentWriteKey(),serialized=JSON.stringify(pending);
    try{window.localStorage.setItem(key,serialized);if(window.localStorage.getItem(key)!==serialized)throw Error('storage');}catch{return {success:false,message:'Enable browser storage before saving to Sheet.'};}
    safeSetItem(key,serialized);return this.retryPendingBusinessWrite();
  }
  public async retryPendingBusinessWrite():Promise<BusinessWriteResult>{
    if(this.businessWriteFlight)return this.businessWriteFlight;
    const pending=this.getPendingBusinessWrite(),actor=this.currentUser,key=this.currentWriteKey(),endpoint=this.settings.appsScriptUrl,token=remoteSessionId(endpoint);
    if(!pending)return {success:true,message:''};
    if(!actor||!token)return {success:false,message:'Login again to retry the pending Sheet save.'};
    if(this.bulkPublishing)return {success:false,message:'Wait for Sheet publication to finish.'};
    const before=businessFingerprint(this.businessSnapshot()),wasClean=!this.hasUnsyncedBusinessData();
    if(!wasClean){const recovered=await this.recoverLegacyCache('RETRY_SAVE');if(!recovered.success)return recovered;return this.retryPendingBusinessWrite();}
    const run=async():Promise<BusinessWriteResult>=>{
      this.writeFeedback={key,status:'saving',message:'ກຳລັງບັນທຶກໄປ Sheet… (Saving to Sheet…)'};this.notify();
      if((pending.kind==='DELETE_CUSTOMER'||pending.kind==='DELETE_ALL_CUSTOMERS')&&!(this.deletionSupport?.endpoint===endpoint&&this.deletionSupport.actorId===actor.id&&this.deletionSupport.token===token)){
        const capability=await accountRequest(endpoint,'GET_BUSINESS_DATA');
        if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint)){this.setCurrentUser(null);return {success:false,message:'Login again. The delete receipt is retained.'};}
        if(this.currentUser?.id!==actor.id||this.settings.appsScriptUrl!==endpoint||remoteSessionId(endpoint)!==token)return {success:false,message:'Account changed; the delete receipt is retained.'};
        if(!capability.success||capability.deletionVersion!==1){const message=capability.success?'ກະລຸນາໃຫ້ Admin ຕິດຕັ້ງ Code.gs ໃໝ່ ແລະ Deploy → New version ເພື່ອລົບແຖວໃນ Sheet.':capability.message||'Could not verify Sheet deletion support';this.writeFeedback={key,status:'error',message};this.notify();return {success:false,message};}
        this.rememberDeletionSupport(capability,endpoint,actor.id,token);
      }
      const result=await accountRequest(endpoint,'MUTATE_BUSINESS',{id:pending.id,kind:pending.kind,data:pending.data});
      if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint)){this.setCurrentUser(null);return {success:false,message:'Login again. The save receipt is retained.'};}
      if(this.currentUser?.id!==actor.id||this.settings.appsScriptUrl!==endpoint||remoteSessionId(endpoint)!==token)return {success:false,message:'Account changed; the save receipt is retained for the original account.'};
      try{
        if(!result.success){
          if(result.writeVersion===1&&result.retryable===false){safeRemoveItem(key);if(pending.previousEndpoint)safeRemoveItem(businessWriteKey(actor.id,pending.previousEndpoint));}
          throw Error(result.message||'Sheet save failed');
        }
        if(result.writeVersion!==1||result.mutationId!==pending.id)throw Error('Update Code.gs and Deploy → New version to enable automatic Sheet saves.');
        if((pending.kind==='DELETE_CUSTOMER'||pending.kind==='DELETE_ALL_CUSTOMERS')&&result.deletionVersion!==1)throw Error('Update Code.gs and Deploy → New version to remove rows from Sheet. The delete receipt is retained.');
        const user=result.user;if(!user||user.id!==actor.id||!['ADMIN','TEAM_USER'].includes(user.role)||user.role!=='ADMIN'&&!/^B[1-7]$/.test(user.team))throw Error('Invalid Sheet write account');
        const scope=user.role==='ADMIN'?'ALL':user.team;if(result.scope!==scope)throw Error('Invalid Sheet write scope');
        const snapshot=validateBusinessSnapshot(result.snapshot,scope);
        if(before!==businessFingerprint(this.businessSnapshot()))throw Error('Local data changed while saving. Back up local edits before retrying.');
        // The acknowledged read is authoritative for the actor's whole scope.
        // It includes unrelated changes made by another browser while we saved.
        this.customers=snapshot.customers;this.conditions=snapshot.conditions;this.contracts=snapshot.contracts;
        this.budgets=snapshot.budgets;this.transactions=snapshot.transactions;
        this.rememberDeletionSupport(result,endpoint,actor.id,token);
        this.currentUser=user;safeSetItem(STORAGE_KEYS.AUTH,JSON.stringify(user));this.persistAll();this.recalculateContractStatuses();
        if(pending.kind==='REPRICE'){this.settings.pricePerCrate=Number(pending.data.price);safeSetItem(STORAGE_KEYS.SETTINGS,JSON.stringify(this.settings));}
        safeRemoveItem(key);if(pending.previousEndpoint)safeRemoveItem(businessWriteKey(actor.id,pending.previousEndpoint));if(wasClean)this.markBusinessSynced(endpoint,this.businessSnapshot(),result.businessRevision);
        this.writeFeedback={key,status:'saved',message:'ບັນທຶກໄປ Google Sheet ສຳເລັດ (Saved to Google Sheet)'};this.notify();
        return {success:true,message:result.message||'Saved to Google Sheet',entityId:result.entityId};
      }catch(error){const message=error instanceof Error?error.message:String(error);this.writeFeedback={key,status:'error',message};this.notify();return {success:false,message};}
    };
    this.businessWriteFlight=run();try{return await this.businessWriteFlight;}finally{this.businessWriteFlight=null;}
  }
  private annualBudgetsPrepared = false;
  private budgetCalendarDay = businessToday();
  private ensureAnnualBudgets() {
    if(this.annualBudgetsPrepared)return;
    const clean=!this.hasUnsyncedBusinessData();
    const projected=projectAnnualBudgets(this.contracts,this.budgets,this.transactions);
    if(JSON.stringify(projected.budgets)!==JSON.stringify(this.budgets)||JSON.stringify(projected.transactions)!==JSON.stringify(this.transactions)){
      this.budgets=projected.budgets;this.transactions=projected.transactions;this.persistAll();
      if(clean && this.settings.appsScriptUrl){let revision;try{revision=JSON.parse(this.businessBaselineText||'null')?.revision;}catch{}this.storeBusinessBaseline({endpoint:this.settings.appsScriptUrl,fingerprint:businessFingerprint(this.businessSnapshot()),revision});}
    }
    this.annualBudgetsPrepared=true;
  }
  public refreshBudgetCalendar() {
    if(this.budgetCalendarDay===businessToday())return;
    this.budgetCalendarDay=businessToday();this.recalculateContractStatuses();this.notify();
  }
  private sheetDataState: {status:'idle'|'loading'|'loaded'|'error'|'local';message:string} = {status:'idle',message:''};

  public getSheetDataState() { return this.sheetDataState; }
  private applySharedResponse(result:AccountResponse,actor:User):User {
    if(result.settingsVersion!==1)throw Error('Update Code.gs and deploy a new Web App version for shared Admin settings.');
    const common=sharedSettings(result.settings),user=result.user||actor;
    if(user.id!==actor.id || !['ADMIN','TEAM_USER'].includes(user.role) || user.role!=='ADMIN'&&!/^B[1-7]$/.test(user.team))throw Error('Invalid shared account scope');
    if(user.role!=='ADMIN'||!safeGetItem('mkt_shared_settings_pending_v1'))this.settings={...this.settings,...common};
    this.currentUser=user;safeSetItem(STORAGE_KEYS.AUTH,JSON.stringify(user));safeSetItem(STORAGE_KEYS.SETTINGS,JSON.stringify(this.settings));
    return user;
  }
  public async refreshSharedSettings():Promise<{success:boolean;message:string}> {
    const actor=this.currentUser,endpoint=this.settings.appsScriptUrl,token=remoteSessionId(endpoint);
    if(!actor||!token)return {success:false,message:'Sign in first'};
    try{
      const result=await accountRequest(endpoint,'GET_SHARED_SETTINGS');
      if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint)){this.setCurrentUser(null);return {success:false,message:'Login again after the database migration.'};}
      if(this.currentUser?.id!==actor.id||this.settings.appsScriptUrl!==endpoint||remoteSessionId(endpoint)!==token)return {success:false,message:'Account changed'};
      if(!result.success)throw Error(result.message||'Update Code.gs to load shared Admin settings.');
      this.applySharedResponse(result,actor);this.recalculateContractStatuses();this.notify();return {success:true,message:'Shared Admin settings loaded'};
    }catch(error){const message=error instanceof Error?error.message:String(error);this.sheetDataState={status:'error',message};this.notify();return {success:false,message};}
  }
  public markSharedSettingsPublished(published:unknown) {
    if(JSON.stringify(sharedSettings(published))===JSON.stringify(sharedSettings(this.settings)))safeRemoveItem('mkt_shared_settings_pending_v1');
  }
  private businessSnapshot(): BusinessSnapshot {
    return {customers:this.customers,conditions:this.conditions,contracts:this.contracts,budgets:this.budgets,transactions:this.transactions};
  }
  public exportBusinessBackup() { return JSON.parse(JSON.stringify(this.businessSnapshot())) as BusinessSnapshot; }
  public hasUnsyncedBusinessData(): boolean {
    const snapshot=this.businessSnapshot(), fingerprint=businessFingerprint(snapshot);
    try {
      const baseline=JSON.parse(this.businessBaselineText || 'null');
      const sameSheet=baseline?.endpoint===this.settings.appsScriptUrl || isRetiredBackend(baseline?.endpoint)&&this.settings.appsScriptUrl===DEPLOYED_BACKEND_URL;
      if(sameSheet && baseline.fingerprint===fingerprint) return false;
    } catch {}
    if(Object.values(snapshot).every(rows=>rows.length===0))return false;
    return fingerprint!==businessFingerprint(generateSeedData());
  }
  public markBusinessSynced(endpoint:string, snapshot:BusinessSnapshot=this.businessSnapshot(), revision?:string) {
    const fingerprint=businessFingerprint(snapshot);
    this.storeBusinessBaseline({endpoint,fingerprint,revision});
    if(this.sheetDataState.status==='local' && endpoint===this.settings.appsScriptUrl && fingerprint===businessFingerprint(this.businessSnapshot())){
      this.sheetDataState={status:'idle',message:'ບັນທຶກການແກ້ໄຂໄປ Sheet ແລ້ວ. ສາມາດໂຫຼດຂໍ້ມູນລ່າສຸດໄດ້.'};this.notify();
    }
  }
  public async loadBusinessFromSheets(replaceLocal=false,background=false): Promise<{success:boolean;message:string}> {
    const endpoint=this.settings.appsScriptUrl, actor=this.currentUser;
    const token=remoteSessionId(endpoint);
    if(!actor || !token)return {success:false,message:'Sign in to Sheets first.'};
    if(this.getPendingSheetPublish())return {success:false,message:'Finish or cancel the pending Sheet publication first. Uploaded data is retained.'};
    if(this.bulkPublishing)return {success:false,message:'Wait for the Excel/Sheet publication to finish.'};
    this.ensureAnnualBudgets();
    if(this.recoveryFlight)return this.recoveryFlight;
    if(this.businessWriteFlight||this.getPendingBusinessWrite()&&!(replaceLocal&&this.hasUnsyncedBusinessData()))return {success:false,message:'Finish the pending Sheet save before loading data.'};
    const sequence=++this.sheetLoadSequence;
    const publish=(status:typeof this.sheetDataState.status,message:string,success=false)=>{
      if(sequence===this.sheetLoadSequence){this.sheetDataState={status,message};this.notify();}
      return {success,message};
    };
    if(this.hasUnsyncedBusinessData())return this.recoverLegacyCache('LOAD_SHEET');
    const before=businessFingerprint(this.businessSnapshot());
    publish('loading','ກຳລັງໂຫຼດລູກຄ້າ ແລະງົບປະມານຈາກ Google Sheet…');
    try {
      const result=await accountRequest(endpoint,'GET_BUSINESS_DATA');
      if(sequence!==this.sheetLoadSequence)return {success:false,message:'Newer read started; old response ignored.'};
      if(this.currentUser?.id===actor.id&&this.settings.appsScriptUrl===endpoint&&!remoteSession(endpoint)){this.setCurrentUser(null);return publish('error','Login again after the database migration.');}
      if(this.currentUser?.id!==actor.id || this.settings.appsScriptUrl!==endpoint || remoteSessionId(endpoint)!==token)return publish('error','Session changed. Please load from Sheet again.');
      if(!result.success || result.dataVersion!==1 || result.settingsVersion!==1){
        const error=result.message || result.error || '';
        if(result.success || /Unsupported action|Unknown action/.test(error))throw Error('ກະລຸນາໃຫ້ Admin ອັບເດດ Code.gs ແລະ Deploy → New version ກ່ອນໂຫຼດຂໍ້ມູນຈາກ Sheet.');
        throw Error(error || 'Could not load Sheet data');
      }
      const authoritativeUser=this.applySharedResponse(result,actor);
      const scope=authoritativeUser.role==='ADMIN'?'ALL':authoritativeUser.team;
      if(authoritativeUser.role!=='ADMIN'&&!/^B[1-7]$/.test(scope))throw Error('Invalid assigned team');
      if(result.scope!==scope)throw Error('Unexpected Sheet data scope');
      const data=validateBusinessSnapshot(result.snapshot,scope);
      if(before!==businessFingerprint(this.businessSnapshot()))return publish('local','ມີການແກ້ຂໍ້ມູນຂະນະກຳລັງໂຫຼດ. ແອັບເກັບການແກ້ໄຂໄວ້; ກະລຸນາ Sync ຫຼືສຳຮອງກ່ອນ.');
      if(typeof result.businessRevision==='string'&&this.migratePendingSheetPublish(result.spreadsheetId||'',result.migratedFromSpreadsheetId||''))return publish('local',this.sheetPublishMessage);
      this.customers=data.customers;this.conditions=data.conditions;this.contracts=data.contracts;this.budgets=data.budgets;this.transactions=data.transactions;
      this.rememberDeletionSupport(result,endpoint,actor.id,token);
      const previousSheetId=this.settings.spreadsheetId;
      if(result.spreadsheetId)this.settings.spreadsheetId=result.spreadsheetId;
      this.markBusinessSynced(endpoint,this.businessSnapshot(),result.businessRevision);
      this.persistAll();
      this.recalculateContractStatuses();
      if(!background)this.logAction('LOAD_FROM_SHEETS',`Loaded ${data.customers.length} customers from Sheet, scope ${scope}.`);
      const migrated=typeof result.businessRevision==='string'&&this.migratePendingBusinessWrite(result.spreadsheetId||'',previousSheetId,result.migratedFromSpreadsheetId||'');
      const loaded=publish('loaded',`ໂຫຼດຈາກ Sheet ສຳເລັດ: ${data.customers.filter(customer=>customer.status!=='DELETED').length} ຮ້ານ (${scope}).`,true);
      if(migrated)await this.retryPendingBusinessWrite();
      return loaded;
    } catch(error){return publish('error',error instanceof Error?error.message:String(error));}
  }

  constructor() {
    this.init();
  }

  public init() {
    this.deletionSupport=null;
    this.businessBaselineText=safeGetItem('mkt_sheet_business_baseline_v1');
    this.annualBudgetsPrepared=false;
    try {
      const storedSettings = safeGetItem(STORAGE_KEYS.SETTINGS);
      this.settings = { ...INITIAL_SETTINGS, ...(storedSettings ? JSON.parse(storedSettings) : {}) };
      this.settings.appsScriptUrl = resolveBackendUrl(this.settings.appsScriptUrl, INITIAL_SETTINGS.appsScriptUrl);

      const storedUsers = safeGetItem(STORAGE_KEYS.USERS);
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
        // Ensure all users have passwords populated
        let updated = false;
        this.users.forEach((u) => {
          if (!u.password && !this.settings.appsScriptUrl) {
            u.password = u.username === 'admin' ? 'CHANGE_ME_ADMIN_PASSWORD' : `${u.username}_123`;
            updated = true;
          }
        });
        if (updated) {
          safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
        }
      } else {
        this.users = [...INITIAL_USERS];
        safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      }

      const storedAuth = safeGetItem(STORAGE_KEYS.AUTH);
      if (storedAuth) {
        this.currentUser = JSON.parse(storedAuth);
      } else if (!this.settings.appsScriptUrl) {
        // Default login as Admin for instant accessibility
        this.currentUser = this.users[0];
        safeSetItem(STORAGE_KEYS.AUTH, JSON.stringify(this.currentUser));
      } else this.currentUser = null;

      if (this.settings.appsScriptUrl && !this.hasRemoteUserSession()) this.currentUser = null;

      const storedCustomers = safeGetItem(STORAGE_KEYS.CUSTOMERS);
      if (storedCustomers) {
        this.customers = JSON.parse(storedCustomers);
        this.conditions = JSON.parse(safeGetItem(STORAGE_KEYS.CONDITIONS) || '[]');
        this.contracts = JSON.parse(safeGetItem(STORAGE_KEYS.CONTRACTS) || '[]');
        this.budgets = JSON.parse(safeGetItem(STORAGE_KEYS.BUDGETS) || '[]');
        this.transactions = JSON.parse(safeGetItem(STORAGE_KEYS.TRANSACTIONS) || '[]');
        this.logs = JSON.parse(safeGetItem(STORAGE_KEYS.LOGS) || '[]');

        // Sheet imports preserve the actual financial values, including zero and negative balances.
        if (!this.settings.appsScriptUrl && !safeGetItem('mkt_sheet_business_baseline_v1')) {
        // Synchronize and enforce formula: Annual Budget = Condition Quantity (crates) * Price per Crate
        const pricePerCrate = this.settings.pricePerCrate || 240000;
        let hasSyncChanges = false;
        const cartonSteps = [125, 200, 150, 250, 100, 300, 125, 350, 175, 500];

        this.customers.forEach((cust, idx) => {
          if (cust.status === 'DELETED') return;
          let cond = this.conditions.find((c) => c.customerCode === cust.code);
          if (!cond) {
            cond = {
              id: `CND-${cust.code}`,
              customerCode: cust.code,
              conditionQuantity: cartonSteps[idx % cartonSteps.length],
              conditionUOM: 'Cartons',
              conditionProductDescription: 'Beerlao Lager Can 330ml x 24',
              pricePerUnit: pricePerCrate,
              updatedAt: '2026-01-05'
            };
            this.conditions.push(cond);
            hasSyncChanges = true;
          } else if (!cond.conditionQuantity || cond.conditionQuantity <= 0) {
            cond.conditionQuantity = cartonSteps[idx % cartonSteps.length];
            cond.pricePerUnit = pricePerCrate;
            hasSyncChanges = true;
          }

          const budget = this.budgets.find((b) => b.customerCode === cust.code);
          if (budget) {
            const expectedAnnual = cond.conditionQuantity * pricePerCrate;
            if (budget.annualAmount !== expectedAnnual) {
              budget.annualAmount = expectedAnnual;
              budget.remainingAmount = Math.max(0, expectedAnnual - (budget.totalUsed || 0));
              budget.utilizationPercentage = expectedAnnual > 0
                ? Math.round(((budget.totalUsed || 0) / expectedAnnual) * 1000) / 10
                : 0;
              if (budget.totalUsed > budget.annualAmount) {
                budget.status = 'EXCEEDED';
              } else if (budget.utilizationPercentage >= 100) {
                budget.status = 'CRITICAL_100';
              } else if (budget.utilizationPercentage >= 80) {
                budget.status = 'WARNING_80';
              } else {
                budget.status = 'NORMAL';
              }
              hasSyncChanges = true;
            }
          }
        });

        if (hasSyncChanges) {
          this.persistAll();
        }
        }
      } else {
        if (this.settings.appsScriptUrl) {
          this.customers=[];this.conditions=[];this.contracts=[];this.budgets=[];this.transactions=[];this.logs=[];
          this.persistAll();
        } else this.initializeSeedData();
      }

      this.recalculateContractStatuses();
    } catch (e) {
      console.error('Storage initialization failed, resetting defaults', e);
      this.initializeSeedData();
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public resetToSeedData() {
    if(!this.canManageSettings())throw new Error('Admin permission required');
    if(this.getPendingBusinessWrite())throw Error('Finish the pending Sheet save first');
    this.initializeSeedData();
  }
  private initializeSeedData() {
    const seed = generateSeedData();
    this.customers = seed.customers;
    this.conditions = seed.conditions;
    this.contracts = seed.contracts;
    this.budgets = seed.budgets;
    this.transactions = seed.transactions;
    this.users = [...INITIAL_USERS];
    this.settings = { ...INITIAL_SETTINGS };
    this.logs = [
      {
        id: 'LOG-0001',
        timestamp: new Date().toISOString(),
        user: 'system',
        role: 'ADMIN',
        team: 'ALL',
        action: 'INITIALIZE_DATABASE',
        details: 'Initial import of 578 customers across teams B1-B7 from spreadsheet template.'
      }
    ];

    this.persistAll();
    this.notify();
  }

  private persistAll() {
    this.annualBudgetsPrepared=false;
    safeSetItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
    safeSetItem(STORAGE_KEYS.CONDITIONS, JSON.stringify(this.conditions));
    safeSetItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(this.contracts));
    safeSetItem(STORAGE_KEYS.BUDGETS, JSON.stringify(this.budgets));
    safeSetItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(this.transactions));
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
    safeSetItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    safeSetItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
  }

  // --- Auth & Permission System ---
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (user) {
      safeSetItem(STORAGE_KEYS.AUTH, JSON.stringify(user));
      this.logAction('USER_LOGIN', `User ${user.username} logged in (${user.role} - ${user.team})`);
    } else {
      safeRemoveItem(STORAGE_KEYS.AUTH);
    }
    this.notify();
  }

  public async login(username: string, password?: string): Promise<{ success: boolean; message?: string }> {
    if (!this.settings.appsScriptUrl) return this.loginLocally(username,password);
    const result = await accountRequest(this.settings.appsScriptUrl,'AUTH_LOGIN',{username,password});
    if (result.success && result.user) this.setCurrentUser(result.user);
    return {success:result.success,message:result.message};
  }

  public async backupDatabase():Promise<BusinessWriteResult>{
    if(!this.canManageSettings())return {success:false,message:'Admin permission required'};
    if(this.hasUnsyncedBusinessData()){const recovered=await this.recoverLegacyCache('MANUAL_BACKUP');if(!recovered.success)return recovered;}
    const result=await accountRequest(this.settings.appsScriptUrl,'BACKUP_DATABASE');return {success:result.success,message:result.message||'Database backup failed',entityId:result.backupId};
  }
  public hasRemoteUserSession() { return !!remoteSession(this.settings.appsScriptUrl); }
  private async remoteAccount(action: string, payload: Record<string, unknown> = {}, migratedLocalId?: string) {
    const result = await accountRequest(this.settings.appsScriptUrl,action,payload);
    if (result.success) {
      if (migratedLocalId) this.users = this.users.filter(user => user.id !== migratedLocalId);
      if (action === 'DELETE_USER') this.users = this.users.filter(user => user.id !== payload.id);
      if (action === 'UPDATE_USER' || action === 'RESET_USER_PASSWORD') this.users = this.users.map(user => user.id === payload.id ? { ...user, password:undefined } : user);
      if (action === 'UPDATE_PROFILE' && result.user) {
        this.users = this.users.map(user => user.id === result.user!.id ? result.user! : user);
        this.persistUsers();
      }
      if (result.users) {
        if (action !== 'SYNC_USERS' && this.users.some(user => user.password !== undefined)) {
          const local = this.users;
          this.users = result.users.map(user => {
            const old = local.find(item => item.username.toLowerCase() === user.username.toLowerCase());
            return old?.password && !old.password.startsWith('CHANGE_ME_') ? { ...user, password:old.password } : user;
          });
          this.users.push(...local.filter(user => user.password !== undefined && !result.users!.some(item => item.username.toLowerCase() === user.username.toLowerCase())));
        } else this.users = result.users;
        this.persistUsers();
      }
      if (result.user) this.setCurrentUser(result.user);
      this.notify();
    }
    return {success:result.success,message:result.message || (result.success ? 'Saved to Sheet USERS' : 'Account operation failed')};
  }
  private async mutateSheetUser(action: 'UPDATE_USER' | 'RESET_USER_PASSWORD', id: string, data: Partial<User>) {
    const local = this.users.find(user => user.id === id);
    const result = await this.remoteAccount(action,{...data,id});
    if (result.success || !/^(Error:\s*)?User not found$/i.test(result.message) || !local) return result;

    // Browser accounts have different IDs from server-created accounts. Resolve
    // the original username before changing it, and migrate only local records.
    const listing = await accountRequest(this.settings.appsScriptUrl,'GET_USERS');
    if (!listing.success || !listing.users) return {success:false,message:listing.message || 'Could not load Sheet users. Try again.'};
    const remote = listing.users.find(user => user.username.toLowerCase() === local.username.toLowerCase());
    if (remote) return this.remoteAccount(action,{...data,id:remote.id},id);
    if (local.password === undefined) return {success:false,message:'This user no longer exists in Sheet. Reload the user list before editing.'};
    const password = data.password || local.password;
    if (!password || password.startsWith('CHANGE_ME_') || password.length < 8) return {success:false,message:'ບັນຊີນີ້ຍັງຢູ່ໃນ browser. ກະລຸນາຕັ້ງລະຫັດໃໝ່ຢ່າງໜ້ອຍ 8 ຕົວ ເພື່ອບັນທຶກລົງ Sheet.'};
    return this.remoteAccount('ADD_USER',{
      username:local.username,fullName:local.fullName,email:local.email,
      role:local.role,team:local.team,isActive:local.isActive,...data,password
    },id);
  }
  public async syncUsersToSheets() {
    if (this.currentUser?.role !== 'ADMIN') return {success:false,message:'Admin permission required'};
    return this.remoteAccount('SYNC_USERS',{users:this.users});
  }
  public async loadUsersFromSheets() { return this.remoteAccount('GET_USERS'); }
  public async updateOwnProfile(data: Partial<User>) {
    if (!this.currentUser) return {success:false,message:'Sign in first'};
    if (!this.settings.appsScriptUrl) return this.updateUser(this.currentUser.id,data);
    return this.remoteAccount('UPDATE_PROFILE',data);
  }

  private loginLocally(username: string, password?: string): { success: boolean; message?: string } {
    const user = this.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (!user) {
      return { success: false, message: 'ບໍ່ພົບຊື່ຜູ້ໃຊ້ນີ້ໃນລະບົບ (Username not found)' };
    }
    if (!user.isActive) {
      return { success: false, message: 'ບັນຊີນີ້ຖືກປິດການໃຊ້ງານແລ້ວ (Account is disabled)' };
    }

    // Password verification
    if (password && user.password && password.trim() !== user.password) {
      return { success: false, message: 'ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ (Incorrect password)' };
    }

    // Update last login
    user.lastLogin = new Date().toISOString().replace('T', ' ').slice(0, 16);
    this.setCurrentUser(user);
    this.persistUsers();
    return { success: true };
  }

  public logout() {
    const endpoint = this.settings.appsScriptUrl;
    if (endpoint) {
      void accountRequest(endpoint,'AUTH_LOGOUT').finally(() => clearRemoteSession(endpoint));
    }
    if (this.currentUser) {
      this.logAction('USER_LOGOUT', `User ${this.currentUser.username} logged out`);
    }
    this.setCurrentUser(null);
  }

  public canAccessTeam(team: Team): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'ADMIN' || this.currentUser.team === 'ALL') return true;
    return this.currentUser.team === team;
  }

  public canEditCustomer(customerTeam: Team): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'ADMIN') return true;
    return this.currentUser.team === customerTeam;
  }

  public canDeleteCustomer(code: string): boolean {
    const customer = this.getCustomerByCode(code);
    return !!customer && customer.status !== 'DELETED' && this.canEditCustomer(customer.team);
  }

  public canManageUsers(): boolean {
    return this.currentUser?.role === 'ADMIN';
  }
  public canManageSettings():boolean { return this.currentUser?.role==='ADMIN'; }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.settings;
  }

  public getGoogleSheetsSnapshot() {
    if (this.currentUser?.role !== 'ADMIN') {
      throw new Error('Only Admin can sync the complete database to Google Sheets.');
    }
    if(this.getPendingBusinessWrite()||this.businessWriteFlight||this.recoveryFlight)throw Error('Finish the pending Sheet save before publishing a full snapshot.');
    this.ensureAnnualBudgets();
    let revision;try{revision=JSON.parse(this.businessBaselineText||'null')?.revision;}catch{}
    if(this.settings.appsScriptUrl&&!revision)throw Error('Load the latest Sheet before full publication. Back up existing local edits first.');
    const logIds=new Set<string>();let repaired=false;
    this.logs=this.logs.map(log=>{let id=log.id;if(!id||logIds.has(id)){id='LOG-'+crypto.randomUUID();repaired=true;}logIds.add(id);return id===log.id?log:{...log,id};});
    if(repaired)safeSetItem(STORAGE_KEYS.LOGS,JSON.stringify(this.logs));
    return JSON.parse(JSON.stringify({
      expectedBusinessRevision:revision,
      spreadsheetId: this.settings.spreadsheetId,
      customers: this.customers,
      conditions: this.conditions,
      contracts: this.contracts,
      budgets: this.budgets,
      transactions: this.transactions,
      logs: this.logs,
      settings: this.settings
    }));
  }

  public updateSettings(newSettings: Partial<AppSettings>) {
    if(!this.canManageSettings())throw new Error('Admin permission required');
    sharedSettings(newSettings);
    if(sharedSettingKeys.some(key=>newSettings[key]!==undefined&&newSettings[key]!==this.settings[key]))safeSetItem('mkt_shared_settings_pending_v1','true');
    this.settings = { ...this.settings, ...newSettings };
    this.settings.appsScriptUrl = resolveBackendUrl(this.settings.appsScriptUrl, INITIAL_SETTINGS.appsScriptUrl);
    const serialized = JSON.stringify(this.settings);
    safeSetItem(STORAGE_KEYS.SETTINGS, serialized);
    let persisted = false;
    try {
      persisted = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEYS.SETTINGS) === serialized;
    } catch {
      // The in-memory save still works, but a reload may lose these settings.
    }
    this.logAction('UPDATE_SETTINGS', 'Application settings updated');
    this.notify();
    return { persisted };
  }

  public recalculateBudgetsByPricePerCrate(newPrice: number): { success: boolean; updatedCount: number } {
    if(!this.canManageSettings()||this.getPendingBusinessWrite())return {success:false,updatedCount:0};
    this.ensureAnnualBudgets();
    this.settings.pricePerCrate = Number(newPrice);
    let updatedCount = 0;

    this.conditions.forEach((cond) => {
      if (this.getCustomerByCode(cond.customerCode)?.status === 'DELETED') return;
      cond.pricePerUnit = newPrice;
      const budget = this.getBudgetForCustomer(cond.customerCode);
      if (budget && cond.conditionQuantity > 0) {
        budget.annualAmount = cond.conditionQuantity * newPrice;
        this.budgets.filter(year=>year.contractId===budget.contractId&&(year.periodNumber||1)>(budget.periodNumber||1)).forEach(year=>{year.annualAmount=budget.annualAmount;refreshBudgetTotals(year);});
        budget.remainingAmount = budget.annualAmount - budget.totalUsed;
        budget.utilizationPercentage = budget.annualAmount > 0
          ? Math.round((budget.totalUsed / budget.annualAmount) * 1000) / 10
          : 0;

        if (budget.totalUsed > budget.annualAmount) {
          budget.status = 'EXCEEDED';
        } else if (budget.utilizationPercentage >= 100) {
          budget.status = 'CRITICAL_100';
        } else if (budget.utilizationPercentage >= 80) {
          budget.status = 'WARNING_80';
        } else {
          budget.status = 'NORMAL';
        }
        updatedCount++;
      }
    });

    this.persistAll();
    this.logAction(
      'RECALCULATE_BUDGETS',
      `Recalculated budgets for ${updatedCount} customers with price per crate = ${this.formatCurrency(newPrice)}`
    );
    this.notify();
    return { success: true, updatedCount };
  }

  // --- Currency Formatter ---
  public formatCurrency(amount: number): string {
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0
    }).format(Math.round(amount || 0));

    if (this.settings.currencyPosition === 'before') {
      return `${this.settings.currencySymbol} ${formatted}`;
    }
    return `${formatted} ${this.settings.currencySymbol}`;
  }

  // --- Contract Status Lifecycle Calculation ---
  private recalculateContractStatuses() {
    const today = businessToday();
    let modified = false;
    this.contracts.forEach((c) => {
      const days = (Date.parse(c.expiringOn)-Date.parse(today))/86400000;
      const newStatus:ContractStatus = today>c.expiringOn ? 'EXPIRED' : today<c.commencingOn ? 'UPCOMING' : days<=this.settings.contractAlertDays ? 'EXPIRING_SOON' : 'ACTIVE';
      if(newStatus!==c.status){c.status=newStatus;modified=true;}
    });

    if (modified) {
      localStorage.setItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(this.contracts));
    }
  }

  // --- Customers Query & Mutation ---
  public getCustomers(teamFilter?: Team | 'ALL', search?: string): Customer[] {
    let list = this.customers.filter(customer => customer.status !== 'DELETED');

    // RBAC: If team user, enforce assigned team strictly
    if (this.currentUser && this.currentUser.role !== 'ADMIN' && this.currentUser.team !== 'ALL') {
      list = list.filter((c) => c.team === this.currentUser!.team);
    } else if (teamFilter && teamFilter !== 'ALL') {
      list = list.filter((c) => c.team === teamFilter);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.mde.toLowerCase().includes(q) ||
          (c.province && c.province.toLowerCase().includes(q))
      );
    }

    return list;
  }

  public getCustomerByCode(code: string): Customer | undefined {
    return this.customers.find((c) => c.code === code);
  }

  public deleteCustomer(code: string): { success: boolean; message: string } {
    const customer = this.getCustomerByCode(code);
    if (!customer || customer.status === 'DELETED') return { success:false, message:'ບໍ່ພົບຮ້ານຄ້ານີ້ ຫຼືຮ້ານຖືກລົບແລ້ວ (Store not found or already deleted)' };
    if (!this.canDeleteCustomer(code)) return { success:false, message:'ທ່ານບໍ່ມີສິດລົບຮ້ານຂອງທີມອື່ນ (Permission denied)' };
    // Retain the record as a tombstone so manual Sheet upserts transmit the
    // deletion status and financial history never loses its customer reference.
    customer.status = 'DELETED';
    this.persistAll();
    this.logAction('DELETE_CUSTOMER', `Deleted store ${customer.name} (${customer.code}), Team ${customer.team}. Contract and transaction history retained.`);
    this.notify();
    return { success:true, message:'ລົບຮ້ານອອກຈາກລາຍຊື່ສຳເລັດ. ປະຫວັດສັນຍາ ແລະລາຍຈ່າຍຍັງເກັບໄວ້. (Store removed; history retained.)' };
  }

  public getCustomerCondition(customerCode: string): CustomerCondition | undefined {
    return this.conditions.find((c) => c.customerCode === customerCode);
  }

  public getCustomerContracts(customerCode: string): Contract[] {
    return this.contracts
      .filter((c) => c.customerCode === customerCode)
      .sort((a, b) => b.cycleNumber - a.cycleNumber);
  }

  public getActiveContract(customerCode: string): Contract | undefined {
    const list = this.getCustomerContracts(customerCode);
    return list.find((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON') || list[0];
  }

  public getContractBudgets(contractId:string):Budget[] {
    this.ensureAnnualBudgets();
    return this.budgets.filter(budget=>budget.contractId===contractId).sort((a,b)=>(a.periodNumber||1)-(b.periodNumber||1));
  }
  public getContractBudget(contractId: string, date=businessToday(), clamp=true): Budget | undefined {
    const contract=this.contracts.find(row=>row.id===contractId);
    const eligible=this.getContractBudgets(contractId).filter(budget=>!budget.periodStart||!contract||budget.periodStart>=contract.commencingOn&&budget.periodStart<=contract.expiringOn);
    return selectAnnualBudget(eligible,date,clamp);
  }
  public getContractForDate(customerCode:string,date:string):Contract|undefined {
    return this.getCustomerContracts(customerCode).find(contract=>date>=contract.commencingOn&&date<=contract.expiringOn);
  }

  public getBudgetForCustomer(customerCode: string): Budget | undefined {
    const contract = this.getActiveContract(customerCode);
    if (!contract) return undefined;
    return this.getContractBudget(contract.id);
  }

  // --- Transactions ---
  public getTransactions(filters?: {
    team?: Team | 'ALL';
    customerCode?: string;
    contractId?: string;
    category?: string;
    search?: string;
    status?: 'ACTIVE' | 'CANCELLED';
  }): BudgetTransaction[] {
    this.ensureAnnualBudgets();
    let list = [...this.transactions];

    // RBAC: Team User restriction
    if (this.currentUser && this.currentUser.role !== 'ADMIN' && this.currentUser.team !== 'ALL') {
      list = list.filter((t) => t.team === this.currentUser!.team);
    } else if (filters?.team && filters.team !== 'ALL') {
      list = list.filter((t) => t.team === filters.team);
    }

    if (filters?.customerCode) {
      list = list.filter((t) => t.customerCode === filters.customerCode);
    }

    if (filters?.contractId) {
      list = list.filter((t) => t.contractId === filters.contractId);
    }

    if (filters?.category && filters.category !== 'ALL') {
      list = list.filter((t) => t.category === filters.category);
    }

    if (filters?.status) {
      list = list.filter((t) => t.status === filters.status);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.customerCode.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.invoiceRef && t.invoiceRef.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addTransaction(data: {
    customerCode: string;
    category: string;
    description: string;
    amount: number;
    invoiceRef?: string;
    date: string;
    allowException?: boolean;
    exceptionReason?: string;
  }): { success: boolean; message: string; transaction?: BudgetTransaction } {
    const customer = this.getCustomerByCode(data.customerCode);
    if (!customer) {
      return { success: false, message: 'Customer not found' };
    }

    if (customer.status === 'DELETED') return { success:false, message:'ຮ້ານນີ້ຖືກລົບແລ້ວ (Store has been deleted)' };

    // Team validation
    if (!this.canAccessTeam(customer.team)) {
      return { success: false, message: 'ທ່ານບໍ່ມີສິດບັນທຶກລາຍຈ່າຍໃຫ້ລູກຄ້າທີມອື່ນ (Unauthorized)' };
    }

    const date=data.date||businessToday();
    if(!isCalendarDate(date))return {success:false,message:'ວັນທີລາຍຈ່າຍບໍ່ຖືກຕ້ອງ (Invalid date)'};
    const contract = this.getContractForDate(data.customerCode,date);
    if (!contract) {
      return { success: false, message: 'ບໍ່ພົບສັນຍາທີ່ກຳລັງດຳເນີນການສຳລັບລູກຄ້ານີ້' };
    }

    const budget = this.getContractBudget(contract.id,date,false);
    if (!budget) {
      return { success: false, message: 'ບໍ່ພົບງົບປະມານສຳລັບຮອບສັນຍານີ້' };
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0' };
    }

    // Budget limitation verification
    const newUsed = budget.totalUsed + amount;
    const remaining = budget.annualAmount - newUsed;

    if (remaining < 0) {
      // Over budget
      const isAdmin = this.currentUser?.role === 'ADMIN';
      if (!isAdmin && !data.allowException) {
        return {
          success: false,
          message: `ງົບປະມານບໍ່ພຽງພໍ! ຍັງເຫຼືອພຽງ ${this.formatCurrency(budget.remainingAmount)}, ຕ້ອງການໃຊ້ ${this.formatCurrency(amount)}. ຕ້ອງໄດ້ຮັບການອະນຸມັດພິເສດຈາກ Admin.`
        };
      }
    }

    // Create transaction
    const txnId = `TXN-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
    const newTxn: BudgetTransaction = {
      id: txnId,
      date,
      customerCode: customer.code,
      customerName: customer.name,
      team: customer.team,
      contractId: contract.id,
      budgetId: budget.id,
      category: data.category,
      description: data.description,
      amount,
      invoiceRef: data.invoiceRef || '',
      createdBy: this.currentUser?.username || 'user',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'ACTIVE'
    };

    // Update budget
    budget.totalUsed = newUsed;
    budget.remainingAmount = remaining;
    budget.utilizationPercentage = Math.round((newUsed / budget.annualAmount) * 1000) / 10;

    if (newUsed > budget.annualAmount) {
      budget.status = 'EXCEEDED';
      budget.allowException = true;
      budget.exceptionReason = data.exceptionReason || 'Admin authorized over-budget expenditure';
    } else if (budget.utilizationPercentage >= 100) {
      budget.status = 'CRITICAL_100';
    } else if (budget.utilizationPercentage >= 80) {
      budget.status = 'WARNING_80';
    } else {
      budget.status = 'NORMAL';
    }

    budget.updatedAt = new Date().toISOString();

    this.transactions.unshift(newTxn);
    this.persistAll();

    this.logAction(
      'ADD_TRANSACTION',
      `Recorded ${this.formatCurrency(amount)} for ${customer.name} (${customer.code}) [${data.category}]`
    );

    this.notify();
    return { success: true, message: 'ບັນທຶກລາຍຈ່າຍສຳເລັດແລ້ວ', transaction: newTxn };
  }

  public cancelTransaction(
    txnId: string,
    reason: string
  ): { success: boolean; message: string } {
    this.ensureAnnualBudgets();
    const txn = this.transactions.find((t) => t.id === txnId);
    if (!txn) {
      return { success: false, message: 'ບໍ່ພົບລາຍການນີ້' };
    }

    if (txn.status === 'CANCELLED') {
      return { success: false, message: 'ລາຍການນີ້ຖືກຍົກເລີກແລ້ວ' };
    }

    if (!this.canAccessTeam(txn.team)) {
      return { success: false, message: 'ທ່ານບໍ່ມີສິດຍົກເລີກລາຍການນີ້' };
    }

    // Revert budget
    const budget = this.budgets.find((b) => b.id === txn.budgetId);
    if (budget) {
      budget.totalUsed = Math.max(0, budget.totalUsed - txn.amount);
      budget.remainingAmount = budget.annualAmount - budget.totalUsed;
      budget.utilizationPercentage =
        budget.annualAmount > 0
          ? Math.round((budget.totalUsed / budget.annualAmount) * 1000) / 10
          : 0;

      if (budget.totalUsed > budget.annualAmount) {
        budget.status = 'EXCEEDED';
      } else if (budget.utilizationPercentage >= 100) {
        budget.status = 'CRITICAL_100';
      } else if (budget.utilizationPercentage >= 80) {
        budget.status = 'WARNING_80';
      } else {
        budget.status = 'NORMAL';
      }
      budget.updatedAt = new Date().toISOString();
    }

    txn.status = 'CANCELLED';
    txn.cancellationReason = reason;
    txn.cancelledBy = this.currentUser?.username || 'user';
    txn.cancelledAt = new Date().toISOString();

    this.persistAll();
    this.logAction(
      'CANCEL_TRANSACTION',
      `Cancelled transaction ${txnId} (${this.formatCurrency(txn.amount)}) - Reason: ${reason}`
    );

    this.notify();
    return { success: true, message: 'ຍົກເລີກລາຍການສຳເລັດແລ້ວ' };
  }

  // --- Contract Management & Cycle Renewals ---
  public addNewContractCycle(data: {
    customerCode: string;
    commencingOn: string;
    expiringOn: string;
    annualBudget: number;
    notes?: string;
  }): { success: boolean; message: string; contract?: Contract } {
    const customer = this.getCustomerByCode(data.customerCode);
    if (!customer) {
      return { success: false, message: 'Customer not found' };
    }

    if (customer.status === 'DELETED') return { success:false, message:'ຮ້ານນີ້ຖືກລົບແລ້ວ (Store has been deleted)' };

    if (this.currentUser?.role !== 'ADMIN') {
      return { success: false, message: 'ສະເພາະ Admin ເທົ່ານັ້ນທີ່ສາມາດສ້າງຮອບສັນຍາໃໝ່ໄດ້' };
    }

    const existingContracts = this.getCustomerContracts(data.customerCode);
    const nextCycleNumber = existingContracts.length + 1;
    const contractId = `CNT-${customer.code}-${String(nextCycleNumber).padStart(2, '0')}`;
    const budgetId = `BDG-${customer.code}-${String(nextCycleNumber).padStart(2, '0')}`;

    const newContract: Contract = {
      id: contractId,
      customerCode: customer.code,
      customerName: customer.name,
      team: customer.team,
      commencingOn: data.commencingOn,
      expiringOn: data.expiringOn,
      cycleNumber: nextCycleNumber,
      status: 'ACTIVE',
      notes: data.notes || `ສັນຍາຮອບທີ ${nextCycleNumber} ຂອງລູກຄ້າ ${customer.name}`,
      createdAt: new Date().toISOString()
    };

    const newBudget: Budget = {
      id: budgetId,
      contractId,
      customerCode: customer.code,
      team: customer.team,
      annualAmount: Number(data.annualBudget) || 0,
      totalUsed: 0,
      remainingAmount: Number(data.annualBudget) || 0,
      utilizationPercentage: 0,
      status: 'NORMAL',
      updatedAt: new Date().toISOString()
    };

    this.contracts.unshift(newContract);
    this.budgets.unshift(newBudget);
    this.persistAll();

    this.logAction(
      'NEW_CONTRACT_CYCLE',
      `Created cycle #${nextCycleNumber} for ${customer.name} (${customer.code}) with budget ${this.formatCurrency(data.annualBudget)}`
    );

    this.notify();
    return { success: true, message: 'ສ້າງຮອບສັນຍາໃໝ່ສຳເລັດແລ້ວ', contract: newContract };
  }

  // --- Budget Adjustments (Admin Only) ---
  public updateBudget(
    budgetId: string,
    newAmount: number,
    notes?: string
  ): { success: boolean; message: string } {
    if (this.currentUser?.role !== 'ADMIN') {
      return { success: false, message: 'ສະເພາະ Admin ເທົ່ານັ້ນທີ່ສາມາດປັບແກ້ງົບປະມານໄດ້' };
    }
    this.ensureAnnualBudgets();
    if(!Number.isFinite(Number(newAmount))||Number(newAmount)<0)return {success:false,message:'Invalid budget amount'};

    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) {
      return { success: false, message: 'ບໍ່ພົບງົບປະມານນີ້' };
    }
    if (this.getCustomerByCode(budget.customerCode)?.status === 'DELETED') return { success:false, message:'ຮ້ານນີ້ຖືກລົບແລ້ວ (Store has been deleted)' };

    const oldAmount = budget.annualAmount;
    budget.annualAmount = Number(newAmount);
    this.budgets.filter(year=>year.contractId===budget.contractId&&(year.periodNumber||1)>(budget.periodNumber||1)).forEach(year=>{year.annualAmount=budget.annualAmount;refreshBudgetTotals(year);});
    budget.remainingAmount = budget.annualAmount - budget.totalUsed;
    budget.utilizationPercentage =
      budget.annualAmount > 0
        ? Math.round((budget.totalUsed / budget.annualAmount) * 1000) / 10
        : 0;

    if (budget.totalUsed > budget.annualAmount) {
      budget.status = 'EXCEEDED';
    } else if (budget.utilizationPercentage >= 100) {
      budget.status = 'CRITICAL_100';
    } else if (budget.utilizationPercentage >= 80) {
      budget.status = 'WARNING_80';
    } else {
      budget.status = 'NORMAL';
    }

    budget.updatedAt = new Date().toISOString();
    this.persistAll();

    this.logAction(
      'UPDATE_BUDGET',
      `Adjusted budget for ${budget.customerCode} from ${this.formatCurrency(oldAmount)} to ${this.formatCurrency(newAmount)} (${notes || 'No note'})`
    );

    this.notify();
    return { success: true, message: 'ອັບເດດງົບປະມານສຳເລັດແລ້ວ' };
  }

  // --- Customer CRUD ---
  public addCustomer(data: {
    code: string;
    name: string;
    team: Team;
    conditionQty: number;
    conditionUOM: string;
    conditionProductDescription: string;
    commencingOn: string;
    expiringOn: string;
    annualBudget: number;
    phone?: string;
    address?: string;
    province?: string;
  }): { success: boolean; message: string } {
    // RBAC: Non-admin users can only add customers to their own assigned team
    if (this.currentUser && this.currentUser.role !== 'ADMIN' && this.currentUser.team !== 'ALL') {
      if (data.team !== this.currentUser.team) {
        return { success: false, message: 'ທ່ານສາມາດເພີ່ມລູກຄ້າສະເພາະທີມຂອງທ່ານເທົ່ານັ້ນ' };
      }
    }

    if (this.customers.some((c) => c.code.trim().toUpperCase() === data.code.trim().toUpperCase())) {
      return { success: false, message: 'ລະຫັດລູກຄ້ານີ້ມີຢູ່ໃນລະບົບແລ້ວ (Duplicate Customer Code)' };
    }

    const customerCode = data.code.trim().toUpperCase();
    const customer: Customer = {
      code: customerCode,
      name: data.name.trim(),
      team: data.team,
      mde: `MDE-${data.team}`,
      phone: data.phone || '',
      address: data.address || '',
      province: data.province || '',
      status: 'ACTIVE',
      createdAt: new Date().toISOString().slice(0, 10)
    };

    const condition: CustomerCondition = {
      id: `CND-${customerCode}`,
      customerCode,
      conditionQuantity: Number(data.conditionQty) || 0,
      conditionUOM: data.conditionUOM || 'Cartons',
      conditionProductDescription: data.conditionProductDescription || '',
      updatedAt: new Date().toISOString()
    };

    const contractId = `CNT-${customerCode}-01`;
    const budgetId = `BDG-${customerCode}-01`;

    const contract: Contract = {
      id: contractId,
      customerCode,
      customerName: customer.name,
      team: customer.team,
      commencingOn: data.commencingOn,
      expiringOn: data.expiringOn,
      cycleNumber: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const annualAmount = Number(data.annualBudget) || 0;
    const budget: Budget = {
      id: budgetId,
      contractId,
      customerCode,
      team: customer.team,
      annualAmount,
      totalUsed: 0,
      remainingAmount: annualAmount,
      utilizationPercentage: 0,
      status: 'NORMAL',
      updatedAt: new Date().toISOString()
    };

    this.customers.unshift(customer);
    this.conditions.unshift(condition);
    this.contracts.unshift(contract);
    this.budgets.unshift(budget);

    this.persistAll();
    this.logAction('ADD_CUSTOMER', `Created new customer ${customer.name} (${customerCode}) in Team ${data.team}`);
    this.notify();
    return { success: true, message: 'ເພີ່ມລູກຄ້າໃໝ່ສຳເລັດແລ້ວ' };
  }

  // --- User Management (Admin only) ---
  public getUsers(): User[] {
    return this.users;
  }

  public async addUser(data: {
    username: string;
    password?: string;
    fullName: string;
    role: 'ADMIN' | 'TEAM_USER';
    team: Team;
    email?: string;
  }): Promise<{ success: boolean; message: string }> {
    if (this.settings.appsScriptUrl) return this.remoteAccount('ADD_USER',data);
    if (this.users.some((u) => u.username.toLowerCase() === data.username.toLowerCase())) {
      return { success: false, message: 'ຊື່ຜູ້ໃຊ້ນີ້ມີຢູ່ແລ້ວ (Duplicate Username)' };
    }

    const newUser: User = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      username: data.username.trim(),
      password: data.password?.trim() || `${data.username.trim()}_123`,
      fullName: data.fullName.trim(),
      email: data.email || `${data.username}@example.invalid`,
      role: data.role,
      team: data.role === 'ADMIN' ? 'ALL' : data.team,
      isActive: true,
      createdAt: new Date().toISOString().slice(0, 10)
    };

    this.users.push(newUser);
    this.persistUsers();
    this.logAction('CREATE_USER', `Created user account ${newUser.username} (${newUser.role} - ${newUser.team})`);
    this.notify();
    return { success: true, message: 'ສ້າງຜູ້ໃຊ້ງານໃໝ່ສຳເລັດແລ້ວ' };
  }

  public async updateUser(
    id: string,
    data: Partial<Pick<User, 'username' | 'password' | 'fullName' | 'role' | 'team' | 'isActive' | 'email'>>
  ): Promise<{ success: boolean; message: string }> {
    if (this.settings.appsScriptUrl) return this.mutateSheetUser('UPDATE_USER',id,data);
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check duplicate username if username is changed
    if (data.username && data.username.toLowerCase() !== user.username.toLowerCase()) {
      if (this.users.some((u) => u.id !== id && u.username.toLowerCase() === data.username!.toLowerCase())) {
        return { success: false, message: 'ຊື່ຜູ້ໃຊ້ນີ້ມີຢູ່ແລ້ວ (Username already taken)' };
      }
    }

    Object.assign(user, data);
    if (user.role === 'ADMIN') {
      user.team = 'ALL';
    }

    // If current logged-in user is updated, update session
    if (this.currentUser && this.currentUser.id === id) {
      this.currentUser = { ...user };
      safeSetItem(STORAGE_KEYS.AUTH, JSON.stringify(this.currentUser));
    }

    this.persistUsers();
    this.logAction('UPDATE_USER', `Updated user ${user.username} (${user.fullName})`);
    this.notify();
    return { success: true, message: 'ອັບເດດຂໍ້ມູນຜູ້ໃຊ້ງານສຳເລັດແລ້ວ' };
  }

  public async resetUserPassword(id: string, newPassword?: string): Promise<{ success: boolean; message: string; password?: string }> {
    if (this.settings.appsScriptUrl) return this.mutateSheetUser('RESET_USER_PASSWORD',id,{password:newPassword});
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    const defaultPw = newPassword?.trim() || `${user.username}_123`;
    user.password = defaultPw;
    this.persistUsers();
    this.logAction('RESET_PASSWORD', `Reset password for user ${user.username}`);
    this.notify();
    return { success: true, message: `ຣີເຊັດລະຫັດຜ່ານສຳເລັດ: ${defaultPw}`, password: defaultPw };
  }

  public async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    if (this.settings.appsScriptUrl) return this.remoteAccount('DELETE_USER',{id});
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    if (user.username === 'admin') {
      return { success: false, message: 'ບໍ່ສາມາດລຶບບັນຊີຫຼັກ Admin ໄດ້' };
    }
    this.users = this.users.filter((u) => u.id !== id);
    this.persistUsers();
    this.logAction('DELETE_USER', `Deleted user ${user.username}`);
    this.notify();
    return { success: true, message: 'ລຶບບັນຊີຜູ້ໃຊ້ງານສຳເລັດແລ້ວ' };
  }

  private persistUsers() {
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
  }

  // --- Audit Logs ---
  public getLogs(limit = 100): ActivityLog[] {
    return this.logs.slice(0, limit);
  }

  public logAction(action: string, details: string) {
    const log: ActivityLog = {
      id: 'LOG-'+crypto.randomUUID(),
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      user: this.currentUser?.username || 'system',
      role: this.currentUser?.role || 'ADMIN',
      team: this.currentUser?.team || 'ALL',
      action,
      details
    };
    this.logs.unshift(log);
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(0, 500);
    }
    safeSetItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
  }

  // --- Dashboard Metrics Aggregator ---
  public getDashboardMetrics(selectedTeam?: Team | 'ALL'): DashboardMetrics {
    // If team user, enforce assigned team
    const effectiveTeam =
      this.currentUser && this.currentUser.role !== 'ADMIN' && this.currentUser.team !== 'ALL'
        ? this.currentUser.team
        : selectedTeam;

    const filteredCustomers = this.getCustomers(effectiveTeam);

    const customerCodes = new Set(filteredCustomers.map((c) => c.code));

    const filteredContracts = this.contracts.filter((c) => customerCodes.has(c.customerCode));
    const activeContracts = filteredContracts.filter((c) => c.status === 'ACTIVE').length;
    const expiringContracts = filteredContracts.filter((c) => c.status === 'EXPIRING_SOON').length;
    const expiredContracts = filteredContracts.filter((c) => c.status === 'EXPIRED').length;

    // Budgets for active contracts
    const filteredBudgets = filteredCustomers.map(customer=>this.getBudgetForCustomer(customer.code)).filter((budget):budget is Budget=>Boolean(budget));

    const totalAnnualBudget = filteredBudgets.reduce((acc, b) => acc + (b.annualAmount || 0), 0);
    const totalBudgetUsed = filteredBudgets.reduce((acc, b) => acc + (b.totalUsed || 0), 0);
    const totalRemainingBudget = totalAnnualBudget - totalBudgetUsed;
    const overallUtilizationRate =
      totalAnnualBudget > 0
        ? Math.round((totalBudgetUsed / totalAnnualBudget) * 1000) / 10
        : 0;

    // Per-Team Breakdown
    const teamBudgets = {} as DashboardMetrics['teamBudgets'];
    const teams: Team[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

    teams.forEach((t) => {
      const tCusts = this.getCustomers().filter((c) => c.team === t);
      const tCustCodes = new Set(tCusts.map((c) => c.code));
      const tBudgets = filteredBudgets.filter((b) => tCustCodes.has(b.customerCode));

      const annual = tBudgets.reduce((acc, b) => acc + (b.annualAmount || 0), 0);
      const used = tBudgets.reduce((acc, b) => acc + (b.totalUsed || 0), 0);
      const rem = annual - used;
      const util = annual > 0 ? Math.round((used / annual) * 1000) / 10 : 0;

      teamBudgets[t] = {
        customerCount: tCusts.length,
        annualBudget: annual,
        usedBudget: used,
        remainingBudget: rem,
        utilization: util
      };
    });

    // Category usage for active transactions
    const currentBudgetIds=new Set(filteredBudgets.map(budget=>budget.id));
    const filteredTxns = this.transactions.filter(
      (t) => customerCodes.has(t.customerCode) && currentBudgetIds.has(t.budgetId) && t.status === 'ACTIVE'
    );
    const categoryUsage: Record<string, number> = {};
    filteredTxns.forEach((t) => {
      categoryUsage[t.category] = (categoryUsage[t.category] || 0) + t.amount;
    });

    // Monthly usage
    const monthlyMap: Record<string, number> = {
      'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0,
      'Jul': 0, 'Aug': 0, 'Sep': 0, 'Oct': 0, 'Nov': 0, 'Dec': 0
    };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    filteredTxns.forEach((t) => {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        const m = monthNames[d.getMonth()];
        monthlyMap[m] = (monthlyMap[m] || 0) + t.amount;
      }
    });

    const monthlyUsage = monthNames.map((month) => ({
      month,
      amount: monthlyMap[month] || 0
    }));

    return {
      totalCustomers: filteredCustomers.length,
      totalAnnualBudget,
      totalBudgetUsed,
      totalRemainingBudget,
      overallUtilizationRate,
      activeContracts,
      expiringContracts,
      expiredContracts,
      teamBudgets,
      categoryUsage,
      monthlyUsage
    };
  }

  // --- CSV Import / Export Handler ---
  public importCustomersFromCsv(csvText: string): {
    success: boolean;
    importedCount: number;
    errors: string[];
  } {
    if(this.getPendingBusinessWrite()||this.recoveryFlight)return {success:false,importedCount:0,errors:['Finish the pending Sheet save first']};
    if(!this.canManageSettings())return {success:false,importedCount:0,errors:['Admin permission required']};
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { success: false, importedCount: 0, errors: ['CSV file is empty or invalid'] };
    }

    let importedCount = 0;
    const errors: string[] = [];

    // Columns: MDE, Customer Code, Customer Name, Condition Quantity, Condition UOM, Condition Product Code Description, Commencing On, Expiring On
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by comma or semicolon, handling quoted strings
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim());

      if (parts.length < 8) {
        errors.push(`Line ${i + 1}: Insufficient columns (expected 8, got ${parts.length})`);
        continue;
      }

      const [
        mdeRaw,
        customerCode,
        customerName,
        condQtyRaw,
        condUOM,
        condProdDesc,
        commencingOn,
        expiringOn
      ] = parts;

      if (!customerCode || !customerName) {
        errors.push(`Line ${i + 1}: Missing customer code or name`);
        continue;
      }

      // Map MDE-B1 -> B1
      const teamMatch = mdeRaw.match(/B[1-7]/i);
      const team: Team = teamMatch ? (teamMatch[0].toUpperCase() as Team) : 'B1';
      const mde = `MDE-${team}`;
      const conditionQuantity = parseFloat(condQtyRaw) || 0;

      // Check if customer exists
      let customer = this.getCustomerByCode(customerCode);
      if (!customer) {
        customer = {
          code: customerCode,
          name: customerName,
          team,
          mde,
          status: 'ACTIVE',
          createdAt: new Date().toISOString().slice(0, 10)
        };
        this.customers.push(customer);
      } else {
        // Update customer details preserving history
        customer.name = customerName;
        customer.team = team;
        customer.mde = mde;
      }

      // Condition
      let condition = this.getCustomerCondition(customerCode);
      if (!condition) {
        condition = {
          id: `CND-${customerCode}`,
          customerCode,
          conditionQuantity,
          conditionUOM: condUOM || 'Cartons',
          conditionProductDescription: condProdDesc || '',
          updatedAt: new Date().toISOString()
        };
        this.conditions.push(condition);
      } else {
        condition.conditionQuantity = conditionQuantity;
        condition.conditionUOM = condUOM || condition.conditionUOM;
        condition.conditionProductDescription = condProdDesc || condition.conditionProductDescription;
        condition.updatedAt = new Date().toISOString();
      }

      // Contract
      let contract = this.getActiveContract(customerCode);
      if (!contract) {
        const contractId = `CNT-${customerCode}-01`;
        const budgetId = `BDG-${customerCode}-01`;

        contract = {
          id: contractId,
          customerCode,
          customerName,
          team,
          commencingOn: commencingOn || '2026-01-01',
          expiringOn: expiringOn || '2026-12-31',
          cycleNumber: 1,
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        this.contracts.push(contract);

        const pricePerCrate = this.settings.pricePerCrate || 240000;
        const annualBudget = conditionQuantity > 0 ? conditionQuantity * pricePerCrate : 30000000;
        const budget: Budget = {
          id: budgetId,
          contractId,
          customerCode,
          team,
          annualAmount: annualBudget,
          totalUsed: 0,
          remainingAmount: annualBudget,
          utilizationPercentage: 0,
          status: 'NORMAL',
          updatedAt: new Date().toISOString()
        };
        this.budgets.push(budget);
      } else {
        if (commencingOn) contract.commencingOn = commencingOn;
        if (expiringOn) contract.expiringOn = expiringOn;
      }

      importedCount++;
    }

    this.persistAll();
    this.recalculateContractStatuses();
    this.logAction('IMPORT_CUSTOMERS', `Imported ${importedCount} customers from CSV file`);
    this.notify();

    return { success: true, importedCount, errors };
  }

  // --- Clear All Customers (Clean Slate for fresh Excel import) ---
  public clearAllCustomers(): { success: boolean; message: string } {
    if (this.currentUser?.role !== 'ADMIN') {
      return { success: false, message: 'ສະເພາະ Admin ເທົ່ານັ້ນທີ່ສາມາດລຶບລາຍຊື່ລູກຄ້າທັງໝົດໄດ້' };
    }

    const previousCount = this.customers.length;
    this.customers.forEach(customer=>{customer.status='DELETED';});
    this.persistAll();
    this.logAction(
      'CLEAR_ALL_CUSTOMERS',
      `Admin archived all ${previousCount} customers; contracts, budgets and transactions retained.`
    );
    this.notify();

    return {
      success: true,
      message: `ລົບຮ້ານ ${previousCount} ລາຍການອອກຈາກລາຍຊື່ແລ້ວ; ປະຫວັດລາຍຈ່າຍຍັງເກັບໄວ້.`
    };
  }

  // --- Import Customers from Parsed Excel/CSV Rows ---
  public importCustomersFromRawRows(
    rows: (string | number)[][],
    options: {
      replaceAll?: boolean;
      defaultAnnualBudget?: number;
    } = {}
  ): {
    success: boolean;
    importedCount: number;
    errors: string[];
  } {
    if(this.getPendingSheetPublish())return {success:false,importedCount:0,errors:['Finish or cancel the pending Sheet publication first']};
    if(this.getPendingBusinessWrite()||this.recoveryFlight)return {success:false,importedCount:0,errors:['Finish the pending Sheet save first']};
    if(!this.canManageSettings())return {success:false,importedCount:0,errors:['Admin permission required']};
    if (rows.length < 1) {
      return { success: false, importedCount: 0, errors: ['ໄຟລ໌ບໍ່ມີຂໍ້ມູນ (No rows found)'] };
    }


    const defaultBudget = options.defaultAnnualBudget || 30000000;
    const errors: string[] = [];
    let importedCount = 0;

    // Detect if first row is header
    let startIndex = 0;
    const firstRow = rows[0].map((cell) => String(cell || '').toLowerCase().trim());
    const isHeader =
      firstRow.some((c) => c.includes('mde') || c.includes('code') || c.includes('name') || c.includes('condition'));
    if (isHeader) {
      startIndex = 1;
    }

    // Helper to format date strings or Excel serial numbers
    const parseDateValue = (val: string | number | undefined, defaultDate: string): string => {
      if (!val) return defaultDate;
      if (typeof val === 'number') {
        // Excel serial date to JS date
        // Excel serials are calendar dates, independent of the browser timezone.
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
        if (!isNaN(jsDate.getTime())) {
          return jsDate.toISOString().slice(0, 10);
        }
      }
      const str = String(val).trim();
      // Try YYYY-MM-DD or DD/MM/YYYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
      return defaultDate;
    };

    const incomingCodes=new Set<string>();
    for(let i=startIndex;i<rows.length;i++){
      const row=rows[i];if(!row||row.every(cell=>String(cell??'').trim()===''))continue;
      const code=String(row[1]||'').trim().toUpperCase();
      if(!/^MDE-B[1-7]$/i.test(String(row[0]||'').trim()) || !code || !String(row[2]||'').trim() || incomingCodes.has(code) || !Number.isFinite(Number(row[3])) || Number(row[3])<0 || !parseDateValue(row[6],'') || !parseDateValue(row[7],'') || parseDateValue(row[6],'')>parseDateValue(row[7],'')){
        errors.push(`Row ${i+1}: invalid team, customer, quantity, dates, or duplicate customer code`);
      }
      incomingCodes.add(code);
    }
    if(errors.length||!incomingCodes.size)return {success:false,importedCount:0,errors:errors.length?errors:['No customer rows found']};
    if(options.replaceAll)this.customers.forEach(customer=>{if(!incomingCodes.has(customer.code))customer.status='DELETED';});
    const existingCodes = new Set(this.customers.map((c) => c.code.toUpperCase()));

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const mdeRaw = String(row[0] || '').trim();
      const customerCode = String(row[1] || '').trim().toUpperCase();
      const customerName = String(row[2] || '').trim();
      const condQtyRaw = Number(row[3]) || 0;
      const condUOM = String(row[4] || 'Cartons').trim();
      const condProdDesc = String(row[5] || '').trim();
      const commencingOn = parseDateValue(row[6], '2026-01-01');
      const expiringOn = parseDateValue(row[7], '2026-12-31');

      if (!customerCode && !customerName) continue;
      if (!customerCode || !customerName) {
        errors.push(`ແຖວທີ ${i + 1}: ລະຫັດ ຫຼື ຊື່ລູກຄ້າຫວ່າງເປົ່າ`);
        continue;
      }

      // Map MDE-B1 -> B1
      const teamMatch = mdeRaw.match(/B[1-7]/i);
      const team: Team = teamMatch ? (teamMatch[0].toUpperCase() as Team) : 'B1';
      const mde = `MDE-${team}`;

      let customer = this.getCustomerByCode(customerCode);
      if (!customer) {
        customer = {
          code: customerCode,
          name: customerName,
          team,
          mde,
          status: 'ACTIVE',
          createdAt: new Date().toISOString().slice(0, 10)
        };
        this.customers.push(customer);
        existingCodes.add(customerCode);
      } else {
        customer.name = customerName;
        customer.team = team;
        customer.mde = mde;
      }

      // Condition
      let condition = this.getCustomerCondition(customerCode);
      if (!condition) {
        condition = {
          id: `CND-${customerCode}`,
          customerCode,
          conditionQuantity: condQtyRaw,
          pricePerUnit:this.settings.pricePerCrate,
          conditionUOM: condUOM || 'Cartons',
          conditionProductDescription: condProdDesc || 'Standard Marketing Condition',
          updatedAt: new Date().toISOString()
        };
        this.conditions.push(condition);
      } else {
        condition.conditionQuantity = condQtyRaw;
        condition.pricePerUnit=this.settings.pricePerCrate;
        condition.conditionUOM = condUOM || condition.conditionUOM;
        condition.conditionProductDescription = condProdDesc || condition.conditionProductDescription;
        condition.updatedAt = new Date().toISOString();
      }

      // Contract
      let contract = this.getActiveContract(customerCode);
      if (!contract) {
        const contractId = `CNT-${customerCode}-01`;
        const budgetId = `BDG-${customerCode}-01`;

        contract = {
          id: contractId,
          customerCode,
          customerName,
          team,
          commencingOn,
          expiringOn,
          cycleNumber: 1,
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        this.contracts.push(contract);

        const annualAmount = row[3] === '' || row[3] === undefined ? defaultBudget : condQtyRaw * this.settings.pricePerCrate;

        const budget: Budget = {
          id: budgetId,
          contractId,
          customerCode,
          team,
          annualAmount: annualAmount,
          totalUsed: 0,
          remainingAmount: annualAmount,
          utilizationPercentage: 0,
          status: 'NORMAL',
          updatedAt: new Date().toISOString()
        };
        this.budgets.push(budget);
      } else {
        contract.customerName=customerName;contract.team=team;
        contract.commencingOn = commencingOn;
        contract.expiringOn = expiringOn;
        const budget=this.getContractBudget(contract.id);
        if(budget){
          budget.team=team;budget.annualAmount=row[3] === '' || row[3] === undefined ? defaultBudget : condQtyRaw*this.settings.pricePerCrate;
          budget.remainingAmount=budget.annualAmount-budget.totalUsed;
          budget.utilizationPercentage=budget.annualAmount>0?Math.round(budget.totalUsed/budget.annualAmount*1000)/10:0;
          budget.status=budget.totalUsed>budget.annualAmount?'EXCEEDED':budget.utilizationPercentage>=100?'CRITICAL_100':budget.utilizationPercentage>=80?'WARNING_80':'NORMAL';
          this.budgets.filter(year=>year.contractId===budget.contractId&&(year.periodNumber||1)>(budget.periodNumber||1)).forEach(year=>{year.annualAmount=budget.annualAmount;year.team=team;refreshBudgetTotals(year);});
          budget.updatedAt=new Date().toISOString();
        }
      }

      importedCount++;
    }

    this.persistAll();
    this.recalculateContractStatuses();
    this.logAction(
      'IMPORT_EXCEL_CUSTOMERS',
      `Imported ${importedCount} customers from Excel file (${options.replaceAll ? 'Replaced database' : 'Appended'})`
    );
    this.notify();

    return {
      success: true,
      importedCount,
      errors
    };
  }
}

export const storage = new StorageService();

