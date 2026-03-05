import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fastAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const Login = () => {
  // console.log('🔍 Login component loaded!');
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear stale auth data on component mount - NON-BLOCKING for better performance
  useEffect(() => {
    // Clear localStorage immediately (synchronous, fast)
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('sb-') || 
      key.includes('supabase') ||
      key === 'userData' || 
      key === 'userRole' || 
      key === 'userName' || 
      key === 'userEmail' || 
      key === 'firmId' || 
      key === 'userId' ||
      key === 'companyName'
    );
    keys.forEach(key => localStorage.removeItem(key));
    
    // Clear session asynchronously (non-blocking) - don't wait for it
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          // Sign out in background - don't block
          supabase.auth.signOut().catch(() => {
            // Ignore errors - already cleared localStorage
          });
        }
      })
      .catch(() => {
        // Ignore - already cleared localStorage
      });
    
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(""); // Clear error when user types
  };

  const redirectBasedOnRole = (role: string) => {
    // console.log('🎯 Redirecting based on role:', role);
    
    // Small delay to ensure alert is shown
    setTimeout(() => {
      switch (role) {
        case 'super_admin':
          // console.log('🚀 Redirecting to super admin dashboard');
          navigate('/super-admin');
          break;
        case 'firm_admin':
          // console.log('🏢 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'project_manager':
          // console.log('📋 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'editor':
          // console.log('🔧 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'viewer':
          // console.log('👁️ Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'vdcr_manager':
          // console.log('📋 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        default:
          // console.log('❌ Unknown role, redirecting to no permission');
          navigate('/no-permission');
          break;
      }
    }, 500); // 0.5 second delay
  };

  // Helper function to add timeout to Supabase auth calls
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
      })
    ]);
  };

  // Helper function to retry with exponential backoff
  const retryWithBackoff = async <T,>(
    fn: () => Promise<T>,
    maxRetries: number = 2,
    baseDelay: number = 500 // Reduced from 1000ms to 500ms for faster retries
  ): Promise<T> => {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        // Don't retry on auth errors (wrong password, etc.) or timeout errors
        if (error?.message?.includes('Invalid login') || 
            error?.message?.includes('Email not confirmed') ||
            error?.message?.includes('Request timeout') ||
            error?.status === 400) {
          throw error;
        }
        // Exponential backoff: 500ms, 1s (reduced delays)
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple simultaneous submissions
    if (isSubmittingRef.current) {
      return;
    }
    
    isSubmittingRef.current = true;
    setLoading(true);
    setError("");

    // Set timeout protection (45 seconds to account for retries: 3 attempts × 12s + backoff delays)
    timeoutRef.current = setTimeout(() => {
      if (isSubmittingRef.current) {
        console.error('⏱️ Login timeout - operation took too long');
        setError("Login timeout: The request took too long. Please check your connection and try again.");
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }, 45000); // 45 seconds timeout (accounts for retries)

    try {
      // Skip session cleanup - already done on mount (non-blocking)
      // Go straight to login for faster response
      
      // Sign in with Supabase with timeout and retry
      let authData: any = null;
      let authError: any = null;

      try {
        // Retry login up to 2 times with exponential backoff (only on network errors)
        const result = await retryWithBackoff(
          () => withTimeout(
            supabase.auth.signInWithPassword({
              email: formData.email,
              password: formData.password,
            }),
            8000 // 8 second timeout per attempt (reduced from 10s - should be fast now)
          ),
          2, // max 2 retries
          500 // start with 500ms delay (reduced from 1000ms)
        );
        
        authData = result.data;
        authError = result.error;
        
        if (authError) {
          console.error('🚨 Sign in error:', authError);
          setError(`Login failed: ${authError.message}. Please check your credentials or create an account first.`);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          isSubmittingRef.current = false;
          return;
        }

        if (!authData || !authData.user) {
          console.error('🚨 No user data returned');
          setError("No user data returned. Please create an account first by going to the Sign Up page.");
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          isSubmittingRef.current = false;
          return;
        }
      } catch (error: any) {
        console.error('🚨 Login error:', error);
        if (error?.message === 'Request timeout') {
          setError("Login timeout: The server took too long to respond. This may be due to network issues. Please check your connection and try again.");
        } else if (error?.message?.includes('Invalid login') || error?.message?.includes('Invalid credentials')) {
          setError("Invalid email or password. Please check your credentials and try again.");
        } else {
          setError(`Login failed: ${error?.message || 'Unknown error'}. Please try again.`);
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      // Get user role from our users table - OPTIMIZED: use only user ID (guaranteed from auth)
      let userData = null;
      let userError = null;

      // 🔧 FIX: Check invites table first for pending invitations (case-insensitive)
      let inviteData = null;
      try {
        const normalizedEmail = authData.user.email?.toLowerCase().trim();
        // console.log('🔍 Checking invites for email (normalized):', normalizedEmail);
        inviteData = await fastAPI.getInviteByEmail(normalizedEmail || authData.user.email);
        // console.log('🔍 Invite check result:', inviteData ? {
        //   id: inviteData.id,
        //   email: inviteData.email,
        //   role: inviteData.role,
        //   status: inviteData.status,
        //   firm_id: inviteData.firm_id,
        //   project_id: inviteData.project_id
        // } : 'No invite found');
      } catch (inviteError) {
        console.error('❌ Error checking invites:', inviteError);
      }

      try {
        // Use only ID query (faster, guaranteed to exist from auth) - reduced from 8s to 5s timeout
        const idResult = await withTimeout(
          supabase
            .from('users')
            .select('id, role, full_name, firm_id, email, is_active')
            .eq('id', authData.user.id)
            .maybeSingle() as unknown as Promise<any>,
          5000 // 5 second timeout (reduced from 8s)
        );

        if (idResult.data && !idResult.error) {
          userData = idResult.data;
          
          // 🔧 FIX: If user exists but has wrong role, check invites and update
          if (inviteData && inviteData.role && userData.role !== inviteData.role) {
            // console.log('⚠️ User role mismatch detected! User has:', userData.role, 'but invite says:', inviteData.role);
            // console.log('🔄 Updating user role from invite...');
            
            const { data: updateData, error: updateError } = await supabase
              .from('users')
              .update({
                role: inviteData.role,
                firm_id: inviteData.firm_id || userData.firm_id,
                project_id: inviteData.project_id || userData.project_id,
                assigned_by: inviteData.invited_by || userData.assigned_by
              } as any)
              .eq('id', authData.user.id)
              .select();
            
            if (!updateError && updateData) {
              userData = updateData;
              // console.log('✅ User role updated from invite:', updateData);
              
              // Mark invite as accepted
              try {
                await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
                // console.log('✅ Invite marked as accepted');
              } catch (updateInviteError) {
                // console.log('⚠️ Could not update invite status:', updateInviteError);
              }
            } else {
              console.error('❌ Failed to update user role:', updateError);
            }
          }
        } 
        // If user not found by ID, try email-based lookup (handles ID mismatches)
        else if (idResult.error?.code === 'PGRST116' || !idResult.data) {
          // Try email-based lookup as fallback
          // console.log('⚠️ User not found by ID, trying email-based lookup...');
          
          try {
            const emailResult = await retryWithBackoff(
              () => withTimeout(
                supabase
                  .from('users')
                  .select('id, role, full_name, firm_id, email, is_active')
                  .eq('email', authData.user.email)
                  .maybeSingle() as unknown as Promise<any>,
                5000 // 5 second timeout
              ),
              2, // retry 2 times
              500 // 500ms delay
            );

            if (emailResult.data && !emailResult.error) {
              // 🔧 FIX: Check for ID mismatch
              if (emailResult.data.id !== authData.user.id) {
                // ❌ ID MISMATCH: User found by email but has wrong ID
                console.error('⚠️ ID MISMATCH DETECTED!');
                console.error('  Auth ID:', authData.user.id);
                console.error('  Users table ID:', emailResult.data.id);
                console.error('  Email:', emailResult.data.email);
                console.error('  This user needs to be fixed. The ID should match the Auth ID.');
                console.error('  This can be fixed by signing up again or contacting support.');
                
                // Still use the user data for login, but log the issue
                // The proper fix should happen during signup (which we've now fixed)
                userData = emailResult.data;
                // console.log('⚠️ Using user data with mismatched ID. User should re-signup to fix this.');
              } else {
                // ✅ ID matches - everything is good
                userData = emailResult.data;
                // console.log('✅ User found by email with matching ID:', emailResult.data.email);
              }
              
              // 🔧 FIX: If user exists but has wrong role, check invites and update
              if (inviteData && inviteData.role && userData.role !== inviteData.role) {
                // console.log('⚠️ User role mismatch detected! User has:', userData.role, 'but invite says:', inviteData.role);
                // console.log('🔄 Updating user role from invite...');
                
                const { data: updateData, error: updateError } = await supabase
                  .from('users')
                  .update({
                    role: inviteData.role,
                    firm_id: inviteData.firm_id || userData.firm_id,
                    project_id: inviteData.project_id || userData.project_id,
                    assigned_by: inviteData.invited_by || userData.assigned_by
                  } as any)
                  .eq('id', authData.user.id)
                  .select();
                
                if (!updateError && updateData) {
                  userData = updateData;
                  // console.log('✅ User role updated from invite:', updateData);
                  
                  // Mark invite as accepted
                  try {
                    await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
                    // console.log('✅ Invite marked as accepted');
                  } catch (updateInviteError) {
                    // console.log('⚠️ Could not update invite status:', updateInviteError);
                  }
                } else {
                  console.error('❌ Failed to update user role:', updateError);
                }
              }
            } else if (emailResult.error?.code === 'PGRST116') {
              // User not found by email either - create new record
              // console.log('⚠️ User not found by email, creating new user record...');
              
              // 🔧 FIX: ALWAYS use invite data if available, NEVER default to 'viewer' if invite exists
              if (!inviteData) {
                console.error('❌ No invite found for email:', authData.user.email);
                console.error('❌ User cannot be created without invite. Please contact administrator.');
                userError = new Error('No invitation found. Please contact your administrator for an invitation.');
              } else {
                const defaultRole = inviteData.role; // ✅ ALWAYS use invite role (no fallback to viewer)
                const defaultFirmId = inviteData.firm_id || null;
                const defaultProjectId = inviteData.project_id || null;
                const defaultAssignedBy = inviteData.invited_by || null;
                
                // console.log('📝 Creating user with invite role:', defaultRole, 'from invite:', {
                //   invite_id: inviteData.id,
                //   invite_email: inviteData.email,
                //   invite_role: inviteData.role
                // });
              
                const createResult = await withTimeout(
                  supabase
                    .from('users')
                    .insert({
                      id: authData.user.id,
                      email: authData.user.email,
                      full_name: authData.user.user_metadata?.full_name || inviteData.full_name || 'User',
                      role: defaultRole, // ✅ ALWAYS use invite role
                      firm_id: defaultFirmId,
                      project_id: defaultProjectId,
                      assigned_by: defaultAssignedBy,
                      is_active: true
                    } as any)
                    .select()
                    .single() as unknown as Promise<any>,
                  10000 // 10 second timeout
                );

                if (createResult.data && !createResult.error) {
                  userData = createResult.data;
                  // console.log('✅ New user record created with invite role:', defaultRole);
                  
                  // Mark invite as accepted
                  try {
                    await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
                    // console.log('✅ Invite marked as accepted');
                  } catch (updateInviteError) {
                    console.error('⚠️ Could not update invite status:', updateInviteError);
                  }
                } else {
                  console.error('❌ Error creating user:', createResult.error);
                  userError = createResult.error || new Error('Failed to create user record');
                }
              }
            } else {
              // Network/timeout error - don't treat as fatal, try to continue
              console.warn('⚠️ Email lookup error (non-fatal):', emailResult.error);
              // Still try to create user record as fallback (only if invite exists)
              if (!inviteData) {
                console.error('❌ No invite found and email lookup failed. Cannot create user.');
                userError = new Error('No invitation found. Please contact your administrator for an invitation.');
              } else {
                try {
                  // 🔧 FIX: ALWAYS use invite data (no fallback to viewer)
                  const defaultRole = inviteData.role;
                  const defaultFirmId = inviteData.firm_id || null;
                  const defaultProjectId = inviteData.project_id || null;
                  const defaultAssignedBy = inviteData.invited_by || null;
                
                  const createResult = await withTimeout(
                    supabase
                      .from('users')
                      .insert({
                        id: authData.user.id,
                        email: authData.user.email,
                        full_name: authData.user.user_metadata?.full_name || inviteData.full_name || 'User',
                        role: defaultRole, // ✅ ALWAYS use invite role
                        firm_id: defaultFirmId,
                        project_id: defaultProjectId,
                        assigned_by: defaultAssignedBy,
                        is_active: true
                      } as any)
                      .select()
                      .single() as unknown as Promise<any>,
                    10000
                  );
                  
                  if (createResult.data && !createResult.error) {
                    userData = createResult.data;
                    // console.log('✅ User record created as fallback with invite role:', defaultRole);
                    
                    // Mark invite as accepted
                    try {
                      await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
                      // console.log('✅ Invite marked as accepted');
                    } catch (updateInviteError) {
                      console.error('⚠️ Could not update invite status:', updateInviteError);
                    }
                  } else {
                    console.error('❌ Error creating user:', createResult.error);
                    userError = createResult.error || new Error('Failed to create user record');
                  }
                } catch (createErr) {
                  console.error('❌ Fallback user creation failed:', createErr);
                  userError = createErr as Error;
                }
              }
            }
          } catch (emailLookupError: any) {
            console.error('🚨 Email lookup exception:', emailLookupError);
            if (emailLookupError?.message === 'Request timeout') {
              userError = new Error('Database connection timeout. Please check your internet connection and try again.');
            } else {
              userError = emailLookupError || new Error('Failed to fetch user data. Please try again.');
            }
          }
        } else {
          userError = idResult.error || new Error('Failed to fetch user data');
        }
      } catch (error: any) {
        console.error('🚨 Database query error:', error);
        if (error?.message === 'Request timeout') {
          userError = new Error('Database query timeout. Please try again.');
        } else {
          userError = error;
        }
      }

      if (userError) {
        console.error('🚨 Error with user data:', userError);
        setError(`Database error: ${userError.message}. Please try again or contact support.`);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (!userData) {
        console.error('🚨 No user data available');
        setError("Unable to retrieve user information. Please contact your administrator.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (!userData.is_active) {
        console.error('🚨 User account is inactive');
        setError("Your account has been deactivated. Please contact your administrator.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      // 🔧 FIX: If firm_id is missing, try to get it from assigned projects
      if (!userData.firm_id && userData.role !== 'super_admin') {
        try {
          // console.log('⚠️ firm_id is missing, attempting to retrieve from assigned projects...');
          
          // Get user's assigned projects from project_members table
          const { data: projectMembers, error: pmError } = await supabase
            .from('project_members')
            .select('project_id')
            .eq('email', userData.email)
            .limit(1);
          
          if (!pmError && projectMembers && projectMembers.length > 0 && (projectMembers[0] as any)?.project_id) {
            // Get firm_id from the first assigned project
            const { data: projectData, error: projError } = await supabase
              .from('projects')
              .select('firm_id')
              .eq('id', (projectMembers[0] as any).project_id)
              .single();
            
            const firmIdValue = (projectData as any)?.firm_id;
            if (!projError && firmIdValue) {
              // console.log('✅ Found firm_id from assigned project:', firmIdValue);
              
              // Update user record with firm_id
              const { error: updateError } = await supabase
                .from('users')
                .update({ firm_id: firmIdValue } as any)
                .eq('id', (userData as any).id);
              
              if (!updateError) {
                // Update userData object with the firm_id
                (userData as any).firm_id = firmIdValue;
                // console.log('✅ Updated user record with firm_id');
              } else {
                console.error('❌ Failed to update user firm_id:', updateError);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error retrieving firm_id from projects:', error);
          // Non-fatal, continue with login
        }
      }
      
      // Clear timeout since we succeeded
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Fetch company name and logo from firms table if user has firm_id (for header display)
      let companyName = '';
      let logoUrl: string | null = null;
      if (userData.firm_id) {
        try {
          const firmData = await fastAPI.getFirmById(userData.firm_id);
          if (firmData?.name) {
            companyName = firmData.name;
          }
          if (firmData?.logo_url) {
            logoUrl = firmData.logo_url;
          }
        } catch (firmError) {
          console.warn('⚠️ Could not fetch company data (non-fatal):', firmError);
        }
      }
      
      // Store complete user info in localStorage for role-based routing and dashboard display
      const userInfo = {
        id: userData.id, // 🔧 FIX: Use users table ID instead of auth user ID
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        firm_id: userData.firm_id,
        company_name: companyName,
        logo_url: logoUrl
      };
      
      // Clear cache on login to ensure fresh data (non-blocking)
      import('@/utils/cache').then(({ clearCache }) => {
        try {
          clearCache();
        } catch (error) {
          // Non-fatal
        }
      }).catch(() => {
        // Non-fatal
      });

      // Store in localStorage with error handling
      try {
        localStorage.setItem('userData', JSON.stringify(userInfo));
        localStorage.setItem('userRole', userData.role);
        localStorage.setItem('userName', userData.full_name);
        localStorage.setItem('userEmail', userData.email);
        localStorage.setItem('firmId', userData.firm_id || '');
        localStorage.setItem('userId', authData.user.id);
        if (companyName) {
          localStorage.setItem('companyName', companyName);
        }
        if (logoUrl) {
          localStorage.setItem('companyLogo', logoUrl);
        }
      } catch (storageError) {
        console.error('⚠️ localStorage error (non-fatal):', storageError);
        // Continue with redirect even if localStorage fails
      }

      // Show success toast
      toast({ 
        title: 'Success', 
        description: `Login successful!\n\n👤 Welcome back, ${userData.full_name}!\n🎯 Role: ${userData.role.replace('_', ' ')}\n🚀 Redirecting to dashboard...` 
      });
      
      // Reset loading state before redirect
      setLoading(false);
      isSubmittingRef.current = false;
      
      // Redirect with error handling
      try {
        redirectBasedOnRole(userData.role);
      } catch (redirectError) {
        console.error('🚨 Redirect error:', redirectError);
        // If redirect fails, force navigation
        window.location.href = userData.role === 'super_admin' ? '/super-admin' : '/company-dashboard';
      }

    } catch (err: any) {
      console.error('🚨 Error during sign in:', err);
      if (err?.message === 'Request timeout') {
        setError("Login timeout: The request took too long. Please check your connection and try again.");
      } else {
        setError("An error occurred during sign in. Please try again.");
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        {/* Header - Welcome to + Company Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <p className="text-sm sm:text-base text-gray-600 mb-2 sm:mb-3">Welcome to</p>
          <a href="/" className="inline-block">
            <img 
              src="/Group%20134614.png" 
              alt="ProjectFIO.ai by Digiteq Solutions" 
              className="h-10 sm:h-12 lg:h-14 w-auto object-contain mx-auto"
            />
          </a>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Welcome back</h2>
            <p className="text-sm sm:text-base text-gray-600">Enter your credentials to access your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                className="mt-1"
              />
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password" className="text-xs sm:text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={14} className="sm:w-4 sm:h-4" /> : <Eye size={14} className="sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-red-600 text-xs sm:text-sm bg-red-50 p-2 sm:p-3 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 sm:px-4 rounded-md font-medium transition-colors text-sm"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>

            {/* Forgot password link */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium"
              >
                Forgot password?
              </button>
            </div>
          </form>

          {/* Sign Up Link */}
          <div className="text-center mt-4 sm:mt-6">
            <p className="text-sm sm:text-base text-gray-600">
              Don't have an account?{" "}
              <button
                onClick={() => navigate('/signup')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
