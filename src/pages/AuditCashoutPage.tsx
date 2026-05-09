import React from 'react';
import { ReceiptText } from 'lucide-react';

export default function AuditCashoutPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <ReceiptText className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold">Audit Cash Out 2026</h2>
        <p className="text-muted-foreground text-sm mt-1">Modul ini sedang dalam pengembangan.</p>
      </div>
    </div>
  );
}
