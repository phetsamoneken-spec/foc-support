/**
 * Google Apps Script Web App Integration Service
 * Connects frontend PWA with backend Google Apps Script and Google Sheets
 * Spreadsheet ID: YOUR_SPREADSHEET_ID
 */

import { storage } from './storage';
import { accountRequest,remoteSessionId } from './remoteAccounts';
import {isSupabaseBackend,isBackendEndpoint,SUPABASE_PUBLISHABLE_KEY} from '../config/supabase';
import {publishWithLockRetry,type SheetPublishSource} from './sheetPublish';

export interface GasResponse<T = unknown> {
  success: boolean;
  syncVersion?: number;
  annualBudgetVersion?: number;
  businessRevision?:string;
  message?: string;
  data?: T;
  error?: string;
}

export class GasService {
  public static async saveSharedSettings():Promise<{success:boolean;message:string}>{
    if(!storage.canManageSettings())return {success:false,message:'Admin permission required'};
    const settings={...storage.getSettings()};
    const result=await this.sendToGas('SAVE_SHARED_SETTINGS',{settings});
    if(result.success && (result as {settingsVersion?:number}).settingsVersion!==1)return {success:false,message:'Update Code.gs and deploy a new Web App version to publish Admin settings.'};
    if(result.success)storage.markSharedSettingsPublished(settings);
    return {success:result.success===true,message:result.message||result.error||(result.success?'Admin settings saved to the shared Sheet.':'Settings were not published to the shared Sheet.')};
  }
  /**
   * Test connection to deployed Google Apps Script Web App
   */
  public static async testConnection(scriptUrl: string): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
    details?: unknown;
  }> {
    if (!isBackendEndpoint(scriptUrl)) {
      return {
        success: false,
        message: 'Invalid URL. Must start with https://script.google.com/macros/s/.../exec'
      };
    }

    const startTime = Date.now();
    try {
      // Use mode 'cors' or fallback to no-cors check
      const testEndpoint = `${scriptUrl}?action=ping&t=${Date.now()}`;
      
      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',...(isSupabaseBackend(scriptUrl)?{apikey:SUPABASE_PUBLISHABLE_KEY}:{})
        }
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          latencyMs,
          message: `Server returned HTTP ${response.status}: ${response.statusText}`
        };
      }

      const json = await response.json();
      return {
        success: json.success === true && json.ready !== false,
        latencyMs,
        message: json.message || json.error || (json.success === true ? (isSupabaseBackend(scriptUrl)?(json.ready?'Connected to Supabase.':'Supabase migration is still in progress.'):'Connected successfully to Google Apps Script!') : 'Backend rejected the connection check.'),
        details: json
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // Note on Google Apps Script CORS:
      // Google Apps Script redirect can sometimes trigger CORS in simple browser fetch if ContentService.MimeType is not TEXT/JSON.
      return {
        success: false,
        latencyMs,
        message: `Connection failed: ${errorMsg}. Please ensure Google Apps Script Web App is deployed with 'Execute as: Me' and 'Who has access: Anyone'.`
      };
    }
  }

  /**
   * Post action to Google Apps Script Web App
   */
  public static async sendToGas(
    action: string,
    payload: Record<string, unknown>,
    scriptUrl?: string
  ): Promise<GasResponse> {
    const settings = storage.getSettings();
    const endpoint = (scriptUrl || settings.appsScriptUrl).trim();
    if (!endpoint) {
      return {
        success: false,
        message: 'Google Apps Script URL is not configured. Using local persistence.'
      };
    }

    return accountRequest(endpoint,action,payload);
  }

  /**
   * Sync complete local state to Google Sheets via GAS
   */
  public static async syncAllToGoogleSheets(scriptUrl?: string,source:SheetPublishSource={}): Promise<{
    success: boolean;
    message: string;
  }> {
    const settings=storage.getSettings(),endpoint=(scriptUrl||settings.appsScriptUrl).trim();
    if(!isBackendEndpoint(endpoint))return {success:false,message:'Use the deployed Google Apps Script URL ending in /exec.'};
    if(!storage.canManageSettings())return {success:false,message:'Admin permission required'};
    const actor=storage.getCurrentUser()!,token=remoteSessionId(endpoint);
    const sameAccount=()=>storage.getCurrentUser()?.id===actor.id&&storage.canManageSettings()&&remoteSessionId(endpoint)===token&&storage.getSettings().appsScriptUrl===settings.appsScriptUrl;
    try{storage.beginBulkPublish();}catch(error){return {success:false,message:error instanceof Error?error.message:String(error)};}
    try{
      const pending=storage.getPendingSheetPublish(endpoint)||storage.savePendingSheetPublish(endpoint,storage.getGoogleSheetsSnapshot(),source);
      storage.setSheetPublishMessage('ກຳລັງສົ່ງຂໍ້ມູນໄປ Sheet…');
      const res=await publishWithLockRetry(
        ()=>sameAccount()?this.sendToGas('SYNC_BULK_DATA',pending.payload,endpoint):Promise.resolve({success:false,message:'Account changed. The pending publication is retained for its original account.'}),
        (attempt,delayMs)=>storage.setSheetPublishMessage(`Sheet ກຳລັງໃຊ້ງານ. ຈະລອງສົ່ງຊ້ຳ ${attempt}/3 ໃນ ${delayMs/1000} ວິນາທີ…`)
      );
      if(!sameAccount())return {success:false,message:'Account changed. The pending publication is retained for its original account.'};
      if(res.success===true&&(res.syncVersion!==2||res.annualBudgetVersion!==1)){
        const message='The backend is still the old version. Deploy the unified Code.gs as a new Web App version, then sync again.';storage.setSheetPublishMessage(message);return {success:false,message};
      }
      const message=res.message||res.error||(res.success?'Synced successfully to Google Sheets!':'Sync failed.');
      if(res.success){
        storage.markBusinessSynced(endpoint,pending.payload as unknown as import('./businessData').BusinessSnapshot,res.businessRevision);
        storage.markSharedSettingsPublished(pending.payload.settings);
        storage.completeSheetPublish(endpoint,pending.id);
      }else storage.setSheetPublishMessage(message);
      return {success:res.success===true,message};
    }catch(error){const message=error instanceof Error?error.message:String(error);storage.setSheetPublishMessage(message);return {success:false,message};}
    finally{storage.endBulkPublish();}
  }
}
