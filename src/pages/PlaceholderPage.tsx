import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  titleKey: string;
}

export default function PlaceholderPage({ titleKey }: PlaceholderPageProps) {
  const { t, language } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">{t(titleKey)}</h1>
      <p className="text-muted-foreground text-center max-w-md">
        {language === 'en' 
          ? 'This page is under development. Please check back later.'
          : 'Halaman ini sedang dalam pengembangan. Silakan cek kembali nanti.'}
      </p>
    </div>
  );
}
