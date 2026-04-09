import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fastAPI } from "@/lib/api";
import { sendNotifications, getDashboardUrl } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Building,
  Users,
  Circle,
  Plus,
  Edit,
  Trash2,
  Grid,
  User,
  X,
  Check,
  AlertCircle,
  LogOut,
  Upload,
  Image as ImageIcon,
  Pause,
  Play
} from "lucide-react";
import { useNavigate } from 'react-router-dom';

export interface FirmAdminEntry {
  id?: string;
  full_name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
}

interface Company {
  id: string;
  name: string;
  subscription_plan: 'free' | 'basic' | 'premium' | 'enterprise';
  is_active: boolean;
  max_users: number;
  created_at: string;
  user_count: number;
  admin_name?: string;
  admin_email?: string;
  admin_phone?: string;
  admin_whatsapp?: string;
  logo_url?: string | null;
  services_paused?: boolean;
  equipment_unlock_days?: number | null;
  firm_admins?: FirmAdminEntry[];
  max_equipment_limit?: number | null;
  equipment_count?: number;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  firm_id: string;
  is_active: boolean;
}

const SuperAdminDashboard = () => {
  const { toast } = useToast();
  const { user, signOut, userName: authUserName } = useAuth();
  const userName = authUserName || localStorage.getItem('userName') || user?.user_metadata?.full_name || 'Super Admin';
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicking on the logout button or inside the dropdown
      const target = event.target as HTMLElement;
      if (target.closest('.logout-button') || target.closest('.user-dropdown')) {
        return;
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    // Use a slight delay to ensure click events on buttons inside dropdown fire first
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      // // console.log('🚪 Logout initiated...');
      
      // IMMEDIATE: Clear ALL storage first (but preserve critical caches)
      // Use synchronous approach to preserve critical caches
      const tabCounters = localStorage.getItem('epms_cache_tab_counters');
      const summaryStats = localStorage.getItem('epms_cache_summary_stats');
      const standaloneEquipment = localStorage.getItem('epms_cache_equipment_standalone');
      
      localStorage.clear();
      
      // Restore critical caches immediately
      if (tabCounters) localStorage.setItem('epms_cache_tab_counters', tabCounters);
      if (summaryStats) localStorage.setItem('epms_cache_summary_stats', summaryStats);
      if (standaloneEquipment) localStorage.setItem('epms_cache_equipment_standalone', standaloneEquipment);
      
      sessionStorage.clear();
      
      // IMMEDIATE: Force redirect right away (don't wait for signOut)
      // // console.log('✅ Clearing storage and redirecting immediately...');
      window.location.replace('/login');
      
      // Continue signOut in background (non-blocking)
      // We don't await this - redirect happens immediately
      (async () => {
        try {
          if (signOut && typeof signOut === 'function') {
            await signOut();
          } else {
            await supabase.auth.signOut();
          }
        } catch (signOutError) {
          console.warn('⚠️ SignOut error (non-fatal, already redirected):', signOutError);
        }
      })();
      
    } catch (error) {
      console.error('❌ Error during logout:', error);
      // Even if everything fails, preserve critical caches
      const tabCounters = localStorage.getItem('epms_cache_tab_counters');
      const summaryStats = localStorage.getItem('epms_cache_summary_stats');
      const standaloneEquipment = localStorage.getItem('epms_cache_equipment_standalone');
      
      localStorage.clear();
      
      if (tabCounters) localStorage.setItem('epms_cache_tab_counters', tabCounters);
      if (summaryStats) localStorage.setItem('epms_cache_summary_stats', summaryStats);
      if (standaloneEquipment) localStorage.setItem('epms_cache_equipment_standalone', standaloneEquipment);
      
      sessionStorage.clear();
      window.location.replace('/login');
    }
  };
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({
    name: '',
    subscription_plan: 'basic' as const,
    is_active: true,
    max_users: 5,
    admin_name: '',
    admin_email: '',
    admin_phone: '',
    admin_whatsapp: '',
    equipment_unlock_days: 90,
    firm_admins: [{ full_name: '', email: '', phone: '', whatsapp: '' }] as FirmAdminEntry[],
    max_equipment_limit: null as number | null
  });
  const [newCompanyLogo, setNewCompanyLogo] = useState<File | null>(null);
  const [newCompanyLogoPreview, setNewCompanyLogoPreview] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingCompanyLogo, setEditingCompanyLogo] = useState<File | null>(null);
  const [editingCompanyLogoPreview, setEditingCompanyLogoPreview] = useState<string | null>(null);
  const [pausingCompany, setPausingCompany] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch companies and users in parallel for speed
      const [companiesData, usersData] = await Promise.all([
        fastAPI.getCompanies(),
        fastAPI.getUsers()
      ]);

      // Process companies with user count and all firm admins
      const processedCompanies = companiesData?.map((company: any) => {
        const companyUsers = usersData?.filter((user: any) => user.firm_id === company.id) || [];
        const adminUsers = companyUsers.filter((user: any) => user.role === 'firm_admin');

        // Prefer firm_admins from firms table (all stored; no overwrite); merge with users to get id
        const storedFirmAdmins = Array.isArray(company.firm_admins) ? company.firm_admins : null;
        let firm_admins: FirmAdminEntry[];
        if (storedFirmAdmins && storedFirmAdmins.length > 0) {
          const byEmail = new Map(adminUsers.map((u: any) => [((u.email || '') as string).toLowerCase(), u]));
          firm_admins = storedFirmAdmins.map((a: any) => {
            const user = a.email ? byEmail.get((a.email as string).toLowerCase()) : null;
            return {
              id: user?.id ?? a.id,
              full_name: (a.full_name ?? user?.full_name ?? '') || '',
              email: (a.email ?? user?.email ?? '') || '',
              phone: (a.phone ?? user?.phone ?? '') ?? '',
              whatsapp: (a.whatsapp ?? user?.whatsapp ?? '') ?? ''
            };
          });
          // Append any admin users not in stored list (e.g. just invited, not yet in firm_admins)
          const storedEmails = new Set(firm_admins.map((a) => (a.email || '').toLowerCase()));
          for (const u of adminUsers) {
            if (!u.email || storedEmails.has((u.email as string).toLowerCase())) continue;
            storedEmails.add((u.email as string).toLowerCase());
            firm_admins.push({
              id: u.id,
              full_name: u.full_name || '',
              email: u.email || '',
              phone: u.phone || '',
              whatsapp: (u.whatsapp ?? (company.admin_whatsapp && u.id === adminUsers[0]?.id ? company.admin_whatsapp : '')) || ''
            });
          }
        } else {
          const firstAdmin = adminUsers[0];
          firm_admins = adminUsers.length > 0
            ? adminUsers.map((u: any) => ({
                id: u.id,
                full_name: u.full_name || '',
                email: u.email || '',
                phone: u.phone || '',
                whatsapp: (u.whatsapp ?? (company.admin_whatsapp && u.id === firstAdmin?.id ? company.admin_whatsapp : '')) || ''
              }))
            : (company.admin_name || company.admin_email
                ? [{ full_name: company.admin_name || '', email: company.admin_email || '', phone: company.admin_phone || '', whatsapp: company.admin_whatsapp || '' }]
                : []);
        }

        const firstAdmin = firm_admins[0];
        // First admin / legacy fields for backward compat
        const adminName = firstAdmin?.full_name || company.admin_name || '';
        const adminEmail = firstAdmin?.email || company.admin_email || '';

        return {
          id: company.id,
          name: company.name,
          subscription_plan: company.subscription_plan,
          is_active: company.is_active,
          max_users: company.max_users || 5,
          created_at: company.created_at,
          user_count: companyUsers.length,
          admin_name: adminName,
          admin_email: adminEmail,
          admin_phone: firstAdmin?.phone || company.admin_phone || '',
          admin_whatsapp: company.admin_whatsapp || '',
          logo_url: company.logo_url || null,
          services_paused: company.services_paused ?? false,
          equipment_unlock_days: company.equipment_unlock_days ?? 90,
          firm_admins,
          max_equipment_limit: company.max_equipment_limit ?? null
        };
      }) || [];

      const counts = await Promise.all(processedCompanies.map((c) => fastAPI.getEquipmentCountByFirm(c.id)));
      const withCounts = processedCompanies.map((c, i) => ({ ...c, equipment_count: counts[i] ?? 0 }));

      setCompanies(withCounts);
      setUsers(usersData || []);

      // Data processed successfully
    } catch (error) {
      toast({ title: 'Error', description: 'Error loading data: ' + (error as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    try {
      setCreatingCompany(true);
      const firstAdmin = newCompany.firm_admins?.[0];
      const adminName = firstAdmin?.full_name ?? newCompany.admin_name;
      const adminEmail = firstAdmin?.email ?? newCompany.admin_email;
      const adminPhone = firstAdmin?.phone ?? newCompany.admin_phone;
      const adminWhatsapp = firstAdmin?.whatsapp ?? newCompany.admin_whatsapp;

      // Build firm_admins array for firms table (all admins; no overwrite)
      const firmAdminsPayload = (newCompany.firm_admins || [])
        .filter((a) => (a.email || '').trim())
        .map((a) => ({
          full_name: (a.full_name || '').trim() || (a.email || '').trim(),
          email: (a.email || '').trim(),
          phone: (a.phone || '').trim() || undefined,
          whatsapp: (a.whatsapp || '').trim() || undefined
        }));

      // Create company in firms table (first admin for legacy fields + full firm_admins array)
      const companyData = await fastAPI.createCompany({
        name: newCompany.name,
        subscription_plan: newCompany.subscription_plan,
        is_active: newCompany.is_active,
        max_users: newCompany.max_users,
        admin_name: adminName,
        admin_email: adminEmail,
        admin_phone: adminPhone,
        admin_whatsapp: adminWhatsapp,
        equipment_unlock_days: newCompany.equipment_unlock_days ?? 90,
        firm_admins: firmAdminsPayload.length ? firmAdminsPayload : undefined,
        max_equipment_limit: newCompany.max_equipment_limit ?? null
      });

      // // console.log('✅ Company created:', companyData);
      const firmId = companyData[0]?.id || companyData.id;

      // Upload logo if provided - with timeout protection
      if (newCompanyLogo) {
        try {
          console.log('📤 Starting logo upload for firm:', firmId, 'File size:', newCompanyLogo.size, 'bytes');
          
          // Add timeout wrapper to prevent infinite hanging
          const uploadWithTimeout = Promise.race([
            fastAPI.uploadCompanyLogo(newCompanyLogo, firmId),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error('Logo upload timed out. Please try again with a smaller file or check your connection.'));
              }, 35000); // 35 second timeout (slightly longer than API timeout)
            })
          ]);
          
          const logoUrl = await uploadWithTimeout;
          console.log('✅ Logo uploaded successfully:', logoUrl);
          
          // Update company with logo URL
          await fastAPI.updateCompany(firmId, { logo_url: logoUrl });
          console.log('✅ Company updated with logo URL');
        } catch (logoError: any) {
          console.error('⚠️ Error uploading logo (company still created):', {
            message: logoError?.message,
            name: logoError?.name,
            stack: logoError?.stack,
            error: logoError
          });
          const errorMessage = logoError?.message || 'Logo upload failed. You can add it later.';
          toast({ 
            title: 'Warning', 
            description: `Company created successfully, but logo upload failed: ${errorMessage}`, 
            variant: 'default',
            duration: 5000
          });
        }
      }

      // 🆕 Skip user creation for now - just proceed with invite
      // // console.log('🔍 Skipping user creation, proceeding with invite...');

      // 🆕 Test invites table first
      try {
        // // console.log('🔍 Testing invites table...');
        const tableExists = await fastAPI.testInvitesTable();
        if (!tableExists) {
          console.error('❌ Invites table does not exist or is not accessible');
          return;
        }
      } catch (testError) {
        console.error('❌ Error testing invites table:', testError);
        return;
      }

      // Create invite for each firm admin
      const adminsToInvite = (newCompany.firm_admins || []).filter((a) => (a.email || '').trim());
      for (const admin of adminsToInvite) {
        try {
          await fastAPI.createInvite({
            email: admin.email.trim(),
            full_name: (admin.full_name || '').trim() || admin.email.trim(),
            role: 'firm_admin',
            firm_id: firmId,
            invited_by: user.id
          });
        } catch (inviteError) {
          console.error('❌ Error creating invite for', admin.email, '(company still created):', inviteError);
        }
      }

      // Send notifications to each firm admin
      for (const admin of adminsToInvite) {
        try {
          await sendNotifications({
            company_name: newCompany.name,
            admin_name: (admin.full_name || '').trim() || admin.email,
            admin_email: admin.email.trim(),
            admin_phone: admin.phone || '',
            admin_whatsapp: admin.whatsapp || '',
            role: 'firm_admin',
            dashboard_url: getDashboardUrl('firm_admin')
          });
        } catch (notificationError) {
          console.error('❌ Notification error for', admin.email, '(company still created):', notificationError);
        }
      }

      // Reset form and refresh data
      setNewCompany({
        name: '',
        subscription_plan: 'basic',
        is_active: true,
        max_users: 5,
        admin_name: '',
        admin_email: '',
        admin_phone: '',
        admin_whatsapp: '',
        equipment_unlock_days: 90,
        firm_admins: [{ full_name: '', email: '', phone: '', whatsapp: '' }],
        max_equipment_limit: null
      });
      setNewCompanyLogo(null);
      setNewCompanyLogoPreview(null);
      setShowCreateCompany(false);
      await fetchData();

      toast({ title: 'Success', description: 'Company created successfully!' });
    } catch (error: any) {
      let errorMessage = 'Error creating company';

      if (error.response?.status === 409) {
        errorMessage = 'Company with this name or admin email already exists';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleEditCompany = async (company: Company) => {
    setEditingCompany(company);
    setEditingCompanyLogo(null);
    setEditingCompanyLogoPreview(company.logo_url || null);
  };

  const handleUpdateCompany = async () => {
    if (!editingCompany) return;

    // Ensure loading state is always reset, even on early return
    try {
      setUpdatingCompany(true);
      // console.log('🔄 Starting company update for:', editingCompany.id);

      // Upload new logo if provided - with timeout protection
      let logoUrl = editingCompany.logo_url;
      if (editingCompanyLogo) {
        try {
          // console.log('📤 Uploading company logo...');
          const uploadStartTime = Date.now();
          
          // Add timeout wrapper
          const uploadWithTimeout = Promise.race([
            fastAPI.uploadCompanyLogo(editingCompanyLogo, editingCompany.id),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error('Logo upload timed out. Please try again with a smaller file or check your connection.'));
              }, 35000); // 35 second timeout (slightly longer than API timeout)
            })
          ]);

          
          
          logoUrl = await uploadWithTimeout;
          const uploadTime = Date.now() - uploadStartTime;
          // console.log(`✅ Logo uploaded successfully in ${uploadTime}ms:`, logoUrl);
        } catch (logoError: any) {
          console.error('⚠️ Error uploading logo:', logoError);
          const errorMessage = logoError?.message || 'Logo upload failed. Company will be updated without logo change.';
          toast({ 
            title: 'Warning', 
            description: errorMessage, 
            variant: 'default',
            duration: 5000
          });
          // Continue with existing logo URL - don't fail the whole update
          logoUrl = editingCompany.logo_url;
        }
      }

      // First firm admin for legacy firm fields; full list for firm_admins (no overwrite)
      const firstAdmin = editingCompany.firm_admins?.[0];
      const admin_name = firstAdmin?.full_name ?? editingCompany.admin_name ?? '';
      const admin_email = firstAdmin?.email ?? editingCompany.admin_email ?? '';
      const admin_phone = firstAdmin?.phone ?? editingCompany.admin_phone ?? '';
      const admin_whatsapp = firstAdmin?.whatsapp ?? editingCompany.admin_whatsapp ?? '';

      const firmAdminsList = editingCompany.firm_admins ?? (editingCompany.admin_name || editingCompany.admin_email ? [{ full_name: editingCompany.admin_name ?? '', email: editingCompany.admin_email ?? '', phone: editingCompany.admin_phone ?? '', whatsapp: editingCompany.admin_whatsapp ?? '' }] : []);
      const firmAdminsPayload = firmAdminsList
        .filter((a) => (a.email || '').trim())
        .map((a) => ({
          ...(a.id && { id: a.id }),
          full_name: (a.full_name || '').trim() || (a.email || '').trim(),
          email: (a.email || '').trim(),
          phone: (a.phone || '').trim() || undefined,
          whatsapp: (a.whatsapp || '').trim() || undefined
        }));

      // Update company in firms table - this should always complete (all firm admins stored in firm_admins)
      // console.log('💾 Updating company data...');
      const updateData = {
        name: editingCompany.name,
        subscription_plan: editingCompany.subscription_plan,
        is_active: editingCompany.is_active,
        max_users: editingCompany.max_users,
        admin_name,
        admin_email,
        admin_phone,
        admin_whatsapp,
        logo_url: logoUrl,
        equipment_unlock_days: editingCompany.equipment_unlock_days ?? 90,
        updated_at: new Date().toISOString(),
        firm_admins: firmAdminsPayload,
        max_equipment_limit: editingCompany.max_equipment_limit ?? null
      };
      
      try {
        await fastAPI.updateCompany(editingCompany.id, updateData);
        // console.log('✅ Company data updated successfully');
      } catch (updateError: any) {
        console.error('❌ Error updating company data:', updateError);
        throw new Error(updateError?.response?.data?.message || updateError?.message || 'Failed to update company data');
      }

      // Update each existing firm admin user; create invite for new (no id) entries
      for (const admin of firmAdminsList) {
        const email = (admin.email || '').trim();
        if (!email) continue;
        if (admin.id) {
          try {
            await fastAPI.updateUser(admin.id, {
              full_name: (admin.full_name || '').trim() || email,
              email,
              ...(admin.phone !== undefined && { phone: admin.phone || null }),
              ...(admin.whatsapp !== undefined && { whatsapp: admin.whatsapp || null })
            });
          } catch (userError) {
            console.error('⚠️ Error updating firm admin user (non-critical):', userError);
          }
        } else {
          try {
            await fastAPI.createInvite({
              email,
              full_name: (admin.full_name || '').trim() || email,
              role: 'firm_admin',
              firm_id: editingCompany.id,
              invited_by: user.id
            });
          } catch (inviteError) {
            console.error('⚠️ Error creating invite for new firm admin (non-critical):', inviteError);
          }
        }
      }

      // Reset form state BEFORE refresh to avoid UI flicker
      setEditingCompany(null);
      setEditingCompanyLogo(null);
      setEditingCompanyLogoPreview(null);
      
      // Refresh data
      // console.log('🔄 Refreshing company data...');
      try {
        await fetchData();
        // console.log('✅ Data refreshed successfully');
      } catch (refreshError) {
        console.error('⚠️ Error refreshing data (non-critical):', refreshError);
        // Don't fail the whole operation if refresh fails
      }
      
      toast({ 
        title: 'Success', 
        description: 'Company updated successfully!', 
        duration: 3000
      });
      // console.log('✅ Company update completed successfully');
    } catch (error: any) {
      console.error('❌ Error updating company:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error occurred';
      toast({ 
        title: 'Error', 
        description: `Error updating company: ${errorMessage}`, 
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      // ALWAYS reset loading state, no matter what
      setUpdatingCompany(false);
      // console.log('🏁 Update process finished - loading state reset');
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (window.confirm('⚠️ Are you sure you want to delete this company? This action cannot be undone and will delete all associated users.')) {
      try {
        setDeletingCompany(companyId);
        // Deleting company

        // First delete all users in this company
        await fastAPI.deleteUsersByFirm(companyId);

        // Then delete the company
        await fastAPI.deleteCompany(companyId);

        // Refresh data
        await fetchData();
        toast({ title: 'Success', description: 'Company deleted successfully!' });
      } catch (error) {
        toast({ title: 'Error', description: 'Error deleting company: ' + (error as Error).message, variant: 'destructive' });
      } finally {
        setDeletingCompany(null);
      }
    }
  };

  const handleToggleServicesPaused = async (company: Company) => {
    try {
      setPausingCompany(company.id);
      const newPaused = !(company.services_paused ?? false);
      await fastAPI.updateCompany(company.id, { services_paused: newPaused });
      await fetchData();
      toast({
        title: newPaused ? 'Services paused' : 'Services resumed',
        description: newPaused ? `All users of ${company.name} are now blocked from actions.` : `Users of ${company.name} can use the dashboard again.`,
        duration: 3000
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update services pause: ' + (error as Error).message, variant: 'destructive' });
    } finally {
      setPausingCompany(null);
    }
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'premium':
        return 'bg-blue-600 text-white';
      case 'enterprise':
        return 'bg-indigo-600 text-white';
      case 'basic':
        return 'bg-blue-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-blue-100 text-blue-800'
      : 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait while we fetch your data...</p>
        </div>
      </div>
    );
  }

  const totalCompanies = companies.length;
  const totalUsers = users.length;
  const activeCompanies = companies.filter(c => c.is_active).length;

  // Dashboard rendering with data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex-1 flex items-center gap-2 sm:gap-3">
            <a href="/" className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 rounded-lg">
              <img 
                src="/Group%20134614.png" 
                alt="ProjectFIO.ai by Digiteq Solutions" 
                className="h-9 sm:h-10 lg:h-11 w-auto object-contain object-left"
              />
            </a>
          </div>

          {/* User Profile with Logout Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3 ml-4 relative" ref={dropdownRef}>
            <div className="text-right">
              <p className="text-xs sm:text-sm font-medium font-display text-gray-700">
                {userName || 'User'}
              </p>
              <p className="text-xs font-sans text-gray-500">Super Admin</p>
            </div>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 hover:opacity-90 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 bg-white border border-gray-200"
            >
              <img 
                src="/ProjectFlo_Symbol_Wht.png" 
                alt="ProjectFLO" 
                className="w-full h-full object-contain p-1"
              />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div 
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 user-dropdown"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{userName || 'User'}</p>
                  <p className="text-xs text-gray-500">Super Admin</p>
                </div>
                <div
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // // console.log('🔴 Logout clicked');
                    setShowDropdown(false);
                    await handleLogout();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="logout-button w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer select-none"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="bg-white border border-gray-200 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium uppercase tracking-wide font-sans">Total Companies</p>
                  <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2 font-display">{totalCompanies}</p>
                </div>
                <div className="w-[72px] h-[72px] bg-blue-100 rounded-full flex items-center justify-center shadow-sm">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <Grid className="w-[22px] h-[22px] text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium uppercase tracking-wide font-sans">Total Users</p>
                  <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2 font-display">{totalUsers}</p>
                </div>
                <div className="w-[72px] h-[72px] bg-blue-100 rounded-full flex items-center justify-center shadow-sm">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <Users className="w-[22px] h-[22px] text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium uppercase tracking-wide font-sans">Active Companies</p>
                  <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2 font-display">{activeCompanies}</p>
                </div>
                <div className="w-[72px] h-[72px] bg-blue-100 rounded-full flex items-center justify-center shadow-sm">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <Circle className="w-[22px] h-[22px] text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Company Button */}
        <div className="mb-8">
          <Button
            onClick={() => setShowCreateCompany(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loading}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Company
          </Button>
        </div>

        {/* Companies Overview */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 font-display">Companies Overview</h2>
          <p className="text-gray-600 mb-6 font-sans">Manage all companies. Users are managed by their respective company admins.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {companies.map((company) => (
              <Card key={company.id} className="overflow-hidden">
                {/* Top Section - Solid Blue Header */}
                <div className="bg-blue-600 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Grid className="w-5 h-5" />
                      <h3 className="font-bold text-lg font-display truncate">{company.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleServicesPaused(company)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        disabled={updatingCompany || deletingCompany}
                        title={company.services_paused ? 'Resume services' : 'Pause services'}
                      >
                        {pausingCompany === company.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : company.services_paused ? (
                          <Play className="w-4 h-4" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEditCompany(company)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        disabled={updatingCompany || deletingCompany}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        disabled={updatingCompany || deletingCompany}
                      >
                        {deletingCompany === company.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Section - Company Details */}
                <div className="p-4 bg-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Building className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700 font-sans">Company Details</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Plan:</span>
                      <Badge className={getPlanBadgeColor(company.subscription_plan)}>
                        {company.subscription_plan.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge className={getStatusBadgeColor(company.is_active)}>
                        {company.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Services:</span>
                      <Badge className={(company.services_paused ?? false) ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>
                        {(company.services_paused ?? false) ? 'Paused' : 'Active'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Max Users:</span>
                      <span className="text-sm text-gray-900">{company.max_users || 5}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Equipment:</span>
                      <span className="text-sm text-gray-900">
                        {company.equipment_count ?? 0}
                        {company.max_equipment_limit != null ? ` / ${company.max_equipment_limit}` : ' (unlimited)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Onboarded on:</span>
                      <span className="text-sm text-gray-900">{formatDate(company.created_at)}</span>
                    </div>
                  </div>

                  {/* Company Admins Section (multiple firm admins) - fixed height, hidden vertical scroll */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700 font-sans">Company Admins</span>
                    </div>

                    <div
                      className="space-y-2 min-h-[72px] max-h-[72px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {(company.firm_admins && company.firm_admins.length > 0) ? (
                        <>
                          {company.firm_admins.map((admin, i) => (
                            <div key={admin.id ?? i} className="flex items-center gap-3 flex-shrink-0">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium flex-shrink-0">
                                {(admin.full_name || admin.email) ? (admin.full_name || admin.email).charAt(0).toUpperCase() : 'A'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 font-display truncate">{admin.full_name || admin.email || '—'}</p>
                                <p className="text-xs text-gray-500 font-sans truncate">{admin.email || '—'}</p>
                                {(admin.phone || admin.whatsapp) && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {[admin.phone, admin.whatsapp].filter(Boolean).join(' · ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : company.admin_name || company.admin_email ? (
                        <>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">
                              {company.admin_name ? company.admin_name.charAt(0).toUpperCase() : 'A'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 font-display">{company.admin_name}</p>
                              <p className="text-xs text-gray-500 font-sans">{company.admin_email}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between flex-shrink-0">
                            <span className="text-sm text-gray-600">Phone:</span>
                            <span className="text-sm text-gray-900">{company.admin_phone || 'Not provided'}</span>
                          </div>
                          <div className="flex items-center justify-between flex-shrink-0">
                            <span className="text-sm text-gray-600">WhatsApp:</span>
                            <span className="text-sm text-gray-900">{company.admin_whatsapp || 'Not provided'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-2 flex-shrink-0">
                          <p className="text-sm text-gray-500">No admin user found</p>
                          <p className="text-xs text-gray-400">Admin will be created when company is set up</p>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="mt-4 pt-4 border-t border-gray-200 bg-gray-50 -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>{company.user_count}/{company.max_users || 5} Users</span>
                        <span>{(company.firm_admins?.length ?? (company.admin_name || company.admin_email ? 1 : 0))} Admins</span>
                        <span>{Math.max(0, company.user_count - (company.firm_admins?.length ?? (company.admin_name || company.admin_email ? 1 : 0)))} Members</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Create Company Modal */}
      {showCreateCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Create New Company</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                <select
                  value={newCompany.subscription_plan}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, subscription_plan: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={newCompany.is_active ? 'true' : 'false'}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={newCompany.max_users}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, max_users: parseInt(e.target.value) || 5 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5"
                  min="1"
                  max="100"
                />
              </div>

              {/* Firm Admins (multiple) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Firm Admins</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewCompany(prev => ({
                      ...prev,
                      firm_admins: [...(prev.firm_admins || []), { full_name: '', email: '', phone: '', whatsapp: '' }]
                    }))}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add firm admin
                  </Button>
                </div>
                {(newCompany.firm_admins || []).map((admin, idx) => (
                  <div key={idx} className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50/50 space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-medium text-gray-600">Firm admin {idx + 1}</span>
                      {(newCompany.firm_admins?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewCompany(prev => ({
                            ...prev,
                            firm_admins: prev.firm_admins?.filter((_, i) => i !== idx) ?? []
                          }))}
                          className="text-red-600 hover:text-red-800 p-1"
                          aria-label="Remove firm admin"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={admin.full_name}
                        onChange={(e) => setNewCompany(prev => ({
                          ...prev,
                          firm_admins: (prev.firm_admins || []).map((a, i) => i === idx ? { ...a, full_name: e.target.value } : a)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        value={admin.email}
                        onChange={(e) => setNewCompany(prev => ({
                          ...prev,
                          firm_admins: (prev.firm_admins || []).map((a, i) => i === idx ? { ...a, email: e.target.value } : a)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Email *"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        value={admin.phone || ''}
                        onChange={(e) => setNewCompany(prev => ({
                          ...prev,
                          firm_admins: (prev.firm_admins || []).map((a, i) => i === idx ? { ...a, phone: e.target.value } : a)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Phone"
                      />
                      <input
                        type="tel"
                        value={admin.whatsapp || ''}
                        onChange={(e) => setNewCompany(prev => ({
                          ...prev,
                          firm_admins: (prev.firm_admins || []).map((a, i) => i === idx ? { ...a, whatsapp: e.target.value } : a)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="WhatsApp"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment dashboard unlock (days)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={newCompany.equipment_unlock_days}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const num = isNaN(v) ? 90 : Math.max(0, Math.min(365, v));
                    setNewCompany(prev => ({ ...prev, equipment_unlock_days: num }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 60 or 90"
                />
                <p className="text-xs text-gray-500 mt-1">Equipment tab stays locked for this many days after onboarding so users get used to the app step by step.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max equipment limit (optional)</label>
                <input
                  type="number"
                  min={0}
                  value={newCompany.max_equipment_limit ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    const num = v === null ? null : (isNaN(v as number) ? 0 : Math.max(0, v as number));
                    setNewCompany(prev => ({ ...prev, max_equipment_limit: num }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Unlimited if empty"
                />
                <p className="text-xs text-gray-500 mt-1">Total equipment (project + standalone) this company can create. Leave empty for unlimited.</p>
              </div>

              {/* Company Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo (Optional)</label>
                <div className="space-y-3">
                  {newCompanyLogoPreview ? (
                    <div className="relative">
                      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
                        {newCompanyLogoPreview.toLowerCase().endsWith('.pdf') ? (
                          <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                          </div>
                        ) : (
                          <img 
                            src={newCompanyLogoPreview} 
                            alt="Logo preview" 
                            className="max-w-full max-h-[100px] object-contain"
                            style={{ width: 'auto', height: 'auto' }}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCompanyLogo(null);
                          setNewCompanyLogoPreview(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG, PDF (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Validate file size (5MB max)
                            if (file.size > 5 * 1024 * 1024) {
                              toast({ 
                                title: 'Error', 
                                description: 'File size too large. Maximum size is 5MB.', 
                                variant: 'destructive' 
                              });
                              return;
                            }
                            setNewCompanyLogo(file);
                            // Create preview
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewCompanyLogoPreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            } else if (file.type === 'application/pdf') {
                              setNewCompanyLogoPreview('pdf');
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleCreateCompany}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                disabled={!newCompany.name || !(newCompany.firm_admins?.some(a => (a.email || '').trim())) || creatingCompany}
              >
                {creatingCompany ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Company'
                )}
              </Button>
              <Button
                onClick={() => setShowCreateCompany(false)}
                variant="outline"
                className="flex-1"
                disabled={creatingCompany}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Edit Company</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                <select
                  value={editingCompany.subscription_plan}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, subscription_plan: e.target.value as any } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editingCompany.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, is_active: e.target.value === 'active' } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={editingCompany.max_users || 5}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, max_users: parseInt(e.target.value) || 5 } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="100"
                />
              </div>

              {/* Firm Admins (multiple) - pre-filled from company */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Firm Admins</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCompany(prev => prev ? {
                      ...prev,
                      firm_admins: [...(prev.firm_admins ?? []), { full_name: '', email: '', phone: '', whatsapp: '' }]
                    } : null)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add firm admin
                  </Button>
                </div>
                {(editingCompany.firm_admins ?? []).map((admin, idx) => (
                  <div key={admin.id ?? `new-${idx}`} className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50/50 space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-medium text-gray-600">Firm admin {idx + 1}</span>
                      {(editingCompany.firm_admins?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditingCompany(prev => prev ? {
                            ...prev,
                            firm_admins: prev.firm_admins?.filter((_, i) => i !== idx) ?? []
                          } : null)}
                          className="text-red-600 hover:text-red-800 p-1"
                          aria-label="Remove firm admin"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={admin.full_name || ''}
                        onChange={(e) => setEditingCompany(prev => prev ? {
                          ...prev,
                          firm_admins: (prev.firm_admins ?? []).map((a, i) => i === idx ? { ...a, full_name: e.target.value } : a)
                        } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        value={admin.email || ''}
                        onChange={(e) => setEditingCompany(prev => prev ? {
                          ...prev,
                          firm_admins: (prev.firm_admins ?? []).map((a, i) => i === idx ? { ...a, email: e.target.value } : a)
                        } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Email *"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        value={admin.phone || ''}
                        onChange={(e) => setEditingCompany(prev => prev ? {
                          ...prev,
                          firm_admins: (prev.firm_admins ?? []).map((a, i) => i === idx ? { ...a, phone: e.target.value } : a)
                        } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Phone"
                      />
                      <input
                        type="tel"
                        value={admin.whatsapp || ''}
                        onChange={(e) => setEditingCompany(prev => prev ? {
                          ...prev,
                          firm_admins: (prev.firm_admins ?? []).map((a, i) => i === idx ? { ...a, whatsapp: e.target.value } : a)
                        } : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="WhatsApp"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment dashboard unlock (days)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={editingCompany.equipment_unlock_days ?? 90}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const num = isNaN(v) ? 90 : Math.max(0, Math.min(365, v));
                    setEditingCompany(prev => prev ? { ...prev, equipment_unlock_days: num } : null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 60 or 90"
                />
                <p className="text-xs text-gray-500 mt-1">Equipment tab stays locked for this many days after onboarding.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max equipment limit (optional)</label>
                <input
                  type="number"
                  min={0}
                  value={editingCompany.max_equipment_limit ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    const num = v === null ? null : (isNaN(v as number) ? 0 : Math.max(0, v as number));
                    setEditingCompany(prev => prev ? { ...prev, max_equipment_limit: num } : null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Unlimited if empty"
                />
                <p className="text-xs text-gray-500 mt-1">Total equipment (project + standalone) this company can create. Leave empty for unlimited.</p>
              </div>

              {/* Company Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                <div className="space-y-3">
                  {(editingCompanyLogoPreview || editingCompany?.logo_url) ? (
                    <div className="relative">
                      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
                        {(editingCompanyLogoPreview && editingCompanyLogoPreview !== 'pdf' && !editingCompanyLogoPreview.startsWith('http')) ? (
                          // New logo preview (local file)
                          editingCompanyLogoPreview.toLowerCase().endsWith('.pdf') ? (
                            <div className="flex flex-col items-center">
                              <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                            </div>
                          ) : (
                            <img 
                              src={editingCompanyLogoPreview} 
                              alt="Logo preview" 
                              className="max-w-full max-h-[100px] object-contain"
                              style={{ width: 'auto', height: 'auto' }}
                            />
                          )
                        ) : (
                          // Existing logo from database
                          editingCompany?.logo_url && (
                            editingCompany.logo_url.toLowerCase().endsWith('.pdf') ? (
                              <div className="flex flex-col items-center">
                                <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                              </div>
                            ) : (
                              <img 
                                src={editingCompany.logo_url} 
                                alt="Company Logo" 
                                className="max-w-full max-h-[100px] object-contain"
                                style={{ width: 'auto', height: 'auto' }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCompanyLogo(null);
                          setEditingCompanyLogoPreview(null);
                          if (editingCompany) {
                            setEditingCompany({ ...editingCompany, logo_url: null });
                          }
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG, PDF (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Validate file size (5MB max)
                            if (file.size > 5 * 1024 * 1024) {
                              toast({ 
                                title: 'Error', 
                                description: 'File size too large. Maximum size is 5MB.', 
                                variant: 'destructive' 
                              });
                              return;
                            }
                            setEditingCompanyLogo(file);
                            // Create preview
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setEditingCompanyLogoPreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            } else if (file.type === 'application/pdf') {
                              setEditingCompanyLogoPreview('pdf');
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleUpdateCompany}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                disabled={updatingCompany}
              >
                {updatingCompany ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Updating...
                  </>
                ) : (
                  'Update Company'
                )}
              </Button>
              <Button
                onClick={() => {
                  setEditingCompany(null);
                  setEditingCompanyLogo(null);
                  setEditingCompanyLogoPreview(null);
                }}
                variant="outline"
                className="flex-1"
                disabled={updatingCompany}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
