import React, { useRef, useState } from 'react';
import { Camera, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface InvoiceScanButtonProps {
  type: 'ar' | 'ap';
  onExtracted: (data: Record<string, any>) => void;
  disabled?: boolean;
}

export function InvoiceScanButton({ type, onExtracted, disabled }: InvoiceScanButtonProps) {
  const { language } = useLanguage();
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error(language === 'en' ? 'Please upload an image (JPG, PNG) or PDF' : 'Upload gambar (JPG, PNG) atau PDF');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(language === 'en' ? 'File too large (max 10MB)' : 'File terlalu besar (maks 10MB)');
      return;
    }

    try {
      setScanning(true);
      toast.info(language === 'en' ? 'Scanning invoice...' : 'Memindai invoice...');

      // Convert file to base64
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('scan-invoice', {
        body: { image_base64: base64, type, mime_type: file.type },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        onExtracted(data.data);
        toast.success(language === 'en' ? 'Invoice data extracted!' : 'Data invoice berhasil diekstrak!');
      } else {
        throw new Error('No data extracted');
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(err.message || (language === 'en' ? 'Failed to scan invoice' : 'Gagal memindai invoice'));
    } finally {
      setScanning(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || scanning}
        onClick={() => fileInputRef.current?.click()}
        className="gap-2"
      >
        {scanning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
        {scanning
          ? (language === 'en' ? 'Scanning...' : 'Memindai...')
          : (language === 'en' ? 'Scan Invoice' : 'Scan Invoice')}
      </Button>
    </>
  );
}
