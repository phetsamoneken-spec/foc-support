import React, {useEffect,useState} from 'react';
import {BrandLogo} from '../components/BrandLogo';
import {Download,Printer} from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TEAMS } from '../types';

interface ReportsViewProps {
  selectedTeam: Team | 'ALL';
  onSelectTeam: (team: Team | 'ALL') => void;
}

type ReportField={label:string;value:React.ReactNode;tone?:'used'|'remaining'};
function ReportRecord({title,subtitle,fields}:{title:string;subtitle?:React.ReactNode;fields:ReportField[]}){
  return <article className="report-record"><div className="report-record-heading"><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div><dl>{fields.map((field,index)=><div key={index}><dt>{field.label}</dt><dd className={field.tone?`report-value-${field.tone}`:undefined}>{field.value}</dd></div>)}</dl></article>;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  selectedTeam,
  onSelectTeam
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];
  const isAdmin = currentUser?.role === 'ADMIN';

  const [reportType, setReportType] = useState<'SUMMARY_BY_TEAM' | 'CUSTOMER_BALANCES' | 'EXPENSES_BY_CATEGORY' | 'TRANSACTION_AUDIT'>('SUMMARY_BY_TEAM');
  const [rowLimit,setRowLimit]=useState(100);
  useEffect(()=>setRowLimit(100),[reportType,selectedTeam]);

  const metrics = storage.getDashboardMetrics(selectedTeam);
  const customers = storage.getCustomers(selectedTeam);
  const transactions = storage.getTransactions({ team: selectedTeam });

  const scopedTeams=TEAMS.filter(team=>isAdmin?(selectedTeam==='ALL'||selectedTeam===team):team===currentUser?.team);
  const shownCustomers=customers.slice(0,rowLimit),shownTransactions=transactions.slice(0,rowLimit);
  const customerRows=reportType==='CUSTOMER_BALANCES'?shownCustomers.map(customer=>{const contract=storage.getActiveContract(customer.code),budget=storage.getBudgetForCustomer(customer.code);return {customer,contract,budget,util:budget?.utilizationPercentage||0};}):[];
  const reportTitles={
    SUMMARY_BY_TEAM:lang==='lo'?'ສະຫຼຸບຕາມທີມ':'Team summary',
    CUSTOMER_BALANCES:lang==='lo'?'ຍອດເຫຼືອລູກຄ້າ':'Customer balances',
    EXPENSES_BY_CATEGORY:lang==='lo'?'ຕາມໝວດລາຍຈ່າຍ':'Expenses by category',
    TRANSACTION_AUDIT:lang==='lo'?'ປະຫວັດລາຍຈ່າຍ':'Transaction audit'
  };
  const rowCount=reportType==='CUSTOMER_BALANCES'?customers.length:reportType==='TRANSACTION_AUDIT'?transactions.length:0;
  const generatedDate=new Date().toLocaleDateString(lang==='lo'?'lo-LA':'en-GB',{day:'2-digit',month:'2-digit',year:'numeric',calendar:'gregory'});
  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filename = `MKT_Report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (reportType === 'SUMMARY_BY_TEAM') {
      headers = ['Team', 'Customers', 'Annual Budget', 'Used Budget', 'Remaining Budget', 'Utilization (%)'];
      rows = scopedTeams.map((tm) => {
        const tb = metrics.teamBudgets[tm];
        return [
          tm,
          tb.customerCount,
          tb.annualBudget,
          tb.usedBudget,
          tb.remainingBudget,
          tb.utilization
        ];
      });
    } else if (reportType === 'CUSTOMER_BALANCES') {
      headers = [
        'Customer Code',
        'Customer Name',
        'Team',
        'Contract Start',
        'Contract End',
        'Annual Budget',
        'Used Budget',
        'Remaining Budget',
        'Utilization (%)'
      ];
      rows = customers.map((c) => {
        const contract = storage.getActiveContract(c.code);
        const budget = storage.getBudgetForCustomer(c.code);
        return [
          c.code,
          `"${c.name.replace(/"/g, '""')}"`,
          c.team,
          contract?.commencingOn || '',
          contract?.expiringOn || '',
          budget?.annualAmount || 0,
          budget?.totalUsed || 0,
          budget?.remainingAmount || 0,
          budget?.utilizationPercentage || 0
        ];
      });
    } else if (reportType === 'EXPENSES_BY_CATEGORY') {
      headers = ['Category', 'Total Spent', 'Percentage of Total Used (%)'];
      const totalUsed = metrics.totalBudgetUsed || 1;
      rows = Object.entries(metrics.categoryUsage).map(([cat, amt]) => [
        `"${cat}"`,
        amt,
        Math.round((amt / totalUsed) * 1000) / 10
      ]);
    } else {
      headers = [
        'Transaction ID',
        'Date',
        'Customer Code',
        'Customer Name',
        'Team',
        'Category',
        'Description',
        'Amount',
        'Invoice Ref',
        'Created By',
        'Status'
      ];
      rows = transactions.map((txn) => [
        txn.id,
        txn.date,
        txn.customerCode,
        `"${txn.customerName.replace(/"/g, '""')}"`,
        txn.team,
        `"${txn.category}"`,
        `"${txn.description.replace(/"/g, '""')}"`,
        txn.amount,
        txn.invoiceRef || '',
        txn.createdBy,
        txn.status
      ]);
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  return <div className="reports-view space-y-4">
    <div className="report-toolbar no-print"><div><h2 className="text-xl font-black text-slate-900">{t.navReports}</h2><p className="text-xs text-slate-600 mt-1">{lang==='lo'?'ສະຫຼຸບງົບປະມານ ແລະລາຍຈ່າຍຕາມຂໍ້ມູນຈິງ':'Budget and spending reports from your current data'}</p></div><div className="report-export-actions"><button type="button" onClick={handleExportCsv} className="report-export-button"><Download size={17}/><span>{t.exportExcel} / CSV</span></button><button type="button" onClick={handlePrint} className="report-print-button"><Printer size={17}/><span>{t.printReport}</span></button></div></div>
    <div className="report-type-options no-print" role="group" aria-label={lang==='lo'?'ປະເພດລາຍງານ':'Report type'}>{(Object.keys(reportTitles) as (keyof typeof reportTitles)[]).map(type=><button key={type} type="button" aria-pressed={reportType===type} onClick={()=>setReportType(type)}>{reportTitles[type]}</button>)}</div>
    <section className="report-document bg-white" aria-label={lang==='lo'?'ເອກະສານລາຍງານ':'Report document'}>
      <div className="report-document-header"><div className="report-identity"><div className="report-brand"><BrandLogo size={44} decorative/><h1>{t.appName}</h1></div><p>{lang==='lo'?'ລາຍງານງົບປະມານ ແລະສັນຍາລູກຄ້າ':'Customer budget & contract performance report'}</p></div><dl className="report-metadata"><div><dt>{lang==='lo'?'ວັນທີລາຍງານ':'Report date'}</dt><dd>{generatedDate}</dd></div><div><dt>{lang==='lo'?'ຂອບເຂດທີມ':'Team scope'}</dt><dd>{selectedTeam==='ALL'?(isAdmin?t.allTeams:currentUser?.team):selectedTeam}</dd></div><div className="report-author"><dt>{lang==='lo'?'ຈັດທຳໂດຍ':'Prepared by'}</dt><dd>{currentUser?.fullName} · {isAdmin?'Admin':currentUser?.team}</dd></div></dl></div>
      <dl className="report-kpis"><div><dt>{t.totalCustomers}</dt><dd data-report-kpi="customers">{metrics.totalCustomers}</dd></div><div><dt>{t.totalAnnualBudget}</dt><dd data-report-kpi="annual">{storage.formatCurrency(metrics.totalAnnualBudget)}</dd></div><div><dt>{t.totalBudgetUsed}</dt><dd data-report-kpi="used" className="report-value-used">{storage.formatCurrency(metrics.totalBudgetUsed)}</dd></div><div><dt>{t.totalRemainingBudget}</dt><dd data-report-kpi="remaining" className="report-value-remaining">{storage.formatCurrency(metrics.totalRemainingBudget)}</dd></div></dl>
      <h2 className="report-section-title">{reportTitles[reportType]}</h2>
      <div className="report-mobile-records">
        {reportType==='SUMMARY_BY_TEAM'&&scopedTeams.map(team=>{const budget=metrics.teamBudgets[team];return <ReportRecord key={team} title={`${t.team} ${team}`} subtitle={`${budget.customerCount} ${lang==='lo'?'ລູກຄ້າ':'customers'}`} fields={[{label:t.annualBudget,value:storage.formatCurrency(budget.annualBudget)},{label:t.budgetUsed,value:storage.formatCurrency(budget.usedBudget),tone:'used'},{label:t.remainingBudget,value:storage.formatCurrency(budget.remainingBudget),tone:'remaining'},{label:t.utilizationRate,value:`${budget.utilization}%`}]}/>;})}
        {reportType==='CUSTOMER_BALANCES'&&customerRows.map(({customer,contract,budget})=>{return <ReportRecord key={customer.code} title={customer.name} subtitle={`${customer.code} · ${customer.team}`} fields={[{label:t.contractPeriod,value:contract?`${contract.commencingOn} → ${contract.expiringOn}`:'—'},{label:t.annualBudget,value:storage.formatCurrency(budget?.annualAmount||0)},{label:t.budgetUsed,value:storage.formatCurrency(budget?.totalUsed||0),tone:'used'},{label:t.remainingBudget,value:storage.formatCurrency(budget?.remainingAmount||0),tone:'remaining'},{label:t.utilizationRate,value:`${budget?.utilizationPercentage||0}%`}]}/>;})}
        {reportType==='EXPENSES_BY_CATEGORY'&&Object.entries(metrics.categoryUsage).sort((a,b)=>b[1]-a[1]).map(([category,amount])=><ReportRecord key={category} title={category} fields={[{label:t.amount,value:storage.formatCurrency(amount),tone:'used'},{label:lang==='lo'?'ສັດສ່ວນຂອງລາຍຈ່າຍ':'Share of total spending',value:`${Math.round(amount/(metrics.totalBudgetUsed||1)*1000)/10}%`}]} />)}
        {reportType==='TRANSACTION_AUDIT'&&shownTransactions.map(transaction=><ReportRecord key={transaction.id} title={transaction.customerName} subtitle={`${transaction.id} · ${transaction.team}`} fields={[{label:t.date,value:transaction.date},{label:t.category,value:transaction.category},{label:t.amount,value:storage.formatCurrency(transaction.amount)},{label:t.invoiceRef,value:transaction.invoiceRef||'—'},{label:t.createdBy,value:transaction.createdBy}]}/>)}
      </div>
        {/* Report Content Table */}
        {reportType === 'SUMMARY_BY_TEAM' && (
          <div className="report-table-wrap">
            <table aria-label={reportTitles[reportType]} className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">{t.team}</th>
                  <th className="py-2.5 px-3 text-center">{t.totalCustomers}</th>
                  <th className="py-2.5 px-3 text-right">{t.annualBudget}</th>
                  <th className="py-2.5 px-3 text-right">{t.budgetUsed}</th>
                  <th className="py-2.5 px-3 text-right">{t.remainingBudget}</th>
                  <th className="py-2.5 px-3 text-center">{t.utilizationRate}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {scopedTeams.map((tm) => {
                  const tb = metrics.teamBudgets[tm];
                  return (
                    <tr key={tm} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">Team {tm}</td>
                      <td className="py-2.5 px-3 text-center">{tb.customerCount}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">{storage.formatCurrency(tb.annualBudget)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-700 font-semibold">{storage.formatCurrency(tb.usedBudget)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{storage.formatCurrency(tb.remainingBudget)}</td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] ${
                          tb.utilization >= 100 ? 'bg-rose-100 text-rose-800' : tb.utilization >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {tb.utilization}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/80 font-black border-t-2 border-slate-300">
                  <td className="py-3 px-3">{lang === 'lo' ? 'ລວມທັງໝົດ' : 'Total'}</td>
                  <td className="py-3 px-3 text-center">{metrics.totalCustomers}</td>
                  <td className="py-3 px-3 text-right">{storage.formatCurrency(metrics.totalAnnualBudget)}</td>
                  <td className="py-3 px-3 text-right text-amber-700">{storage.formatCurrency(metrics.totalBudgetUsed)}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">{storage.formatCurrency(metrics.totalRemainingBudget)}</td>
                  <td className="py-3 px-3 text-center">{metrics.overallUtilizationRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {reportType === 'CUSTOMER_BALANCES' && (
          <div className="report-table-wrap">
            <table aria-label={reportTitles[reportType]} className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">{t.customerCode}</th>
                  <th className="py-2.5 px-3">{t.customerName}</th>
                  <th className="py-2.5 px-2">{t.team}</th>
                  <th className="py-2.5 px-3">{t.contractPeriod}</th>
                  <th className="py-2.5 px-3 text-right">{t.annualBudget}</th>
                  <th className="py-2.5 px-3 text-right">{t.budgetUsed}</th>
                  <th className="py-2.5 px-3 text-right">{t.remainingBudget}</th>
                  <th className="py-2.5 px-2 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerRows.map(({customer:c,contract,budget,util}) => {

                  return (
                    <tr key={c.code} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-blue-700">{c.code}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{c.name}</td>
                      <td className="py-2 px-2">{c.team}</td>
                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                        {contract?.commencingOn} → {contract?.expiringOn}
                      </td>
                      <td className="py-2 px-3 text-right">{storage.formatCurrency(budget?.annualAmount || 0)}</td>
                      <td className="py-2 px-3 text-right text-amber-700">{storage.formatCurrency(budget?.totalUsed || 0)}</td>
                      <td className="py-2 px-3 text-right text-emerald-700 font-bold">{storage.formatCurrency(budget?.remainingAmount || 0)}</td>
                      <td className="py-2 px-2 text-center font-bold text-[11px]">{util}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'EXPENSES_BY_CATEGORY' && (
          <div className="report-table-wrap">
            <table aria-label={reportTitles[reportType]} className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">{t.category}</th>
                  <th className="py-2.5 px-4 text-right">{t.amount}</th>
                  <th className="py-2.5 px-4 text-right">% of Total Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {Object.entries(metrics.categoryUsage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const total = metrics.totalBudgetUsed || 1;
                    const pct = Math.round((amt / total) * 1000) / 10;
                    return (
                      <tr key={cat} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{cat}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">{storage.formatCurrency(amt)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-blue-600">{pct}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'TRANSACTION_AUDIT' && (
          <div className="report-table-wrap">
            <table aria-label={reportTitles[reportType]} className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2 px-3">{t.txnId}</th>
                  <th className="py-2 px-2">{t.date}</th>
                  <th className="py-2 px-3">{t.customerName}</th>
                  <th className="py-2 px-2">{t.team}</th>
                  <th className="py-2 px-3">{t.category}</th>
                  <th className="py-2 px-3 text-right">{t.amount}</th>
                  <th className="py-2 px-2">{t.invoiceRef}</th>
                  <th className="py-2 px-2">{t.createdBy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownTransactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">{txn.id}</td>
                    <td className="py-2 px-2 text-slate-600">{txn.date}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{txn.customerName}</td>
                    <td className="py-2 px-2 font-bold">{txn.team}</td>
                    <td className="py-2 px-3">{txn.category}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">{storage.formatCurrency(txn.amount)}</td>
                    <td className="py-2 px-2 font-mono text-[11px] text-slate-500">{txn.invoiceRef || '-'}</td>
                    <td className="py-2 px-2 text-slate-600">{txn.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {((reportType==='CUSTOMER_BALANCES'&&customers.length===0)||(reportType==='EXPENSES_BY_CATEGORY'&&Object.keys(metrics.categoryUsage).length===0)||(reportType==='TRANSACTION_AUDIT'&&transactions.length===0))&&<p className="report-empty">{lang==='lo'?'ຍັງບໍ່ມີຂໍ້ມູນລາຍງານໃນຂອບເຂດນີ້':'No report records in this scope'}</p>}
      {rowCount>0&&<p className="report-row-count">{lang==='lo'?`ສະແດງ ${Math.min(rowLimit,rowCount)} ຈາກ ${rowCount} ລາຍການ · CSV ມີຂໍ້ມູນທັງໝົດ`:`Showing ${Math.min(rowLimit,rowCount)} of ${rowCount} records · CSV includes all records`}</p>}
      {rowCount>rowLimit&&<button type="button" className="report-show-more no-print" onClick={()=>setRowLimit(limit=>limit+100)}>{lang==='lo'?'ເບິ່ງເພີ່ມ':'Show more'}</button>}
      <div className="report-footer"><span>MKT Budget Management</span><span>{lang==='lo'?'ລາຍງານງົບປະມານການຕະຫຼາດ':'Marketing budget report'}</span></div>
    </section>
  </div>;
};
