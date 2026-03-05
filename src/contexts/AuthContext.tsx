import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

/** Cached firm data - single source for Index (no duplicate getFirmById) */
export interface FirmData {
  name?: string;
  logo_url?: string | null;
  services_paused?: boolean;
  equipment_unlock_days?: number;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  userName: string | null;
  firmId: string | null;
  /** Firm data fetched once in AuthContext; consumers use this instead of calling getFirmById */
  firmData: FirmData | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Use auth when inside AuthProvider; returns undefined when outside (e.g. after provider unmount). Use for gates that must not throw. */
export const useAuthOptional = (): AuthContextType | undefined => useContext(AuthContext);

interface AuthProviderProps {
  children: React.ReactNode;
}

const FIRM_DATA_CACHE_KEY = 'epms_firm_data_cache';

/** Restore firm data from localStorage so logo/name are available immediately on refresh */
function getInitialFirmData(): FirmData | null {
  try {
    const raw = localStorage.getItem(FIRM_DATA_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FirmData;
      return parsed;
    }
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const name = localStorage.getItem('companyName') || userData.company_name;
    const logo = localStorage.getItem('companyLogo') || userData.logo_url;
    if (name || logo) {
      return { name: name || undefined, logo_url: logo ?? undefined };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Restore user/firm ids and role from localStorage for immediate use on refresh */
function getInitialStoredAuth(): { firmId: string | null; userRole: string | null; userName: string | null } {
  try {
    const firmId = localStorage.getItem('firmId') || JSON.parse(localStorage.getItem('userData') || '{}').firm_id || null;
    const userRole = localStorage.getItem('userRole') || JSON.parse(localStorage.getItem('userData') || '{}').role || null;
    const userName = localStorage.getItem('userName') || JSON.parse(localStorage.getItem('userData') || '{}').full_name || null;
    return { firmId, userRole, userName };
  } catch {
    return { firmId: null, userRole: null, userName: null };
  }
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const initialStored = getInitialStoredAuth();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(initialStored.userRole);
  const [userName, setUserName] = useState<string | null>(initialStored.userName);
  const [firmId, setFirmId] = useState<string | null>(initialStored.firmId);
  const [firmData, setFirmData] = useState<FirmData | null>(getInitialFirmData);
  const [loading, setLoading] = useState(() => {
    // If we have cached firm + role, consider auth "ready" immediately so UI and project fetch can run
    return !(initialStored.firmId && initialStored.userRole);
  });
  const firmRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      // Restore from localStorage first so logo, name, firmId show immediately (no flash)
      const stored = getInitialStoredAuth();
      if (stored.firmId && stored.userRole) {
        setFirmId(stored.firmId);
        setUserRole(stored.userRole);
        setUserName(stored.userName ?? localStorage.getItem('userName'));
        const cachedFirm = getInitialFirmData();
        if (cachedFirm) setFirmData(cachedFirm);
        // Do NOT set loading false here. Wait for getSession + fetchUserData so userId/userData
        // are in localStorage before Index runs project fetch (non-firm_admin need p_user_email).
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setLoading(false);
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserData(session.user.id);
          // console.log('✅ AuthContext: fetchUserData completed', { firmId, userRole });
          
          // ALWAYS restore from localStorage as backup - ensures state is always set
          // This handles cases where fetchUserData returns early or fails silently
          const storedRole = localStorage.getItem('userRole');
          const storedName = localStorage.getItem('userName');
          const storedFirmId = localStorage.getItem('firmId');
          
          if (storedRole && storedName && storedFirmId) {
            // Always set from localStorage to ensure state is populated
            // fetchUserData might have set it, but this ensures it's definitely set
            setUserRole(storedRole);
            setUserName(storedName);
            setFirmId(storedFirmId);
            // console.log('✅ AuthContext: Ensured state from localStorage', { storedFirmId, storedRole });
          }
        } else {
          // Try to restore from localStorage if no session
          const storedRole = localStorage.getItem('userRole');
          const storedName = localStorage.getItem('userName');
          const storedFirmId = localStorage.getItem('firmId');
          
          if (storedRole && storedName) {
            setUserRole(storedRole);
            setUserName(storedName);
            setFirmId(storedFirmId);
            // console.log('✅ AuthContext: Restored from localStorage (no session)', { storedFirmId, storedRole });
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Try localStorage as fallback even on error
        const storedRole = localStorage.getItem('userRole');
        const storedName = localStorage.getItem('userName');
        const storedFirmId = localStorage.getItem('firmId');
        
        if (storedRole && storedName && storedFirmId) {
          setUserRole(storedRole);
          setUserName(storedName);
          setFirmId(storedFirmId);
          // console.log('✅ AuthContext: Restored from localStorage after error', { storedFirmId, storedRole });
        }
      } finally {
        // Always restore from localStorage before setting loading to false
        // This ensures state is set even if fetchUserData failed
        const storedRole = localStorage.getItem('userRole');
        const storedName = localStorage.getItem('userName');
        const storedFirmId = localStorage.getItem('firmId');
        
        if (storedRole && storedName && storedFirmId) {
          setUserRole(storedRole);
          setUserName(storedName);
          setFirmId(storedFirmId);
          // console.log('✅ AuthContext: Final localStorage restore in finally block', { storedFirmId, storedRole });
        }
        
        // Always set loading to false
        // console.log('✅ AuthContext: Setting loading to false', { 
        //   firmId: storedFirmId || firmId, 
        //   userRole: storedRole || userRole 
        // });
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log('Auth state changed:', event, session?.user?.id);
      
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        // Only clear user data and localStorage on explicit sign out.
        // Do NOT clear on INITIAL_SESSION or other events with null session — on refresh
        // Supabase can fire with session null before session is rehydrated, which would
        // wipe localStorage and prevent Index from loading projects (no firmId/userRole).
        if (event === 'SIGNED_OUT') {
          setUserRole(null);
          setUserName(null);
          setFirmId(null);
          setFirmData(null);
          const { clearCache } = await import('@/utils/cache');
          clearCache();
          localStorage.clear();
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // First try to get the current user's email from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser?.email) {
        console.error('⚠️ No authenticated user email found - trying localStorage fallback');
        // Try localStorage as fallback
        const storedRole = localStorage.getItem('userRole');
        const storedName = localStorage.getItem('userName');
        const storedFirmId = localStorage.getItem('firmId');
        
        if (storedRole && storedName && storedFirmId) {
          setUserRole(storedRole);
          setUserName(storedName);
          setFirmId(storedFirmId);
          // console.log('✅ AuthContext: Using localStorage fallback (no email)', { storedFirmId, storedRole });
        }
        return;
      }

      // Search by email instead of ID to handle ID mismatches
      const { data: userData, error } = await supabase
        .from('users')
        .select('role, full_name, firm_id, is_active, id, email')
        .eq('email', authUser.email)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
      
      const typedUserData = userData as any;

      if (error) {
        console.error('⚠️ Error fetching user data:', error, '- trying localStorage fallback');
        // Try localStorage as fallback
        const storedRole = localStorage.getItem('userRole');
        const storedName = localStorage.getItem('userName');
        const storedFirmId = localStorage.getItem('firmId');
        
        if (storedRole && storedName && storedFirmId) {
          setUserRole(storedRole);
          setUserName(storedName);
          setFirmId(storedFirmId);
          // console.log('✅ AuthContext: Using localStorage fallback (error)', { storedFirmId, storedRole });
        }
        return;
      }

      // Handle case where no user data is found
      if (!typedUserData) {
        console.warn('No user data found in database for email:', authUser.email);
        return;
      }

      if (!typedUserData.is_active) {
        console.warn('User account is inactive');
        return;
      }

      setUserRole(typedUserData.role);
      setUserName(typedUserData.full_name);
      setFirmId(typedUserData.firm_id);

      // Single source: fetch firm once here; Index and others use firmData from context (no duplicate getFirmById)
      let companyName = '';
      let logoUrl: string | null = null;
      if (typedUserData.firm_id) {
        try {
          const { fastAPI } = await import('@/lib/api');
          const firm = await fastAPI.getFirmById(typedUserData.firm_id);
          if (firm) {
            companyName = firm.name ?? '';
            logoUrl = firm.logo_url ?? null;
            const cached: FirmData = {
              name: firm.name,
              logo_url: firm.logo_url,
              services_paused: firm.services_paused,
              equipment_unlock_days: firm.equipment_unlock_days,
              created_at: firm.created_at,
            };
            setFirmData(cached);
            try {
              localStorage.setItem(FIRM_DATA_CACHE_KEY, JSON.stringify(cached));
            } catch {
              // quota
            }
            localStorage.setItem('companyName', companyName);
            if (logoUrl) localStorage.setItem('companyLogo', logoUrl);
            else localStorage.removeItem('companyLogo');
          }
        } catch (firmError) {
          // Non-fatal - use localStorage fallback
          companyName = localStorage.getItem('companyName') ?? '';
          logoUrl = localStorage.getItem('companyLogo');
        }
      }

      // Store in localStorage
      localStorage.setItem('userRole', typedUserData.role);
      localStorage.setItem('userName', typedUserData.full_name);
      localStorage.setItem('firmId', typedUserData.firm_id || '');
      localStorage.setItem('userId', userId);
      
      // Also store as userData object to match what Index.tsx expects
      // This ensures that after page refresh, Index.tsx can find userData.firm_id
      const userDataObject = {
        id: userId,
        role: typedUserData.role,
        full_name: typedUserData.full_name,
        email: typedUserData.email || authUser.email,
        firm_id: typedUserData.firm_id,
        is_active: typedUserData.is_active,
        company_name: companyName,
        logo_url: logoUrl
      };
      localStorage.setItem('userData', JSON.stringify(userDataObject));
      
      // console.log('✅ AuthContext: User data loaded and stored', { 
      //   firmId: typedUserData.firm_id, 
      //   role: typedUserData.role,
      //   hasUserData: !!localStorage.getItem('userData')
      // });
    } catch (error) {
      console.error('Error in fetchUserData:', error);
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  const signOut = async () => {
    try {
      if (firmRealtimeChannelRef.current) {
        supabase.removeChannel(firmRealtimeChannelRef.current);
        firmRealtimeChannelRef.current = null;
      }
      await supabase.auth.signOut();
      setUser(null);
      setUserRole(null);
      setUserName(null);
      setFirmId(null);
      setFirmData(null);
      try {
        localStorage.removeItem(FIRM_DATA_CACHE_KEY);
      } catch {
        // ignore
      }
      // Clear cache on logout
      const { clearCache } = await import('@/utils/cache');
      clearCache();
      localStorage.clear();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Realtime: update firmData when firm row changes (e.g. services_paused) so no polling needed
  useEffect(() => {
    const id = firmId;
    if (!id) return;
    const channel = supabase
      .channel(`firm-data-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'firms', filter: `id=eq.${id}` },
        (payload: { new?: Record<string, unknown> }) => {
          if (payload.new && typeof payload.new === 'object') {
            setFirmData((prev) => {
              const next: FirmData = prev ? { ...prev } : {};
              if (typeof payload.new?.services_paused === 'boolean') next.services_paused = payload.new.services_paused;
              if (payload.new?.name !== undefined) next.name = String(payload.new.name);
              if (payload.new?.logo_url !== undefined) next.logo_url = payload.new.logo_url as string | null;
              if (payload.new?.equipment_unlock_days !== undefined) next.equipment_unlock_days = Number(payload.new.equipment_unlock_days);
              if (payload.new?.created_at !== undefined) next.created_at = String(payload.new.created_at);
              return Object.keys(next).length ? next : null;
            });
            try {
              const stored = localStorage.getItem(FIRM_DATA_CACHE_KEY);
              const parsed = stored ? JSON.parse(stored) as FirmData : {};
              if (typeof payload.new?.services_paused === 'boolean') parsed.services_paused = payload.new.services_paused;
              if (payload.new?.name !== undefined) parsed.name = String(payload.new.name);
              if (payload.new?.logo_url !== undefined) parsed.logo_url = payload.new.logo_url as string | null;
              if (payload.new?.equipment_unlock_days !== undefined) parsed.equipment_unlock_days = Number(payload.new.equipment_unlock_days);
              if (payload.new?.created_at !== undefined) parsed.created_at = String(payload.new.created_at);
              localStorage.setItem(FIRM_DATA_CACHE_KEY, JSON.stringify(parsed));
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe();
    firmRealtimeChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      firmRealtimeChannelRef.current = null;
    };
  }, [firmId]);

  const value = {
    user,
    userRole,
    userName,
    firmId,
    firmData,
    loading,
    signOut,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};