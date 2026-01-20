import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRoleAccess } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Building, Save, Upload, Loader2 } from 'lucide-react';

interface CompanyProfile {
  id: string;
  company_name: string;
  brand_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  updated_at: string;
}

export default function CompanyProfilePage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { hasRole } = useRoleAccess();
  const isSuperAdmin = hasRole(['SUPER_ADMIN']);
  
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    company_name: '',
    brand_name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('company_profile')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfile(data);
        setFormData({
          company_name: data.company_name || '',
          brand_name: data.brand_name || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          logo_url: data.logo_url || '',
        });
      }
    } catch (error) {
      console.error('Error fetching company profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load company profile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!isSuperAdmin) {
      toast({
        title: 'Access Denied',
        description: 'Only Super Admin can update company profile',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from('company_profile')
          .update({
            company_name: formData.company_name,
            brand_name: formData.brand_name,
            address: formData.address || null,
            phone: formData.phone || null,
            email: formData.email || null,
            website: formData.website || null,
            logo_url: formData.logo_url || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('company_profile')
          .insert({
            company_name: formData.company_name,
            brand_name: formData.brand_name,
            address: formData.address || null,
            phone: formData.phone || null,
            email: formData.email || null,
            website: formData.website || null,
            logo_url: formData.logo_url || null,
          });

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Company profile saved successfully',
      });
      
      fetchProfile();
    } catch (error) {
      console.error('Error saving company profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to save company profile',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('menu.companyProfile')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('companyProfile.description') || 'Manage company information used in billing letters and documents'}
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t('common.save')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              {t('companyProfile.companyInfo') || 'Company Information'}
            </CardTitle>
            <CardDescription>
              {t('companyProfile.companyInfoDesc') || 'Basic company details that appear on official documents'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">{t('companyProfile.companyName') || 'Company Name'} *</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleInputChange}
                  placeholder="PT. Kemika Karya Pratama"
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand_name">{t('companyProfile.brandName') || 'Brand Name'}</Label>
                <Input
                  id="brand_name"
                  name="brand_name"
                  value={formData.brand_name}
                  onChange={handleInputChange}
                  placeholder="KEMIKA"
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{t('companyProfile.address') || 'Address'}</Label>
              <Textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Jl. Example No. 123, Jakarta"
                rows={3}
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('companyProfile.phone') || 'Phone'}</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+62 21 12345678"
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('companyProfile.email') || 'Email'}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="info@company.com"
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">{t('companyProfile.website') || 'Website'}</Label>
              <Input
                id="website"
                name="website"
                value={formData.website}
                onChange={handleInputChange}
                placeholder="https://www.company.com"
                disabled={!isSuperAdmin}
              />
            </div>
          </CardContent>
        </Card>

        {/* Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('companyProfile.logo') || 'Company Logo'}</CardTitle>
            <CardDescription>
              {t('companyProfile.logoDesc') || 'Logo used in billing letters and documents'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
              {formData.logo_url ? (
                <img 
                  src={formData.logo_url} 
                  alt="Company Logo" 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Upload className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">{t('companyProfile.noLogo') || 'No logo uploaded'}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="logo_url">{t('companyProfile.logoUrl') || 'Logo URL'}</Label>
              <Input
                id="logo_url"
                name="logo_url"
                value={formData.logo_url}
                onChange={handleInputChange}
                placeholder="https://example.com/logo.png"
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                {t('companyProfile.logoUrlHint') || 'Enter the URL of your company logo image'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('companyProfile.preview') || 'Billing Letter Preview'}</CardTitle>
          <CardDescription>
            {t('companyProfile.previewDesc') || 'Preview how the company information appears on billing letters'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white text-black p-6 rounded-lg border shadow-sm max-w-2xl">
            <div className="flex items-start gap-4 border-b pb-4 mb-4">
              {formData.logo_url && (
                <img 
                  src={formData.logo_url} 
                  alt="Logo" 
                  className="w-16 h-16 object-contain"
                />
              )}
              <div className="flex-1">
                <h2 className="text-xl font-bold">{formData.company_name || 'Company Name'}</h2>
                {formData.brand_name && (
                  <p className="text-sm text-gray-600">{formData.brand_name}</p>
                )}
              </div>
            </div>
            <div className="text-sm text-gray-700 space-y-1">
              {formData.address && <p>{formData.address}</p>}
              <div className="flex flex-wrap gap-4">
                {formData.phone && <p>Tel: {formData.phone}</p>}
                {formData.email && <p>Email: {formData.email}</p>}
              </div>
              {formData.website && <p>Website: {formData.website}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isSuperAdmin && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-600">
              {t('companyProfile.readOnly') || 'You have read-only access. Contact a Super Admin to make changes.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
