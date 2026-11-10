import React,{useRef,useState} from 'react';
import {Lock,User,ArrowRight,AlertCircle,Eye,EyeOff} from 'lucide-react';
import {BrandLogo} from '../components/BrandLogo';
import {PWAInstallButton} from '../components/PWAInstallButton';
import {storage} from '../services/storage';
import {translations,Language} from '../locales/translations';

export const LoginView:React.FC=()=>{
  const lang:Language=storage.getSettings().language,lo=lang==='lo',t=translations[lang];
  const [username,setUsername]=useState('admin'),[password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false),[error,setError]=useState<string|null>(null),[signingIn,setSigningIn]=useState(false);
  const signingInRef=useRef(false);
  const handleLogin=async(event:React.FormEvent)=>{
    event.preventDefault();if(signingInRef.current)return;
    signingInRef.current=true;setError(null);setSigningIn(true);
    try{
      const result=await storage.login(username,password);
      if(!result.success)setError(result.message||(lo?'ບໍ່ສາມາດເຂົ້າລະບົບໄດ້. ກະລຸນາລອງໃໝ່.':'Unable to sign in. Please try again.'));
    }catch{setError(lo?'ບໍ່ສາມາດເຂົ້າລະບົບໄດ້. ກະລຸນາລອງໃໝ່.':'Unable to sign in. Please try again.');}
    finally{signingInRef.current=false;setSigningIn(false);}
  };
  return <div className="gold-login">
    <div className="login-content">
      <header className="login-brand"><BrandLogo size={80}/><h1>{t.appName}</h1><p>{lo?'ຈັດການງົບປະມານ ແລະລູກຄ້າ · ທີມ B1–B7':'Customer & budget management · Teams B1–B7'}</p></header>
      <section className="login-panel" aria-label={lo?'ເຂົ້າສູ່ລະບົບ':'Sign in'}>
        {error&&<div role="alert" className="login-error"><AlertCircle size={18} aria-hidden="true"/><span>{error}</span></div>}
        <form onSubmit={handleLogin} className="login-form">
          <div><label htmlFor="login-username">{lo?'ຊື່ຜູ້ໃຊ້ງານ':'Username'}</label><div className="login-field"><User size={18} aria-hidden="true"/><input id="login-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event=>setUsername(event.target.value)} placeholder={lo?'ປ້ອນຊື່ຜູ້ໃຊ້':'Enter username'}/></div></div>
          <div><label htmlFor="login-password">{lo?'ລະຫັດຜ່ານ':'Password'}</label><div className="login-field"><Lock size={18} aria-hidden="true"/><input id="login-password" name="password" type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder={lo?'ປ້ອນລະຫັດຜ່ານ':'Enter password'}/><button type="button" className="login-password-toggle" aria-label={showPassword?(lo?'ເຊື່ອງລະຫັດຜ່ານ':'Hide password'):(lo?'ສະແດງລະຫັດຜ່ານ':'Show password')} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
          <button type="submit" disabled={signingIn} aria-busy={signingIn} className="login-submit"><span>{signingIn?(lo?'ກຳລັງເຂົ້າລະບົບ…':'Signing in…'):t.login}</span>{signingIn?<span className="gold-loading-spinner" aria-hidden="true"/>:<ArrowRight size={18} aria-hidden="true"/>}</button>
        </form>
      </section>
      <section className="login-install" aria-label={lo?'ຕິດຕັ້ງແອັບ':'App installation'}><PWAInstallButton language={lang}/><p>{lo?'ຕິດຕັ້ງໃສ່ໜ້າຈໍຫຼັກໄດ້ ໂດຍບໍ່ຕ້ອງເຂົ້າລະບົບກ່ອນ.':'Add the app to your home screen before signing in.'}</p></section>
    </div>
  </div>;
};
