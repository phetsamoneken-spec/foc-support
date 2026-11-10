import React from 'react';
import { House, Wallet, ReceiptText, ChartNoAxesCombined, Settings } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Language } from '../locales/translations';

export function BottomNavigation({currentView,onNavigate,language}:{currentView:string;onNavigate:(view:string)=>void;language:Language}) {
  const reduced=useReducedMotion();
  const items=[
    {id:'dashboard',lo:'ໜ້າຫຼັກ',en:'Home',icon:House},
    {id:'budgets',lo:'ງົບປະມານ',en:'Budget',icon:Wallet},
    {id:'transactions',lo:'ລາຍການ',en:'Transactions',icon:ReceiptText},
    {id:'reports',lo:'ລາຍງານ',en:'Reports',icon:ChartNoAxesCombined},
    {id:'settings',lo:'ຕັ້ງຄ່າ',en:'Settings',icon:Settings}
  ];
  return <nav className="gold-bottom-nav no-print" aria-label={language==='lo'?'ເມນູຫຼັກ':'Primary navigation'}>
    {items.map(({id,lo,en,icon:Icon})=><motion.button key={id} type="button" onClick={()=>onNavigate(id)} aria-current={currentView===id?'page':undefined} className={currentView===id?'active':''} whileTap={reduced?undefined:{scale:.97}} transition={{type:'spring',stiffness:420,damping:30,duration:.22}}>
      {currentView===id&&<motion.span className="gold-tab-indicator" layoutId="bottom-active-tab" transition={reduced?{duration:0}:{type:'spring',stiffness:420,damping:34}}/>}
      <Icon size={21} strokeWidth={currentView===id?2.6:1.8}/><span>{language==='lo'?lo:en}</span>
    </motion.button>)}
  </nav>;
}
