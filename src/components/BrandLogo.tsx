import React from 'react';

/** Shared artwork for the header, navigation drawer and sign-in screen. */
export function BrandLogo({size=40,decorative=false}:{size?:number;decorative?:boolean}){
  return <img
    src={`${import.meta.env.BASE_URL}beerlao-budget-logo-v2.webp`}
    alt={decorative?'':'Beerlao — MKT Budget Management'}
    aria-hidden={decorative||undefined}
    width={size}
    height={size}
    className="brand-logo"
    decoding="async"
  />;
}
