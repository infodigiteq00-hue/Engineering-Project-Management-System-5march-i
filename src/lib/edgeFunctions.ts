// Edge Functions Client
// Provides secure client-side functions to call Supabase Edge Functions
// This ensures sensitive keys (like service role key) are never exposed to frontend

import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ypdlbqrcxnugrvllbmsi.supabase.co'

// Helper function to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to convert file to base64'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface UploadFileParams {
  bucket: string
  filePath: string
  file: File
}

// Helper function to get session token with fallbacks (similar to api.ts)
async function getSessionTokenForUpload(): Promise<string | null> {
  // First, try to get from localStorage (fastest, most reliable)
  try {
    const storageKey = 'sb-ypdlbqrcxnugrvllbmsi-auth-token';
    const storedSession = localStorage.getItem(storageKey);
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      if (parsed?.access_token) {
        // Check if token is expired
        const expiresAt = parsed.expires_at;
        const now = Math.floor(Date.now() / 1000);
        // If token is valid or has refresh token, use it
        if (!expiresAt || expiresAt > now || parsed.refresh_token) {
          return parsed.access_token;
        }
      }
    }
  } catch (e) {
    // Ignore localStorage errors, continue to fallback
  }
  
  // Fallback: Try getSession with short timeout (non-blocking)
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('getSession timeout')), 3000) // 3 second timeout
    );
    
    const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]) as any;
    
    if (!error && session?.access_token) {
      return session.access_token;
    }
  } catch (error) {
    // Ignore getSession errors, will throw below
  }
  
  return null;
}

export async function uploadFileViaEdgeFunction({
  bucket,
  filePath,
  file
}: UploadFileParams): Promise<string> {
  try {
    // Get session token using fast localStorage-first approach
    let accessToken: string | null = null;
    
    try {
      accessToken = await getSessionTokenForUpload();
    } catch (tokenError: any) {
      console.warn('⚠️ Session token retrieval issue:', tokenError.message);
    }

    // If no token from localStorage or getSession, try refresh
    if (!accessToken) {
      try {
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshedSession?.access_token) {
          throw new Error('User not authenticated. Please log in again.');
        }
        accessToken = refreshedSession.access_token;
      } catch (refreshErr: any) {
        console.error('❌ Session refresh failed:', refreshErr);
        throw new Error('User not authenticated. Please log in again.');
      }
    }

    if (!accessToken) {
      throw new Error('User not authenticated. Please log in again.');
    }

    // Validate file size before encoding (to avoid long base64 conversion)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 5MB.')
    }

    // Convert file to base64 with timeout
    let fileData: string
    try {
      const base64Promise = fileToBase64(file)
      const base64Timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File encoding timed out')), 10000) // 10 seconds for base64
      )
      fileData = await Promise.race([base64Promise, base64Timeout])
    } catch (encodeError: any) {
      console.error('❌ File encoding error:', encodeError)
      throw new Error(`Failed to process file: ${encodeError.message}`)
    }

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      // Call edge function with timeout
      const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({
          bucket,
          filePath,
          fileData,
          contentType: file.type,
          fileName: file.name
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || errorData.message || `Upload failed: ${response.status} ${response.statusText}`
        console.error('❌ Upload failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          details: errorData
        })
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      if (!result.publicUrl) {
        throw new Error('Upload succeeded but no URL returned')
      }
      
      return result.publicUrl
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('Upload request timed out. Please try again with a smaller file or check your connection.')
      }
      // Re-throw with more context
      if (fetchError.message) {
        throw fetchError
      }
      throw new Error(`Upload failed: ${fetchError.message || 'Unknown error'}`)
    }
  } catch (error: any) {
    console.error('❌ Edge function upload error:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    })
    throw error
  }
}

