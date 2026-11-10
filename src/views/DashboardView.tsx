import React from 'react';
import { Users, Wallet, TrendingUp, CheckCircle2, Plus, Calendar, FileSpreadsheet, ChartNoAxesCombined, ArrowUpRight, Bell, ChevronRight } from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TEAMS } from '../types';

interface DashboardViewProps {
  selectedTeam: Team | 'ALL'; onSelectTeam:(team:Team|'ALL')=>void;
  onNavigate:(view:string)=>void; onOpenAddTransaction:()=>void; onOpenAddContract:()=>void;
}
const chartColors=['#087C35','#D99A00','#4285A7','#9556A2','#F57C00','#56665A','#B04455','#728B31'];
export const DashboardView:React.FC<DashboardViewProps>=({selectedTeam,onSelectTeam,onNavigate,onOpenAddTransaction,onOpenAddContract})=>{
  const user=storage.getCurrentUser(),settings=storage.getSettings(),lang:Language=settings.language,t=translations[lang],lo=lang==='lo',admin=user?.role==='ADMIN';
  const metrics=storage.getDashboardMetrics(selectedTeam),money=storage.formatCurrency.bind(storage);
  const used=metrics.overallUtilizationRate,arc=Math.min(100,Math.max(0,used));
  const remainingRate=metrics.totalAnnualBudget>0?Math.max(0,100-used):0;
  const categories=Object.entries(metrics.categoryUsage).sort((a,b)=>b[1]-a[1]);
  const maxMonth=Math.max(...metrics.monthlyUsage.map(m=>m.amount),1);
  const visibleTeams=admin?TEAMS:TEAMS.filter(team=>team===user?.team);
  return <div className="gold-dashboard space-y-4">
    <section className="gold-greeting flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0"><span className="gold-avatar" aria-hidden="true">{user?.fullName?.charAt(0)||'M'}</span><div className="min-w-0"><h2 className="font-bold text-base sm:text-xl break-words">{lo?'ສະບາຍດີ, ':'Hello, '}{user?.fullName}</h2><p className="text-xs text-slate-600 mt-1">{lo?'ພາບລວມງົບປະມານ':'Budget overview'} · {admin?'Admin':user?.team}</p></div></div>
      {admin&&<select aria-label={lo?'ເລືອກທີມ':'Select team'} className="gold-team-select" value={selectedTeam} onChange={e=>onSelectTeam(e.target.value as Team)}><option value="ALL">{lo?'ທຸກທີມ':'All teams'}</option>{TEAMS.map(team=><option key={team}>{team}</option>)}</select>}
    </section>
    <div className="gold-kpi-grid">
      <button type="button" className="gold-total-card" onClick={()=>onNavigate('budgets')} aria-label={`${t.totalAnnualBudget}: ${money(metrics.totalAnnualBudget)}`}><span className="gold-total-icon"><Wallet size={30}/></span><span className="min-w-0"><span className="block text-sm font-semibold">{t.totalAnnualBudget}</span><strong className="gold-total-amount" data-testid="annual-total">{money(metrics.totalAnnualBudget)}</strong><span className="block text-[11px] mt-1">{lo?'ຮອບປີຕາມສັນຍາ':'Current contract anniversary periods'}</span></span><ArrowUpRight className="gold-total-arrow" size={18}/></button>
      <button type="button" className="gold-metric-card gold-used-card" onClick={()=>onNavigate('transactions')}><span className="flex items-center gap-2 text-xs"><CheckCircle2 size={18}/>{t.budgetUsed}</span><strong data-testid="used-total">{money(metrics.totalBudgetUsed)}</strong><span className="text-xs">{used}% {lo?'ນຳໃຊ້ແລ້ວ':'utilized'}</span></button>
      <button type="button" className={`gold-metric-card gold-remaining-card ${metrics.totalRemainingBudget<0?'gold-over-budget':''}`} onClick={()=>onNavigate('budgets')}><span className="flex items-center gap-2 text-xs"><Wallet size={18}/>{t.remainingBudget}</span><strong data-testid="remaining-total">{money(metrics.totalRemainingBudget)}</strong><span className="text-xs">{remainingRate.toFixed(1)}% {lo?'ຍັງເຫຼືອ':'available'}</span></button>
    </div>
    <div className="gold-analytics-grid">
      <section className="gold-card gold-utilization-card p-4" aria-labelledby="utilization-title">
        <div className="gold-donut" role="img" aria-label={`${t.utilizationRate}: ${used}%`} style={{background:metrics.totalAnnualBudget<=0?'#eee8d8':`conic-gradient(${used>=100?'#D32F2F':'#087C35'} 0% ${arc}%, #FFC400 ${arc}% 100%)`}}><div><span>{t.budgetUsed}</span><strong>{used}%</strong></div></div>
        <div className="min-w-0 flex-1"><h3 id="utilization-title" className="text-sm font-bold mb-3">{lo?'ການນຳໃຊ້ງົບປະມານ':'Budget utilization'}</h3><div className="space-y-2 text-xs"><p className="gold-legend"><i style={{background:'#087C35'}}/><span>{t.budgetUsed}</span><b>{used}%</b></p><p className="gold-legend"><i style={{background:'#FFC400'}}/><span>{t.remainingBudget}</span><b>{remainingRate.toFixed(1)}%</b></p></div><p className="mt-3 text-[10px] text-slate-500 leading-relaxed">{t.contractCycleNotice}</p></div>
      </section>
      <section className="gold-card p-4" aria-labelledby="monthly-title"><div className="flex items-center justify-between gap-2 mb-3"><h3 id="monthly-title" className="text-sm font-bold flex items-center gap-2"><ChartNoAxesCombined size={18} className="text-amber-700"/>{lo?'ການໃຊ້ຈ່າຍລາຍເດືອນ':'Monthly spending'}</h3><button type="button" className="gold-icon-button" aria-label={lo?'ເບິ່ງລາຍງານ':'View reports'} onClick={()=>onNavigate('reports')}><ArrowUpRight size={18}/></button></div>
        <div className="gold-month-chart" role="img" aria-label={lo?'ລາຍຈ່າຍຕົວຈິງໃນຮອບງົບປະມານປັດຈຸບັນ':'Actual spending in current budget periods'}>{metrics.monthlyUsage.map(item=><div key={item.month} className="gold-month-column"><div className="gold-month-track"><div style={{height:`${item.amount>0?Math.max(2,item.amount/maxMonth*100):0}%`}}/></div><span>{item.month}</span></div>)}</div>
        <details className="gold-chart-values mt-2"><summary>{lo?'ເບິ່ງຍອດແຕ່ລະເດືອນ':'View monthly amounts'}</summary><dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">{metrics.monthlyUsage.map(item=><div key={item.month} className="flex justify-between gap-2"><dt>{item.month}</dt><dd>{money(item.amount)}</dd></div>)}</dl></details>
      </section>
    </div>
    <section className="gold-quick-actions no-print" aria-label={lo?'ທາງລັດ':'Quick actions'}>
      <button type="button" onClick={onOpenAddTransaction}><span className="gold-action-green"><Plus/></span>{lo?'ເພີ່ມລາຍຈ່າຍ':'Add expense'}</button>
      <button type="button" onClick={()=>onNavigate('budgets')}><span className="gold-action-orange"><Wallet/></span>{lo?'ຈັດການງົບ':'Manage budget'}</button>
      <button type="button" onClick={admin?onOpenAddContract:()=>onNavigate('contracts')}><span className="gold-action-green"><Calendar/></span>{lo?'ສັນຍາ':'Contracts'}</button>
      <button type="button" onClick={()=>onNavigate('reports')}><span className="gold-action-gold"><ChartNoAxesCombined/></span>{lo?'ລາຍງານ':'Reports'}</button>
    </section>
    {(metrics.expiringContracts>0||metrics.expiredContracts>0||used>=80)&&<button type="button" className="gold-alert-row w-full" onClick={()=>onNavigate(used>=80?'budgets':'contracts')}><Bell size={19}/><span className="flex-1 text-left">{lo?'ລາຍການທີ່ຕ້ອງກວດສອບ':'Attention required'}<small className="block mt-1">{t.expiringContracts}: {metrics.expiringContracts} · {t.expiredContracts}: {metrics.expiredContracts}{used>=80?` · ${t.utilizationRate}: ${used}%`:''}</small></span><ChevronRight size={18}/></button>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="gold-card p-4"><div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm">{lo?'ລາຍຈ່າຍຕາມໝວດໝູ່':'Expenses by category'}</h3><TrendingUp size={18} className="text-slate-500"/></div>{categories.length===0?<p className="text-xs text-slate-500 py-4">{lo?'ຍັງບໍ່ມີລາຍຈ່າຍ':'No expenses recorded'}</p>:<div className="space-y-3">{categories.map(([category,amount],i)=><div key={category}><div className="flex items-start justify-between gap-3 text-xs mb-1"><span className="break-words min-w-0">{category}</span><strong className="text-right">{money(amount)}</strong></div><div className="gold-progress"><div style={{width:`${Math.min(100,amount/(metrics.totalBudgetUsed||1)*100)}%`,background:chartColors[i%chartColors.length]}}/></div></div>)}</div>}</section>
      <section className="gold-card p-4"><div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm">{lo?'ງົບປະມານແຕ່ລະທີມ':'Team budgets'}</h3><span className="gold-eyebrow">{selectedTeam==='ALL'?'B1–B7':selectedTeam}</span></div><div className="space-y-3">{visibleTeams.map(team=>{const item=metrics.teamBudgets[team];return <button type="button" key={team} className="gold-team-row" disabled={!admin} aria-pressed={selectedTeam===team} onClick={()=>onSelectTeam(selectedTeam===team?'ALL':team)}><span className="flex items-center justify-between gap-2 text-xs"><b>{team} · {item.customerCount} {lo?'ລູກຄ້າ':'customers'}</b><span>{item.utilization}%</span></span><span className="gold-progress mt-2"><span style={{display:'block',height:'100%',width:`${Math.min(100,item.utilization)}%`,background:item.utilization>=100?'#D32F2F':'#087C35'}}/></span><small className="block text-right mt-1">{money(item.usedBudget)} / {money(item.annualBudget)}</small></button>})}</div></section>
    </div>
    <div className="gold-summary-links"><button type="button" onClick={()=>onNavigate('customers')}><Users size={18}/><span>{t.totalCustomers}<b>{metrics.totalCustomers}</b></span><ChevronRight size={16}/></button><button type="button" onClick={()=>onNavigate('contracts')}><CheckCircle2 size={18}/><span>{t.activeContracts}<b>{metrics.activeContracts}</b></span><ChevronRight size={16}/></button>{admin&&<button type="button" onClick={()=>onNavigate('customers')}><FileSpreadsheet size={18}/><span>{lo?'ອັບໂຫຼດ Excel':'Upload Excel'}</span><ChevronRight size={16}/></button>}</div>
    {metrics.totalCustomers===0&&<p className="gold-card p-4 text-xs text-slate-600">{lo?'ຍັງບໍ່ມີຂໍ້ມູນລູກຄ້າ. Admin ສາມາດນຳເຂົ້າ Excel ໃນໜ້າລູກຄ້າ.':'No customer records. An administrator can import Excel from Customers.'}</p>}
    <p className="text-center text-[10px] text-slate-500">{lo?'ງົບປະມານ = ຈຳນວນລັງ × ລາຄາຕໍ່ລັງ':'Budget = quantity × price per crate'} · {money(settings.pricePerCrate)}/{lo?'ລັງ':'crate'}</p>
  </div>;
};
