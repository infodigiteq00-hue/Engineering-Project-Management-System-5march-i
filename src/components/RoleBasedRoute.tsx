import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import SuperAdminDashboard from "@/pages/SuperAdminDashboard";
import Index from "@/pages/Index";
import NoPermission from "@/components/NoPermission";

const RoleBasedRoute = () => {
  // RoleBasedRoute component loaded
  
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check localStorage first before any async operations
    const storedRole = localStorage.getItem('userRole');
    const storedName = localStorage.getItem('userName');
    const storedUserId = localStorage.getItem('userId');

    if (storedRole && storedName && storedUserId) {
      // console.log('📱 Found stored user data, setting immediately...');
      setUserRole(storedRole);
      setUserName(storedName);
      setLoading(false);
      // Still verify session in background
      checkUserAuth();
      return;
    }

    // No stored data, need to authenticate
    checkUserAuth();
  }, []);

  const checkUserAuth = async () => {
    try {
      // Check if we already have user data (from useEffect)
      if (userRole && userName) {
        // console.log('📱 User data already set, just verifying session...');
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          // console.log('❌ No valid session, clearing storage and redirecting to login');
          const { safeLocalStorageClear } = await import('@/utils/cache');
          safeLocalStorageClear();
          window.location.href = '/login';
          return;
        }

        // console.log('✅ Session valid, user already authenticated');
        return;
      }

      // No stored data, need to authenticate and fetch from database
      // console.log('🔍 No stored data, authenticating user...');
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        // console.log('No active session, redirecting to login');
        window.location.href = '/login';
        return;
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = '/login';
        return;
      }
      
      // Get user role from our users table
      let userData = null;
      let userError = null;

      try {
        // First try to find user by email
        const { data: userByEmail, error: emailError } = await supabase
          .from('users')
          .select('role, full_name, firm_id, is_active')
          .eq('email', user.email)
          .single();

        if (userByEmail && !emailError) {
          userData = userByEmail;
        } else {
          // Try by ID as fallback
          const { data: userById, error: idError } = await supabase
            .from('users')
            .select('role, full_name, firm_id, is_active')
            .eq('id', user.id)
            .single();

          if (userById && !idError) {
            userData = userById;
          } else {
            // Create user record with default viewer role
            const { data: newUser, error: createError } = await supabase
              .from('users')
              .insert([
                {
                  id: user.id,
                  email: user.email,
                  full_name: user.user_metadata?.full_name || 'User',
                  role: 'viewer',
                  is_active: true
                }
              ])
              .select()
              .single();

            if (newUser && !createError) {
              userData = newUser;
            } else {
              userError = createError;
            }
          }
        }
      } catch (error) {
        userError = error;
      }

      if (userError || !userData) {
        console.error('❌ User not found in database:', userError);
        window.location.href = '/login';
        return;
      }

      if (!userData.is_active) {
        toast({ title: 'Error', description: 'Your account has been deactivated. Please contact your administrator.', variant: 'destructive' });
        await supabase.auth.signOut();
        window.location.href = '/login';
        return;
      }

      // Store user info in localStorage for future use
      localStorage.setItem('userRole', userData.role);
      localStorage.setItem('userName', userData.full_name);
      localStorage.setItem('firmId', userData.firm_id || '');
      localStorage.setItem('userId', user.id);

      setUserRole(userData.role);
      setUserName(userData.full_name);
      
      // User auth check completed successfully
    } catch (error) {
      console.error('Auth error:', error);
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      const { safeLocalStorageClear } = await import('@/utils/cache');
      safeLocalStorageClear();
      navigate('/login');
    } catch (error) {
      // Error signing out
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
          <p className="mt-2 text-sm text-gray-500">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  // Render appropriate dashboard based on role and current path
  const currentPath = window.location.pathname;
  
  // If user is on /super-admin path, show SuperAdminDashboard
  if (currentPath === '/super-admin' && userRole === 'super_admin') {
    return <SuperAdminDashboard />;
  }
  
  // For all other paths (/company-dashboard, /dashboard, /), show Index (normal dashboard)
  switch (userRole) {
    case 'super_admin':
      // Super admin can access both dashboards based on URL
      if (currentPath === '/super-admin') {
        return <SuperAdminDashboard />;
      } else {
        return <Index />;
      }
    
    case 'firm_admin':
    case 'project_manager':
    case 'vdcr_manager':
    case 'editor':
    case 'viewer':
      return <Index />;
    
    case null:
    case undefined:
    case '':
      // No role assigned - show no permission page
      return <NoPermission />;
    
    default:
      // Unknown role - show no permission page
      return <NoPermission />;
  }
};

export default RoleBasedRoute;
