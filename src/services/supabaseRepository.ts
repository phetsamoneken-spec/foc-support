import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User, ActivityLog, Budget, Contract, Team } from '../types';
import { validateBusinessSnapshot, type BusinessSnapshot } from './businessData';
import { annualPeriods, businessToday } from './annualBudgets';
import type { BusinessWriteKind } from './businessWrites';

type Row = Record<string, any>;
export interface SupabaseOperation { p_kind: string; p_data: Record<string, unknown>; p_operation: string; p_expected: number | null }
export interface SupabaseSnapshot { user: User; users: User[]; logs: ActivityLog[]; business: BusinessSnapshot; versions: Map<string,number> }
export class SupabaseFailure extends Error {
  constructor(message: string, public code = '') { super(message); }
}
const check = (error: { message: string; code?: string } | null) => { if (error) throw new SupabaseFailure(error.message, error.code); };
function decimal(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n) || Math.abs(n)>Number.MAX_SAFE_INTEGER/100) throw Error('Invalid server financial value');
  return n;
}
// Keep exact decimal text in write transport; reject values outside safe UI cents.
export function money(value: unknown): string {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isSafeInteger(Math.round(Number(text) * 100))) throw Error('Enter a nonnegative amount with at most 2 decimal places');
  return text;
}
function profile(r: Row): User {
  if (!r || !r.is_active || r.status !== 'ACTIVE' || !['ADMIN','TEAM_USER'].includes(r.role) || (r.role === 'ADMIN' ? r.team !== 'ALL' : !/^B[1-7]$/.test(r.team))) throw new SupabaseFailure('Your account is inactive or has no assigned team', '42501');
  return {id:r.id,username:r.username,fullName:r.full_name,email:r.email,role:r.role,team:r.team,isActive:r.is_active,status:r.status,createdAt:r.created_at};
}
export class SupabaseRepository {
  readonly client: SupabaseClient;
  private versions = new Map<string, number>();
  constructor(url: string, key: string, client?: SupabaseClient) {
    if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) throw Error('Invalid Supabase URL');
    if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) throw Error('Use a publishable client key');
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (payload.role !== 'anon') throw Error('Privileged keys are forbidden in the browser');
    }
    this.client = client || createClient(url, key, {global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(20000)})},auth:{storageKey:'foc-supabase-auth-v1:'+new URL(url).host,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  }
  async login(email: string, password: string) {
    if (!email.includes('@')) throw Error('Use the email assigned to your Supabase account');
    const {error} = await this.client.auth.signInWithPassword({email:email.trim(),password}); check(error);
  }
  async logout() { const {error}=await this.client.auth.signOut({scope:'local'}); check(error); }
  async snapshot(): Promise<SupabaseSnapshot> {
    const auth=await this.client.auth.getUser(); check(auth.error);
    if (!auth.data.user || auth.data.user.is_anonymous) throw new SupabaseFailure('Sign in first','401');
    const {data,error}=await this.client.rpc('mkt_snapshot'); check(error);
    const user=profile(data?.profile);
    if (user.id !== auth.data.user.id) throw Error('Account changed');
    const names = new Map<string,string>((data.customers as Row[]).map(r=>[r.code,r.name]));
    const today=businessToday();
    const business=validateBusinessSnapshot({
      customers:data.customers.map((r:Row)=>({code:r.code,name:r.name,team:r.team,mde:r.mde,phone:r.phone||'',address:r.address||'',province:r.province||'',contactPerson:r.contact_person||'',status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,deletedAt:r.deleted_at})),
      conditions:data.conditions.map((r:Row)=>({id:r.id,customerCode:r.customer_code,conditionQuantity:decimal(r.condition_quantity),conditionUOM:r.condition_uom,conditionProductDescription:r.condition_product_description,...(r.price_per_unit===null?{}:{pricePerUnit:decimal(r.price_per_unit)}),updatedAt:r.updated_at})),
      contracts:data.contracts.map((r:Row)=>({id:r.id,customerCode:r.customer_code,customerName:names.get(r.customer_code)||'',team:r.team,commencingOn:r.commencing_on,expiringOn:r.expiring_on,cycleNumber:r.cycle_number,status:today<r.commencing_on?'UPCOMING':today>r.expiring_on?'EXPIRED':'ACTIVE',notes:r.notes||'',createdAt:r.created_at,updatedAt:r.updated_at})),
      budgets:data.budgets.map((r:Row)=>({id:r.id,contractId:r.contract_id,customerCode:r.customer_code,team:r.team,annualAmount:decimal(r.annual_amount),unallocatedUsed:decimal(r.unallocated_used),periodNumber:r.period_number,periodStart:r.period_start,periodEnd:r.period_end,totalUsed:decimal(r.total_used),remainingAmount:decimal(r.remaining_amount),utilizationPercentage:decimal(r.utilization_percentage),status:r.status,allowException:r.allow_exception,exceptionReason:r.exception_reason||'',updatedAt:r.updated_at})),
      transactions:data.transactions.map((r:Row)=>({id:r.id,budgetId:r.budget_id,contractId:r.contract_id,customerCode:r.customer_code,customerName:names.get(r.customer_code)||'',team:r.team,date:r.date,category:r.category,description:r.description,amount:decimal(r.amount),invoiceRef:r.invoice_ref||'',createdBy:r.created_by||r.legacy_created_by||'',createdAt:r.created_at,status:r.status,cancellationReason:r.cancellation_reason,cancelledBy:r.cancelled_by||r.legacy_cancelled_by,cancelledAt:r.cancelled_at})),
    },user.team);
    const versions=new Map<string,number>();
    for(const [table,rows] of Object.entries({customers:data.customers,conditions:data.conditions,contracts:data.contracts,budgets:data.budgets})) for(const row of rows as Row[]) {
      if(!Number.isSafeInteger(Number(row.version)) || Number(row.version)<1)throw Error('Invalid server version');
      versions.set(table+':'+(row.code||row.id),Number(row.version));
    }
    return {user,business,versions,users:data.users.map((r:Row)=>({id:r.id,username:r.username,fullName:r.full_name,email:r.email,role:r.role,team:r.team,isActive:r.is_active,status:r.status,createdAt:r.created_at})),logs:data.logs.map((r:Row)=>({id:r.id,timestamp:r.timestamp,user:r.actor_id||r.legacy_user||'',role:r.role,team:r.team,action:r.action,details:r.details}))};
  }
  acceptSnapshot(snapshot:SupabaseSnapshot){this.versions=new Map(snapshot.versions);}
  operations(kind: BusinessWriteKind, data: Record<string, any>, snapshot: BusinessSnapshot, user: User): SupabaseOperation[] {
    const ops:SupabaseOperation[]=[];
    const add=(p_kind:string,p_data:Record<string,unknown>,p_expected:number|null=null)=>ops.push({p_kind,p_data,p_operation:crypto.randomUUID(),p_expected});
    const version=(table:string,id:string)=>{const v=this.versions.get(table+':'+id);if(!v)throw Error('Refresh the latest data before saving');return v;};
    const customer=(code:string)=>{const c=snapshot.customers.find(c=>c.code===code&&c.status!=='DELETED');if(!c || user.role!=='ADMIN'&&user.team!==c.team)throw Error('Customer unavailable for this team');return c;};
    const newContract=(code:string)=>{
      if(user.role!=='ADMIN')throw Error('Admin creates contracts and initial budgets');
      const id='CT-'+crypto.randomUUID();
      const contract={commencingOn:data.commencingOn,expiringOn:data.expiringOn} as Contract;
      const periods=annualPeriods(contract);if(!periods.length)throw Error('Invalid contract dates');
      add('CREATE_CONTRACT',{id,customer_code:code,commencing_on:data.commencingOn,expiring_on:data.expiringOn,notes:data.notes||''});
      // An explicit initial amount is applied only to the first selected period.
      add('SAVE_BUDGET',{id:'BD-'+crypto.randomUUID(),customer_code:code,contract_id:id,period_number:1,annual_amount:money(data.annualBudget)});
    };
    if(kind==='ADD_CUSTOMER') {
      const code=String(data.code).trim().toUpperCase();
      if(user.role!=='ADMIN'&&data.team!==user.team)throw Error('Team denied');
      add('CREATE_CUSTOMER',{code,name:data.name,team:data.team,phone:data.phone||'',address:data.address||'',province:data.province||''});
      if(user.role==='ADMIN') {
        add('SAVE_CONDITION',{id:'CND-'+crypto.randomUUID(),customer_code:code,condition_quantity:data.conditionQty,condition_uom:data.conditionUOM,condition_product_description:data.conditionProductDescription});
        newContract(code);
      }
    } else if(kind==='UPDATE_CUSTOMER') {
      const c=customer(String(data.code));
      add('EDIT_CUSTOMER',{code:c.code,name:data.name,phone:data.phone||'',address:data.address||'',province:data.province||''},version('customers',c.code));
      if(user.role==='ADMIN' && data.conditionQty!==undefined) {
        const condition=snapshot.conditions.find(r=>r.customerCode===c.code);
        add('SAVE_CONDITION',{id:condition?.id||'CND-'+crypto.randomUUID(),customer_code:c.code,condition_quantity:data.conditionQty,condition_uom:data.conditionUOM,condition_product_description:data.conditionProductDescription},condition?version('conditions',condition.id):null);
      }
    } else if(kind==='DELETE_CUSTOMER') { const c=customer(String(data.customerCode));add('DELETE_CUSTOMER',{code:c.code},version('customers',c.code));
    } else if(kind==='NEW_CONTRACT') {customer(String(data.customerCode));newContract(String(data.customerCode));
    } else if(kind==='UPDATE_BUDGET') {
      const b=snapshot.budgets.find(b=>b.id===data.budgetId);if(!b)throw Error('Budget unavailable');customer(b.customerCode);
      add('SAVE_BUDGET',{id:b.id,customer_code:b.customerCode,contract_id:b.contractId,period_number:b.periodNumber,annual_amount:money(data.newAmount)},version('budgets',b.id));
    } else if(kind==='CREATE_BUDGET') {
      if(user.role!=='ADMIN')throw Error('Admin initializes budgets');
      const ct=snapshot.contracts.find(c=>c.id===data.contractId);if(!ct)throw Error('Contract unavailable');customer(ct.customerCode);
      add('SAVE_BUDGET',{id:'BD-'+crypto.randomUUID(),customer_code:ct.customerCode,contract_id:ct.id,period_number:data.periodNumber,annual_amount:money(data.newAmount)});
    } else if(kind==='ADD_TRANSACTION') {
      customer(String(data.customerCode));
      const ct=snapshot.contracts.find(c=>c.customerCode===data.customerCode&&data.date>=c.commencingOn&&data.date<=c.expiringOn);
      const b=snapshot.budgets.find(b=>b.contractId===ct?.id&&data.date>=b.periodStart!&&data.date<=b.periodEnd!);
      if(!b)throw Error('Admin must initialize this annual budget first');
      let v=version('budgets',b.id);
      if(data.allowException) {
        if(user.role!=='ADMIN'||!String(data.exceptionReason||'').trim())throw Error('Admin approval and reason required');
        add('SAVE_BUDGET',{id:b.id,customer_code:b.customerCode,contract_id:b.contractId,period_number:b.periodNumber,annual_amount:money(b.annualAmount),allow_exception:true,exception_reason:data.exceptionReason},v++);
      }
      add('ADD_TRANSACTION',{id:'TX-'+crypto.randomUUID(),budget_id:b.id,date:data.date,category:data.category,description:data.description,amount:money(data.amount),invoice_ref:data.invoiceRef||''},v);
    } else if(kind==='CANCEL_TRANSACTION') {
      const tx=snapshot.transactions.find(t=>t.id===data.txnId);if(!tx)throw Error('Transaction unavailable');customer(tx.customerCode);
      add('CANCEL_TRANSACTION',{id:tx.id,reason:data.reason},version('budgets',tx.budgetId));
    } else throw Error('This operation is not available for Supabase');
    return ops;
  }
  async mutate(operations:SupabaseOperation[]) { const {error}=await this.client.rpc('mkt_batch',{p_operations:operations});check(error); }
}
