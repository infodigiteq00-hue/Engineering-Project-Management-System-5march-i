// Deno Deploy / Supabase Edge Function
// Handles secure file uploads to Supabase Storage using service role key
// Service role key is stored as a secret and never exposed to frontend

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Deno types
declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

interface UploadPayload {
  bucket: string
  filePath: string
  fileData: string // base64 encoded file data
  contentType?: string
  fileName?: string
}

// CORS headers - must match what browser sends in Access-Control-Request-Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '3600',
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'content-type': 'application/json',
      ...corsHeaders,
    },
  })
}

Deno.serve(async (req) => {
  // Handle CORS preflight - MUST be the first thing, before any auth checks
  // Return 200 OK (not 204) as some Supabase proxies require it
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    // JWT VALIDATION - Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ 
        error: 'Unauthorized: Missing or invalid authorization header' 
      }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Get Supabase URL and anon key for JWT verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL')
    const anonKey = Deno.env.get('ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
    
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, 500)
    }

    // Ensure URL has https:// prefix
    const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`
    
    // Verify JWT token using anon key (with timeout protection)
    const supabaseClient = createClient(finalUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the JWT token with timeout (3 seconds)
    const jwtValidationPromise = supabaseClient.auth.getUser(token)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('JWT validation timeout')), 3000)
    )
    
    let user
    try {
      const result = await Promise.race([jwtValidationPromise, timeoutPromise]) as any
      const { data: { user: validatedUser }, error: authError } = result || { data: {}, error: null }
      
      if (authError || !validatedUser) {
        console.error('JWT validation failed:', authError?.message)
        return jsonResponse({ 
          error: 'Unauthorized: Invalid or expired token' 
        }, 401)
      }
      user = validatedUser
    } catch (timeoutError: any) {
      console.error('JWT validation timeout or error:', timeoutError.message)
      return jsonResponse({ 
        error: `Unauthorized: ${timeoutError.message}` 
      }, 401)
    }

    // console.log('✅ JWT validated for user:', user.id)

    // Get service role key from environment (set as Supabase secret)
    // Note: Supabase secrets cannot start with SUPABASE_ prefix
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')

    if (!serviceRoleKey) {
      return jsonResponse({ 
        error: 'Server configuration error: Missing service role key' 
      }, 500)
    }

    // Create Supabase client with service role key for storage operations
    const supabase = createClient(finalUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Parse request body
    const payload = (await req.json()) as UploadPayload

    if (!payload?.bucket || !payload?.filePath || !payload?.fileData) {
      return jsonResponse({ 
        error: 'Missing required fields: bucket, filePath, fileData' 
      }, 400)
    }

    // Convert base64 to Uint8Array
    const base64Data = payload.fileData.includes(',') 
      ? payload.fileData.split(',')[1] 
      : payload.fileData
    
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

    // Upload file to storage
    const { data, error } = await supabase.storage
      .from(payload.bucket)
      .upload(payload.filePath, binaryData, {
        contentType: payload.contentType || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600'
      })

    if (error) {
      console.error('Storage upload error:', error)
      return jsonResponse({ 
        error: `Upload failed: ${error.message}`,
        details: error 
      }, 400)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(payload.bucket)
      .getPublicUrl(payload.filePath)

    return jsonResponse({
      success: true,
      path: data.path,
      publicUrl: urlData.publicUrl,
      fullPath: data.fullPath
    })

  } catch (err) {
    console.error('Edge function error:', err)
    return jsonResponse({ 
      error: 'Internal server error',
      message: err instanceof Error ? err.message : String(err)
    }, 500)
  }
})

