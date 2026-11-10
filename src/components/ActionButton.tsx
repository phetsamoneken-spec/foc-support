import React from 'react';
import {motion,useReducedMotion,type HTMLMotionProps} from 'motion/react';
import {Check} from 'lucide-react';
type Props=Omit<HTMLMotionProps<'button'>,'children'>&{children?:React.ReactNode;loading?:boolean;loadingLabel?:string};
export function ActionButton({loading=false,loadingLabel,disabled,children,...props}:Props){
  const reduced=useReducedMotion();
  return <motion.button {...props} disabled={disabled||loading} aria-busy={loading} whileTap={reduced?undefined:{scale:.97}} whileHover={!reduced&&window.matchMedia('(hover:hover) and (pointer:fine)').matches?{scale:1.02}:undefined} transition={{type:'spring',stiffness:420,damping:28,duration:.22}}>
    {loading?<span className="gold-loading-spinner" aria-hidden="true"/>:<Check size={18} aria-hidden="true"/>}<span>{loading?(loadingLabel||'Saving…'):children}</span>
  </motion.button>;
}
