import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fastAPI } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const SignUp = () => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(""); // Clear error when user types
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      // // console.log('Starting sign up process...');
      
      // Create user in Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      // // console.log('Auth signup result:', { data, error: signUpError });

      if (signUpError) {
        console.error('❌ Auth signup error:', signUpError);
        console.error('❌ Full error details:', {
          message: signUpError.message,
          status: signUpError.status,
          name: signUpError.name,
          code: (signUpError as any).code,
          details: (signUpError as any).details,
          hint: (signUpError as any).hint
        });
        
        // More user-friendly error message
        let errorMessage = signUpError.message;
        if (signUpError.message?.includes('Database error')) {
          errorMessage = 'Account creation failed. This might be due to a database configuration issue. Please contact support.';
        } else if (signUpError.message?.includes('email')) {
          errorMessage = signUpError.message;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (data.user) {
        // // console.log('User created in auth, creating profile...');
        
        // ⏳ CRITICAL FIX: Wait for session to be available (needed for RLS to work)
        // After signUp(), session might not be immediately available, causing RLS to fail
        // // console.log('⏳ Waiting for authentication session to be available...');
        let session = data.session;
        
        // If session not immediately available, wait for it (up to 2 seconds)
        if (!session) {
          // // console.log('⏳ Session not immediately available, waiting...');
          for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession) {
              session = currentSession;
              // // console.log('✅ Session available after wait');
              break;
            }
          }
        }
        
        if (!session) {
          // Email confirmation required: user created in Auth but no session yet. Show success and redirect.
          setLoading(false);
          toast({
            title: 'Success',
            description: `Account created successfully!\n\n📧 Please check your email (${formData.email}) and click the confirmation link to verify your account.\n\n🔗 After email confirmation, you can login with your credentials.`
          });
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
          return;
        }
        
        // // console.log('✅ Session confirmed, proceeding with user creation...');
        
        // Create user record in our users table
        // // console.log('Attempting to insert user profile with data:', {
        //   id: data.user.id,
        //   email: formData.email,
        //   full_name: formData.fullName,
        //   role: 'viewer',
        //   firm_id: null,
        //   is_active: true
        // });

        // 🆕 NEW: Check invites table FIRST for pending invitations (case-insensitive)
        const normalizedEmail = formData.email.toLowerCase().trim();
        // // console.log('🔍 Step 1: Checking invites table for pending invitation (normalized email):', normalizedEmail);
        let inviteData = null;
        try {
          inviteData = await fastAPI.getInviteByEmail(normalizedEmail);
          // // console.log('🔍 Invite check result:', inviteData ? {
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

        // If invite found, use that data and skip other checks
        if (inviteData && inviteData.role) {
          // ✅ Validate invite data
          if (!inviteData.role) {
            console.error('❌ Invite found but missing role!', inviteData);
            setError('Invalid invitation: missing role. Please contact support.');
            setLoading(false);
            return;
          }
          // // console.log('✅ Found valid invitation! Using invite data:', {
          //   role: inviteData.role,
          //   firm_id: inviteData.firm_id,
          //   project_id: inviteData.project_id
          // });
          
          // ✅ ALWAYS use invite data (this is the source of truth)
          const userRole = inviteData.role;
          const firmId = inviteData.firm_id;
          const projectId = inviteData.project_id;
          const assignedBy = inviteData.invited_by;

          // 🔧 FIX: Check if user already exists (to handle ID mismatches)
          const { data: existingUserByEmail, error: existingUserError } = await (supabase
            .from('users')
            .select('id, role, firm_id, project_id, assigned_by')
            .eq('email', formData.email)
            .maybeSingle() as unknown as Promise<any>);

          if (existingUserByEmail && !existingUserError) {
            // console.log('⚠️ User already exists. Existing data:', {
            //   id: (existingUserByEmail as any).id,
            //   role: (existingUserByEmail as any).role,
            //   firm_id: (existingUserByEmail as any).firm_id
            // });
            // console.log('✅ Will use INVITE data (not existing user data):', {
            //   role: userRole,
            //   firm_id: firmId
            // });
            
            // User exists - check for ID mismatch
            if ((existingUserByEmail as any).id === data.user.id) {
              // ✅ ID matches - update with INVITE data (not existing user data)
              // console.log('✅ User exists with correct Auth ID, updating with INVITE data...');
              const { data: updateData, error: updateError } = await supabase
                .from('users')
                .update({
                  full_name: formData.fullName,
                  role: userRole, // ✅ Use invite role, not existing role
                  firm_id: firmId, // ✅ Use invite firm_id, not existing firm_id
                  project_id: projectId,
                  assigned_by: assignedBy,
                  is_active: true
                } as any)
                .eq('id', data.user.id)
                .select();

              if (updateError) {
                console.error('❌ Error updating user profile:', updateError);
                console.error('❌ Full error details:', {
                  message: updateError.message,
                  code: updateError.code,
                  details: updateError.details,
                  hint: updateError.hint
                });
                
                // Check if it's RLS error
                if (updateError.code === '42501' || updateError.message?.includes('row-level security') || updateError.message?.includes('RLS')) {
                  setError(`Access denied: ${updateError.message}. Please contact support.`);
                } else {
                  setError(`Profile update failed: ${updateError.message}`);
                }
                setLoading(false);
                return;
              }
              // console.log('✅ User updated with invite data:', updateData);
              // Continue with project_members update below
            } else {
              // ❌ ID MISMATCH: Delete old record and create new one with INVITE data
              // console.log('⚠️ ID mismatch detected in invite path. Replacing user record with INVITE data...');
              const { error: deleteError } = await supabase
                .from('users')
                .delete()
                .eq('id', (existingUserByEmail as any).id);
              
              if (deleteError) {
                console.error('❌ Error deleting old user record:', deleteError);
                setError(`Failed to sync user ID: ${deleteError.message}`);
                setLoading(false);
                return;
              }
              
              // Create new record with correct Auth ID and INVITE data
              const { data: profileData, error: profileError } = await supabase
                .from('users')
                .insert([
                  {
                    id: data.user.id, // ✅ Use Auth ID
                    email: formData.email,
                    full_name: formData.fullName,
                    role: userRole, // ✅ Use invite role
                    firm_id: firmId, // ✅ Use invite firm_id
                    project_id: projectId,
                    assigned_by: assignedBy,
                    is_active: true
                  }
                ])
                .select();

              if (profileError) {
                console.error('❌ Error creating user profile:', profileError);
                console.error('❌ Full error details:', {
                  message: profileError.message,
                  code: profileError.code,
                  details: profileError.details,
                  hint: profileError.hint
                });
                
                // Check if it's RLS error
                if (profileError.code === '42501' || profileError.message?.includes('row-level security') || profileError.message?.includes('RLS')) {
                  setError(`Access denied: ${profileError.message}. Please contact support.`);
                } else {
                  setError(`Profile creation failed: ${profileError.message}`);
                }
                setLoading(false);
                return;
              }
              // console.log('✅ User created with invite data:', profileData);
              // Continue with project_members update below
            }
          } else {
            // User doesn't exist - create new user with INVITE data
            // console.log('🆕 Creating new user with invite data...');
            const { data: profileData, error: profileError } = await supabase
              .from('users')
              .insert([
                {
                  id: data.user.id,
                  email: formData.email,
                  full_name: formData.fullName,
                  role: userRole, // ✅ Use invite role
                  firm_id: firmId, // ✅ Use invite firm_id
                  project_id: projectId,
                  assigned_by: assignedBy,
                  is_active: true
                }
              ])
              .select();

            if (profileError) {
              console.error('❌ Error creating user profile:', profileError);
              console.error('❌ Full error details:', {
                message: profileError.message,
                code: profileError.code,
                details: profileError.details,
                hint: profileError.hint
              });
              
              // Check if it's RLS error
              if (profileError.code === '42501' || profileError.message?.includes('row-level security') || profileError.message?.includes('RLS')) {
                setError(`Access denied: ${profileError.message}. Please contact support.`);
              } else {
                setError(`Profile creation failed: ${profileError.message}`);
              }
              setLoading(false);
              return;
            }
            // console.log('✅ User created with invite data:', profileData);
          }

          // // console.log('✅ User created successfully with invite role:', profileData);

          // Update project_members table if project_id exists
          if (projectId) {
            try {
              // // console.log('🔗 Linking user to project_members...');
              const { error: linkError } = await supabase
                .from('project_members')
                .update({ user_id: data.user.id })
                .eq('email', formData.email)
                .eq('project_id', projectId);
              
              if (linkError) {
                // console.log('⚠️ Could not link to project_members:', linkError);
              } else {
                // console.log('✅ User linked to project_members successfully');
              }
            } catch (linkError) {
              // console.log('⚠️ Error linking to project_members:', linkError);
            }
          }

          // Mark invite as accepted
          try {
            await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
            // // console.log('✅ Invite marked as accepted');
          } catch (updateError) {
            // console.log('⚠️ Could not update invite status:', updateError);
          }

          // Show success message and redirect
          // // console.log('Profile creation/update completed successfully!');
          // // console.log('Sign up successful!');
          setLoading(false);
          
          const roleMessage = userRole 
            ? `🎯 Role: ${userRole.replace('_', ' ')}`
            : '⏳ Please wait for Super Admin to assign your role and company access.';
            
          toast({ 
            title: 'Success', 
            description: `Account created successfully!\n\n📧 Please check your email (${formData.email}) and click the confirmation link to verify your account.\n\n🔗 After email confirmation, you can login with your credentials.\n\n${roleMessage}` 
          });
          
          // Wait 2 seconds before redirect so user can see the success message
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
          return; // Exit here, don't run existing logic
        }

        // 🔄 EXISTING LOGIC: If no invite found, proceed with existing checks
        // console.log('ℹ️ No invite found (or invite missing role), checking existing user/project_members tables...');
        
        // Check if user was invited by checking project_members table for existing role assignment
        // console.log('🔍 Checking if user was invited and has assigned role...');
        // console.log('🔍 Searching for email:', formData.email);
        
        // First check users table
        const { data: existingUserData, error: existingUserError } = await supabase
          .from('users')
          .select('id, role, firm_id, project_id, assigned_by')
          .eq('email', formData.email)
          .maybeSingle(); // Use maybeSingle to avoid errors if user doesn't exist
          
        // Then check project_members table for invited users
        const { data: projectMemberData, error: projectMemberError } = await supabase
          .from('project_members')
          .select('role, project_id, user_id')
          .eq('email', formData.email)
          .maybeSingle(); // Use maybeSingle to avoid errors if not found
          
        // console.log('🔍 Existing user query result:', { existingUserData, existingUserError });
        // console.log('🔍 Project member query result:', { projectMemberData, projectMemberError });

        let userRole = null; // No default - must come from backend
        let firmId = null;
        let projectId = null;
        let assignedBy = null;

        if (existingUserData && !existingUserError) {
          // console.log('✅ User exists! Found existing data:', {
          //   id: existingUserData.id,
          //   role: existingUserData.role,
          //   firm_id: existingUserData.firm_id
          // });
          userRole = existingUserData.role;
          firmId = existingUserData.firm_id;
          projectId = existingUserData.project_id;
          assignedBy = existingUserData.assigned_by;
        }

        // 🔧 FIX: Check project_members even if user exists (to get firm_id if missing)
        if (projectMemberData && !projectMemberError) {
          // // console.log('✅ User was invited as project member! Found role assignment:', projectMemberData);
          // Only set role/project if not already set from existingUserData
          if (!userRole) {
            userRole = projectMemberData.role;
          }
          if (!projectId) {
            projectId = projectMemberData.project_id;
          }
          // 🔧 KEY FIX: Always try to get firm_id from project if it's missing
          if (!firmId && projectMemberData.project_id) {
            const { data: projectData } = await supabase
              .from('projects')
              .select('firm_id')
              .eq('id', projectMemberData.project_id)
              .single();
            firmId = (projectData as any)?.firm_id || null;
          }
        }

        // Deny access if no role assigned
        if (!userRole) {
          // console.log('❌ User was not invited, denying access');
          setError("You are not authorized to create an account. Please contact your administrator for an invitation.");
          setLoading(false);
          return;
        }

        // Update or create user with proper role assignment
        if (existingUserData && !existingUserError) {
          // 🔧 FIX: Check if the existing user has the correct Auth ID
          if (existingUserData.id === data.user.id) {
            // ✅ User already has correct Auth ID, just update other fields
            // // console.log('✅ User already exists with correct Auth ID, updating profile...');
            const { data: updateData, error: updateError } = await supabase
              .from('users')
              .update({
                full_name: formData.fullName,
                is_active: true,
                role: userRole,
                firm_id: firmId,
                project_id: projectId,
                assigned_by: assignedBy
              } as any)
              .eq('id', data.user.id) // Use ID, not email (more reliable)
              .select();

            if (updateError) {
              console.error('❌ Error updating user:', updateError);
              console.error('❌ Full error details:', {
                message: updateError.message,
                code: updateError.code,
                details: updateError.details,
                hint: updateError.hint
              });
              
              // Check if it's RLS error
              if (updateError.code === '42501' || updateError.message?.includes('row-level security') || updateError.message?.includes('RLS')) {
                setError(`Access denied: ${updateError.message}. Please contact support.`);
              } else {
                setError(`Failed to update user profile: ${updateError.message}`);
              }
              setLoading(false);
              return;
            }

            // // console.log('✅ User updated successfully:', updateData);
          } else {
            // ❌ ID MISMATCH: User exists with wrong ID (auto-generated UUID instead of Auth ID)
            // This happens when users were created before the code explicitly set id: data.user.id
            // console.log('⚠️ ID mismatch detected! Existing user ID:', existingUserData.id, 'Auth ID:', data.user.id);
            // console.log('🔄 Replacing user record with correct Auth ID...');
            
            // First, check if a user with the Auth ID already exists (shouldn't happen, but safety check)
            const { data: authIdUser, error: authIdCheckError } = await supabase
              .from('users')
              .select('id')
              .eq('id', data.user.id)
              .maybeSingle();
            
            if (authIdUser && !authIdCheckError) {
              // User with Auth ID already exists - this is unexpected
              console.error('❌ User with Auth ID already exists! This should not happen.');
              setError('Account synchronization error. Please contact support.');
              setLoading(false);
              return;
            }
            
            // Delete the old user record with wrong ID
            const { error: deleteError } = await supabase
              .from('users')
              .delete()
              .eq('id', existingUserData.id);
            
            if (deleteError) {
              console.error('❌ Error deleting old user record:', deleteError);
              setError(`Failed to sync user ID: ${deleteError.message}. Please contact support.`);
              setLoading(false);
              return;
            }
            
            // console.log('✅ Old user record deleted. Creating new record with correct Auth ID...');
            
            // Create new record with correct Auth ID
            const { data: profileData, error: profileError } = await supabase
              .from('users')
              .insert([
                {
                  id: data.user.id, // ✅ Use Auth ID (this is the fix)
                  email: formData.email,
                  full_name: formData.fullName,
                  role: userRole,
                  firm_id: firmId,
                  project_id: projectId,
                  assigned_by: assignedBy,
                  is_active: true
                }
              ])
              .select();
            
            if (profileError) {
              console.error('❌ Error creating user profile with correct ID:', profileError);
              console.error('❌ Full error details:', {
                message: profileError.message,
                code: profileError.code,
                details: profileError.details,
                hint: profileError.hint
              });
              
              // Check if it's RLS error
              if (profileError.code === '42501' || profileError.message?.includes('row-level security') || profileError.message?.includes('RLS')) {
                setError(`Access denied: ${profileError.message}. Please contact support.`);
              } else {
                setError(`Profile creation failed: ${profileError.message}. Please contact support.`);
              }
              setLoading(false);
              return;
            }
            
            // console.log('✅ User record replaced with correct Auth ID:', profileData);
            
            // Also update project_members table if project_id exists
            if (projectId) {
              try {
                // Update project_members to use the correct user_id
                const { error: linkError } = await supabase
                  .from('project_members')
                  .update({ user_id: data.user.id })
                  .eq('email', formData.email)
                  .eq('project_id', projectId);
                
                if (linkError) {
                  // console.log('⚠️ Could not update project_members user_id:', linkError);
                } else {
                  // console.log('✅ project_members updated with correct user_id');
                }
              } catch (linkError) {
                // console.log('⚠️ Error updating project_members:', linkError);
              }
            }
          }
        } else {
          // console.log('🆕 Creating new user profile...');
          // Create new user
          const { data: profileData, error: profileError } = await supabase
            .from('users')
            .insert([
              {
                id: data.user.id,
                email: formData.email,
                full_name: formData.fullName,
                role: userRole,
                firm_id: firmId,
                project_id: projectId,
                assigned_by: assignedBy,
                is_active: true
              }
            ])
            .select();

          if (profileError) {
            console.error('❌ Error creating user profile:', profileError);
            console.error('❌ Full error details:', {
              message: profileError.message,
              code: profileError.code,
              details: profileError.details,
              hint: profileError.hint
            });
            
            // Check if it's RLS error
            if (profileError.code === '42501' || profileError.message?.includes('row-level security') || profileError.message?.includes('RLS')) {
              setError(`Access denied: ${profileError.message}. Please contact support.`);
            } else {
              setError(`Profile creation failed: ${profileError.message}`);
            }
            setLoading(false);
            return;
          }

          // // console.log('✅ User created successfully:', profileData);
        }

        // // console.log('Profile creation/update completed successfully!');

        // // console.log('Sign up successful!');
        
        // Reset loading state
        setLoading(false);
        
        // Show success message with email confirmation
        const roleMessage = userRole 
          ? `🎯 Role: ${userRole.replace('_', ' ')}`
          : '⏳ Please wait for Super Admin to assign your role and company access.';
          
        toast({ 
          title: 'Success', 
          description: `Account created successfully!\n\n📧 Please check your email (${formData.email}) and click the confirmation link to verify your account.\n\n🔗 After email confirmation, you can login with your credentials.\n\n${roleMessage}` 
        });
        
        // Wait 2 seconds before redirect so user can see the success message
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        console.error('No user data returned from auth signup');
        setError("Failed to create user account");
        setLoading(false);
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setError("An error occurred during sign up");
      setLoading(false);
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
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Create account</h2>
            <p className="text-sm sm:text-base text-gray-600">Set up your account to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="text-xs sm:text-sm font-medium text-gray-700">
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                required
                className="mt-1"
              />
            </div>

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
                  placeholder="Create a password"
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

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword" className="text-xs sm:text-sm font-medium text-gray-700">
                Confirm Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={14} className="sm:w-4 sm:h-4" /> : <Eye size={14} className="sm:w-4 sm:h-4" />}
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
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          {/* Sign In Link */}
          <div className="text-center mt-4 sm:mt-6">
            <p className="text-sm sm:text-base text-gray-600">
              Already have an account?{" "}
              <button
                onClick={() => navigate('/login')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
