// Deno Deploy / Supabase Edge Function
// Sends email (via Resend) and WhatsApp (via WhatsApp Cloud API) notifications
// Store secrets with: supabase secrets set --env-file ./supabase/.env

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// Deno types
declare const Deno: any;
declare const serve: any;

interface NotifyPayload {
  company_name: string
  admin_name: string
  admin_email: string
  admin_phone?: string
  admin_whatsapp?: string
  role: 'firm_admin' | 'project_manager' | 'engineer' | 'viewer' | 'super_admin'
  dashboard_url: string
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'no-reply@yourdomain.com'

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') // Meta Graph API token
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') // Phone number ID

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function sendEmail(payload: NotifyPayload) {
  if (!RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' }
  const subject = `Welcome as ${payload.role} — ${payload.company_name}`
  const text = `Hi ${payload.admin_name},\n\nYour company "${payload.company_name}" has been created.\nRole: ${payload.role}\n\nOpen your dashboard: ${payload.dashboard_url}\n\nThanks!`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [payload.admin_email],
      subject,
      text,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error: ${res.status} ${err}`)
  }
  return await res.json()
}

async function sendWhatsApp(payload: NotifyPayload) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !payload.admin_whatsapp) {
    return { skipped: true, reason: 'WhatsApp config or number missing' }
  }
  const message = `Hi ${payload.admin_name}, your company "${payload.company_name}" is ready. Role: ${payload.role}.\nDashboard: ${payload.dashboard_url}`

  const res = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: payload.admin_whatsapp,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp error: ${res.status} ${err}`)
  }
  return await res.json()
}

serve(async (req) => {
  try {
    const payload = (await req.json()) as NotifyPayload

    if (!payload?.admin_email || !payload?.dashboard_url || !payload?.company_name || !payload?.admin_name) {
      return jsonResponse({ error: 'Missing required fields' }, 400)
    }

    const [emailResult, waResult] = await Promise.allSettled([
      sendEmail(payload),
      sendWhatsApp(payload),
    ])

    return jsonResponse({
      ok: true,
      email: emailResult.status === 'fulfilled' ? emailResult.value : { error: String(emailResult.reason) },
      whatsapp: waResult.status === 'fulfilled' ? waResult.value : { error: String(waResult.reason) },
    })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500)
  }
})


