import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, UserCheck, UserX, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type UserRole = Database['public']['Enums']['user_role'];

interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  role: UserRole;
}

export default function UserManagementPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  
  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('PURCHASING');

  // Fetch users with roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      return profiles.map(profile => ({
        ...profile,
        role: roles.find(r => r.user_id === profile.user_id)?.role || 'PURCHASING',
      })) as UserWithRole[];
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; fullName: string; role: UserRole }) => {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('manage-users', {
        body: { action: 'create', ...data },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'User created successfully' : 'User berhasil dibuat',
      });
    },
    onError: (error: Error) => {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { userId: string; fullName?: string; role?: UserRole; isActive?: boolean }) => {
      const response = await supabase.functions.invoke('manage-users', {
        body: { action: 'update', ...data },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditOpen(false);
      setSelectedUser(null);
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'User updated successfully' : 'User berhasil diupdate',
      });
    },
    onError: (error: Error) => {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', userId },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: language === 'en' ? 'Success' : 'Berhasil',
        description: language === 'en' ? 'User deleted successfully' : 'User berhasil dihapus',
      });
    },
    onError: (error: Error) => {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setFormRole('PURCHASING');
  };

  const handleCreate = () => {
    if (!formEmail || !formPassword || !formFullName) {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: language === 'en' ? 'Please fill all fields' : 'Harap isi semua field',
        variant: 'destructive',
      });
      return;
    }
    if (formPassword.length < 8) {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: language === 'en' ? 'Password must be at least 8 characters' : 'Password minimal 8 karakter',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({ email: formEmail, password: formPassword, fullName: formFullName, role: formRole });
  };

  const handleEdit = (user: UserWithRole) => {
    setSelectedUser(user);
    setFormFullName(user.full_name);
    setFormRole(user.role);
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;
    updateMutation.mutate({
      userId: selectedUser.user_id,
      fullName: formFullName,
      role: formRole,
    });
  };

  const handleToggleActive = (user: UserWithRole) => {
    updateMutation.mutate({
      userId: user.user_id,
      isActive: !user.is_active,
    });
  };

  const handleDelete = (user: UserWithRole) => {
    if (confirm(language === 'en' ? `Delete user ${user.email}?` : `Hapus user ${user.email}?`)) {
      deleteMutation.mutate(user.user_id);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roleLabels: Record<UserRole, { en: string; id: string }> = {
    PURCHASING: { en: 'Purchasing', id: 'Purchasing' },
    FINANCE: { en: 'Finance', id: 'Finance' },
    ADMIN: { en: 'Admin', id: 'Admin' },
    SUPER_ADMIN: { en: 'Super Admin', id: 'Super Admin' },
    SALES: { en: 'Sales (View Only)', id: 'Sales (Lihat Saja)' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'en' ? 'User Management' : 'Manajemen User'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' ? 'Manage system users and roles' : 'Kelola user dan role sistem'}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          {language === 'en' ? 'Add User' : 'Tambah User'}
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === 'en' ? 'Search users...' : 'Cari user...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{language === 'en' ? 'Created' : 'Dibuat'}</TableHead>
                <TableHead className="w-[100px]">{language === 'en' ? 'Actions' : 'Aksi'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    {language === 'en' ? 'Loading...' : 'Memuat...'}
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No users found' : 'Tidak ada user ditemukan'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'SUPER_ADMIN' ? 'default' : 'secondary'}>
                        {roleLabels[user.role][language]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'destructive'}>
                        {user.is_active 
                          ? (language === 'en' ? 'Active' : 'Aktif')
                          : (language === 'en' ? 'Inactive' : 'Nonaktif')
                        }
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString('id-ID')}
                    </TableCell>
                    <TableCell>
                      {user.role !== 'SUPER_ADMIN' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(user)} className="gap-2">
                              <Edit className="w-4 h-4" />
                              {language === 'en' ? 'Edit' : 'Edit'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(user)} className="gap-2">
                              {user.is_active ? (
                                <>
                                  <UserX className="w-4 h-4" />
                                  {language === 'en' ? 'Deactivate' : 'Nonaktifkan'}
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4" />
                                  {language === 'en' ? 'Activate' : 'Aktifkan'}
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(user)} 
                              className="gap-2 text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                              {language === 'en' ? 'Delete' : 'Hapus'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Create New User' : 'Buat User Baru'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</Label>
              <Input
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder={language === 'en' ? 'Enter full name' : 'Masukkan nama lengkap'}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="user@kemika.co.id"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={language === 'en' ? 'Enter password' : 'Masukkan password'}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASING">Purchasing</SelectItem>
                  <SelectItem value="FINANCE">Finance</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending 
                ? (language === 'en' ? 'Creating...' : 'Membuat...')
                : (language === 'en' ? 'Create' : 'Buat')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Edit User' : 'Edit User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</Label>
              <Input
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASING">Purchasing</SelectItem>
                  <SelectItem value="FINANCE">Finance</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending 
                ? (language === 'en' ? 'Saving...' : 'Menyimpan...')
                : (language === 'en' ? 'Save' : 'Simpan')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
