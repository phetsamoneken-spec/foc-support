import React from 'react';
import type {User} from '../types';
import {useEmployeePortrait} from '../hooks/useEmployeePortrait';

export function EmployeeAvatar({user,compact=false}:{user:Pick<User,'id'|'fullName'>|null;compact?:boolean}){
 const image=useEmployeePortrait(user?.id);
 return <span className={`gold-avatar employee-avatar ${compact?'employee-avatar-compact':''}`} aria-hidden="true">{image?<img src={image} alt="" width={compact?32:44} height={compact?32:44}/>:user?.fullName?.charAt(0)||'M'}</span>;
}
