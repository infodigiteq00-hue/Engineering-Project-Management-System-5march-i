import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug logging
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Prevent multiple instances by using a singleton pattern
let supabaseInstance: ReturnType<typeof createClient> | null = null

export const supabase = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'sb-ypdlbqrcxnugrvllbmsi-auth-token',
        flowType: 'pkce'
      }
    })
  }
  return supabaseInstance
})()

// Database types for TypeScript
export interface Database {
  public: {
    Tables: {
      firms: {
        Row: {
          id: string
          name: string
          subscription_plan: 'free' | 'basic' | 'premium' | 'enterprise'
          created_at: string
          updated_at: string
          is_active: boolean
          logo_url?: string | null
        }
        Insert: {
          id?: string
          name: string
          subscription_plan?: 'free' | 'basic' | 'premium' | 'enterprise'
          created_at?: string
          updated_at?: string
          is_active?: boolean
          logo_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          subscription_plan?: 'free' | 'basic' | 'premium' | 'enterprise'
          created_at?: string
          updated_at?: string
          is_active?: boolean
          logo_url?: string | null
        }
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'super_admin' | 'firm_admin' | 'project_manager' | 'engineer' | 'viewer'
          firm_id: string
          created_at: string
          updated_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          email: string
          full_name: string
          role?: 'super_admin' | 'firm_admin' | 'project_manager' | 'engineer' | 'viewer'
          firm_id: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'super_admin' | 'firm_admin' | 'project_manager' | 'engineer' | 'viewer'
          firm_id?: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
      }
      projects: {
        Row: {
          id: string
          name: string
          client: string
          location: string
          equipment_count: number
          active_equipment: number
          progress: number
          status: 'active' | 'delayed' | 'on-track' | 'completed'
          manager: string
          deadline: string
          po_number: string
          firm_id: string
          created_at: string
          updated_at: string
          completed_date?: string
          scope_of_work?: string
        }
        Insert: {
          id?: string
          name: string
          client: string
          location: string
          equipment_count?: number
          active_equipment?: number
          progress?: number
          status?: 'active' | 'delayed' | 'on-track' | 'completed'
          manager: string
          deadline: string
          po_number: string
          firm_id: string
          created_at?: string
          updated_at?: string
          completed_date?: string
          scope_of_work?: string
        }
        Update: {
          id?: string
          name?: string
          client?: string
          location?: string
          equipment_count?: number
          active_equipment?: number
          progress?: number
          status?: 'active' | 'delayed' | 'on-track' | 'completed'
          manager?: string
          deadline?: string
          po_number?: string
          firm_id?: string
          created_at?: string
          updated_at?: string
          completed_date?: string
          scope_of_work?: string
        }
      }
      equipment: {
        Row: {
          id: string
          project_id: string
          type: string
          tag_number: string
          job_number: string
          manufacturing_serial: string
          po_cdd: string
          status: 'on-track' | 'delayed' | 'nearing-completion' | 'completed' | 'pending'
          progress: number
          progress_phase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched'
          location: string
          supervisor: string
          last_update: string
          next_milestone: string
          priority: 'high' | 'medium' | 'low'
          is_basic_info: boolean
          size?: string
          weight?: string
          design_code?: string
          material?: string
          working_pressure?: string
          design_temp?: string
          welder?: string
          qc_inspector?: string
          project_manager?: string
          custom_fields?: Array<{name: string, value: string}>
          technical_sections?: Array<{name: string, customFields: Array<{name: string, value: string}>}>
          team_custom_fields?: Array<{name: string, value: string}>
          any_personal_title?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          type: string
          tag_number: string
          job_number: string
          manufacturing_serial: string
          po_cdd: string
          status?: 'on-track' | 'delayed' | 'nearing-completion' | 'completed' | 'pending'
          progress?: number
          progress_phase?: 'documentation' | 'manufacturing' | 'testing' | 'dispatched'
          location: string
          supervisor: string
          last_update: string
          next_milestone: string
          priority?: 'high' | 'medium' | 'low'
          is_basic_info?: boolean
          size?: string
          weight?: string
          design_code?: string
          material?: string
          working_pressure?: string
          design_temp?: string
          welder?: string
          qc_inspector?: string
          project_manager?: string
          custom_fields?: Array<{name: string, value: string}>
          technical_sections?: Array<{name: string, customFields: Array<{name: string, value: string}>}>
          team_custom_fields?: Array<{name: string, value: string}>
          any_personal_title?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          type?: string
          tag_number?: string
          job_number?: string
          manufacturing_serial?: string
          po_cdd?: string
          status?: 'on-track' | 'delayed' | 'nearing-completion' | 'completed' | 'pending'
          progress?: number
          progress_phase?: 'documentation' | 'manufacturing' | 'testing' | 'dispatched'
          location?: string
          supervisor?: string
          last_update?: string
          next_milestone?: string
          priority?: 'high' | 'medium' | 'low'
          is_basic_info?: boolean
          size?: string
          weight?: string
          design_code?: string
          material?: string
          working_pressure?: string
          design_temp?: string
          welder?: string
          qc_inspector?: string
          project_manager?: string
          custom_fields?: Array<{name: string, value: string}>
          technical_sections?: Array<{name: string, customFields: Array<{name: string, value: string}>}>
          team_custom_fields?: Array<{name: string, value: string}>
          any_personal_title?: string
          created_at?: string
          updated_at?: string
        }
      }
      vdcr_records: {
        Row: {
          id: string
          project_id: string
          sr_no: string
          equipment_tag_no: string[]
          mfg_serial_no: string[]
          job_no: string[]
          client_doc_no: string
          internal_doc_no: string
          document_name: string
          revision: string
          code_status: string
          status: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'pending' | 'rejected'
          last_update: string
          remarks?: string
          updated_by: string
          document_url?: string
          firm_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          sr_no: string
          equipment_tag_no: string[]
          mfg_serial_no: string[]
          job_no: string[]
          client_doc_no: string
          internal_doc_no: string
          document_name: string
          revision: string
          code_status: string
          status?: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'pending' | 'rejected'
          last_update: string
          remarks?: string
          updated_by: string
          document_url?: string
          firm_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          sr_no?: string
          equipment_tag_no?: string[]
          mfg_serial_no?: string[]
          job_no?: string[]
          client_doc_no?: string
          internal_doc_no?: string
          document_name?: string
          revision?: string
          code_status?: string
          status?: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'pending' | 'rejected'
          last_update?: string
          remarks?: string
          updated_by?: string
          document_url?: string
          firm_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      progress_entries: {
        Row: {
          id: string
          equipment_id: string
          text: string
          date: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          text: string
          date: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          text?: string
          date?: string
          type?: string
          created_at?: string
        }
      }
      team_positions: {
        Row: {
          id: string
          equipment_id: string
          position: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          position: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          position?: string
          name?: string
          created_at?: string
        }
      }
      project_members: {
        Row: {
          id: string
          project_id: string
          name: string
          email?: string
          phone?: string
          position?: string
          role?: string
          permissions?: any[]
          status?: string
          equipment_assignments?: any[]
          data_access?: any[]
          access_level?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          email?: string
          phone?: string
          position?: string
          role?: string
          permissions?: any[]
          status?: string
          equipment_assignments?: any[]
          data_access?: any[]
          access_level?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          email?: string
          phone?: string
          position?: string
          role?: string
          permissions?: any[]
          status?: string
          equipment_assignments?: any[]
          data_access?: any[]
          access_level?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
