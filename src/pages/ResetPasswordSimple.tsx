import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

const ResetPasswordSimple = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let authListener: { data: { subscription: any } } | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const handlePasswordReset = async () => {
      // console.log('🔍 ResetPasswordSimple - Starting verification...');
      // console.log('📍 Current URL:', window.location.href);
      
      // Check localStorage directly first (more reliable than getSession)
      const storageKey = 'sb-ypdlbqrcxnugrvllbmsi-auth-token';
      const storedSession = localStorage.getItem(storageKey);
      
      // console.log('🔍 Checking localStorage for session...', {
        hasStoredSession: !!storedSession,
        storageKey
      });
      
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          // console.log('📦 Parsed session data:', {
            hasAccessToken: !!sessionData.access_token,
            hasUser: !!sessionData.user,
            hasRefreshToken: !!sessionData.refresh_token,
            expiresAt: sessionData.expires_at,
            userEmail: sessionData.user?.email
          });
          
          // Check if we have valid tokens and user data
          if (sessionData.access_token && sessionData.user) {
            // Check if token is not expired
            const expiresAt = sessionData.expires_at;
            const now = Math.floor(Date.now() / 1000);
            const isExpired = expiresAt && expiresAt <= now;
            
            // console.log('⏰ Token expiry check:', {
              expiresAt,
              now,
              isExpired,
              timeUntilExpiry: expiresAt ? expiresAt - now : 'N/A'
            });
            
            // For password reset, even if slightly expired, proceed if we have refresh token
            if (!expiresAt || !isExpired || sessionData.refresh_token) {
              // console.log('✅ Valid session found in localStorage! User:', sessionData.user.email);
              // If we have valid tokens in localStorage, proceed immediately
              // This is the key fix - don't wait for getSession() to work
              setSessionReady(true);
              return;
            } else {
              // console.log('⚠️ Stored session expired and no refresh token, will try to exchange code...');
            }
          } else {
            // console.log('⚠️ Session data missing required fields');
          }
        } catch (e) {
          console.warn('⚠️ Failed to parse stored session:', e);
        }
      } else {
        // console.log('⚠️ No session found in localStorage');
      }
      
      // Wait a moment - Supabase might be processing the code in background (detectSessionInUrl)
      // console.log('⏳ Waiting for Supabase auto-detection (detectSessionInUrl)...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check localStorage again (Supabase might have stored it by now)
      const storedSessionAfterWait = localStorage.getItem(storageKey);
      if (storedSessionAfterWait) {
        try {
          const sessionData = JSON.parse(storedSessionAfterWait);
          if (sessionData.access_token && sessionData.user) {
            // console.log('✅ Session found in localStorage after wait! User:', sessionData.user.email);
            setSessionReady(true);
            return;
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // Fallback: check if session already exists via Supabase
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession) {
        // console.log('✅ Session already exists via getSession!');
        setSessionReady(true);
        return;
      }

      // Set up auth state listener BEFORE doing anything
      // console.log('👂 Setting up auth state listener...');
      authListener = supabase.auth.onAuthStateChange((event, session) => {
        // console.log('🔔 Auth state changed:', event, session ? 'has session' : 'no session');
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            // console.log('✅ Session detected via listener! User:', session.user?.email);
            setSessionReady(true);
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
      });

      try {
        // Extract code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hashCode = hashParams.get('code');
        const hashError = hashParams.get('error');
        
        // console.log('🔍 Extracted params:', {
          codeFromParams: code ? 'found' : 'none',
          codeFromHash: hashCode ? 'found' : 'none',
          hashError: hashError || 'none'
        });
        
        // Check for errors first
        if (hashError) {
          const hashErrorDesc = hashParams.get('error_description');
          console.error('❌ Error in hash:', hashError);
          setError(hashErrorDesc || hashError || 'The reset link is invalid or has expired.');
          return;
        }

        // Use code from URL params or hash
        const recoveryCode = code || hashCode;

        if (!recoveryCode) {
          console.error('❌ No code found in URL');
          setError('Invalid reset link. No code found. Please request a new password reset.');
          return;
        }

        // console.log('✅ Code found. Attempting exchange...');
        
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        
        if (!supabaseUrl) {
          setError('Missing Supabase configuration');
          return;
        }

        // Set timeout
        timeoutId = setTimeout(() => {
          if (!sessionReady) {
            console.error('⏱️ Operation timed out');
            setError('Request timed out. Please try again or request a new reset link.');
          }
        }, 15000);

        // Try the simplest approach: use exchangeCodeForSession with just the code
        // But wrap it in a Promise.race with timeout
        try {
          // console.log('🔄 Attempting exchangeCodeForSession...');
          
          const exchangePromise = supabase.auth.exchangeCodeForSession(recoveryCode);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Exchange timeout after 8 seconds')), 8000)
          );

          const result = await Promise.race([exchangePromise, timeoutPromise]) as any;
          
          if (result?.error) {
            console.error('❌ Exchange error:', result.error);
            setError(result.error.message || 'Failed to verify reset link. It may have expired.');
            return;
          }

          if (result?.data?.session) {
            // console.log('✅ Session created! User:', result.data.session.user?.email);
            setSessionReady(true);
            if (timeoutId) clearTimeout(timeoutId);
            return;
          }

          // Wait and check session
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('❌ Session check error:', sessionError);
            setError('Failed to verify session. Please try again.');
            return;
          }

          if (session) {
            // console.log('✅ Session verified! User:', session.user?.email);
            setSessionReady(true);
            if (timeoutId) clearTimeout(timeoutId);
            return;
          }

          setError('Session creation failed. Please request a new reset link.');
          
        } catch (err: any) {
          console.error('💥 Exchange exception:', err);
          
          // If timeout, try REST API as fallback
          if (err.message?.includes('timeout')) {
            // console.log('⏱️ SDK timed out, trying REST API fallback...');
            
            try {
              const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
              const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  auth_code: recoveryCode,
                }),
              });

              if (response.ok) {
                const tokenData = await response.json();
                if (tokenData.access_token && tokenData.refresh_token) {
                  const { data: sessionData, error: setError } = await supabase.auth.setSession({
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                  });
                  
                  if (sessionData?.session) {
                    // console.log('✅ Session set via REST API!');
                    setSessionReady(true);
                    if (timeoutId) clearTimeout(timeoutId);
                    return;
                  }
                }
              }
              
              const errorText = await response.text();
              console.error('❌ REST API fallback failed:', errorText);
            } catch (restErr) {
              console.error('💥 REST API fallback exception:', restErr);
            }
          }
          
          setError(err?.message || 'Failed to process reset code. Please try again.');
        }
        
      } catch (err: any) {
        console.error('💥 Reset password error:', err);
        setError(err?.message || 'Failed to process reset link.');
      }
    };

    handlePasswordReset();

    // Cleanup
    return () => {
      if (authListener) {
        authListener.data.subscription.unsubscribe();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sessionReady) {
      setError('Please wait for the reset link to be verified.');
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // console.log('🔄 Updating password...');
      
      // Skip getSession() entirely - it's hanging. Use localStorage directly
      // console.log('📡 Step 1: Getting session from localStorage...');
      const storageKey = 'sb-ypdlbqrcxnugrvllbmsi-auth-token';
      const storedSession = localStorage.getItem(storageKey);
      
      if (!storedSession) {
        setError('No session found. Please request a new password reset link.');
        setLoading(false);
        return;
      }
      
      let sessionData;
      try {
        sessionData = JSON.parse(storedSession);
        if (!sessionData.access_token || !sessionData.user) {
          setError('Invalid session. Please request a new password reset link.');
          setLoading(false);
          return;
        }
        // console.log('✅ Session found in localStorage:', { userEmail: sessionData.user.email });
      } catch (e) {
        console.error('❌ Failed to parse localStorage session:', e);
        setError('Invalid session data. Please request a new password reset link.');
        setLoading(false);
        return;
      }
      
      // Use REST API directly - skip all SDK methods that might hang
      // console.log('📡 Step 2: Updating password via REST API...');
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        setError('Missing Supabase configuration');
        setLoading(false);
        return;
      }

      // Check if token is expired - if so, refresh it first
      const expiresAt = sessionData.expires_at;
      const now = Math.floor(Date.now() / 1000);
      let accessToken = sessionData.access_token;
      
      if (expiresAt && expiresAt <= now && sessionData.refresh_token) {
        // console.log('🔄 Token expired, refreshing via REST API...');
        try {
          const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refresh_token: sessionData.refresh_token,
            }),
          });
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            accessToken = refreshData.access_token;
            // console.log('✅ Token refreshed!');
            // Update localStorage
            sessionData.access_token = refreshData.access_token;
            sessionData.refresh_token = refreshData.refresh_token;
            sessionData.expires_at = refreshData.expires_at || Math.floor(Date.now() / 1000) + refreshData.expires_in;
            localStorage.setItem(storageKey, JSON.stringify(sessionData));
          } else {
            console.warn('⚠️ Token refresh failed, proceeding with expired token');
          }
        } catch (refreshErr) {
          console.warn('⚠️ Token refresh error, proceeding with expired token:', refreshErr);
        }
      }
      
      // Update password via REST API
      // console.log('📡 Step 3: Calling password update API...');
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);
      // console.log('📡 Password update response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Password update error:', errorData);
        setError(errorData.message || errorData.error_description || 'Failed to update password');
        setLoading(false);
        return;
      }

      // console.log('✅ Password updated successfully!');
      setMessage("Password updated successfully! Redirecting to login...");
      setLoading(false);
      
      // Clear session and redirect
      localStorage.removeItem(storageKey);
      setTimeout(() => navigate('/login'), 2000);
      
    } catch (err: any) {
      console.error('💥 Password update exception:', err);
      if (err.name === 'AbortError') {
        setError('Password update timed out. Please check your connection and try again.');
      } else {
        setError(err?.message || "Failed to update password. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Reset Password</h1>
          <p className="text-sm sm:text-base text-gray-600">Enter your new password</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          {!sessionReady ? (
            <div className="text-center py-4">
              {error ? (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{error}</div>
              ) : (
                <div className="text-gray-600">Verifying reset link...</div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  New Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{error}</div>
              )}

              {message && (
                <div className="text-green-700 text-sm bg-green-50 p-3 rounded-md">{message}</div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-medium"
              >
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Back to Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordSimple;
