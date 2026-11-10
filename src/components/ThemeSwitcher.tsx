import React, { useEffect, useState } from 'react';
import { useGoldAppearance, setGoldAppearance } from './GoldAppearance';
import { Palette, Check } from 'lucide-react';
export type DashboardTheme = 'glass' | 'executive' | 'neon' | 'minimal' | 'luxury';
const choices: { id: DashboardTheme; label: string; lo: string; colors: string[] }[] = [
  { id:'glass', label:'Glassmorphism + 3D', lo:'ກະຈົກ 3D', colors:['#131d47','#665aca','#83e9f3'] },
  { id:'executive', label:'Modern Executive', lo:'ຜູ້ບໍລິຫານ', colors:['#f1f5ff','#4f46e5','#9fd3ff'] },
  { id:'neon', label:'Futuristic AI Neon', lo:'ນີອອນ AI', colors:['#07111f','#00e5e5','#8b5cf6'] },
  { id:'minimal', label:'Minimal Finance', lo:'ລຽບງ່າຍ', colors:['#effaf4','#18866b','#badbca'] },
  { id:'luxury', label:'Luxury Enterprise', lo:'ຫຼູຫຼາ', colors:['#101a2c','#cba660','#758399'] },
];
export function useDashboardTheme(username: string) {
  const key = `mkt-dashboard-theme-v1:${username}`;
  const [theme, setInternal] = useState<DashboardTheme>(() => {
    try { const saved = localStorage.getItem(key); return choices.some(x=>x.id===saved) ? saved as DashboardTheme : 'glass'; } catch { return 'glass'; }
  });
  useEffect(() => {
    try { const saved = localStorage.getItem(key); setInternal(choices.some(x=>x.id===saved) ? saved as DashboardTheme : 'glass'); } catch { setInternal('glass'); }
  }, [key]);
  const setTheme = (value: DashboardTheme) => { setInternal(value); try { localStorage.setItem(key,value); } catch {} };
  return { theme, setTheme };
}
export function ThemeSwitcher({ theme, onChange, language = 'lo' }: { theme: DashboardTheme; onChange: (theme: DashboardTheme) => void; language?: 'lo' | 'en' }) {
  const gold=useGoldAppearance();
  return <section className="mkt-theme-settings no-print rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm" aria-labelledby="dashboard-appearance-heading">
    <h3 id="dashboard-appearance-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900">
      <Palette size={18} className="text-blue-600" />
      {language === 'lo' ? 'ຮູບແບບ ແລະສີຂອງແອັບ' : 'App appearance'}
    </h3>
    <p className="mt-2 mb-4 text-xs text-slate-500">{language === 'lo' ? 'ເລືອກຮູບແບບທີ່ຕ້ອງການ. ມີຜົນທັນທີ ແລະບັນທຶກອັດຕະໂນມັດໃນ browser ນີ້.' : 'Choose a theme. It applies immediately and saves automatically in this browser.'}</p>
    <button type="button" aria-pressed={gold} onClick={()=>setGoldAppearance(!gold)} className="mkt-theme-option mb-3" style={{background:gold?'#FFF8E7':undefined,borderColor:gold?'#D99A00':undefined}}><span className="mkt-theme-swatches"><i style={{background:'#FFC400'}}/><i style={{background:'#087C35'}}/><i style={{background:'#FFF8E7'}}/></span><span className="flex-1"><strong>Beerlao Gold</strong><small>{language==='lo'?'ຮູບແບບມືຖືໃໝ່ · ສຳລັບ browser ນີ້':'New mobile design · this browser'}</small></span>{gold&&<Check size={17}/>}</button>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Choose dashboard theme">
      {choices.map(c=><button type="button" key={c.id} onClick={()=>{setGoldAppearance(false);onChange(c.id);}} className={`mkt-theme-option ${!gold&&theme===c.id?'active':''}`} aria-pressed={!gold&&theme===c.id}>
        <span className="mkt-theme-swatches">{c.colors.map((color,i)=><i key={i} style={{background:color}}/>)}</span>
        <span className="flex-1 text-left"><strong>{c.label}</strong><small>{c.lo}</small></span>
        {!gold&&theme===c.id && <Check size={17}/>}
      </button>)}
    </div>
  </section>;
}
