import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import logoKemika from '@/assets/logo-kemika.png';
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    login
  } = useAuth();
  const {
    t,
    language,
    toggleLanguage
  } = useLanguage();
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: language === 'en' ? 'Please fill in all fields' : 'Harap isi semua field',
        variant: 'destructive'
      });
      return;
    }
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);
    if (result.success) {
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'Login successful' : 'Login berhasil'
      });
      navigate('/dashboard');
    } else {
      toast({
        title: language === 'en' ? 'Login Failed' : 'Login Gagal',
        description: result.error || (language === 'en' ? 'Invalid credentials' : 'Kredensial tidak valid'),
        variant: 'destructive'
      });
    }
  };
  return <div className="min-h-screen flex">
      {/* Left Panel - Green Brand Section */}
      <div className="hidden lg:flex lg:w-[46%] bg-primary relative flex-col justify-between p-10 overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        
        {/* Content */}
        <div className="relative z-10">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo-kemika-new.png" alt="Kemika Logo" className="w-full h-full object-contain border-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary-foreground">PT KEMIKA KARYA PRATAMA </h1>
              <p className="text-sm text-primary-foreground/70">SPREADING SOLUTION</p>
            </div>
          </div>
        </div>

        {/* Main Hero Text */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-primary-foreground leading-tight mb-6">
            {t('hero.title')}
          </h2>
          <p className="text-lg text-primary-foreground/80 max-w-md leading-relaxed">
            {t('hero.subtitle')}
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex items-center gap-8 border-t border-primary-foreground/20 pt-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary-foreground">4</p>
            <p className="text-sm text-primary-foreground/70">Role</p>
          </div>
          <div className="h-8 w-px bg-primary-foreground/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-primary-foreground">100%</p>
            <p className="text-sm text-primary-foreground/70">Paperless</p>
          </div>
          <div className="h-8 w-px bg-primary-foreground/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-primary-foreground">Real-time</p>
            <p className="text-sm text-primary-foreground/70">Tracking</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col bg-secondary/30">
        {/* Language Toggle */}
        <div className="flex justify-end p-4">
          <button onClick={toggleLanguage} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span className={language === 'en' ? 'text-foreground font-semibold' : ''}>EN</span>
            <span className="text-muted-foreground/50">|</span>
            <span className={language === 'id' ? 'text-foreground font-semibold' : ''}>ID</span>
          </button>
        </div>

        {/* Login Card */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <Card className="w-full max-w-[420px] p-8 shadow-lg border-border/50">
            {/* Mobile Logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <img src={logoKemika} alt="Kemika" className="h-12" />
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t('login.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('login.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  {t('login.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder={t('login.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  {t('login.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder={t('login.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10 h-11" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={isLoading}>
                {isLoading ? language === 'en' ? 'Signing in...' : 'Memproses...' : t('btn.signIn')}
              </Button>
            </form>

            {/* Info Box - No Registration */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border/50 text-center">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {language === 'en' ? "Don't have an account?" : 'Tidak memiliki akun?'}
                </span>
                <br />
                {language === 'en' ? 'Please contact the Super Admin to create a new account.' : 'Hubungi Super Admin untuk pembuatan akun baru.'}
              </p>
            </div>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} PT. Kemika Karya Pratama. All rights reserved.
        </div>
      </div>
    </div>;
}