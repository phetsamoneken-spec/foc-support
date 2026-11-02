import React from 'react';
import {storage} from '../services/storage';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC<{ language?: 'lo' | 'en' }> = ({ language = 'lo' }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 backdrop-blur-xs px-4 py-2.5 text-xs font-semibold text-white shadow-xl border border-amber-400">
      <WifiOff className="w-4 h-4 animate-bounce" />
      <span>
        {storage.usesSupabase?(language==='lo'?'ອອຟລາຍ: ຂໍ້ມູນອາດບໍ່ແມ່ນລ່າສຸດ; ລໍຖ້າ server ຢືນຢັນການບັນທຶກ':'Offline: data may be stale; saves require server confirmation'):language === 'lo'
          ? 'ໂໝດອອຟລາຍ: ທ່ານກຳລັງໃຊ້ຂໍ້ມູນທີ່ຖືກບັນທຶກໄວ້ໃນອຸປະກອນ'
          : 'Offline Mode: You are viewing locally cached data.'}
      </span>
    </div>
  );
};
