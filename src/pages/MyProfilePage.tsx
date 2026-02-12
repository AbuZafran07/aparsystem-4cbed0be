import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Camera, Save, Lock, User, Mail, Loader2 } from 'lucide-react';

export default function MyProfilePage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Profile form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url')
          .eq('user_id', user.id)
          .single();
        
        if (error) throw error;
        
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setAvatarUrl(data.avatar_url);
      } catch (error: any) {
        toast({
          title: language === 'id' ? 'Gagal memuat profil' : 'Failed to load profile',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProfile();
  }, [user?.id, language]);

  // Save profile
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    
    if (!fullName.trim()) {
      toast({
        title: language === 'id' ? 'Nama tidak boleh kosong' : 'Name cannot be empty',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast({
        title: language === 'id' ? 'Profil berhasil diperbarui' : 'Profile updated successfully',
      });
    } catch (error: any) {
      toast({
        title: language === 'id' ? 'Gagal menyimpan profil' : 'Failed to save profile',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: language === 'id' ? 'Semua field password harus diisi' : 'All password fields are required',
        variant: 'destructive',
      });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({
        title: language === 'id' ? 'Password baru tidak cocok' : 'New passwords do not match',
        variant: 'destructive',
      });
      return;
    }
    
    if (newPassword.length < 8) {
      toast({
        title: language === 'id' ? 'Password minimal 8 karakter' : 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }
    
    setIsChangingPassword(true);
    try {
      // First verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: currentPassword,
      });
      
      if (signInError) {
        toast({
          title: language === 'id' ? 'Password saat ini salah' : 'Current password is incorrect',
          variant: 'destructive',
        });
        setIsChangingPassword(false);
        return;
      }
      
      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (error) throw error;
      
      toast({
        title: language === 'id' ? 'Password berhasil diubah' : 'Password changed successfully',
      });
      
      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: language === 'id' ? 'Gagal mengubah password' : 'Failed to change password',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Upload avatar
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: language === 'id' ? 'File harus berupa gambar' : 'File must be an image',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: language === 'id' ? 'Ukuran file maksimal 2MB' : 'File size must be less than 2MB',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploadingAvatar(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: `${publicUrl}?t=${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      
      if (updateError) throw updateError;
      
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      
      toast({
        title: language === 'id' ? 'Foto profil berhasil diperbarui' : 'Profile photo updated successfully',
      });
    } catch (error: any) {
      toast({
        title: language === 'id' ? 'Gagal mengunggah foto' : 'Failed to upload photo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">
        {language === 'id' ? 'Profil Saya' : 'My Profile'}
      </h1>
      
      {/* Avatar Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {language === 'id' ? 'Foto Profil' : 'Profile Photo'}
          </CardTitle>
          <CardDescription>
            {language === 'id' 
              ? 'Unggah foto profil Anda. Maksimal 2MB.' 
              : 'Upload your profile photo. Maximum 2MB.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {getInitials(fullName || 'U')}
                </AvatarFallback>
              </Avatar>
              {isUploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div>
              <input
                type="file"
                id="avatar-upload"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('avatar-upload')?.click()}
                disabled={isUploadingAvatar}
              >
                <Camera className="w-4 h-4 mr-2" />
                {language === 'id' ? 'Ganti Foto' : 'Change Photo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {language === 'id' ? 'Informasi Profil' : 'Profile Information'}
          </CardTitle>
          <CardDescription>
            {language === 'id' 
              ? 'Perbarui informasi profil Anda.' 
              : 'Update your profile information.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">
              {language === 'id' ? 'Nama Lengkap' : 'Full Name'}
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={language === 'id' ? 'Masukkan nama lengkap' : 'Enter full name'}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
            </Label>
            <Input
              id="email"
              value={email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              {language === 'id' 
                ? 'Email tidak dapat diubah.' 
                : 'Email cannot be changed.'}
            </p>
          </div>
          
          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {language === 'id' ? 'Simpan Perubahan' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {language === 'id' ? 'Ubah Password' : 'Change Password'}
          </CardTitle>
          <CardDescription>
            {language === 'id' 
              ? 'Pastikan password baru minimal 6 karakter.' 
              : 'Make sure your new password is at least 6 characters.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">
              {language === 'id' ? 'Password Saat Ini' : 'Current Password'}
            </Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="newPassword">
              {language === 'id' ? 'Password Baru' : 'New Password'}
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {language === 'id' ? 'Konfirmasi Password Baru' : 'Confirm New Password'}
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          
          <Button 
            onClick={handleChangePassword} 
            disabled={isChangingPassword}
            variant="outline"
          >
            {isChangingPassword ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Lock className="w-4 h-4 mr-2" />
            )}
            {language === 'id' ? 'Ubah Password' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
