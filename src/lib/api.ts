import axios from "axios";
import { supabase } from './supabase'; // Use the singleton instance instead of creating a new one
import { logEquipmentCreated, logEquipmentDeleted, logEquipmentUpdated } from './activityLogger';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create axios instance for Supabase
// const api = axios.create({
//   baseURL: `${SUPABASE_URL}/rest/v1`,
//   headers: {
//     'apikey': SUPABASE_ANON_KEY,
//     'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
//     'Content-Type': 'application/json',
//     'Prefer': 'return=representation'
//   },
//   timeout: 30000 // 30 seconds timeout
// });

// Create axios instance for Supabase
const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    // Authorization header will be set dynamically by interceptor below
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  timeout: 30000 // 30 seconds timeout
});

/** PostgREST: total row count from Content-Range (e.g. 0-0/42 → 42) when Prefer: count=exact */
function parseTotalFromContentRange(res: { headers?: Record<string, unknown> }): number | null {
  const h = res.headers || {};
  const cr = (h['content-range'] ?? h['Content-Range']) as string | undefined;
  if (typeof cr !== 'string') return null;
  const m = cr.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

// Cache for session token to avoid repeated getSession() calls
let cachedSessionToken: string | null = null;
let sessionCacheTime = 0;
const SESSION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
// Deduplicate concurrent standalone equipment loads (same params/options) to prevent request storms.
const standaloneEquipmentInFlight = new Map<string, Promise<any[]>>();
// Deduplicate immediate sequential standalone loads from rapid UI re-triggers.
const standaloneEquipmentRecent = new Map<string, { at: number; data: any[] }>();
const STANDALONE_RECENT_TTL_MS = 2000;
/** Deduplicate concurrent getEquipmentByProject(projectId, options) (refresh + pre-cache were doubling RPC + bundle work). */
const equipmentByProjectInFlight = new Map<string, Promise<any[]>>();
/** Dedupe concurrent identical batch fetches (Strict Mode double effects, overlapping effects). */
const equipmentActivitiesBatchInFlight = new Map<string, Promise<Record<string, any[]>>>();
const standaloneEquipmentActivitiesBatchInFlight = new Map<string, Promise<Record<string, any[]>>>();
const latestProgressImageUrlsBatchInFlight = new Map<string, Promise<Record<string, string | null>>>();
const productionChecklistTasksBatchInFlight = new Map<string, Promise<Record<string, any[]>>>();

function batchDedupeKey(ids: string[]): string {
  return ids.length === 0 ? '' : [...ids].sort().join(',');
}

/**
 * Split UUIDs for PostgREST `in.(...)` so the comma-joined id segment stays under ~5KB.
 * Fewer chunks than a fixed "100 ids" cap when ids are short; avoids 414/proxy limits when packing more per request.
 * Request count for activities/checklists scales with ceil(totalActivities / avgIdsPerChunk), not only equipment count.
 */
function chunkIdsForInClause(ids: string[]): string[][] {
  const MAX_JOINED_LEN = 5000;
  if (!ids.length) return [];
  const out: string[][] = [];
  let cur: string[] = [];
  let curLen = 0;
  for (const id of ids) {
    const sep = cur.length ? 1 : 0;
    const need = id.length + sep;
    if (cur.length > 0 && curLen + need > MAX_JOINED_LEN) {
      out.push(cur);
      cur = [id];
      curLen = id.length;
    } else {
      cur.push(id);
      curLen += need;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Batch-delete child rows before removing equipment rows (replaces N per-equipment DELETEs when deleting a project). */
async function deleteEquipmentChildrenByProjectBatches(equipmentIds: string[]): Promise<void> {
  if (!equipmentIds.length) return;
  const tables = [
    'equipment_progress_entries',
    'equipment_progress_images',
    'equipment_documents',
    'equipment_team_positions',
    'equipment_activity_logs',
  ] as const;
  for (const table of tables) {
    for (const chunk of chunkIdsForInClause(equipmentIds)) {
      try {
        await api.delete(`/${table}?equipment_id=in.(${chunk.join(',')})`);
      } catch {
        /* ignore missing / empty */
      }
    }
  }
}

/** Populated when getStandaloneEquipment uses RPC get_standalone_equipment_bundle; consumed once by EquipmentGrid (standalone). */
type StandaloneBundleExtras = {
  documentsByEquipment: Record<string, any[]>;
  activitiesByEquipment: Record<string, any[]>;
  productionChecklistByEquipment: Record<string, any[]>;
  teamPositionsByEquipment: Record<string, any[]>;
};

let standaloneBundleExtras: StandaloneBundleExtras | null = null;

export function takeStandaloneEquipmentBundleExtras(): StandaloneBundleExtras | null {
  const x = standaloneBundleExtras;
  standaloneBundleExtras = null;
  return x;
}

/** True when standalone RPC bundle extras are waiting (grid loadDocuments can run before Index fetch completes). */
export function hasStandaloneEquipmentBundleExtras(): boolean {
  return standaloneBundleExtras != null;
}

/** Populated when getEquipmentByProject uses RPC get_project_equipment_bundle; consumed once by EquipmentGrid (project). */
export type ProjectEquipmentBundleExtras = StandaloneBundleExtras & {
  vdcrRecords: any[];
  /** Prevents concurrent getEquipmentByProject calls from wiping or mixing bundle data across projects. */
  bundleProjectId: string;
};

let projectEquipmentBundleExtras: ProjectEquipmentBundleExtras | null = null;

/** True when RPC has populated bundle extras for this project (loadDocuments may run before refresh finishes). */
export function hasProjectEquipmentBundleExtras(forProjectId: string): boolean {
  return !!(
    projectEquipmentBundleExtras &&
    projectEquipmentBundleExtras.bundleProjectId === forProjectId
  );
}

/**
 * Returns a snapshot of bundle extras for this project (deep clone).
 * Does not clear the module cache — refresh + loadDocuments both call this; clearing after the first
 * call forced a second getEquipmentByProject and doubled RPC + REST work.
 * Cache is replaced on the next successful get_project_equipment_bundle response or cleared on legacy fallback / other project.
 */
export function takeProjectEquipmentBundleExtras(forProjectId: string): ProjectEquipmentBundleExtras | null {
  const x = projectEquipmentBundleExtras;
  if (!x || x.bundleProjectId !== forProjectId) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(x)) as ProjectEquipmentBundleExtras;
  } catch {
    return null;
  }
}

function parseJsonbStringMap(val: unknown): Record<string, string> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v != null && v !== '') out[k] = String(v);
  }
  return out;
}

function mergeProjectEquipmentBundlePayload(
  raw: any,
  progressImagesLatestOnly: boolean,
  projectId: string
): {
  equipment: any[];
  extras: ProjectEquipmentBundleExtras | null;
} {
  const base = mergeStandaloneEquipmentBundlePayload(raw, progressImagesLatestOnly);
  if (!base.extras) {
    return { equipment: base.equipment, extras: null };
  }
  let equipment = base.equipment;
  if (progressImagesLatestOnly) {
    const latestUrls = parseJsonbStringMap(raw?.latest_progress_image_urls);
    if (Object.keys(latestUrls).length > 0) {
      equipment = equipment.map((eq: any) => {
        const u = latestUrls[eq.id];
        if (!u) return eq;
        return { ...eq, progress_images: [u] };
      });
    }
  }
  return {
    equipment,
    extras: {
      ...base.extras,
      vdcrRecords: parseJsonbArray(raw?.vdcr_records),
      bundleProjectId: projectId,
    },
  };
}

function parseJsonbArray(val: unknown): any[] {
  if (Array.isArray(val)) return val;
  return [];
}

function buildUsersMapFromBundle(users: any[]): Record<string, { full_name?: string; email?: string }> {
  const m: Record<string, { full_name?: string; email?: string }> = {};
  for (const u of users) {
    if (u?.id) m[u.id] = { full_name: u.full_name, email: u.email };
  }
  return m;
}

/** Maps RPC JSON to the same shapes as legacy REST + batch helpers. */
function mergeStandaloneEquipmentBundlePayload(raw: any, progressImagesLatestOnly: boolean): {
  equipment: any[];
  extras: StandaloneBundleExtras | null;
} {
  const equipmentRows = parseJsonbArray(raw?.equipment);
  if (equipmentRows.length === 0) {
    return { equipment: [], extras: null };
  }
  const allProgressImages = parseJsonbArray(raw?.progress_images);
  const allProgressEntries = parseJsonbArray(raw?.progress_entries);
  const usersMap = buildUsersMapFromBundle(parseJsonbArray(raw?.users));
  const progressEntriesEnriched = allProgressEntries.map((entry: any) => ({
    ...entry,
    users:
      entry.created_by && usersMap[entry.created_by]
        ? {
            full_name: usersMap[entry.created_by].full_name,
            email: usersMap[entry.created_by].email,
          }
        : null,
    created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null,
  }));
  const equipmentWithProgressData = equipmentRows.map((eq: any) => {
    const progressImages = allProgressImages.filter((img: any) => img.equipment_id === eq.id);
    const progressEntries = progressEntriesEnriched.filter((entry: any) => entry.equipment_id === eq.id);
    return {
      ...eq,
      progress_images: progressImagesLatestOnly ? [] : progressImages.map((img: any) => img.image_url),
      progress_images_metadata: progressImages,
      progress_entries: progressEntries,
      technical_sections: eq.technical_sections || [],
      custom_fields: eq.custom_fields || [],
      team_custom_fields: eq.team_custom_fields || [],
    };
  });

  const equipmentIds = equipmentRows.map((e: any) => e.id).filter(Boolean);

  const documents = parseJsonbArray(raw?.documents).map((d: any) => ({
    ...d,
    uploaded_by_user:
      d.uploaded_by && usersMap[d.uploaded_by]
        ? { full_name: usersMap[d.uploaded_by].full_name, email: usersMap[d.uploaded_by].email }
        : null,
  }));
  const documentsByEquipment: Record<string, any[]> = {};
  for (const id of equipmentIds) documentsByEquipment[id] = [];
  for (const d of documents) {
    if (d.equipment_id) {
      (documentsByEquipment[d.equipment_id] = documentsByEquipment[d.equipment_id] || []).push(d);
    }
  }

  const activities = parseJsonbArray(raw?.activities);
  const actCompletions = parseJsonbArray(raw?.activity_completions);
  for (const c of actCompletions) {
    if (c.updated_by && usersMap[c.updated_by]) {
      c.updated_by_user = { full_name: usersMap[c.updated_by].full_name };
    }
  }
  const completionByActivityId: Record<string, any> = {};
  for (const c of actCompletions) {
    if (c.activity_id) completionByActivityId[c.activity_id] = c;
  }
  const activitiesWithComp = activities.map((a: any) => ({
    ...a,
    completion: completionByActivityId[a.id] || null,
  }));
  const activitiesByEquipment: Record<string, any[]> = {};
  for (const id of equipmentIds) activitiesByEquipment[id] = [];
  for (const a of activitiesWithComp) {
    if (a.equipment_id) {
      (activitiesByEquipment[a.equipment_id] = activitiesByEquipment[a.equipment_id] || []).push(a);
    }
  }

  const checklistTasks = parseJsonbArray(raw?.checklist_tasks).map((t: any) => ({
    ...t,
    created_by_user:
      t.created_by && usersMap[t.created_by]
        ? { full_name: usersMap[t.created_by].full_name, email: usersMap[t.created_by].email }
        : null,
  }));
  const checklistCompletions = parseJsonbArray(raw?.checklist_completions);
  const completionByTaskId: Record<string, any> = {};
  for (const c of checklistCompletions) {
    if (c.task_id) completionByTaskId[c.task_id] = c;
  }
  const checklistWithComp = checklistTasks.map((t: any) => ({
    ...t,
    completion: completionByTaskId[t.id] || null,
  }));
  const productionChecklistByEquipment: Record<string, any[]> = {};
  for (const id of equipmentIds) productionChecklistByEquipment[id] = [];
  for (const t of checklistWithComp) {
    if (t.equipment_id) {
      (productionChecklistByEquipment[t.equipment_id] = productionChecklistByEquipment[t.equipment_id] || []).push(t);
    }
  }

  const teamRows = parseJsonbArray(raw?.team_positions);
  const teamPositionsByEquipment: Record<string, any[]> = {};
  for (const id of equipmentIds) teamPositionsByEquipment[id] = [];
  for (const row of teamRows) {
    if (row.equipment_id) {
      (teamPositionsByEquipment[row.equipment_id] = teamPositionsByEquipment[row.equipment_id] || []).push(row);
    }
  }

  return {
    equipment: equipmentWithProgressData,
    extras: {
      documentsByEquipment,
      activitiesByEquipment,
      productionChecklistByEquipment,
      teamPositionsByEquipment,
    },
  };
}

function isBundleRpcUnavailable(err: any): boolean {
  const code = err?.response?.status;
  const msg = String(err?.response?.data?.message || err?.message || '');
  return (
    code === 404 ||
    code === 406 ||
    msg.includes('PGRST202') ||
    msg.includes('Could not find the function') ||
    msg.includes('does not exist')
  );
}

// Helper function to get session token with fallbacks
async function getSessionToken(): Promise<string | null> {
  // Try to get from cache first (if less than 5 minutes old)
  if (cachedSessionToken && Date.now() - sessionCacheTime < SESSION_CACHE_DURATION) {
    return cachedSessionToken;
  }
  
  // Try to get from localStorage (Supabase stores session there)
  try {
    const storageKey = 'sb-ypdlbqrcxnugrvllbmsi-auth-token';
    const storedSession = localStorage.getItem(storageKey);
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      if (parsed?.access_token) {
        cachedSessionToken = parsed.access_token;
        sessionCacheTime = Date.now();
        return cachedSessionToken;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Fallback: Try getSession with short timeout
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('getSession timeout')), 2000) // 2 second timeout
    );
    
    const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]) as any;
    
    if (!error && session?.access_token) {
      cachedSessionToken = session.access_token;
      sessionCacheTime = Date.now();
      return cachedSessionToken;
    }
  } catch (error) {
    // Ignore getSession errors
  }
  
  return null;
}

// Add request interceptor to dynamically set Authorization header with user's JWT token
// This is required for RLS (Row Level Security) to work correctly
api.interceptors.request.use(async (config: any) => {
  try {
    const token = await getSessionToken();
    
    if (token) {
      // Use the user's JWT token for authenticated requests
      // This allows RLS policies to identify the user via auth.uid()
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Fallback to anon key if no session (for public/unauthenticated requests)
      config.headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
  } catch (error: any) {
    console.error('❌ Interceptor: Error getting session, using anon key:', error?.message || error);
    // Fallback to anon key on error to prevent breaking existing functionality
    config.headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  
  return config;
});

// On 401, clear cached session so next request tries fresh token (or anon)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      cachedSessionToken = null;
      sessionCacheTime = 0;
    }
    return Promise.reject(error);
  }
);

// Fast API functions
/** Compare DB row vs merge payload; skip redundant PATCH during bulk merge. */
function normalizeProductionChecklistMergeTaskRow(row: any) {
  return {
    task_title: row.task_title,
    task_detail: row.task_detail ?? null,
    department: row.department ?? null,
    assigned_to: row.assigned_to ?? null,
    reference_document_url: row.reference_document_url ?? null,
    reference_document_name: row.reference_document_name ?? null,
    reference_image_url: row.reference_image_url ?? null,
    sort_order: Number(row.sort_order ?? 0),
    created_by: row.created_by ?? null,
  };
}

function productionChecklistMergeTaskUnchanged(
  prev: any,
  body: {
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }
) {
  const normalized = {
    task_title: body.task_title,
    task_detail: body.task_detail ?? null,
    department: body.department ?? null,
    assigned_to: body.assigned_to ?? null,
    reference_document_url: body.reference_document_url ?? null,
    reference_document_name: body.reference_document_name ?? null,
    reference_image_url: body.reference_image_url ?? null,
    sort_order: Number(body.sort_order ?? 0),
    created_by: body.created_by ?? null,
  };
  return JSON.stringify(normalizeProductionChecklistMergeTaskRow(prev)) === JSON.stringify(normalized);
}

export const fastAPI = {
  // Fetch all companies with user count
  async getCompanies() {
    try {
      const response = await api.get('/firms?select=*&order=created_at.desc');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('❌ Error fetching companies:', error);
      throw error;
    }
  },

  // Fetch firm by ID
  async getFirmById(firmId: string) {
    try {
      const response = await api.get(`/firms?id=eq.${firmId}&select=*`);
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error('❌ Error fetching firm:', error);
      throw error;
    }
  },

  /** Total equipment count for a firm: project equipment (all projects) + standalone equipment (created by firm users). */
  async getEquipmentCountByFirm(firmId: string): Promise<number> {
    try {
      const [projectsRes, usersRes] = await Promise.all([
        api.get(`/projects?firm_id=eq.${firmId}&select=id`),
        api.get(`/users?firm_id=eq.${firmId}&select=id`)
      ]);
      const projectIds = (projectsRes.data as any[])?.map((p: any) => p.id).filter(Boolean) || [];
      const userIds = (usersRes.data as any[])?.map((u: any) => u.id).filter(Boolean) || [];

      const countRowsExact = async (path: string): Promise<number> => {
        try {
          const res = await api.get(path, {
            headers: { Prefer: 'count=exact', Range: '0-0' },
          });
          const total = parseTotalFromContentRange(res);
          if (total != null) return total;
        } catch {
          /* fall back */
        }
        const res = await api.get(path);
        const data = res.data;
        return Array.isArray(data) ? data.length : 0;
      };

      const [projectEquipmentCount, standaloneCount] = await Promise.all([
        projectIds.length > 0
          ? countRowsExact(`/equipment?project_id=in.(${projectIds.join(',')})&select=id`)
          : Promise.resolve(0),
        userIds.length > 0
          ? countRowsExact(`/standalone_equipment?created_by=in.(${userIds.join(',')})&select=id`)
          : Promise.resolve(0),
      ]);
      return projectEquipmentCount + standaloneCount;
    } catch (error) {
      console.error('❌ Error fetching equipment count by firm:', error);
      return 0;
    }
  },

  // Fetch all users
  async getUsers() {
    try {
      const response = await api.get('/users?select=*&order=created_at.desc');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
  },

  // Fetch team members by project ID
  async getTeamMembersByProject(projectId: string) {
    // Skip for standalone equipment (no project_id) - prevents UUID error
    if (projectId === 'standalone') {
      return [];
    }
    
    try {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // // console.log('👥 Fetching team members for project ID:', projectId);
      const response = await api.get(`/project_members?project_id=eq.${projectId}&select=*,users(*)&order=created_at.desc`);
      // // console.log('✅ Team members response:', response.data);
      
      // Transform the data to include user details
      const transformedData = (response.data as any[]).map((member: any) => ({
        id: member.id,
        name: member.users?.full_name || member.users?.name || 'Unknown',
        email: member.users?.email || '',
        role: member.role,
        position: member.position || member.role,
        user_id: member.user_id,
        project_id: member.project_id,
        equipment_assignments: member.equipment_assignments || []
      }));
      
      return transformedData;
    } catch (error) {
      console.error('❌ Error fetching project team members:', error);
      throw error;
    }
  },

  // Fetch team members by firm ID
  async getTeamMembersByFirm(firmId: string) {
    try {
      const response = await api.get(`/users?firm_id=eq.${firmId}&select=*&order=created_at.desc`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching firm team members:', error);
      throw error;
    }
  },

  // Create new team member
  async createTeamMember(memberData: any) {
    try {
      const response = await api.post('/users', memberData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating team member:', error);
      throw error;
    }
  },

  // Update team member
  async updateTeamMember(memberId: string, updateData: any) {
    try {
      const response = await api.patch(`/users?id=eq.${memberId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating team member:', error);
      throw error;
    }
  },

  // Delete team member
  async deleteTeamMember(memberId: string) {
    try {
      const response = await api.delete(`/users?id=eq.${memberId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting team member:', error);
      throw error;
    }
  },

  // Create new company
  async createCompany(companyData: any) {
    try {
      const response = await api.post('/firms', companyData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating company:', error);
      throw error;
    }
  },

  // Update company
  async updateCompany(id: string, companyData: any) {
    try {
      const response = await api.patch(`/firms?id=eq.${id}`, companyData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating company:', error);
      throw error;
    }
  },

  // Delete company
  async deleteCompany(id: string) {
    try {
      // // console.log('🗑️ Starting cascade delete for company:', id);
      
      // Get all projects for this company first
      const projectsResponse = await api.get(`/projects?firm_id=eq.${id}&select=id`);
      const projects = (projectsResponse.data as any[]) || [];
      // // console.log(`📋 Found ${projects.length} projects to delete`);
      
      // Delete all related data in correct order
      for (const project of projects) {
        // // console.log(`🗑️ Deleting project: ${project.id}`);
        
        // 1. Delete equipment documents
        const equipmentResponse = await api.get(`/equipment?project_id=eq.${project.id}&select=id`);
        const equipment = (equipmentResponse.data as any[]) || [];
        
        for (const eq of equipment) {
          // Delete equipment documents
          await api.delete(`/equipment_documents?equipment_id=eq.${eq.id}`);
          // Delete progress images
          await api.delete(`/equipment_progress_images?equipment_id=eq.${eq.id}`);
          // Delete progress entries
          await api.delete(`/equipment_progress_entries?equipment_id=eq.${eq.id}`);
        }
        
        // 2. Delete equipment
        await api.delete(`/equipment?project_id=eq.${project.id}`);
        
        // 3. Delete project documents
        await api.delete(`/unpriced_po_documents?project_id=eq.${project.id}`);
        await api.delete(`/design_inputs_documents?project_id=eq.${project.id}`);
        await api.delete(`/client_reference_documents?project_id=eq.${project.id}`);
        await api.delete(`/other_documents?project_id=eq.${project.id}`);
        
        // 4. Delete project members
        await api.delete(`/project_members?project_id=eq.${project.id}`);
        
        // 5. Delete VDCR records and documents
        const vdcrResponse = await api.get(`/vdcr_records?project_id=eq.${project.id}&select=id`);
        const vdcrRecords = (vdcrResponse.data as any[]) || [];
        
        for (const vdcr of vdcrRecords) {
          await api.delete(`/vdcr_documents?vdcr_record_id=eq.${vdcr.id}`);
        }
        await api.delete(`/vdcr_records?project_id=eq.${project.id}`);
      }
      
      // 6. Clear project_id references from users table first
      await api.patch(`/users?firm_id=eq.${id}`, { project_id: null });
      // // console.log('✅ Cleared project_id references from users');
      
      // 7. Delete projects
      await api.delete(`/projects?firm_id=eq.${id}`);
      // // console.log('✅ Projects deleted');
      
      // 8. Delete invites
      await api.delete(`/invites?firm_id=eq.${id}`);
      // // console.log('✅ Invites deleted');
      
      // 9. Delete users (now safe)
      await api.delete(`/users?firm_id=eq.${id}`);
      // // console.log('✅ Users deleted');
      
      // 10. Finally delete company
      const response = await api.delete(`/firms?id=eq.${id}`);
      // // console.log('✅ Company deleted successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting company:', error);
      throw error;
    }
  },

  // Create user
  async createUser(userData: any) {
    try {
      const response = await api.post('/users', userData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  },

  // Update user
  async updateUser(id: string, userData: any) {
    try {
      const response = await api.patch(`/users?id=eq.${id}`, userData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  },

  // Delete users by firm_id
  async deleteUsersByFirm(firmId: string) {
    try {
      const response = await api.delete(`/users?firm_id=eq.${firmId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting users by firm:', error);
      throw error;
    }
  },

  // =====================================================
  // PROJECTS API FUNCTIONS
  // =====================================================

  // Fetch projects by firm_id with equipment and documents in one RPC (no N+1)
  async getProjectsByFirm(firmId: string, userRole?: string, userId?: string) {
    try {
      let userEmail: string | null = null;
      if (userRole && userRole !== 'super_admin' && userRole !== 'firm_admin' && userId) {
        try {
          const storedUserData = JSON.parse(localStorage.getItem('userData') || '{}');
          userEmail = storedUserData.email || localStorage.getItem('userEmail') || '';
          if (!userEmail) {
            const userResponse = await api.get(`/users?id=eq.${userId}&select=email`);
            if (userResponse.data && Array.isArray(userResponse.data) && userResponse.data.length > 0) {
              userEmail = (userResponse.data as any[])[0].email;
            }
          }
        } catch (err) {
          console.error('❌ Error fetching user email:', err);
        }
        if (!userEmail || !userEmail.trim()) {
          console.warn('⚠️ No email found for user, cannot fetch assigned projects');
          return [];
        }
      }

      const payload: { p_firm_id: string; p_user_role: string; p_user_email?: string | null } = {
        p_firm_id: firmId,
        p_user_role: userRole || 'viewer',
      };
      if (userEmail !== null && userEmail.trim() !== '') {
        payload.p_user_email = userEmail.trim();
      }

      const response = await api.post('/rpc/get_projects_by_firm', payload, { timeout: 60000 });
      const data = response.data;
      const projects = Array.isArray(data) ? data : (data != null && Array.isArray((data as any).data) ? (data as any).data : []);
      return projects;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      throw error;
    }
  },

  /** Project card metrics for dashboard: doc progress %, manufacturing %, inspection/TPI % and counts (done/total). RPC returns doc counts only; we compute doc % here (equal share per doc: Code 1=100%, Code 2=80%, Code 3=50%, Code 4=0%). */
  async getProjectCardMetrics(projectIds: string[]): Promise<Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal: number; inspectionTpiDone: number }>> {
    const ids = (projectIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (!ids.length) return {};
    try {
      const response = await api.post('/rpc/get_project_card_metrics', { p_project_ids: ids }, { timeout: 15000 });
      let raw = response.data;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      let list: any[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw != null && Array.isArray((raw as any).data)) {
        list = (raw as any).data;
      } else if (raw != null && typeof raw === 'object' && (raw as any).project_id != null) {
        list = [raw];
      } else if (raw != null && typeof raw === 'object') {
        const fnResult = (raw as any).get_project_card_metrics ?? (raw as any).result;
        const parsed = typeof fnResult === 'string' ? (() => { try { return JSON.parse(fnResult); } catch { return null; } })() : fnResult;
        list = Array.isArray(parsed) ? parsed : (parsed && (parsed as any).project_id != null ? [parsed] : []);
      }
      const out: Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal: number; inspectionTpiDone: number }> = {};
      for (const row of list) {
        const r = row as any;
        const id = r.project_id ?? r.projectId;
        if (!id) continue;
        const total = Number(r.doc_total ?? r.docTotal) ?? 0;
        const c1 = Number(r.doc_code1 ?? r.docCode1) ?? 0;
        const c2 = Number(r.doc_code2 ?? r.docCode2) ?? 0;
        const c3 = Number(r.doc_code3 ?? r.docCode3) ?? 0;
        const c4 = Number(r.doc_code4 ?? r.docCode4) ?? 0;
        let docProgressPct = 0;
        if (r.doc_progress_pct != null || r.docProgressPct != null) {
          docProgressPct = Number(r.doc_progress_pct ?? r.docProgressPct) || 0;
        } else if (total > 0) {
          const share = 100 / total;
          docProgressPct = c1 * share * 1 + c2 * share * 0.8 + c3 * share * 0.5 + c4 * share * 0;
        }
        const mfg = Number(r.manufacturing_progress_pct ?? r.manufacturingProgressPct) || 0;
        const insp = Number(r.inspection_tpi_pct ?? r.inspectionTpiPct) || 0;
        const inspTotal = Number(r.inspection_tpi_total ?? r.inspectionTpiTotal) ?? 0;
        const inspDone = Number(r.inspection_tpi_done ?? r.inspectionTpiDone) ?? 0;
        out[String(id)] = {
          docProgressPct: Math.round(docProgressPct * 10) / 10,
          manufacturingProgressPct: mfg,
          inspectionTpiPct: insp,
          inspectionTpiTotal: inspTotal,
          inspectionTpiDone: inspDone,
        };
      }
      return out;
    } catch (error) {
      console.error('❌ Error fetching project card metrics:', error);
      return {};
    }
  },

  /** Client view: get full payload by token (public, no auth required). */
  async getClientViewPayload(token: string): Promise<{
    settings: Record<string, boolean>;
    project: { id: string; name: string; client?: string; location?: string; deadline?: string; created_at?: string; status?: string };
    project_panel: { metrics: any; days_since_start: number | null };
    equipment: Array<{ id: string; name?: string; tag_number?: string; job_number?: string; manufacturing_serial?: string; progress?: number; progress_phase?: string; po_cdd?: string; updated_at?: string; status?: string }>;
  } | null> {
    if (!token?.trim()) return null;
    try {
      const response = await api.post('/rpc/get_client_view_payload', { p_token: token.trim() }, { timeout: 15000 });
      const raw = response.data;
      if (raw == null) return null;
      return raw as any;
    } catch (error) {
      console.error('❌ Error fetching client view payload:', error);
      return null;
    }
  },

  /** Client view: resolve by token (public). */
  async getClientViewByToken(token: string): Promise<any | null> {
    if (!token?.trim()) return null;
    try {
      const response = await api.post('/rpc/get_client_view_by_token', { p_token: token.trim() }, { timeout: 10000 });
      const raw = response.data;
      return raw ?? null;
    } catch (error) {
      console.error('❌ Error fetching client view by token:', error);
      return null;
    }
  },

  /** Client view: list links for a project (authenticated). */
  async getClientViewsForProject(projectId: string): Promise<any[]> {
    try {
      const response = await api.get(`/project_client_views?project_id=eq.${projectId}&select=*&order=created_at.desc`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('❌ Error listing client views:', error);
      return [];
    }
  },

  /** Client view: create new link (authenticated). Returns new row with token. */
  async createClientView(projectId: string, settings: {
    label?: string;
    equipment_ids?: string[] | null;
    show_full_qap?: boolean;
    show_qap_visuals_only?: boolean;
    show_progress_bar?: boolean;
    show_doc_code_1?: boolean;
    show_doc_code_2?: boolean;
    show_doc_code_3?: boolean;
    show_doc_code_4?: boolean;
    show_inspection_reports?: boolean;
    show_audit_internal_docs?: boolean;
    show_pre_production_checklist?: boolean;
    show_project_panel?: boolean;
  }): Promise<{ id: string; token: string; [k: string]: any } | null> {
    try {
      const response = await api.post('/rpc/create_client_view', {
        p_project_id: projectId,
        p_label: settings.label ?? null,
        p_equipment_ids: settings.equipment_ids?.length ? settings.equipment_ids : null,
        p_show_full_qap: settings.show_full_qap ?? false,
        p_show_qap_visuals_only: settings.show_qap_visuals_only ?? true,
        p_show_progress_bar: settings.show_progress_bar ?? true,
        p_show_doc_code_1: settings.show_doc_code_1 ?? true,
        p_show_doc_code_2: settings.show_doc_code_2 ?? true,
        p_show_doc_code_3: settings.show_doc_code_3 ?? true,
        p_show_doc_code_4: settings.show_doc_code_4 ?? true,
        p_show_inspection_reports: settings.show_inspection_reports ?? false,
        p_show_audit_internal_docs: settings.show_audit_internal_docs ?? false,
        p_show_pre_production_checklist: settings.show_pre_production_checklist ?? false,
        p_show_project_panel: settings.show_project_panel ?? true,
      }, { timeout: 10000 });
      const raw = response.data;
      if (raw == null) return null;
      return typeof raw === 'object' && raw.id && raw.token ? raw : null;
    } catch (error) {
      console.error('❌ Error creating client view:', error);
      return null;
    }
  },

  /** Client view: update existing link (authenticated). */
  async updateClientView(viewId: string, settings: Partial<{
    label: string | null;
    equipment_ids: string[] | null;
    show_full_qap: boolean;
    show_qap_visuals_only: boolean;
    show_progress_bar: boolean;
    show_doc_code_1: boolean;
    show_doc_code_2: boolean;
    show_doc_code_3: boolean;
    show_doc_code_4: boolean;
    show_inspection_reports: boolean;
    show_audit_internal_docs: boolean;
    show_pre_production_checklist: boolean;
    show_project_panel: boolean;
  }>): Promise<boolean> {
    try {
      await api.patch(`/project_client_views?id=eq.${viewId}`, settings);
      return true;
    } catch (error) {
      console.error('❌ Error updating client view:', error);
      return false;
    }
  },

  /** Client view: delete link (authenticated). */
  async deleteClientView(viewId: string): Promise<boolean> {
    try {
      await api.delete(`/project_client_views?id=eq.${viewId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting client view:', error);
      return false;
    }
  },

  // Fetch single project by ID
  async getProjectById(projectId: string) {
    // Skip for standalone equipment (no project_id)
    if (projectId === 'standalone') {
      return [];
    }
    try {
      const response = await api.get(`/projects?id=eq.${projectId}&select=*`);
      const project = response.data[0];
      
      if (!project) {
        return [];
      }

      // Fetch documents from separate tables (same approach as getAllProjects)
      try {
        const [unpricedPODocs, designInputsDocs, clientRefDocs, otherDocs] = await Promise.all([
          api.get(`/unpriced_po_documents?project_id=eq.${projectId}&select=*&order=created_at.desc`).catch((error) => {
            return { data: [] };
          }),
          api.get(`/design_inputs_documents?project_id=eq.${projectId}&select=*&order=created_at.desc`).catch((error) => {
            return { data: [] };
          }),
          api.get(`/client_reference_documents?project_id=eq.${projectId}&select=*&order=created_at.desc`).catch((error) => {
            return { data: [] };
          }),
          api.get(`/other_documents?project_id=eq.${projectId}&select=*&order=created_at.desc`).catch((error) => {
            return { data: [] };
          })
        ]);

        // Return project with documents from separate tables, or fallback to JSONB columns if separate tables are empty
        return [{
          ...project,
          unpriced_po_documents: (unpricedPODocs.data && unpricedPODocs.data.length > 0) ? unpricedPODocs.data : (project.unpriced_po_documents || []),
          design_inputs_documents: (designInputsDocs.data && designInputsDocs.data.length > 0) ? designInputsDocs.data : (project.design_inputs_documents || []),
          client_reference_documents: (clientRefDocs.data && clientRefDocs.data.length > 0) ? clientRefDocs.data : (project.client_reference_documents || []),
          other_documents: (otherDocs.data && otherDocs.data.length > 0) ? otherDocs.data : (project.other_documents || [])
        }];
      } catch (docError) {
        // If fetching from separate tables fails, return project with JSONB columns
        console.error('❌ Error fetching documents from separate tables, using JSONB columns:', docError);
        return [{
          ...project,
          unpriced_po_documents: project.unpriced_po_documents || [],
          design_inputs_documents: project.design_inputs_documents || [],
          client_reference_documents: project.client_reference_documents || [],
          other_documents: project.other_documents || []
        }];
      }
    } catch (error) {
      console.error('❌ Error fetching project by ID:', error);
      throw error;
    }
  },

  // Fetch lightweight project fields by ID (single request, no document-table fan-out)
  async getProjectSummaryById(projectId: string) {
    if (projectId === 'standalone') return null;
    try {
      const response = await api.get(`/projects?id=eq.${projectId}&select=id,sales_order_date,vdcr_cycle_time_rev_00,vdcr_cycle_time_rev_01_plus`);
      const row = Array.isArray(response.data) ? response.data[0] : null;
      return row || null;
    } catch (error) {
      console.error('❌ Error fetching project summary by ID:', error);
      return null;
    }
  },

  // Create new project
  async createProject(projectData: any) {
    try {
      const response = await api.post('/projects', projectData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating project:', error);
      throw error;
    }
  },

  // Update project
  async updateProject(id: string, projectData: any) {
    try {
      // // console.log('🔍 Updating project with data:', projectData);
      // // console.log('🔍 Project ID:', id);
      const response = await api.patch(`/projects?id=eq.${id}`, projectData);
      // // console.log('✅ Project updated successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating project:', error);
      console.error('❌ Error response:', error.response?.data);
      throw error;
    }
  },

  // Delete project
  async deleteProject(id: string) {
    try {
      // // console.log('🗑️ Attempting to delete project:', id);
      
      // First get all equipment for this project
      // // console.log('🗑️ Getting equipment for project...');
      const equipmentResponse = await api.get(`/equipment?project_id=eq.${id}&select=id`);
      const equipment = equipmentResponse.data || [];
      const equipmentIds = ((equipment as any[]) || []).map((eq) => eq.id).filter(Boolean);
      await deleteEquipmentChildrenByProjectBatches(equipmentIds);
      
      // Now delete equipment
      // // console.log('🗑️ Deleting related equipment...');
      try {
        await api.delete(`/equipment?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No equipment to delete for project:', id);
      }
      
      // Delete project members
      // // console.log('🗑️ Deleting related project members...');
      try {
        await api.delete(`/project_members?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No project members to delete for project:', id);
      }
      
      // Delete invites to resolve foreign key constraint
      // // console.log('🗑️ Deleting related invites...');
      try {
        await api.delete(`/invites?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No invites to delete for project:', id);
      }
      
      // Clear user references to this project (set project_id to null)
      // // console.log('🗑️ Clearing user references to project...');
      try {
        await api.patch(`/users?project_id=eq.${id}`, { project_id: null });
        // // console.log('✅ User references cleared successfully');
      } catch (error) {
        // console.log('⚠️ No user references to clear for project:', id);
      }
      
      // Delete VDCR records and their child records first (they reference project)
      // Must delete child tables before vdcr_records to avoid foreign key errors
      try {
        const vdcrResponse = await api.get(`/vdcr_records?project_id=eq.${id}&select=id`);
        const vdcrRecords = (vdcrResponse.data as any[]) || [];
        for (const vdcr of vdcrRecords) {
          try {
            await api.delete(`/vdcr_activity_logs?vdcr_id=eq.${vdcr.id}`);
          } catch (_) { /* ignore */ }
          try {
            await api.delete(`/vdcr_revision_events?vdcr_record_id=eq.${vdcr.id}`);
          } catch (_) { /* ignore */ }
          try {
            await api.delete(`/vdcr_document_history?vdcr_record_id=eq.${vdcr.id}`);
          } catch (_) { /* ignore */ }
          try {
            await api.delete(`/vdcr_documents?vdcr_record_id=eq.${vdcr.id}`);
          } catch (_) { /* ignore */ }
        }
        await api.delete(`/vdcr_records?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No VDCR records to delete for project:', id);
      }
      
      // Delete related documents
      // // console.log('🗑️ Deleting related documents...');
      try {
        await api.delete(`/unpriced_po_documents?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No unpriced PO documents to delete');
      }
      
      try {
        await api.delete(`/design_inputs_documents?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No design inputs documents to delete');
      }
      
      try {
        await api.delete(`/client_reference_documents?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No client reference documents to delete');
      }
      
      try {
        await api.delete(`/other_documents?project_id=eq.${id}`);
      } catch (error) {
        // console.log('⚠️ No other documents to delete');
      }
      
      // Now delete the project
      // // console.log('🗑️ Deleting project...');
      const response = await api.delete(`/projects?id=eq.${id}`);
      // // console.log('✅ Project deleted successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      console.error('❌ Error response:', error.response?.data);
      throw error;
    }
  },

  // =====================================================
  // EQUIPMENT API FUNCTIONS
  // =====================================================

  // Fetch equipment by project_id with progress images
  // PERFORMANCE: Added timeout handling and batch processing to prevent statement timeouts
  // Optional: progressImagesLatestOnly = true returns metadata only (no image_url) and progress_images: [] for on-demand loading
  async getEquipmentByProject(projectId: string, options?: { progressImagesLatestOnly?: boolean }) {
    const dedupeKey = JSON.stringify({
      projectId,
      lio: options?.progressImagesLatestOnly === true,
    });
    const inflight = equipmentByProjectInFlight.get(dedupeKey);
    if (inflight) return await inflight;

    const loadPromise = (async (): Promise<any[]> => {
    try {
      // Do NOT clear bundle extras on every call — concurrent getEquipmentByProject calls would wipe data
      // before EquipmentGrid runs takeProjectEquipmentBundleExtras (falls back to many REST calls).
      if (
        projectEquipmentBundleExtras &&
        projectEquipmentBundleExtras.bundleProjectId !== projectId
      ) {
        projectEquipmentBundleExtras = null;
      }
      const progressImagesLatestOnly = options?.progressImagesLatestOnly === true;
      try {
        const rpcRes = await api.post(
          '/rpc/get_project_equipment_bundle',
          { p_project_id: projectId, p_progress_images_latest_only: progressImagesLatestOnly },
          { timeout: 120000 }
        );
        let raw: any = rpcRes.data;
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw);
          } catch {
            raw = null;
          }
        }
        if (raw && typeof raw === 'object' && Array.isArray((raw as any).equipment)) {
          const merged = mergeProjectEquipmentBundlePayload(raw, progressImagesLatestOnly, projectId);
          if (merged.extras) projectEquipmentBundleExtras = merged.extras;
          return merged.equipment;
        }
      } catch (bundleErr: any) {
        if (!isBundleRpcUnavailable(bundleErr)) {
          console.warn('⚠️ get_project_equipment_bundle failed, using legacy REST:', bundleErr?.message || bundleErr);
        }
        projectEquipmentBundleExtras = null;
      }

      projectEquipmentBundleExtras = null;

      // Fetch all equipment first with timeout handling
      let response;
      try {
        response = await api.get(`/equipment?project_id=eq.${projectId}&select=*&order=created_at.desc`, { timeout: 20000 });
      } catch (error: any) {
        // Handle timeout or 500 errors
        if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
          console.error('❌ Error fetching equipment: Query timeout', error);
          return []; // Return empty array instead of crashing
        }
        throw error;
      }
      
      const equipment = response.data;
      
      if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
        return [];
      }

      // Get all equipment IDs for batch fetching
      const equipmentIds = (equipment as any[]).map(eq => eq.id);
      
      // PERFORMANCE: Fetch progress images and entries in batches (30 = fewer round-trips, still safe for timeouts)
      const batchSize = 30;
      const allProgressImages: any[] = [];
      const allProgressEntries: any[] = [];
      
      // When progressImagesLatestOnly: fetch metadata only (no image_url) to keep payload small
      const progressImagesSelect = progressImagesLatestOnly
        ? 'id,equipment_id,description,uploaded_by,upload_date,created_at'
        : 'id,equipment_id,image_url,description,uploaded_by,upload_date,created_at,audio_duration';
      
      // Progress entries: metadata only (no image_url, no audio_data) so list loads fast and doesn't timeout
      const progressEntriesSelect = 'id,equipment_id,entry_text,entry_type,created_by,created_at,image_description,audio_duration';
      // Process batches with small bounded concurrency to reduce end-to-end latency
      // without creating DB request storms.
      const batches: string[][] = [];
      for (let i = 0; i < equipmentIds.length; i += batchSize) {
        batches.push(equipmentIds.slice(i, i + batchSize));
      }
      const MAX_CONCURRENT_BATCHES = 3;
      let batchCursor = 0;
      const runBatchWorker = async () => {
        while (batchCursor < batches.length) {
          const currentIndex = batchCursor++;
          const batch = batches[currentIndex];
          try {
            const [progressImagesResponse, progressEntriesResponse] = await Promise.all([
              api.get(
                `/equipment_progress_images?equipment_id=in.(${batch.join(',')})&select=${progressImagesSelect}&order=created_at.desc&limit=250`,
                { timeout: 15000 }
              ).catch(() => ({ data: [] })),
              api.get(
                `/equipment_progress_entries?equipment_id=in.(${batch.join(',')})&select=${progressEntriesSelect}&order=created_at.desc&limit=250`,
                { timeout: 15000 }
              ).catch(() => ({ data: [] })),
            ]);
            allProgressImages.push(...(progressImagesResponse.data || []));
            allProgressEntries.push(...(progressEntriesResponse.data || []));
          } catch (error: any) {
            if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014') {
              console.warn(`⚠️ Timeout fetching progress data for batch ${currentIndex + 1} (non-fatal):`, error);
            } else {
              console.warn(`⚠️ Error fetching progress data for batch ${currentIndex + 1} (non-fatal):`, error);
            }
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT_BATCHES, batches.length) }, () => runBatchWorker())
      );

      // Fetch user data for progress entries separately (more reliable than joins)
      const userIds = [...new Set(allProgressEntries.map((entry: any) => entry.created_by).filter(Boolean))];
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          const batchSize = 25;
          const userChunks: string[][] = [];
          for (let i = 0; i < userIds.length; i += batchSize) {
            userChunks.push(userIds.slice(i, i + batchSize));
          }
          const userResults = await Promise.all(
            userChunks.map((ids) =>
              api.get(`/users?id=in.(${ids.join(',')})&select=id,full_name,email`, { timeout: 15000 })
            )
          );
          const users = userResults.flatMap((r) => (Array.isArray(r.data) ? r.data : []));
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for progress entries (non-fatal):', (userError as any)?.message || userError);
        }
      }

      // Map progress data to equipment and attach user information
      const equipmentWithProgressData = (equipment as any[]).map((eq: any) => {
        // Filter progress images for this equipment
        const progressImages = allProgressImages.filter((img: any) => img.equipment_id === eq.id);
        // Filter progress entries for this equipment and attach user information
        const progressEntries = allProgressEntries
          .filter((entry: any) => entry.equipment_id === eq.id)
          .map((entry: any) => ({
            ...entry,
            users: entry.created_by && usersMap[entry.created_by] ? { 
              full_name: usersMap[entry.created_by].full_name, 
              email: usersMap[entry.created_by].email 
            } : null,
            created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null
          }));
        
        return {
          ...eq,
          // Main progress images (top section). When progressImagesLatestOnly, leave empty for on-demand load
          progress_images: progressImagesLatestOnly ? [] : progressImages.map((img: any) => img.image_url),
          progress_images_metadata: progressImages,
          // Progress entries (updates tab) - separate from progress images, with user info
          progress_entries: progressEntries,
          // Technical sections and custom fields (already in eq from database)
          technical_sections: eq.technical_sections || [],
          custom_fields: eq.custom_fields || [],
          team_custom_fields: eq.team_custom_fields || []
        };
      });
      
      return equipmentWithProgressData;
    } catch (error: any) {
      // Better error handling - don't throw, return empty array to prevent UI crashes
      if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
        console.error('❌ Error fetching equipment: Query timeout or server error', error);
        return []; // Return empty array instead of crashing
      }
      console.error('❌ Error fetching equipment:', error);
      return []; // Return empty array on any error to prevent UI crashes
    }
    })();

    equipmentByProjectInFlight.set(dedupeKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      equipmentByProjectInFlight.delete(dedupeKey);
    }
  },

  // Fetch standalone equipment (not connected to any project) - filtered by created_by (only equipment added by current user)
  // Optional: progressImagesLatestOnly = true returns metadata only (no image_url) and progress_images: [] for on-demand loading
  async getStandaloneEquipment(firmId?: string, userId?: string, options?: { progressImagesLatestOnly?: boolean }) {
    let inFlightKey = '';
    try {
      // Get user data if not provided
      if (!userId || !firmId) {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        userId = userId || userData.id || localStorage.getItem('userId') || '';
        firmId = firmId || userData.firm_id;
      }
      
      if (!userId) {
        console.error('❌ No user ID available for fetching standalone equipment');
        return [];
      }
  
      // Get user role and email
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const userRole = userData.role || localStorage.getItem('userRole') || '';
      const userEmail = userData.email || localStorage.getItem('userEmail') || '';

      inFlightKey = JSON.stringify({
        firmId: firmId || '',
        userId: userId || '',
        userRole: userRole || '',
        userEmail: (userEmail || '').toLowerCase().trim(),
        progressImagesLatestOnly: options?.progressImagesLatestOnly === true,
      });
      const existing = standaloneEquipmentInFlight.get(inFlightKey);
      if (existing) return await existing;
      const recent = standaloneEquipmentRecent.get(inFlightKey);
      if (recent && Date.now() - recent.at < STANDALONE_RECENT_TTL_MS) {
        return recent.data;
      }

      const loadPromise = (async (): Promise<any[]> => {
      standaloneBundleExtras = null;
      const progressImagesLatestOnly = options?.progressImagesLatestOnly === true;
      try {
        const rpcRes = await api.post(
          '/rpc/get_standalone_equipment_bundle',
          { p_firm_id: firmId ?? null, p_progress_images_latest_only: progressImagesLatestOnly },
          { timeout: 120000 }
        );
        const raw = rpcRes.data;
        if (raw && typeof raw === 'object' && Array.isArray((raw as any).equipment)) {
          const merged = mergeStandaloneEquipmentBundlePayload(raw, progressImagesLatestOnly);
          if (merged.extras) standaloneBundleExtras = merged.extras;
          return merged.equipment;
        }
      } catch (bundleErr: any) {
        if (!isBundleRpcUnavailable(bundleErr)) {
          console.warn('⚠️ get_standalone_equipment_bundle failed, using legacy REST:', bundleErr?.message || bundleErr);
        }
        standaloneBundleExtras = null;
      }

      let equipment: any[] = [];
  
      // Super Admin sees all equipment
      if (userRole === 'super_admin') {
        const response = await api.get(`/standalone_equipment?select=*&order=created_at.desc`);
        equipment = (response.data as any[]) || [];
      } 
      // Firm Admin sees all equipment in their firm
      // Note: standalone_equipment doesn't have firm_id column, firm ownership is via created_by -> users.firm_id
      else if (userRole === 'firm_admin' && firmId) {
        // Get all users in this firm first
        try {
          const firmUsersResponse = await api.get(`/users?firm_id=eq.${firmId}&select=id`);
          const firmUserIds = (firmUsersResponse.data as any[]).map((u: any) => u.id).filter(Boolean);
          
          if (firmUserIds.length > 0) {
            // Query equipment created by users in this firm
            const userIdsString = firmUserIds.join(',');
            const response = await api.get(
              `/standalone_equipment?created_by=in.(${userIdsString})&select=*&order=created_at.desc`
            );
            equipment = (response.data as any[]) || [];
          } else {
            // No users in firm, return empty array
            equipment = [];
          }
        } catch (error) {
          console.error('❌ Error fetching standalone equipment for firm admin:', error);
          equipment = [];
        }
      } 
      // All other roles (project_manager, vdcr_manager, editor, viewer) see assigned equipment
      else {
        let assignedEquipmentIds: string[] = [];
  
        // Get equipment they're assigned to via standalone_equipment_team_positions
        if (userEmail) {
          const normalizedEmail = userEmail.trim().toLowerCase();
          const teamPositionsResponse = await api.get(
            `/standalone_equipment_team_positions?email=ilike.${encodeURIComponent(normalizedEmail)}&select=equipment_id`
          );
          const teamEquipmentIds = (teamPositionsResponse.data as any[])
            .map((tp: any) => tp.equipment_id)
            .filter(Boolean);
          
          assignedEquipmentIds = [...teamEquipmentIds];
          assignedEquipmentIds = [...new Set(assignedEquipmentIds)]; // Remove duplicates
          
          // console.log(`✅ Found ${assignedEquipmentIds.length} assigned standalone equipment for ${normalizedEmail}`);
        }
  
        if (assignedEquipmentIds.length > 0) {
          const equipmentIdsString = assignedEquipmentIds.join(',');
          const response = await api.get(
            `/standalone_equipment?id=in.(${equipmentIdsString})&select=*&order=created_at.desc`
          );
          equipment = (response.data as any[]) || [];
        }
      }
  
      if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
        return [];
      }
  
      // Get all equipment IDs for batch fetching
      const equipmentIds = (equipment as any[]).map(eq => eq.id);
      
      const standaloneProgressImagesSelect = progressImagesLatestOnly
        ? 'id,equipment_id,description,uploaded_by,upload_date,created_at'
        : 'id,equipment_id,image_url,description,uploaded_by,upload_date,created_at,audio_duration';
      
      // PERFORMANCE: Use larger batches, then split only failing batches.
      // This reduces total API calls significantly while preserving timeout resilience.
      const batchSize = 60;
      const standaloneProgressImages: any[] = [];
      const standaloneProgressEntries: any[] = [];
      
      // Progress entries: metadata only - image loaded on preview click (used in batch and fallback)
      const standaloneProgressEntriesSelect = 'id,equipment_id,entry_text,entry_type,created_by,created_at,image_description,audio_duration';
      const fetchStandaloneProgressBatch = async (ids: string[], depth = 0): Promise<void> => {
        if (!ids.length) return;
        try {
          const [progressImagesResponse, progressEntriesResponse] = await Promise.all([
            api.get(
              `/standalone_equipment_progress_images?equipment_id=in.(${ids.join(',')})&select=${standaloneProgressImagesSelect}&order=created_at.desc&limit=250`,
              { timeout: 20000 }
            ),
            api.get(
              `/standalone_equipment_progress_entries?equipment_id=in.(${ids.join(',')})&select=${standaloneProgressEntriesSelect}&order=created_at.desc&limit=250`,
              { timeout: 20000 }
            ),
          ]);
          standaloneProgressImages.push(...(Array.isArray(progressImagesResponse.data) ? progressImagesResponse.data : []));
          standaloneProgressEntries.push(...(Array.isArray(progressEntriesResponse.data) ? progressEntriesResponse.data : []));
        } catch (error: any) {
          const isTimeout = error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014';
          // IMPORTANT: Cap split recursion to avoid request explosion when DB is slow.
          // If a small batch still times out, skip that batch (non-fatal) instead of splitting endlessly.
          const minBatchSizeForSplit = 12;
          const maxSplitDepth = 3;
          if (isTimeout && ids.length > minBatchSizeForSplit && depth < maxSplitDepth) {
            const mid = Math.ceil(ids.length / 2);
            await fetchStandaloneProgressBatch(ids.slice(0, mid), depth + 1);
            await fetchStandaloneProgressBatch(ids.slice(mid), depth + 1);
            return;
          }
          console.warn(`⚠️ Error fetching standalone progress data for batch size ${ids.length} (non-fatal):`, error);
        }
      };

      // Process top-level batches with bounded concurrency to lower total wait time.
      const standaloneBatches: string[][] = [];
      for (let i = 0; i < equipmentIds.length; i += batchSize) {
        standaloneBatches.push(equipmentIds.slice(i, i + batchSize));
      }
      const MAX_STANDALONE_CONCURRENT_BATCHES = 2;
      let standaloneBatchCursor = 0;
      const runStandaloneWorker = async () => {
        while (standaloneBatchCursor < standaloneBatches.length) {
          const currentIndex = standaloneBatchCursor++;
          const batch = standaloneBatches[currentIndex];
          await fetchStandaloneProgressBatch(batch);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_STANDALONE_CONCURRENT_BATCHES, standaloneBatches.length) },
          () => runStandaloneWorker()
        )
      );
      
      const progressImagesResponse = { data: standaloneProgressImages };
      const progressEntriesResponse = { data: standaloneProgressEntries };
  
      const allProgressImages = standaloneProgressImages;
      const allProgressEntries = standaloneProgressEntries;
  
      // Fetch user data for progress entries separately (more reliable than joins)
      const userIds = [...new Set(allProgressEntries.map((entry: any) => entry.created_by).filter(Boolean))];
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          const batchSize = 100;
          const userChunks: string[][] = [];
          for (let i = 0; i < userIds.length; i += batchSize) {
            userChunks.push(userIds.slice(i, i + batchSize));
          }
          const userResults = await Promise.all(
            userChunks.map((ids) =>
              api.get(`/users?id=in.(${ids.join(',')})&select=id,full_name,email`, { timeout: 15000 })
            )
          );
          const users = userResults.flatMap((r) => (Array.isArray(r.data) ? r.data : []));
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for standalone progress entries (non-fatal):', (userError as any)?.message || userError);
        }
      }
  
      // Map progress data to equipment and attach user information
      const equipmentWithProgressData = (equipment as any[]).map((eq: any) => {
        // Filter progress images for this equipment
        const progressImages = allProgressImages.filter((img: any) => img.equipment_id === eq.id);
        // Filter progress entries for this equipment and attach user information
        const progressEntries = allProgressEntries
          .filter((entry: any) => entry.equipment_id === eq.id)
          .map((entry: any) => ({
            ...entry,
            users: entry.created_by && usersMap[entry.created_by] ? { 
              full_name: usersMap[entry.created_by].full_name, 
              email: usersMap[entry.created_by].email 
            } : null,
            created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null
          }));
        
        return {
          ...eq,
          // Main progress images (top section). When progressImagesLatestOnly, leave empty for on-demand load
          progress_images: progressImagesLatestOnly ? [] : progressImages.map((img: any) => img.image_url),
          progress_images_metadata: progressImages,
          // Progress entries (updates tab) - separate from progress images, with user info
          progress_entries: progressEntries,
          // Technical sections and custom fields (already in eq from database)
          technical_sections: eq.technical_sections || [],
          custom_fields: eq.custom_fields || [],
          team_custom_fields: eq.team_custom_fields || []
        };
      });
      
      return equipmentWithProgressData;
      })();

      standaloneEquipmentInFlight.set(inFlightKey, loadPromise);
      try {
        const result = await loadPromise;
        standaloneEquipmentRecent.set(inFlightKey, { at: Date.now(), data: result });
        return result;
      } finally {
        standaloneEquipmentInFlight.delete(inFlightKey);
      }
    } catch (error) {
      console.error('❌ Error fetching standalone equipment:', error);
      throw error;
    }
  },

  // Lightweight suggestions fetch used by Add Standalone Equipment form.
  // Unlike getStandaloneEquipment, this intentionally avoids progress/images joins.
  async getStandaloneEquipmentSuggestions(firmId?: string, userId?: string) {
    try {
      if (!userId || !firmId) {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        userId = userId || userData.id || localStorage.getItem('userId') || '';
        firmId = firmId || userData.firm_id;
      }

      if (!userId) return [];

      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const userRole = userData.role || localStorage.getItem('userRole') || '';
      const userEmail = (userData.email || localStorage.getItem('userEmail') || '').toLowerCase().trim();

      const selectFields = 'id,client_name,plant_location,client_industry,consultant,tpi_agency,equipment_manager,created_by';
      let equipment: any[] = [];

      if (userRole === 'super_admin') {
        const response = await api.get(`/standalone_equipment?select=${selectFields}&order=created_at.desc`);
        equipment = (response.data as any[]) || [];
      } else if (userRole === 'firm_admin' && firmId) {
        const firmUsersResponse = await api.get(`/users?firm_id=eq.${firmId}&select=id`);
        const firmUserIds = (firmUsersResponse.data as any[]).map((u: any) => u.id).filter(Boolean);
        if (!firmUserIds.length) return [];
        const response = await api.get(
          `/standalone_equipment?created_by=in.(${firmUserIds.join(',')})&select=${selectFields}&order=created_at.desc`
        );
        equipment = (response.data as any[]) || [];
      } else {
        if (!userEmail) return [];
        const teamPositionsResponse = await api.get(
          `/standalone_equipment_team_positions?email=ilike.${encodeURIComponent(userEmail)}&select=equipment_id`
        );
        const equipmentIds = (teamPositionsResponse.data as any[])
          .map((tp: any) => tp.equipment_id)
          .filter(Boolean);
        const uniqueEquipmentIds = [...new Set(equipmentIds)];
        if (!uniqueEquipmentIds.length) return [];
        const response = await api.get(
          `/standalone_equipment?id=in.(${uniqueEquipmentIds.join(',')})&select=${selectFields}&order=created_at.desc`
        );
        equipment = (response.data as any[]) || [];
      }

      return Array.isArray(equipment) ? equipment : [];
    } catch (error) {
      console.error('❌ Error fetching standalone equipment suggestions:', error);
      return [];
    }
  },

  // Create new equipment
  // Check if job number already exists globally (tag number, title/MSN duplicates are allowed)
  async checkEquipmentUniqueness(tagNumber?: string, jobNumber?: string, manufacturingSerial?: string, excludeEquipmentId?: string, isStandalone?: boolean) {
    try {
      const checks: Array<{ type: string; promise: Promise<any> }> = [];
      const tableName = isStandalone ? 'standalone_equipment' : 'equipment';
      
      // Only job number must be unique; tag number and equipment title (manufacturing_serial) duplicates are allowed
      if (jobNumber && jobNumber.trim()) {
        let jobQuery = `/${tableName}?job_number=eq.${encodeURIComponent(jobNumber.trim())}`;
        if (excludeEquipmentId) {
          jobQuery += `&id=neq.${excludeEquipmentId}`;
        }
        checks.push({ type: 'jobNumber', promise: api.get(jobQuery) as Promise<any> });
        
        // Also check the other table for global uniqueness
        const otherTable = isStandalone ? 'equipment' : 'standalone_equipment';
        checks.push({ type: 'jobNumberOther', promise: api.get(`/${otherTable}?job_number=eq.${encodeURIComponent(jobNumber.trim())}`).catch(() => ({ data: [] })) as Promise<any> });
      }
      
      const results = await Promise.all(checks.map(c => c.promise));
      const conflicts: string[] = [];
      
      checks.forEach((check, index) => {
        if (results[index]?.data?.length > 0) {
          if (check.type === 'tagNumber' || check.type === 'tagNumberOther') {
            conflicts.push(`Tag Number "${tagNumber}" already exists`);
          } else if (check.type === 'jobNumber' || check.type === 'jobNumberOther') {
            conflicts.push(`Job Number "${jobNumber}" already exists`);
          } else if (check.type === 'manufacturingSerial' || check.type === 'manufacturingSerialOther') {
            conflicts.push(`Manufacturing Serial Number "${manufacturingSerial}" already exists`);
          }
        }
      });
      
      return {
        isUnique: conflicts.length === 0,
        conflicts
      };
    } catch (error: any) {
      console.error('❌ Error checking equipment uniqueness:', error);
      // If check fails, allow creation but log error
      return { isUnique: true, conflicts: [] };
    }
  },

  async createEquipment(equipmentData: any) {
    try {
      const projectId = equipmentData.project_id;
      if (projectId) {
        let firmId: string | null | undefined;
        let limit: number | null | undefined;
        try {
          const projectRes = await api.get(
            `/projects?id=eq.${projectId}&select=firm_id,firms(max_equipment_limit)`
          );
          const project = (projectRes.data as any[])?.[0];
          firmId = project?.firm_id;
          const fr = project?.firms;
          const firmRow = fr != null ? (Array.isArray(fr) ? fr[0] : fr) : null;
          limit = firmRow?.max_equipment_limit;
        } catch {
          const projectRes = await api.get(`/projects?id=eq.${projectId}&select=firm_id`);
          const project = (projectRes.data as any[])?.[0];
          firmId = project?.firm_id;
          if (firmId) {
            const firmRes = await api.get(`/firms?id=eq.${firmId}&select=max_equipment_limit`);
            limit = (firmRes.data as any[])?.[0]?.max_equipment_limit;
          }
        }
        if (firmId != null && limit === undefined) {
          const firmRes = await api.get(`/firms?id=eq.${firmId}&select=max_equipment_limit`);
          limit = (firmRes.data as any[])?.[0]?.max_equipment_limit;
        }
        if (firmId && limit != null && typeof limit === 'number') {
          const count = await fastAPI.getEquipmentCountByFirm(firmId);
          if (count >= limit) {
            throw new Error(`Equipment limit reached (${count}/${limit}). Your company cannot add more equipment. Contact your super admin to increase the limit.`);
          }
        }
      }

      // Normalize values before checking (trim whitespace, handle empty strings)
      const tagNumber = equipmentData.tag_number?.trim() || '';
      const jobNumber = equipmentData.job_number?.trim() || '';
      const manufacturingSerial = equipmentData.manufacturing_serial?.trim() || '';

      // // console.log('🔍 Checking uniqueness for equipment:', {
      //   tag_number: tagNumber,
      //   job_number: jobNumber,
      //   manufacturing_serial: manufacturingSerial
      // });

      // Check for global uniqueness before creating
      // Only check non-empty values to avoid false positives
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumber || undefined,
        jobNumber || undefined,
        manufacturingSerial || undefined
      );

      // // console.log('🔍 Uniqueness check result:', uniquenessCheck);

      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot create equipment. ${uniquenessCheck.conflicts.join('. ')}. Duplicate Job Number is not allowed; Job Number must be unique across all projects.`;
        console.error('❌ Uniqueness validation failed:', errorMessage);
        throw new Error(errorMessage);
      }

      // // console.log('✅ Uniqueness validation passed, creating equipment...');
      const response = await api.post('/equipment', equipmentData);
      // // console.log('✅ Equipment create API response:', response.data);
      
      // Log equipment creation
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const createdEquipment = response.data[0];
        await logEquipmentCreated(
          createdEquipment.project_id,
          createdEquipment.id,
          createdEquipment.type,
          createdEquipment.tag_number
        );
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating equipment:', error);
      throw error;
    }
  },

  // Update equipment

  // Create progress image
  async createProgressImage(imageData: {
    equipment_id: string,
    image_url: string,
    description?: string,
    audio_data?: string,
    audio_duration?: number,
    uploaded_by?: string
  }) {
    try {
      const response = await api.post('/equipment_progress_images', imageData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating progress image:', error);
      throw error;
    }
  },

  // Create standalone progress image
  async createStandaloneProgressImage(imageData: {
    equipment_id: string,
    image_url: string,
    description?: string,
    audio_data?: string,
    audio_duration?: number,
    uploaded_by?: string
  }) {
    try {
      const response = await api.post('/standalone_equipment_progress_images', imageData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating standalone progress image:', error);
      throw error;
    }
  },

  /**
   * Fetch only the latest (most recent) progress image URL for one equipment.
   * Used when USE_ON_DEMAND_PROGRESS_IMAGES is enabled.
   */
  async getLatestProgressImageUrl(equipmentId: string, isStandalone: boolean = false): Promise<string | null> {
    try {
      const table = isStandalone ? 'standalone_equipment_progress_images' : 'equipment_progress_images';
      const res = await api.get(
        `/${table}?equipment_id=eq.${equipmentId}&select=image_url&order=created_at.desc&limit=1`,
        { timeout: 10000 }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      return data[0]?.image_url ?? null;
    } catch (error) {
      console.warn('⚠️ getLatestProgressImageUrl failed (non-fatal):', error);
      return null;
    }
  },

  /**
   * Batch fetch latest progress image URL per equipment. Returns Record<equipmentId, url | null>.
   * One request instead of N for visible page thumbnails.
   */
  async getLatestProgressImageUrlsBatch(equipmentIds: string[], isStandalone: boolean = false): Promise<Record<string, string | null>> {
    if (!equipmentIds?.length) return {};
    const dedupeKey = `${isStandalone ? 's' : 'p'}:${batchDedupeKey(equipmentIds)}`;
    const inflight = latestProgressImageUrlsBatchInFlight.get(dedupeKey);
    if (inflight) return await inflight;

    const loadPromise = (async (): Promise<Record<string, string | null>> => {
      if (import.meta.env.DEV) {
        console.log(`[Batch] Latest progress image URLs: 1 request for ${equipmentIds.length} equipment (was ${equipmentIds.length} before batching)`);
      }
      try {
        const table = isStandalone ? 'standalone_equipment_progress_images' : 'equipment_progress_images';
        const limit = Math.max(500, equipmentIds.length * 2);
        const res = await api.get(
          `/${table}?equipment_id=in.(${equipmentIds.join(',')})&select=equipment_id,image_url,created_at&order=created_at.desc&limit=${limit}`,
          { timeout: 15000 }
        );
        const rows: any[] = Array.isArray(res.data) ? res.data : [];
        const result: Record<string, string | null> = {};
        for (const id of equipmentIds) result[id] = null;
        const placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
        const isPlaceholder = (url: string | null) => !url || url === placeholder || (url.startsWith('data:image/svg') && url.length < 200);
        for (const row of rows) {
          if (!row.equipment_id) continue;
          const url = row.image_url ?? null;
          const current = result[row.equipment_id];
          if (current == null) result[row.equipment_id] = url;
          else if (isPlaceholder(current) && !isPlaceholder(url)) result[row.equipment_id] = url; // prefer latest non-placeholder
        }
        return result;
      } catch (error) {
        console.warn('⚠️ getLatestProgressImageUrlsBatch failed (non-fatal):', error);
        return Object.fromEntries(equipmentIds.map((id) => [id, null]));
      }
    })();

    latestProgressImageUrlsBatchInFlight.set(dedupeKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      latestProgressImageUrlsBatchInFlight.delete(dedupeKey);
    }
  },

  /**
   * Fetch a single progress image URL by equipment and index (0 = latest).
   * Used when user clicks prev/next and USE_ON_DEMAND_PROGRESS_IMAGES is enabled.
   */
  async getProgressImageByEquipmentAndIndex(equipmentId: string, index: number, isStandalone: boolean = false): Promise<string | null> {
    const row = await this.getProgressImageByEquipmentAndIndexFull(equipmentId, index, isStandalone);
    return row?.image_url ?? null;
  },

  /**
   * Fetch a single progress image row (URL + description + uploaded_by + upload_date) in ONE request.
   * Use this to avoid multiple requests (URL, then description, then user, etc.) when loading next/prev image.
   */
  async getProgressImageByEquipmentAndIndexFull(
    equipmentId: string,
    index: number,
    isStandalone: boolean = false
  ): Promise<{ image_url: string; description?: string; uploaded_by?: string; upload_date?: string; created_at?: string } | null> {
    try {
      const table = isStandalone ? 'standalone_equipment_progress_images' : 'equipment_progress_images';
      const res = await api.get(
        `/${table}?equipment_id=eq.${equipmentId}&select=image_url,description,uploaded_by,upload_date,created_at&order=created_at.desc&offset=${index}&limit=1`,
        { timeout: 10000 }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      return data[0] ?? null;
    } catch (error) {
      console.warn('⚠️ getProgressImageByEquipmentAndIndexFull failed (non-fatal):', error);
      return null;
    }
  },

  /**
   * Fetch all progress image URLs for one equipment (newest first). Used e.g. for dossier cover image picker.
   */
  async getProgressImagesForEquipment(
    equipmentId: string,
    isStandalone: boolean = false
  ): Promise<Array<{ image_url: string; created_at?: string }>> {
    try {
      const table = isStandalone ? 'standalone_equipment_progress_images' : 'equipment_progress_images';
      const res = await api.get(
        `/${table}?equipment_id=eq.${equipmentId}&select=image_url,created_at&order=created_at.desc&limit=50`,
        { timeout: 10000 }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      return data;
    } catch (error) {
      console.warn('⚠️ getProgressImagesForEquipment failed (non-fatal):', error);
      return [];
    }
  },

  /**
   * Fetch a single progress image URL by id. Used when opening "View image" from activity detail for a specific upload.
   */
  async getProgressImageUrlById(imageId: string, isStandalone: boolean = false): Promise<string | null> {
    try {
      const table = isStandalone ? 'standalone_equipment_progress_images' : 'equipment_progress_images';
      const res = await api.get(
        `/${table}?id=eq.${imageId}&select=image_url&limit=1`,
        { timeout: 10000 }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      return data[0]?.image_url ?? null;
    } catch (error) {
      console.warn('⚠️ getProgressImageUrlById failed (non-fatal):', error);
      return null;
    }
  },

  /**
   * Fetch a single progress entry's image URL by entry id. Used when user clicks image preview in Updates tab.
   */
  async getProgressEntryImageUrl(entryId: string, isStandalone: boolean = false): Promise<string | null> {
    try {
      const table = isStandalone ? 'standalone_equipment_progress_entries' : 'equipment_progress_entries';
      const res = await api.get(
        `/${table}?id=eq.${entryId}&select=image_url&limit=1`,
        { timeout: 10000 }
      );
      const data = Array.isArray(res.data) ? res.data : [];
      return data[0]?.image_url ?? null;
    } catch (error) {
      console.warn('⚠️ getProgressEntryImageUrl failed (non-fatal):', error);
      return null;
    }
  },

  // Create progress entry
  async createProgressEntry(entryData: {
    equipment_id: string,
    entry_text: string,
    entry_type: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string,
    created_by?: string
  }) {
    try {
      const response = await api.post('/equipment_progress_entries', entryData, {
        headers: { Prefer: 'return=representation' },
      });
      return response.data;
    } catch (error) {
      console.error('❌ Error creating progress entry:', error);
      throw error;
    }
  },

  // Get progress entries for equipment with user information
  async getProgressEntriesByEquipment(equipmentId: string) {
    try {
      const response = await api.get(`/equipment_progress_entries?equipment_id=eq.${equipmentId}&select=*,users(full_name)&order=created_at.desc`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching progress entries:', error);
      throw error;
    }
  },

  // ============================================================================
  // STANDALONE EQUIPMENT PROGRESS ENTRIES FUNCTIONS
  // ============================================================================

  // Create standalone progress entry
  async createStandaloneProgressEntry(entryData: {
    equipment_id: string,
    entry_text: string,
    entry_type: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string,
    created_by?: string
  }) {
    try {
      const response = await api.post('/standalone_equipment_progress_entries', entryData, {
        headers: { Prefer: 'return=representation' },
      });
      return response.data;
    } catch (error) {
      console.error('❌ Error creating standalone progress entry:', error);
      throw error;
    }
  },

  // Get standalone progress entries for equipment with user information
  async getStandaloneProgressEntriesByEquipment(equipmentId: string) {
    try {
      const response = await api.get(`/standalone_equipment_progress_entries?equipment_id=eq.${equipmentId}&select=*,users(full_name)&order=created_at.desc`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching standalone progress entries:', error);
      throw error;
    }
  },

  // Update standalone progress entry
  async updateStandaloneProgressEntry(entryId: string, updateData: {
    entry_text?: string,
    entry_type?: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string
  }) {
    try {
      const response = await api.patch(`/standalone_equipment_progress_entries?id=eq.${entryId}`, updateData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating standalone progress entry:', error);
      throw error;
    }
  },

  // Delete standalone progress entry
  async deleteStandaloneProgressEntry(entryId: string) {
    try {
      const response = await api.delete(`/standalone_equipment_progress_entries?id=eq.${entryId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting standalone progress entry:', error);
      throw error;
    }
  },

  // ============================================================================
  // EQUIPMENT ACTIVITIES (from Excel: activity list + mark complete)
  // ============================================================================

  // Project equipment: get activities (with completion if any). Completions: metadata only (no image_url) for fast load.
  async getEquipmentActivities(equipmentId: string) {
    const completionsSelect =
      'id,activity_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
    const mapEmbedToActivities = (rows: any[]): any[] =>
      rows.map((a: any) => {
        const nested = a.equipment_activity_completions;
        const compArr = Array.isArray(nested) ? nested : nested ? [nested] : [];
        const completion = compArr[0] || null;
        const { equipment_activity_completions, ...rest } = a;
        return { ...rest, completion };
      });
    try {
      // Prefer: one request (activities + completions embed) instead of two round-trips.
      const activitiesRes = await api.get(
        `/equipment_activities?equipment_id=eq.${equipmentId}&select=*,equipment_activity_completions(${completionsSelect})&order=sort_order.asc,sr_no.asc`
      );
      const activities: any[] = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
      if (activities.length === 0) return [];
      return mapEmbedToActivities(activities);
    } catch (embedErr: any) {
      console.warn('⚠️ getEquipmentActivities embed failed, falling back to two requests:', embedErr?.message || embedErr);
      try {
        const activitiesRes = await api.get(`/equipment_activities?equipment_id=eq.${equipmentId}&select=*&order=sort_order.asc,sr_no.asc`);
        const activities: any[] = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
        if (activities.length === 0) return [];
        const activityIds = activities.map((a: any) => a.id).join(',');
        const completionsRes = await api.get(`/equipment_activity_completions?activity_id=in.(${activityIds})&select=${completionsSelect}`);
        const completions: any[] = Array.isArray(completionsRes.data) ? completionsRes.data : [];
        const completionByActivityId = completions.reduce((acc: Record<string, any>, c) => {
          acc[c.activity_id] = c;
          return acc;
        }, {});
        return activities.map((a: any) => ({
          ...a,
          completion: completionByActivityId[a.id] || null
        }));
      } catch (error) {
        console.error('❌ Error fetching equipment activities:', error);
        throw error;
      }
    }
  },

  /** Batch fetch equipment activities for many equipment IDs. Returns Record<equipmentId, activities[]>. */
  async getEquipmentActivitiesBatch(equipmentIds: string[]): Promise<Record<string, any[]>> {
    if (!equipmentIds?.length) return {};
    const dedupeKey = batchDedupeKey(equipmentIds);
    const inflight = equipmentActivitiesBatchInFlight.get(dedupeKey);
    if (inflight) return await inflight;

    const loadPromise = (async (): Promise<Record<string, any[]>> => {
      if (import.meta.env.DEV) {
        console.log(`[Batch] Project activities: 1 batch for ${equipmentIds.length} equipment (was ${equipmentIds.length} before batching)`);
      }
      try {
        const BATCH_CHUNK = 40;
        const allActivities: any[] = [];
        for (let i = 0; i < equipmentIds.length; i += BATCH_CHUNK) {
          const chunk = equipmentIds.slice(i, i + BATCH_CHUNK);
          const res = await api.get(
            `/equipment_activities?equipment_id=in.(${chunk.join(',')})&select=*&order=sort_order.asc,sr_no.asc`,
            { timeout: 15000 }
          );
          const rows = Array.isArray(res.data) ? res.data : [];
          allActivities.push(...rows);
        }
        if (allActivities.length === 0) {
          return Object.fromEntries(equipmentIds.map((id) => [id, []]));
        }
        const activityIds = [...new Set(allActivities.map((a: any) => a.id))];
        const completionsSelect = 'id,activity_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
        let completions: any[] = [];
        for (const idChunk of chunkIdsForInClause(activityIds)) {
          const compRes = await api.get(
            `/equipment_activity_completions?activity_id=in.(${idChunk.join(',')})&select=${completionsSelect}`,
            { timeout: 10000 }
          );
          completions.push(...(Array.isArray(compRes.data) ? compRes.data : []));
        }
        const completionByActivityId = completions.reduce((acc: Record<string, any>, c) => {
          acc[c.activity_id] = c;
          return acc;
        }, {});
        const withCompletion = allActivities.map((a: any) => ({
          ...a,
          completion: completionByActivityId[a.id] || null
        }));
        const result: Record<string, any[]> = {};
        for (const id of equipmentIds) result[id] = [];
        for (const a of withCompletion) {
          if (a.equipment_id) {
            (result[a.equipment_id] = result[a.equipment_id] || []).push(a);
          }
        }
        return result;
      } catch (error: any) {
        console.error('❌ Error fetching equipment activities batch:', error);
        return Object.fromEntries(equipmentIds.map((id) => [id, []]));
      }
    })();

    equipmentActivitiesBatchInFlight.set(dedupeKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      equipmentActivitiesBatchInFlight.delete(dedupeKey);
    }
  },

  // Project equipment: create/upsert activities (from Excel upload or checklist); set commencement_date on equipment
  async setEquipmentActivities(equipmentId: string, payload: {
    commencement_date?: string | null;
    activities: Array<{
      sr_no: number;
      activity_name: string;
      activity_type: 'regular_update' | 'milestone';
      target_relative?: string;
      target_date?: string;
      sort_order: number;
      activity_detail?: string | null;
      department?: string | null;
      reference_document_url?: string | null;
      reference_document_name?: string | null;
      reference_image_url?: string | null;
      created_by?: string | null;
      inspection_tpi_involved?: boolean;
      progress_weight?: number | null;
    }>;
  }) {
    try {
      if (payload.commencement_date !== undefined) {
        await api.patch(`/equipment?id=eq.${equipmentId}`, { commencement_date: payload.commencement_date || null });
      }
      await api.delete(`/equipment_activities?equipment_id=eq.${equipmentId}`);
      if (payload.activities.length === 0) return [];
      const response = await api.post('/equipment_activities', payload.activities.map(a => ({
        equipment_id: equipmentId,
        sr_no: a.sr_no,
        activity_name: a.activity_name,
        activity_type: a.activity_type,
        target_relative: a.target_relative || null,
        target_date: a.target_date || null,
        sort_order: a.sort_order,
        activity_detail: a.activity_detail ?? null,
        department: a.department ?? null,
        reference_document_url: a.reference_document_url ?? null,
        reference_document_name: a.reference_document_name ?? null,
        reference_image_url: a.reference_image_url ?? null,
        created_by: a.created_by ?? null,
        inspection_tpi_involved: a.inspection_tpi_involved ?? false,
        progress_weight: a.progress_weight ?? null,
      })), { headers: { Prefer: 'return=representation' } });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('❌ Error setting equipment activities:', error);
      throw error;
    }
  },

  // Project equipment: merge activities (edit modal / checklist) – PATCH existing, POST new, DELETE removed; preserves completions
  async updateEquipmentActivitiesMerge(
    equipmentId: string,
    payload: {
      commencement_date?: string | null;
      activities: Array<{
        id?: string;
        sr_no: number;
        activity_name: string;
        activity_type: 'regular_update' | 'milestone';
        target_relative?: string;
        target_date?: string;
        sort_order: number;
        activity_detail?: string | null;
        department?: string | null;
        reference_document_url?: string | null;
        reference_document_name?: string | null;
        reference_image_url?: string | null;
        created_by?: string | null;
        inspection_tpi_involved?: boolean;
        progress_weight?: number | null;
      }>;
    },
    options?: { previousActivities?: any[] }
  ) {
    const prevList = options?.previousActivities;
    const useClientSnapshot = Array.isArray(prevList) && prevList.length > 0;
    const completionById: Record<string, any> = {};
    if (useClientSnapshot) {
      for (const a of prevList!) {
        if (a?.id) completionById[a.id] = a.completion ?? null;
      }
    }

    const normMerge = (v: unknown): string | null => {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      return s || null;
    };
    const mergeRowUnchanged = (prev: any, body: any): boolean => {
      if (!prev?.id) return false;
      const n = (x: unknown, y: unknown) => normMerge(x) === normMerge(y);
      const pwEq =
        (prev.progress_weight == null && body.progress_weight == null) ||
        Number(prev.progress_weight) === Number(body.progress_weight);
      return (
        Number(prev.sr_no) === Number(body.sr_no) &&
        Number(prev.sort_order) === Number(body.sort_order) &&
        (prev.activity_name || '') === (body.activity_name || '') &&
        prev.activity_type === body.activity_type &&
        n(prev.target_relative, body.target_relative) &&
        n(prev.target_date, body.target_date) &&
        !!prev.inspection_tpi_involved === !!body.inspection_tpi_involved &&
        pwEq
      );
    };

    const buildBody = (a: (typeof payload.activities)[0]) => ({
      sr_no: a.sr_no,
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      target_relative: a.target_relative ?? null,
      target_date: a.target_date ?? null,
      sort_order: a.sort_order,
      activity_detail: a.activity_detail ?? null,
      department: a.department ?? null,
      reference_document_url: a.reference_document_url ?? null,
      reference_document_name: a.reference_document_name ?? null,
      reference_image_url: a.reference_image_url ?? null,
      created_by: a.created_by ?? null,
      inspection_tpi_involved: a.inspection_tpi_involved ?? false,
      progress_weight: a.progress_weight ?? null,
    });

    try {
      if (payload.commencement_date !== undefined) {
        await api.patch(`/equipment?id=eq.${equipmentId}`, { commencement_date: payload.commencement_date || null });
      }
      const draftExistingIds = (payload.activities || [])
        .filter((a) => a.id && !String(a.id).startsWith('new-'))
        .map((a) => a.id as string);

      let toDelete: string[];
      if (useClientSnapshot) {
        const previousIds = prevList!.map((a: any) => a.id).filter(Boolean);
        toDelete = previousIds.filter((id: string) => !draftExistingIds.includes(id));
      } else {
        const currentRes = await api.get(`/equipment_activities?equipment_id=eq.${equipmentId}&select=id`);
        const current: any[] = Array.isArray(currentRes.data) ? currentRes.data : [];
        toDelete = current.filter((c: any) => !draftExistingIds.includes(c.id)).map((c: any) => c.id);
      }

      const activities = payload.activities || [];
      const rep = { Prefer: 'return=representation' };

      if (useClientSnapshot) {
        const mergedRows = await Promise.all(
          activities.map(async (a) => {
            const body = buildBody(a);
            if (a.id && !String(a.id).startsWith('new-')) {
              const prevRow = prevList!.find((p: any) => p.id === a.id);
              if (prevRow && mergeRowUnchanged(prevRow, body)) {
                return { ...prevRow, completion: completionById[a.id as string] ?? null };
              }
              const res = await api.patch(`/equipment_activities?id=eq.${a.id}`, body, { headers: rep });
              const row = Array.isArray(res.data) ? res.data[0] : res.data;
              return { ...row, completion: completionById[a.id as string] ?? null };
            }
            const res = await api.post('/equipment_activities', { equipment_id: equipmentId, ...body }, { headers: rep });
            const row = Array.isArray(res.data) ? res.data[0] : res.data;
            return { ...row, completion: null };
          })
        );
        if (toDelete.length > 0) {
          await Promise.all(toDelete.map((id) => api.delete(`/equipment_activities?id=eq.${id}`)));
        }
        mergedRows.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return mergedRows;
      }

      for (const a of activities) {
        const body = buildBody(a);
        if (a.id && !String(a.id).startsWith('new-')) {
          await api.patch(`/equipment_activities?id=eq.${a.id}`, body);
        } else {
          await api.post('/equipment_activities', { equipment_id: equipmentId, ...body }, { headers: rep });
        }
      }
      for (const id of toDelete) {
        await api.delete(`/equipment_activities?id=eq.${id}`);
      }
      return await this.getEquipmentActivities(equipmentId);
    } catch (error) {
      console.error('❌ Error merging equipment activities:', error);
      throw error;
    }
  },

  // Project equipment: mark activity complete (updated_on/updated_by set by backend or sent by caller). Supports multiple images via image_urls and optional inspection_report_urls.
  async createEquipmentActivityCompletion(activityId: string, data: {
    completed_on: string;
    completed_by_user_id?: string | null;
    completed_by_display_name?: string | null;
    notes?: string | null;
    department?: string | null; // for docs dashboard / inspection reports by department
    image_url?: string | null;
    image_urls?: string[]; // multiple images; when present, stored in equipment_activity_completion_images
    inspection_report_urls?: string[]; // optional PDFs (data URLs); stored in equipment_activity_completion_inspection_reports
    inspection_report_names?: (string | null)[]; // optional file names, same length as inspection_report_urls
    updated_by?: string | null;
  }) {
    try {
      const imageUrls = data.image_urls && data.image_urls.length > 0 ? data.image_urls : (data.image_url ? [data.image_url] : []);
      const imageCount = imageUrls.length;
      const reportUrls = data.inspection_report_urls && data.inspection_report_urls.length > 0 ? data.inspection_report_urls : [];
      const reportNames = data.inspection_report_names ?? reportUrls.map(() => null);
      const reportCount = reportUrls.length;
      const response = await api.post('/equipment_activity_completions', {
        activity_id: activityId,
        completed_on: data.completed_on,
        completed_by_user_id: data.completed_by_user_id ?? null,
        completed_by_display_name: data.completed_by_display_name ?? null,
        notes: data.notes ?? null,
        department: data.department ?? null,
        image_url: imageCount > 0 ? imageUrls[0] : null,
        image_count: imageCount,
        inspection_report_count: reportCount,
        updated_by: data.updated_by ?? null
      }, { headers: { Prefer: 'return=representation' } });
      const created = Array.isArray(response.data) ? response.data[0] : response.data;
      const completionId = created?.id;
      if (completionId && imageCount > 0) {
        const bulkImages = imageUrls.map((url, i) => ({
          completion_id: completionId,
          sort_order: i,
          image_url: url ?? null
        }));
        try {
          await api.post('/equipment_activity_completion_images', bulkImages);
        } catch (bulkImgErr: any) {
          console.warn('⚠️ Bulk insert completion images failed, falling back to one-by-one:', bulkImgErr?.message || bulkImgErr);
          for (let i = 0; i < imageUrls.length; i++) {
            await api.post('/equipment_activity_completion_images', {
              completion_id: completionId,
              sort_order: i,
              image_url: imageUrls[i] ?? null
            });
          }
        }
      }
      if (completionId && reportCount > 0) {
        const bulkReports = reportUrls.map((url, i) => ({
          completion_id: completionId,
          sort_order: i,
          report_url: url ?? null,
          file_name: reportNames[i] ?? null
        }));
        try {
          await api.post('/equipment_activity_completion_inspection_reports', bulkReports);
        } catch (bulkRepErr: any) {
          console.warn('⚠️ Bulk insert inspection reports failed, falling back to one-by-one:', bulkRepErr?.message || bulkRepErr);
          for (let i = 0; i < reportUrls.length; i++) {
            await api.post('/equipment_activity_completion_inspection_reports', {
              completion_id: completionId,
              sort_order: i,
              report_url: reportUrls[i] ?? null,
              file_name: reportNames[i] ?? null
            });
          }
        }
      }
      return response.data;
    } catch (error) {
      console.error('❌ Error creating equipment activity completion:', error);
      throw error;
    }
  },

  /** Fetch inspection reports for a completion (for QAP "View inspection report"). Returns list with report_url, file_name, sort_order. */
  async getEquipmentActivityCompletionInspectionReports(completionId: string, isStandalone: boolean = false): Promise<Array<{ id: string; report_url: string | null; file_name: string | null; sort_order: number }>> {
    try {
      const table = isStandalone ? 'standalone_equipment_activity_completion_inspection_reports' : 'equipment_activity_completion_inspection_reports';
      const res = await api.get(
        `/${table}?completion_id=eq.${completionId}&order=sort_order.asc&select=id,report_url,file_name,sort_order`
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      return rows;
    } catch (err) {
      console.warn('⚠️ getEquipmentActivityCompletionInspectionReports failed:', err);
      return [];
    }
  },

  /** Fetch number of images for a completion (for progress section when image_count is missing or 1 but multiple exist). */
  async getEquipmentActivityCompletionImageCount(completionId: string, isStandalone: boolean = false): Promise<number> {
    try {
      const table = isStandalone ? 'standalone_equipment_activity_completion_images' : 'equipment_activity_completion_images';
      const res = await api.get(`/${table}?completion_id=eq.${completionId}&select=id`);
      const rows = Array.isArray(res.data) ? res.data : [];
      return rows.length;
    } catch (err) {
      console.warn('⚠️ getEquipmentActivityCompletionImageCount failed:', err);
      return 0;
    }
  },

  /** Batch fetch image counts for many completion IDs. Returns Record<completionId, count>. */
  async getEquipmentActivityCompletionImageCountBatch(
    completionIds: string[],
    isStandalone: boolean = false
  ): Promise<Record<string, number>> {
    if (!completionIds?.length) return {};
    try {
      const table = isStandalone ? 'standalone_equipment_activity_completion_images' : 'equipment_activity_completion_images';
      const uniqueIds = [...new Set(completionIds.filter(Boolean))];
      const counts: Record<string, number> = Object.fromEntries(uniqueIds.map((id) => [id, 0]));
      const CHUNK = 120;
      for (let i = 0; i < uniqueIds.length; i += CHUNK) {
        const chunk = uniqueIds.slice(i, i + CHUNK);
        const res = await api.get(`/${table}?completion_id=in.(${chunk.join(',')})&select=completion_id`);
        const rows = Array.isArray(res.data) ? res.data : [];
        for (const row of rows as any[]) {
          const id = row?.completion_id;
          if (!id) continue;
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      return counts;
    } catch (err) {
      console.warn('⚠️ getEquipmentActivityCompletionImageCountBatch failed:', err);
      return {};
    }
  },

  /** Fetch one completion image URL by completion id and index (0-based). Uses completion_images table; falls back to completion.image_url for index 0 (legacy). */
  async getEquipmentActivityCompletionImageUrl(completionId: string, index: number, isStandalone: boolean = false): Promise<string | null> {
    try {
      const table = isStandalone ? 'standalone_equipment_activity_completion_images' : 'equipment_activity_completion_images';
      const res = await api.get(
        `/${table}?completion_id=eq.${completionId}&order=sort_order.asc&offset=${index}&limit=1&select=image_url`
      );
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row?.image_url) return row.image_url;
      if (index === 0) {
        const compTable = isStandalone ? 'standalone_equipment_activity_completions' : 'equipment_activity_completions';
        const compRes = await api.get(`/${compTable}?id=eq.${completionId}&select=image_url`);
        const comp = Array.isArray(compRes.data) ? compRes.data[0] : compRes.data;
        return comp?.image_url ?? null;
      }
      return null;
    } catch (err) {
      console.warn('⚠️ getEquipmentActivityCompletionImageUrl failed:', err);
      return null;
    }
  },

  /** Batch fetch completion image URLs by (completionId, index). Falls back to completion.image_url for index 0 when needed. */
  async getEquipmentActivityCompletionImageUrlBatch(
    requests: Array<{ completionId: string; index: number }>,
    isStandalone: boolean = false
  ): Promise<Record<string, string | null>> {
    if (!requests?.length) return {};
    try {
      const table = isStandalone ? 'standalone_equipment_activity_completion_images' : 'equipment_activity_completion_images';
      const compTable = isStandalone ? 'standalone_equipment_activity_completions' : 'equipment_activity_completions';
      const uniqueIds = [...new Set(requests.map((r) => r.completionId).filter(Boolean))];
      const result: Record<string, string | null> = {};

      // Initialize all requested keys as null
      for (const req of requests) {
        result[`${req.completionId}_${req.index}`] = null;
      }

      // Fetch all image rows for requested completion IDs (chunked)
      const rows: any[] = [];
      const CHUNK = 120;
      for (let i = 0; i < uniqueIds.length; i += CHUNK) {
        const chunk = uniqueIds.slice(i, i + CHUNK);
        const res = await api.get(
          `/${table}?completion_id=in.(${chunk.join(',')})&select=completion_id,sort_order,image_url&order=sort_order.asc`
        );
        rows.push(...(Array.isArray(res.data) ? res.data : []));
      }

      // Group rows by completion_id and map requested index
      const grouped: Record<string, Array<{ sort_order: number; image_url: string | null }>> = {};
      for (const row of rows) {
        const id = row?.completion_id;
        if (!id) continue;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ sort_order: Number(row.sort_order ?? 0), image_url: row.image_url ?? null });
      }

      const fallbackZeroIds = new Set<string>();
      for (const req of requests) {
        const key = `${req.completionId}_${req.index}`;
        const list = grouped[req.completionId] || [];
        const picked = list[req.index];
        if (picked?.image_url) {
          result[key] = picked.image_url;
        } else if (req.index === 0) {
          fallbackZeroIds.add(req.completionId);
        }
      }

      // Legacy fallback for index 0
      if (fallbackZeroIds.size > 0) {
        const ids = [...fallbackZeroIds];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const res = await api.get(`/${compTable}?id=in.(${chunk.join(',')})&select=id,image_url`);
          const compRows = Array.isArray(res.data) ? res.data : [];
          for (const c of compRows) {
            const id = c?.id;
            if (!id) continue;
            result[`${id}_0`] = c?.image_url ?? null;
          }
        }
      }

      return result;
    } catch (err) {
      console.warn('⚠️ getEquipmentActivityCompletionImageUrlBatch failed:', err);
      return {};
    }
  },

  // Standalone equipment: get activities (with completion if any)
  // Standalone equipment: get activities (completions metadata only, no image_url) for fast load.
  async getStandaloneEquipmentActivities(equipmentId: string) {
    const completionsSelect =
      'id,activity_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
    const mapEmbedToActivities = (rows: any[]): any[] =>
      rows.map((a: any) => {
        const nested = a.standalone_equipment_activity_completions;
        const compArr = Array.isArray(nested) ? nested : nested ? [nested] : [];
        const completion = compArr[0] || null;
        const { standalone_equipment_activity_completions, ...rest } = a;
        return { ...rest, completion };
      });
    try {
      const activitiesRes = await api.get(
        `/standalone_equipment_activities?equipment_id=eq.${equipmentId}&select=*,standalone_equipment_activity_completions(${completionsSelect})&order=sort_order.asc,sr_no.asc`
      );
      const activities: any[] = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
      if (activities.length === 0) return [];
      return mapEmbedToActivities(activities);
    } catch (embedErr: any) {
      console.warn('⚠️ getStandaloneEquipmentActivities embed failed, falling back to two requests:', embedErr?.message || embedErr);
      try {
        const activitiesRes = await api.get(`/standalone_equipment_activities?equipment_id=eq.${equipmentId}&select=*&order=sort_order.asc,sr_no.asc`);
        const activities: any[] = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
        if (activities.length === 0) return [];
        const activityIds = activities.map((a: any) => a.id).join(',');
        const completionsRes = await api.get(`/standalone_equipment_activity_completions?activity_id=in.(${activityIds})&select=${completionsSelect}`);
        const completions: any[] = Array.isArray(completionsRes.data) ? completionsRes.data : [];
        const completionByActivityId = completions.reduce((acc: Record<string, any>, c) => {
          acc[c.activity_id] = c;
          return acc;
        }, {});
        return activities.map((a: any) => ({
          ...a,
          completion: completionByActivityId[a.id] || null
        }));
      } catch (error) {
        console.error('❌ Error fetching standalone equipment activities:', error);
        throw error;
      }
    }
  },

  /** Batch fetch standalone equipment activities for many equipment IDs. Returns Record<equipmentId, activities[]>. */
  async getStandaloneEquipmentActivitiesBatch(equipmentIds: string[]): Promise<Record<string, any[]>> {
    if (!equipmentIds?.length) return {};
    const dedupeKey = batchDedupeKey(equipmentIds);
    const inflight = standaloneEquipmentActivitiesBatchInFlight.get(dedupeKey);
    if (inflight) return await inflight;

    const loadPromise = (async (): Promise<Record<string, any[]>> => {
      if (import.meta.env.DEV) {
        console.log(`[Batch] Standalone activities: 1 batch for ${equipmentIds.length} equipment (was ${equipmentIds.length} before batching)`);
      }
      try {
        const BATCH_CHUNK = 40;
        const allActivities: any[] = [];
        for (let i = 0; i < equipmentIds.length; i += BATCH_CHUNK) {
          const chunk = equipmentIds.slice(i, i + BATCH_CHUNK);
          const res = await api.get(
            `/standalone_equipment_activities?equipment_id=in.(${chunk.join(',')})&select=*&order=sort_order.asc,sr_no.asc`,
            { timeout: 15000 }
          );
          const rows = Array.isArray(res.data) ? res.data : [];
          allActivities.push(...rows);
        }
        if (allActivities.length === 0) {
          return Object.fromEntries(equipmentIds.map((id) => [id, []]));
        }
        const activityIds = [...new Set(allActivities.map((a: any) => a.id))];
        const completionsSelect = 'id,activity_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
        let completions: any[] = [];
        for (const idChunk of chunkIdsForInClause(activityIds)) {
          const compRes = await api.get(
            `/standalone_equipment_activity_completions?activity_id=in.(${idChunk.join(',')})&select=${completionsSelect}`,
            { timeout: 10000 }
          );
          completions.push(...(Array.isArray(compRes.data) ? compRes.data : []));
        }
        const completionByActivityId = completions.reduce((acc: Record<string, any>, c) => {
          acc[c.activity_id] = c;
          return acc;
        }, {});
        const withCompletion = allActivities.map((a: any) => ({
          ...a,
          completion: completionByActivityId[a.id] || null
        }));
        const result: Record<string, any[]> = {};
        for (const id of equipmentIds) result[id] = [];
        for (const a of withCompletion) {
          if (a.equipment_id) {
            (result[a.equipment_id] = result[a.equipment_id] || []).push(a);
          }
        }
        return result;
      } catch (error: any) {
        console.error('❌ Error fetching standalone equipment activities batch:', error);
        return Object.fromEntries(equipmentIds.map((id) => [id, []]));
      }
    })();

    standaloneEquipmentActivitiesBatchInFlight.set(dedupeKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      standaloneEquipmentActivitiesBatchInFlight.delete(dedupeKey);
    }
  },

  // Standalone equipment: create/upsert activities (from Excel upload or checklist)
  async setStandaloneEquipmentActivities(equipmentId: string, payload: {
    commencement_date?: string | null;
    activities: Array<{
      sr_no: number;
      activity_name: string;
      activity_type: 'regular_update' | 'milestone';
      target_relative?: string;
      target_date?: string;
      sort_order: number;
      activity_detail?: string | null;
      department?: string | null;
      reference_document_url?: string | null;
      reference_document_name?: string | null;
      reference_image_url?: string | null;
      created_by?: string | null;
      inspection_tpi_involved?: boolean;
      progress_weight?: number | null;
    }>;
  }) {
    try {
      if (payload.commencement_date !== undefined) {
        await api.patch(`/standalone_equipment?id=eq.${equipmentId}`, { commencement_date: payload.commencement_date || null });
      }
      await api.delete(`/standalone_equipment_activities?equipment_id=eq.${equipmentId}`);
      if (payload.activities.length === 0) return [];
      const response = await api.post('/standalone_equipment_activities', payload.activities.map(a => ({
        equipment_id: equipmentId,
        sr_no: a.sr_no,
        activity_name: a.activity_name,
        activity_type: a.activity_type,
        target_relative: a.target_relative || null,
        target_date: a.target_date || null,
        sort_order: a.sort_order,
        activity_detail: a.activity_detail ?? null,
        department: a.department ?? null,
        reference_document_url: a.reference_document_url ?? null,
        reference_document_name: a.reference_document_name ?? null,
        reference_image_url: a.reference_image_url ?? null,
        created_by: a.created_by ?? null,
        inspection_tpi_involved: a.inspection_tpi_involved ?? false,
        progress_weight: a.progress_weight ?? null,
      })), { headers: { Prefer: 'return=representation' } });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('❌ Error setting standalone equipment activities:', error);
      throw error;
    }
  },

  // Standalone equipment: merge activities (edit modal / checklist) – PATCH existing, POST new, DELETE removed; preserves completions
  async updateStandaloneEquipmentActivitiesMerge(
    equipmentId: string,
    payload: {
      commencement_date?: string | null;
      activities: Array<{
        id?: string;
        sr_no: number;
        activity_name: string;
        activity_type: 'regular_update' | 'milestone';
        target_relative?: string;
        target_date?: string;
        sort_order: number;
        activity_detail?: string | null;
        department?: string | null;
        reference_document_url?: string | null;
        reference_document_name?: string | null;
        reference_image_url?: string | null;
        created_by?: string | null;
        inspection_tpi_involved?: boolean;
        progress_weight?: number | null;
      }>;
    },
    options?: { previousActivities?: any[] }
  ) {
    const prevList = options?.previousActivities;
    const useClientSnapshot = Array.isArray(prevList) && prevList.length > 0;
    const completionById: Record<string, any> = {};
    if (useClientSnapshot) {
      for (const a of prevList!) {
        if (a?.id) completionById[a.id] = a.completion ?? null;
      }
    }

    const normMergeSa = (v: unknown): string | null => {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      return s || null;
    };
    const mergeRowUnchangedSa = (prev: any, body: any): boolean => {
      if (!prev?.id) return false;
      const n = (x: unknown, y: unknown) => normMergeSa(x) === normMergeSa(y);
      const pwEq =
        (prev.progress_weight == null && body.progress_weight == null) ||
        Number(prev.progress_weight) === Number(body.progress_weight);
      return (
        Number(prev.sr_no) === Number(body.sr_no) &&
        Number(prev.sort_order) === Number(body.sort_order) &&
        (prev.activity_name || '') === (body.activity_name || '') &&
        prev.activity_type === body.activity_type &&
        n(prev.target_relative, body.target_relative) &&
        n(prev.target_date, body.target_date) &&
        !!prev.inspection_tpi_involved === !!body.inspection_tpi_involved &&
        pwEq
      );
    };

    const buildBody = (a: (typeof payload.activities)[0]) => ({
      sr_no: a.sr_no,
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      target_relative: a.target_relative ?? null,
      target_date: a.target_date ?? null,
      sort_order: a.sort_order,
      activity_detail: a.activity_detail ?? null,
      department: a.department ?? null,
      reference_document_url: a.reference_document_url ?? null,
      reference_document_name: a.reference_document_name ?? null,
      reference_image_url: a.reference_image_url ?? null,
      created_by: a.created_by ?? null,
      inspection_tpi_involved: a.inspection_tpi_involved ?? false,
      progress_weight: a.progress_weight ?? null,
    });

    try {
      if (payload.commencement_date !== undefined) {
        await api.patch(`/standalone_equipment?id=eq.${equipmentId}`, { commencement_date: payload.commencement_date || null });
      }
      const draftExistingIds = (payload.activities || [])
        .filter((a) => a.id && !String(a.id).startsWith('new-'))
        .map((a) => a.id as string);

      let toDelete: string[];
      if (useClientSnapshot) {
        const previousIds = prevList!.map((a: any) => a.id).filter(Boolean);
        toDelete = previousIds.filter((id: string) => !draftExistingIds.includes(id));
      } else {
        const currentRes = await api.get(`/standalone_equipment_activities?equipment_id=eq.${equipmentId}&select=id`);
        const current: any[] = Array.isArray(currentRes.data) ? currentRes.data : [];
        toDelete = current.filter((c: any) => !draftExistingIds.includes(c.id)).map((c: any) => c.id);
      }

      const activities = payload.activities || [];
      const rep = { Prefer: 'return=representation' };

      if (useClientSnapshot) {
        const mergedRows = await Promise.all(
          activities.map(async (a) => {
            const body = buildBody(a);
            if (a.id && !String(a.id).startsWith('new-')) {
              const prevRow = prevList!.find((p: any) => p.id === a.id);
              if (prevRow && mergeRowUnchangedSa(prevRow, body)) {
                return { ...prevRow, completion: completionById[a.id as string] ?? null };
              }
              const res = await api.patch(`/standalone_equipment_activities?id=eq.${a.id}`, body, { headers: rep });
              const row = Array.isArray(res.data) ? res.data[0] : res.data;
              return { ...row, completion: completionById[a.id as string] ?? null };
            }
            const res = await api.post('/standalone_equipment_activities', { equipment_id: equipmentId, ...body }, { headers: rep });
            const row = Array.isArray(res.data) ? res.data[0] : res.data;
            return { ...row, completion: null };
          })
        );
        if (toDelete.length > 0) {
          await Promise.all(toDelete.map((id) => api.delete(`/standalone_equipment_activities?id=eq.${id}`)));
        }
        mergedRows.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return mergedRows;
      }

      for (const a of activities) {
        const body = buildBody(a);
        if (a.id && !String(a.id).startsWith('new-')) {
          await api.patch(`/standalone_equipment_activities?id=eq.${a.id}`, body);
        } else {
          await api.post('/standalone_equipment_activities', { equipment_id: equipmentId, ...body }, { headers: rep });
        }
      }
      for (const id of toDelete) {
        await api.delete(`/standalone_equipment_activities?id=eq.${id}`);
      }
      return await this.getStandaloneEquipmentActivities(equipmentId);
    } catch (error) {
      console.error('❌ Error merging standalone equipment activities:', error);
      throw error;
    }
  },

  // Standalone equipment: mark activity complete. Supports multiple images via image_urls and optional inspection_report_urls.
  async createStandaloneEquipmentActivityCompletion(activityId: string, data: {
    completed_on: string;
    completed_by_user_id?: string | null;
    completed_by_display_name?: string | null;
    notes?: string | null;
    department?: string | null;
    image_url?: string | null;
    image_urls?: string[];
    inspection_report_urls?: string[];
    inspection_report_names?: (string | null)[];
    updated_by?: string | null;
  }) {
    try {
      const imageUrls = data.image_urls && data.image_urls.length > 0 ? data.image_urls : (data.image_url ? [data.image_url] : []);
      const imageCount = imageUrls.length;
      const reportUrls = data.inspection_report_urls && data.inspection_report_urls.length > 0 ? data.inspection_report_urls : [];
      const reportNames = data.inspection_report_names ?? reportUrls.map(() => null);
      const reportCount = reportUrls.length;
      const response = await api.post('/standalone_equipment_activity_completions', {
        activity_id: activityId,
        completed_on: data.completed_on,
        completed_by_user_id: data.completed_by_user_id ?? null,
        completed_by_display_name: data.completed_by_display_name ?? null,
        notes: data.notes ?? null,
        department: data.department ?? null,
        image_url: imageCount > 0 ? imageUrls[0] : null,
        image_count: imageCount,
        inspection_report_count: reportCount,
        updated_by: data.updated_by ?? null
      }, { headers: { Prefer: 'return=representation' } });
      const created = Array.isArray(response.data) ? response.data[0] : response.data;
      const completionId = created?.id;
      if (completionId && imageCount > 0) {
        const bulkImages = imageUrls.map((url, i) => ({
          completion_id: completionId,
          sort_order: i,
          image_url: url ?? null
        }));
        try {
          await api.post('/standalone_equipment_activity_completion_images', bulkImages);
        } catch (bulkImgErr: any) {
          console.warn('⚠️ Bulk insert standalone completion images failed, falling back:', bulkImgErr?.message || bulkImgErr);
          for (let i = 0; i < imageUrls.length; i++) {
            await api.post('/standalone_equipment_activity_completion_images', {
              completion_id: completionId,
              sort_order: i,
              image_url: imageUrls[i] ?? null
            });
          }
        }
      }
      if (completionId && reportCount > 0) {
        const bulkReports = reportUrls.map((url, i) => ({
          completion_id: completionId,
          sort_order: i,
          report_url: url ?? null,
          file_name: reportNames[i] ?? null
        }));
        try {
          await api.post('/standalone_equipment_activity_completion_inspection_reports', bulkReports);
        } catch (bulkRepErr: any) {
          console.warn('⚠️ Bulk insert standalone inspection reports failed, falling back:', bulkRepErr?.message || bulkRepErr);
          for (let i = 0; i < reportUrls.length; i++) {
            await api.post('/standalone_equipment_activity_completion_inspection_reports', {
              completion_id: completionId,
              sort_order: i,
              report_url: reportUrls[i] ?? null,
              file_name: reportNames[i] ?? null
            });
          }
        }
      }
      return response.data;
    } catch (error) {
      console.error('❌ Error creating standalone equipment activity completion:', error);
      throw error;
    }
  },

  // Update equipment
  async updateEquipment(id: string, equipmentData: any, currentUserId?: string) {
  try {
    // // console.log('🔧 updateEquipment called with:', { id, equipmentData, currentUserId });
    // QAP "mark complete" only updates progress — skip prefetch GET + audit logging (saves 1 API call per submit).
    const dataKeys = Object.keys(equipmentData || {});
    if (
      dataKeys.length === 1 &&
      dataKeys[0] === 'progress' &&
      typeof equipmentData.progress === 'number'
    ) {
      const updateData = {
        progress: equipmentData.progress,
        updated_at: new Date().toISOString(),
        ...(currentUserId && { updated_by: currentUserId })
      };
      const response = await api.patch(`/equipment?id=eq.${id}`, updateData, {
        headers: { Prefer: 'return=representation' }
      });
      return response.data;
    }

    // Get current equipment data to track changes
    const currentEquipmentResponse = await api.get(`/equipment?id=eq.${id}&select=*`);
    const currentEquipment = currentEquipmentResponse.data?.[0];
    
    // Check for global uniqueness if tag_number, job_number, or manufacturing_serial are being updated
    // Only check fields that are actually being changed
    const tagNumberToCheck = equipmentData.tag_number !== undefined ? equipmentData.tag_number : undefined;
    const jobNumberToCheck = equipmentData.job_number !== undefined ? equipmentData.job_number : undefined;
    const msnToCheck = equipmentData.manufacturing_serial !== undefined ? equipmentData.manufacturing_serial : undefined;
    
    // Only run uniqueness check if at least one of these fields is being updated
    if (currentEquipment && (tagNumberToCheck !== undefined || jobNumberToCheck !== undefined || msnToCheck !== undefined)) {
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumberToCheck !== undefined ? tagNumberToCheck : undefined,
        jobNumberToCheck !== undefined ? jobNumberToCheck : undefined,
        msnToCheck !== undefined ? msnToCheck : undefined,
        id // Exclude current equipment from check
      );
      
      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot update equipment. ${uniquenessCheck.conflicts.join('. ')}. Duplicate Job Number is not allowed; Job Number must be unique across all projects.`;
        throw new Error(errorMessage);
      }
    }
    
    // Add updated_by field to track who made the update
    const updateData = {
      ...equipmentData,
      updated_at: new Date().toISOString(),
      ...(currentUserId && { updated_by: currentUserId })
    };
    
    const response = await api.patch(`/equipment?id=eq.${id}`, updateData);
    // // console.log('✅ Equipment update API response:', response.data);
    
    // Track changes for logging
    if (currentEquipment && response.data && Array.isArray(response.data) && response.data.length > 0) {
      const updatedEquipment = response.data[0];
      const changes: Record<string, { old: any; new: any }> = {};
      
      // Compare key fields for changes - only track meaningful changes
      const fieldsToTrack = ['type', 'tag_number', 'status', 'progress', 'progress_phase', 'location', 'priority', 'notes', 'po_cdd'];
      
      // Helper to normalize values - treat "Not Assigned", "Not set", empty, null as equivalent
      const normalizeForComparison = (val: any): string | null => {
        if (val === null || val === undefined) return null;
        const str = String(val).trim();
        const lowerStr = str.toLowerCase();
        // Treat all these as equivalent (no real value set)
        if (str === '' || 
            lowerStr === 'not set' || 
            lowerStr === 'not-set' || 
            lowerStr === 'not assigned' || 
            lowerStr === 'null' || 
            lowerStr === 'undefined') {
          return null;
        }
        return str;
      };
      
      // Check if progress_phase is changing (if so, we'll skip progress percentage changes)
      const progressPhaseChanging = currentEquipment['progress_phase'] !== updatedEquipment['progress_phase'];
      
      fieldsToTrack.forEach(field => {
        const oldValue = currentEquipment[field];
        const newValue = updatedEquipment[field];
        
        // Skip progress percentage if progress_phase is also changing (progress is automatically set based on phase)
        if (field === 'progress' && progressPhaseChanging) {
          return; // Don't log progress changes when phase changes (it's automatic)
        }
        
        // Only track if values actually changed
        if (oldValue !== newValue) {
          const normalizedOld = normalizeForComparison(oldValue);
          const normalizedNew = normalizeForComparison(newValue);
          
          // Skip if both are null/empty/not set (no meaningful change)
          if (!(normalizedOld === null && normalizedNew === null)) {
            // Format values for display
            const displayOld = normalizedOld === null ? 'Not set' : normalizedOld;
            const displayNew = normalizedNew === null ? 'Not set' : normalizedNew;
            
            // Only log if old and new are actually different (skip "Not set" → "Not set")
            if (displayOld !== displayNew) {
              changes[field] = {
                old: displayOld,
                new: displayNew
              };
              
              // Final safety check: remove if both are "Not set"
              if (changes[field].old === 'Not set' && changes[field].new === 'Not set') {
                delete changes[field];
              }
            }
          }
        }
      });
      
      // Track team member fields ONLY if they were explicitly included in the update payload
      // Don't compare fields the user didn't touch
      const teamFieldsToTrack = ['supervisor', 'welder', 'qc_inspector', 'project_manager'];
      const fieldsInUpdate = Object.keys(updateData); // Only fields that were sent in the update
      
      teamFieldsToTrack.forEach(field => {
        // Skip if this field wasn't in the update payload (user didn't change it)
        if (!fieldsInUpdate.includes(field)) {
          return;
        }
        
        const oldValue = currentEquipment[field];
        const newValue = updatedEquipment[field];
        
        // Normalize values for comparison - treat "Not Assigned", "Not set", empty, null as equivalent
        const normalizeValue = (val: any): string | null => {
          if (!val) return null;
          const str = String(val).trim();
          const lowerStr = str.toLowerCase();
          // Treat all these as equivalent (no real value set)
          if (str === '' || 
              lowerStr === 'not set' || 
              lowerStr === 'not-set' || 
              lowerStr === 'not assigned' || 
              lowerStr === 'null' || 
              lowerStr === 'undefined') {
            return null;
          }
          return str;
        };
        
        const normalizedOld = normalizeValue(oldValue);
        const normalizedNew = normalizeValue(newValue);
        
        // Only track if:
        // 1. Going from null/empty to a value
        // 2. Going from a value to null/empty  
        // 3. Going from one value to a different value
        // NEVER log if both are null/empty (futile change)
        if (normalizedOld !== normalizedNew) {
          if (!(normalizedOld === null && normalizedNew === null)) {
            changes[field] = {
              old: normalizedOld || 'Not set',
              new: normalizedNew || 'Not set'
            };
            
            // Double-check: if both end up as "Not set", remove it
            if (changes[field].old === 'Not set' && changes[field].new === 'Not set') {
              delete changes[field];
            }
          }
        }
      });
      
      // Track technical sections changes
      if (JSON.stringify(currentEquipment.technical_sections) !== JSON.stringify(updatedEquipment.technical_sections)) {
        changes['technical_sections'] = {
          old: currentEquipment.technical_sections || 'No sections',
          new: updatedEquipment.technical_sections || 'No sections'
        };
      }
      
      // Track custom fields changes
      if (JSON.stringify(currentEquipment.custom_fields) !== JSON.stringify(updatedEquipment.custom_fields)) {
        changes['custom_fields'] = {
          old: currentEquipment.custom_fields || 'No custom fields',
          new: updatedEquipment.custom_fields || 'No custom fields'
        };
      }
      
      // Track team custom fields changes
      if (JSON.stringify(currentEquipment.team_custom_fields) !== JSON.stringify(updatedEquipment.team_custom_fields)) {
        changes['team_custom_fields'] = {
          old: currentEquipment.team_custom_fields || 'No team fields',
          new: updatedEquipment.team_custom_fields || 'No team fields'
        };
      }
      
      // Log the changes if any
      if (Object.keys(changes).length > 0) {
        await logEquipmentUpdated(
          updatedEquipment.project_id,
          id,
          updatedEquipment.type,
          updatedEquipment.tag_number,
          changes
        );
      }
    }
    
    return response.data;
  } 
  catch (error: any) {
    console.error('❌ Error updating equipment:', error);
    console.error('❌ Error response data:', error.response?.data);
    console.error('❌ Error response status:', error.response?.status);
    throw error;
  }
},

  // Delete equipment (with manual cascade for related records)
  async deleteEquipment(
    id: string,
    meta?: { projectId?: string | null; type?: string | null; tagNumber?: string | null }
  ) {
    try {
      // Prefer caller-provided metadata to avoid an extra fetch during delete.
      let equipment: any = null;
      if (meta?.projectId || meta?.type || meta?.tagNumber) {
        equipment = {
          project_id: meta?.projectId ?? null,
          type: meta?.type ?? null,
          tag_number: meta?.tagNumber ?? null,
        };
      } else {
        const equipmentResponse = await api.get(`/equipment?id=eq.${id}&select=project_id,type,tag_number`);
        equipment = Array.isArray(equipmentResponse.data) ? equipmentResponse.data[0] : equipmentResponse.data?.[0];
      }

      // Manually delete dependent records to satisfy foreign key constraints
      // 1. Progress entries
      try {
        await api.delete(`/equipment_progress_entries?equipment_id=eq.${id}`);
      } catch (error) {
        console.warn('⚠️ No progress entries to delete for equipment:', id, error?.response?.data || '');
      }

      // 2. Progress images
      try {
        await api.delete(`/equipment_progress_images?equipment_id=eq.${id}`);
      } catch (error) {
        console.warn('⚠️ No progress images to delete for equipment:', id, error?.response?.data || '');
      }

      // 3. Documents
      try {
        await api.delete(`/equipment_documents?equipment_id=eq.${id}`);
      } catch (error) {
        console.warn('⚠️ No equipment documents to delete for equipment:', id, error?.response?.data || '');
      }

      // 4. Team positions
      try {
        await api.delete(`/equipment_team_positions?equipment_id=eq.${id}`);
      } catch (error) {
        console.warn('⚠️ No team positions to delete for equipment:', id, error?.response?.data || '');
      }

      // 5. Activity logs
      try {
        await api.delete(`/equipment_activity_logs?equipment_id=eq.${id}`);
      } catch (error) {
        console.warn('⚠️ No activity logs to delete for equipment:', id, error?.response?.data || '');
      }

      // Finally, delete the equipment row itself
      const response = await api.delete(`/equipment?id=eq.${id}`);

      // Log equipment deletion
      if (equipment) {
        await logEquipmentDeleted(
          equipment.project_id,
          id,
          equipment.type,
          equipment.tag_number
        );
      }

      return response.data;
    } catch (error) {
      console.error('❌ Error deleting equipment:', error);
      console.error('❌ Error response data:', (error as any)?.response?.data);
      throw error;
    }
  },

  // Standalone Equipment CRUD operations
  async createStandaloneEquipment(equipmentData: any, firmId?: string) {
    try {
      // Get current user ID to set as created_by (firm_id is determined via created_by -> users.firm_id)
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('Cannot create standalone equipment: user ID is required. Please ensure you are logged in.');
      }

      // Set created_by to track who created the equipment (firm ownership determined via users.firm_id)
      equipmentData.created_by = userId;

      if (firmId) {
        const firmRes = await api.get(`/firms?id=eq.${firmId}&select=max_equipment_limit`);
        const limit = (firmRes.data as any[])?.[0]?.max_equipment_limit;
        if (limit != null && typeof limit === 'number') {
          const count = await fastAPI.getEquipmentCountByFirm(firmId);
          if (count >= limit) {
            throw new Error(`Equipment limit reached (${count}/${limit}). Your company cannot add more equipment. Contact your super admin to increase the limit.`);
          }
        }
      }

      // Normalize values before checking (trim whitespace, handle empty strings)
      const tagNumber = equipmentData.tag_number?.trim() || '';
      const jobNumber = equipmentData.job_number?.trim() || '';
      const manufacturingSerial = equipmentData.manufacturing_serial?.trim() || '';

      // Check for global uniqueness (across both equipment and standalone_equipment tables)
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumber || undefined,
        jobNumber || undefined,
        manufacturingSerial || undefined,
        undefined,
        true // isStandalone flag
      );
      
      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot create equipment. ${uniquenessCheck.conflicts.join('. ')}. Duplicate Job Number is not allowed; Job Number must be unique across all projects and standalone equipment.`;
        console.error('❌ Uniqueness validation failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      const response = await api.post('/standalone_equipment', equipmentData);
      
      // Log equipment creation (project_id will be null for standalone equipment)
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const createdEquipment = response.data[0];
        await logEquipmentCreated(
          null, // No project_id for standalone equipment (now allowed in activity_logs)
          createdEquipment.id,
          createdEquipment.type,
          createdEquipment.tag_number
        );
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating standalone equipment:', error);
      throw error;
    }
  },

  async updateStandaloneEquipment(id: string, equipmentData: any, currentUserId?: string) {
    try {
      const dataKeys = Object.keys(equipmentData || {});
      if (
        dataKeys.length === 1 &&
        dataKeys[0] === 'progress' &&
        typeof equipmentData.progress === 'number'
      ) {
        const updateData = {
          progress: equipmentData.progress,
          updated_at: new Date().toISOString(),
          ...(currentUserId && { updated_by: currentUserId })
        };
        const response = await api.patch(`/standalone_equipment?id=eq.${id}`, updateData, {
          headers: { Prefer: 'return=representation' }
        });
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
          throw new Error('Update failed: No rows were updated. This may be due to insufficient permissions or the record not existing.');
        }
        return response.data;
      }

      // Get current equipment data to track changes
      const currentEquipmentResponse = await api.get(`/standalone_equipment?id=eq.${id}&select=*`);
      const currentEquipment = currentEquipmentResponse.data?.[0];
      
      // Check for global uniqueness if tag_number, job_number, or manufacturing_serial are being updated
      const tagNumberToCheck = equipmentData.tag_number !== undefined ? equipmentData.tag_number : undefined;
      const jobNumberToCheck = equipmentData.job_number !== undefined ? equipmentData.job_number : undefined;
      const msnToCheck = equipmentData.manufacturing_serial !== undefined ? equipmentData.manufacturing_serial : undefined;
      
      if (currentEquipment && (tagNumberToCheck !== undefined || jobNumberToCheck !== undefined || msnToCheck !== undefined)) {
        const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
          tagNumberToCheck !== undefined ? tagNumberToCheck : undefined,
          jobNumberToCheck !== undefined ? jobNumberToCheck : undefined,
          msnToCheck !== undefined ? msnToCheck : undefined,
          id,
          true // isStandalone flag
        );
        
        if (!uniquenessCheck.isUnique) {
          const errorMessage = `Cannot update equipment. ${uniquenessCheck.conflicts.join('. ')}. Duplicate Job Number is not allowed; Job Number must be unique across all projects and standalone equipment.`;
          throw new Error(errorMessage);
        }
      }
      
      // Add updated_by field to track who made the update
      const updateData = {
        ...equipmentData,
        updated_at: new Date().toISOString(),
        ...(currentUserId && { updated_by: currentUserId })
      };
      
      const response = await api.patch(`/standalone_equipment?id=eq.${id}`, updateData);
      
      // Check if update was successful (RLS may block update and return empty array)
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Update failed: No rows were updated. This may be due to insufficient permissions or the record not existing.');
      }
      
      // Track changes for logging (similar to updateEquipment)
      if (currentEquipment && response.data && Array.isArray(response.data) && response.data.length > 0) {
        const updatedEquipment = response.data[0];
        const changes: Record<string, { old: any; new: any }> = {};
        
        // Compare key fields for changes - only track meaningful changes
        const fieldsToTrack = ['type', 'tag_number', 'status', 'progress', 'progress_phase', 'priority', 'notes', 'po_cdd'];
        
        // Helper to normalize values - treat "Not Assigned", "Not set", empty, null as equivalent
        const normalizeForComparison = (val: any): string | null => {
          if (val === null || val === undefined) return null;
          const str = String(val).trim();
          const lowerStr = str.toLowerCase();
          // Treat all these as equivalent (no real value set)
          if (str === '' || 
              lowerStr === 'not set' || 
              lowerStr === 'not-set' || 
              lowerStr === 'not assigned' || 
              lowerStr === 'null' || 
              lowerStr === 'undefined') {
            return null;
          }
          return str;
        };
        
        // Check if progress_phase is changing (if so, we'll skip progress percentage changes)
        const progressPhaseChanging = currentEquipment['progress_phase'] !== updatedEquipment['progress_phase'];
        
        fieldsToTrack.forEach(field => {
          const oldValue = currentEquipment[field];
          const newValue = updatedEquipment[field];
          
          // Skip progress percentage if progress_phase is also changing (progress is automatically set based on phase)
          if (field === 'progress' && progressPhaseChanging) {
            return; // Don't log progress changes when phase changes (it's automatic)
          }
          
          // Only track if values actually changed
          if (oldValue !== newValue) {
            const normalizedOld = normalizeForComparison(oldValue);
            const normalizedNew = normalizeForComparison(newValue);
            
            // Skip if both are null/empty/not set (no meaningful change)
            if (!(normalizedOld === null && normalizedNew === null)) {
              // Format values for display
              const displayOld = normalizedOld === null ? 'Not set' : normalizedOld;
              const displayNew = normalizedNew === null ? 'Not set' : normalizedNew;
              
              // Only log if old and new are actually different (skip "Not set" → "Not set")
              if (displayOld !== displayNew) {
                changes[field] = {
                  old: displayOld,
                  new: displayNew
                };
                
                // Final safety check: remove if both are "Not set"
                if (changes[field].old === 'Not set' && changes[field].new === 'Not set') {
                  delete changes[field];
                }
              }
            }
          }
        });
        
        // Track technical sections changes
        if (JSON.stringify(currentEquipment.technical_sections) !== JSON.stringify(updatedEquipment.technical_sections)) {
          changes['technical_sections'] = {
            old: currentEquipment.technical_sections || 'No sections',
            new: updatedEquipment.technical_sections || 'No sections'
          };
        }
        
        // Track custom fields changes
        if (JSON.stringify(currentEquipment.custom_fields) !== JSON.stringify(updatedEquipment.custom_fields)) {
          changes['custom_fields'] = {
            old: currentEquipment.custom_fields || 'No custom fields',
            new: updatedEquipment.custom_fields || 'No custom fields'
          };
        }
        
        // Log the changes if any (project_id is null for standalone equipment)
        if (Object.keys(changes).length > 0) {
          await logEquipmentUpdated(
            null, // No project_id for standalone equipment
            id,
            updatedEquipment.type,
            updatedEquipment.tag_number,
            changes
          );
        }
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating standalone equipment:', error);
      throw error;
    }
  },

  async getStandaloneEquipmentById(id: string, options?: { progressImagesLatestOnly?: boolean }) {
    try {
      const progressImagesLatestOnly = !!options?.progressImagesLatestOnly;
      const eqRes = await api.get(`/standalone_equipment?id=eq.${id}&select=*`);
      const equipment = Array.isArray(eqRes.data) ? eqRes.data[0] : eqRes.data;
      if (!equipment) return null;

      const standaloneProgressImagesSelect = progressImagesLatestOnly
        ? 'id,equipment_id,image_url,description,uploaded_by,created_at'
        : '*';
      const standaloneProgressEntriesSelect = 'id,equipment_id,entry_text,entry_type,created_by,created_at,image_description,audio_duration';

      const [progressImagesResponse, progressEntriesResponse] = await Promise.all([
        api.get(`/standalone_equipment_progress_images?equipment_id=eq.${id}&select=${standaloneProgressImagesSelect}&order=created_at.desc&limit=250`),
        api.get(`/standalone_equipment_progress_entries?equipment_id=eq.${id}&select=${standaloneProgressEntriesSelect}&order=created_at.desc&limit=250`),
      ]);

      const allProgressImages = Array.isArray(progressImagesResponse.data) ? progressImagesResponse.data : [];
      const allProgressEntries = Array.isArray(progressEntriesResponse.data) ? progressEntriesResponse.data : [];

      const createdByIds = Array.from(
        new Set(
          allProgressEntries
            .map((entry: any) => entry?.created_by)
            .filter((v: any) => !!v && typeof v === 'string')
        )
      );

      let usersMap: Record<string, any> = {};
      if (createdByIds.length > 0) {
        try {
          const userIdsString = createdByIds.join(',');
          const usersResponse = await api.get(`/users?id=in.(${userIdsString})&select=id,full_name,email`);
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: Record<string, any>, u: any) => {
            acc[u.id] = u;
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for standalone progress entries (non-fatal):', (userError as any)?.message || userError);
        }
      }

      const entriesWithUsers = allProgressEntries.map((entry: any) => ({
        ...entry,
        users: entry.created_by ? usersMap[entry.created_by] || null : null,
      }));

      return {
        ...equipment,
        progress_images: allProgressImages,
        progress_entries: entriesWithUsers,
      };
    } catch (error) {
      console.error('❌ Error fetching standalone equipment by id:', error);
      throw error;
    }
  },

  async deleteStandaloneEquipment(
    id: string,
    meta?: { type?: string | null; tagNumber?: string | null }
  ) {
    try {
      // Prefer caller-provided metadata to avoid an extra fetch during delete.
      let equipment: any = null;
      if (meta?.type || meta?.tagNumber) {
        equipment = {
          type: meta?.type ?? null,
          tag_number: meta?.tagNumber ?? null,
        };
      } else {
        const equipmentResponse = await api.get(`/standalone_equipment?id=eq.${id}&select=type,tag_number`);
        equipment = equipmentResponse.data?.[0];
      }

      // Manually delete dependent records to satisfy foreign key constraints
      const dependentTables = [
        'standalone_equipment_progress_entries',
        'standalone_equipment_progress_images',
        'standalone_equipment_documents',
        'standalone_equipment_team_positions',
        'standalone_equipment_activity_logs'
      ];
      for (const table of dependentTables) {
        try {
          await api.delete(`/${table}?equipment_id=eq.${id}`);
        } catch (err) {
          console.warn(`⚠️ No records to delete from ${table} for equipment:`, id);
        }
      }
      
      const response = await api.delete(`/standalone_equipment?id=eq.${id}`);
      
      // Log equipment deletion (project_id will be null for standalone equipment)
      if (equipment) {
        await logEquipmentDeleted(
          null, // No project_id for standalone equipment (now allowed in activity_logs)
          id,
          equipment.type,
          equipment.tag_number
        );
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting standalone equipment:', error);
      throw error;
    }
  },

  // Get project equipment team positions (for project equipment - equipment_team_positions table)
  async getProjectEquipmentTeamPositions(equipmentId: string) {
    try {
      const response = await api.get(
        `/equipment_team_positions?equipment_id=eq.${equipmentId}&order=created_at.desc`
      );
      return Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
    } catch (error: any) {
      console.error('Error fetching project equipment team positions:', error);
      return [];
    }
  },

  /** Batch fetch project equipment team positions for many equipment IDs. Returns Record<equipmentId, teamPositions[]>. */
  async getProjectEquipmentTeamPositionsBatch(equipmentIds: string[]): Promise<Record<string, any[]>> {
    if (!equipmentIds?.length) return {};
    if (import.meta.env.DEV) {
      const reqCount = Math.ceil(equipmentIds.length / 50) || 1;
      console.log(`[Batch] Project team positions: ${reqCount} request(s) for ${equipmentIds.length} equipment (was ${equipmentIds.length} before batching)`);
    }
    try {
      const BATCH_CHUNK = 50;
      const allRows: any[] = [];
      for (let i = 0; i < equipmentIds.length; i += BATCH_CHUNK) {
        const chunk = equipmentIds.slice(i, i + BATCH_CHUNK);
        const response = await api.get(
          `/equipment_team_positions?equipment_id=in.(${chunk.join(',')})&order=created_at.desc`
        );
        const rows = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
        allRows.push(...rows);
      }
      const result: Record<string, any[]> = {};
      for (const id of equipmentIds) result[id] = [];
      for (const row of allRows) {
        if (row.equipment_id) {
          (result[row.equipment_id] = result[row.equipment_id] || []).push(row);
        }
      }
      return result;
    } catch (error: any) {
      console.error('Error fetching project equipment team positions batch:', error);
      return Object.fromEntries(equipmentIds.map((id) => [id, []]));
    }
  },

  // Create team position (for project equipment)
  async createTeamPosition(teamPositionData: any) {
    try {
      const response = await api.post('/equipment_team_positions', teamPositionData);
      // // console.log('✅ Team position create API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating team position:', error);
      throw error;
    }
  },

  // Create project equipment team positions in one bulk request
  async createTeamPositionsBulk(teamPositionsData: any[]) {
    if (!Array.isArray(teamPositionsData) || teamPositionsData.length === 0) return [];
    try {
      const response = await api.post('/equipment_team_positions', teamPositionsData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error bulk creating team positions:', error);
      throw error;
    }
  },

  // Look up equipment manager email/phone by person_name from standalone_equipment_team_positions (for previously added team members)
  async getStandaloneEquipmentManagerContact(personName: string): Promise<{ email: string; phone: string } | null> {
    if (!personName || !personName.trim()) return null;
    try {
      const encoded = encodeURIComponent(personName.trim());
      const response = await api.get(
        `/standalone_equipment_team_positions?position_name=eq.Equipment Manager&person_name=ilike.${encoded}&select=email,phone&limit=1`
      );
      const rows = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
      const row = rows[0];
      if (row?.email && row.email.includes('@') && !String(row.email).toLowerCase().includes('@company')) {
        return { email: row.email, phone: row.phone || '' };
      }
      return null;
    } catch {
      return null;
    }
  },

  /** Batch fetch standalone equipment team positions for many equipment IDs. Returns Record<equipmentId, teamPositions[]>. */
  async getStandaloneTeamPositionsBatch(equipmentIds: string[]): Promise<Record<string, any[]>> {
    if (!equipmentIds?.length) return {};
    if (import.meta.env.DEV) {
      const reqCount = Math.ceil(equipmentIds.length / 50) || 1;
      console.log(`[Batch] Standalone team positions: ${reqCount} request(s) for ${equipmentIds.length} equipment (was ${equipmentIds.length} before batching)`);
    }
    try {
      const BATCH_CHUNK = 50;
      const allRows: any[] = [];
      for (let i = 0; i < equipmentIds.length; i += BATCH_CHUNK) {
        const chunk = equipmentIds.slice(i, i + BATCH_CHUNK);
        const response = await api.get(
          `/standalone_equipment_team_positions?equipment_id=in.(${chunk.join(',')})&order=created_at.desc`
        );
        const rows = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
        allRows.push(...rows);
      }
      const result: Record<string, any[]> = {};
      for (const id of equipmentIds) result[id] = [];
      for (const row of allRows) {
        if (row.equipment_id) {
          (result[row.equipment_id] = result[row.equipment_id] || []).push(row);
        }
      }
      return result;
    } catch (error: any) {
      console.error('Error fetching standalone team positions batch:', error);
      return Object.fromEntries(equipmentIds.map((id) => [id, []]));
    }
  },

  // Create standalone equipment team position
  async createStandaloneTeamPosition(teamPositionData: any) {
    try {
      const response = await api.post('/standalone_equipment_team_positions', teamPositionData);
      // // console.log('✅ Standalone team position create API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating standalone team position:', error);
      throw error;
    }
  },

  // Update standalone equipment team position
  async updateStandaloneTeamPosition(id: string, teamPositionData: any) {
    try {
      const response = await api.patch(`/standalone_equipment_team_positions?id=eq.${id}`, teamPositionData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating standalone team position:', error);
      throw error;
    }
  },

  // Delete standalone equipment team position
  async deleteStandaloneTeamPosition(id: string) {
    try {
      const response = await api.delete(`/standalone_equipment_team_positions?id=eq.${id}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting standalone team position:', error);
      throw error;
    }
  },


  // Create document
  async createDocument(documentData: any) {
    try {
      const response = await api.post('/equipment_documents', documentData);
      // // console.log('✅ Document create API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating document:', error);
      throw error;
    }
  },

  // Get documents by equipment ID
  async getDocumentsByEquipment(equipmentId: string) {
    try {
      // // console.log(`🔍 Fetching documents for equipment ID: ${equipmentId}`);
      const response = await api.get(`/equipment_documents?equipment_id=eq.${equipmentId}&select=*&order=upload_date.desc`);
      // // console.log('✅ Documents fetch API response:', response.data);
      // // console.log(`📊 Found ${(response.data as any[])?.length || 0} documents for equipment ${equipmentId}`);
      
      let documents = Array.isArray(response.data) ? response.data : [];
      
      // Fetch user data for uploaded_by fields
      const userIds = [...new Set(documents
        .map((doc: any) => doc.uploaded_by)
        .filter((id: any) => id && typeof id === 'string' && id.length === 36) // UUID check
      )];
      
      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`);
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for equipment documents:', userError);
        }
      }
      
      // Merge user data into documents
      documents = documents.map((doc: any) => ({
        ...doc,
        uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null
      }));
      
      return documents;
    } catch (error: any) {
      console.error('❌ Error fetching documents:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get all documents (for debugging)
  async getAllDocuments() {
    try {
      // // console.log('🔍 Fetching ALL documents from database...');
      const response = await api.get('/equipment_documents?select=*&order=created_at.desc');
      // // console.log('✅ All documents response:', response.data);
      // // console.log(`📊 Total documents in database: ${(response.data as any[])?.length || 0}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching all documents:', error);
      return [];
    }
  },

  // Project Members API functions
  async getProjectMembers(projectId: string) {
    // Skip for standalone equipment (no project_id)
    if (projectId === 'standalone') {
      return [];
    }
    try {
      // // console.log('👥 Fetching project members for project ID:', projectId);
      const response = await api.get(`/project_members?project_id=eq.${projectId}&select=*&order=created_at.desc`);
      // // console.log('✅ Project members response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching project members:', error);
      return [];
    }
  },

  async createProjectMember(memberData: any) {
    // Skip for standalone equipment (no project_id)
    if (memberData.project_id === 'standalone') {
      throw new Error('Cannot create project member for standalone equipment. Use team_positions instead.');
    }
    try {
      // // console.log('👥 Creating project member:', memberData);
      const response = await api.post('/project_members', memberData, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      // // console.log('✅ Project member created successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating project member:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  async updateProjectMember(memberId: string, memberData: any) {
    try {
      // // console.log('👥 Updating project member:', memberId, memberData);
      
      // Remove user_id from update data if it's not provided (to avoid constraint issues)
      const updateData = { ...memberData };
      if (!updateData.user_id) {
        delete updateData.user_id;
      }
      
      const response = await api.patch(`/project_members?id=eq.${memberId}`, updateData, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      // // console.log('✅ Project member updated successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating project member:', error);
      throw error;
    }
  },

  async deleteProjectMember(memberId: string) {
    try {
      // // console.log('👥 Deleting project member:', memberId);
      const response = await api.delete(`/project_members?id=eq.${memberId}`, {
        headers: {
          'Prefer': 'return=minimal'
        }
      });
      // // console.log('✅ Project member deleted successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting project member:', error);
      throw error;
    }
  },

  // Get all unique team members across all projects in the firm
  async getAllFirmTeamMembers(firmId: string) {
    try {
      // First, get all projects for this firm
      const projectsResponse = await api.get(`/projects?firm_id=eq.${firmId}&select=id`);
      const projectIds = (projectsResponse.data as any[]).map(p => p.id);
      
      if (projectIds.length === 0) {
        return [];
      }

      // Get all project members for these projects
      const projectIdsString = projectIds.join(',');
      const membersResponse = await api.get(`/project_members?project_id=in.(${projectIdsString})&select=name,email,phone,role,access_level&order=name.asc`);
      const allMembers = (membersResponse.data as any[]) || [];

      // Group by email to get unique members (take the first occurrence of each email)
      const uniqueMembersMap = new Map<string, any>();
      allMembers.forEach(member => {
        if (member.email && !uniqueMembersMap.has(member.email.toLowerCase())) {
          uniqueMembersMap.set(member.email.toLowerCase(), {
            name: member.name,
            email: member.email,
            phone: member.phone || '',
            role: member.role,
            access_level: member.access_level || member.role
          });
        }
      });

      // Convert map to array
      const uniqueMembers = Array.from(uniqueMembersMap.values());
      return uniqueMembers;
    } catch (error: any) {
      console.error('❌ Error fetching firm team members:', error);
      return [];
    }
  },

  // Import existing documents from storage to database (PERFECT SETUP)
  async importExistingDocuments() {
    try {
      // // console.log('🔄 PERFECT: Importing existing documents from storage...');
      
      // List all files in project-documents bucket
      const { data: files, error } = await supabase.storage
        .from('project-documents')
        .list('', {
          limit: 100,
          offset: 0
        });
      
      if (error) {
        console.error('❌ Error listing storage files:', error);
        return [];
      }
      
      // // console.log('📁 PERFECT: Found files in storage:', files);
      
      const importedDocs = [];
      
      // Process each file
      for (const file of files || []) {
        if (file.name && !file.name.includes('/')) { // Only root level files
          try {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('project-documents')
              .getPublicUrl(file.name);
            
            // Try to extract equipment ID from filename or use a default
            const equipmentId = '8d629c78-3805-47fa-90e5-e2955a72b3a1'; // Default to first equipment
            
            const documentData = {
              equipment_id: equipmentId,
              document_name: file.name,
              document_url: urlData.publicUrl,
              document_type: 'application/pdf', // Default type
              file_size: file.metadata?.size || 0,
              uploaded_by: 'system-import',
              upload_date: new Date().toISOString()
            };
            
            // Save to database
            const savedDoc = await this.createDocument(documentData);
            importedDocs.push(savedDoc);
            // // console.log('✅ PERFECT: Imported document:', file.name);
            
          } catch (importError) {
            console.error(`❌ Error importing file ${file.name}:`, importError);
          }
        }
      }
      
      // // console.log(`✅ PERFECT: Imported ${importedDocs.length} documents from storage`);
      return importedDocs;
      
    } catch (error: any) {
      console.error('❌ PERFECT: Error importing existing documents:', error);
      return [];
    }
  },

  // Upload company logo to Supabase storage
  async uploadCompanyLogo(file: File, firmId: string): Promise<string> {
    try {
      // console.log('📤 Starting logo upload for firm:', firmId);
      
      // Validate file type (images and PDF)
      const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/pdf'
      ];
      
      if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please upload PNG, JPG, GIF, WebP, SVG, or PDF files only.');
      }
      
      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new Error('File size too large. Maximum size is 5MB.');
      }
      
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `logo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
      const filePath = `company-logos/${firmId}/${fileName}`;
      const bucket = 'project-documents';
      
      // console.log('📁 Uploading to:', filePath);
      
      // Use edge function for secure upload (service role key not exposed)
      const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
      const logoUrl = await uploadFileViaEdgeFunction({
        bucket,
        filePath,
        file
      });
      
      // console.log('✅ Logo URL generated:', logoUrl);
      return logoUrl;
    } catch (error: any) {
      console.error('❌ Error uploading company logo:', error);
      throw new Error(error.message || 'Failed to upload logo. Please try again.');
    }
  },

  // Upload file to Supabase storage (PERFECT SETUP)
  async uploadFileToStorage(file: File, equipmentId: string, bucket: string = 'project-documents'): Promise<string> {
    try {
      // // console.log('📤 PERFECT: Uploading file to Supabase storage:', file.name);
      // // console.log('📤 PERFECT: File size:', file.size, 'bytes');
      // // console.log('📤 PERFECT: Equipment ID:', equipmentId);
      // // console.log('📤 PERFECT: Bucket:', bucket);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
      const filePath = `equipment-documents/${equipmentId}/${fileName}`;
      
      // // console.log('📤 PERFECT: File path:', filePath);
      // // console.log('📤 PERFECT: Starting upload to Supabase...');
      
      // Direct upload without timeout
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      // // console.log('📤 REAL: Upload completed');
      // // console.log('📤 PERFECT: Upload data:', data);
      // // console.log('📤 PERFECT: Upload error:', error);
      
      if (error) {
        console.error('❌ Storage upload error:', error);
        throw new Error(`Storage upload failed: ${error.message}`);
      }
      
      // // console.log('📤 PERFECT: Getting public URL...');
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);
      
      const fileUrl = urlData.publicUrl;
      // // console.log('✅ PERFECT: File uploaded to storage:', fileUrl);
      return fileUrl;
    } catch (error: any) {
      console.error('❌ PERFECT: Error uploading file to storage:', error);
      throw error;
    }
  },

  // Delete document
  async deleteDocument(documentId: string) {
    try {
      const response = await api.delete(`/equipment_documents?id=eq.${documentId}`);
      // // console.log('✅ Document delete API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }
  },


  // Update progress entry
  async updateProgressEntry(entryId: string, updateData: {
    entry_text?: string,
    entry_type?: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string
  }) {
    try {
      // // console.log('📝 Updating progress entry:', entryId, updateData);
      const response = await api.patch(`/equipment_progress_entries?id=eq.${entryId}`, updateData);
      // // console.log('✅ Progress entry update API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating progress entry:', error);
      throw error;
    }
  },

  // Delete progress entry
  async deleteProgressEntry(entryId: string) {
    try {
      // // console.log('🗑️ Deleting progress entry:', entryId);
      const response = await api.delete(`/equipment_progress_entries?id=eq.${entryId}`);
      // // console.log('✅ Progress entry delete API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting progress entry:', error);
      throw error;
    }
  },

  // Get all progress entries across all projects (for company highlights)
  // PERFORMANCE: Simplified query to prevent statement timeouts (same fix as getAllProgressImages)
  async getAllProgressEntries(startDate?: string, endDate?: string, projectIds?: string[], limit?: number, offset?: number) {
    try {
      // CRITICAL FIX: Simplified query - removed complex nested joins that cause timeouts
      // Fetch only essential fields first, then fetch related data separately
      // Support pagination with limit and offset
      // IMPORTANT: If projectIds are provided, first resolve the allowed equipment IDs for those projects
      // and restrict the progress entries query to those equipment_ids. This avoids loading entries for
      // projects the user cannot see, without re-introducing heavy joins.
      let allowedEquipmentIds: string[] | null = null;
      if (projectIds && projectIds.length > 0) {
        try {
          const projectIdsString = projectIds.join(',');
          const equipmentForProjects = await api.get(
            `/equipment?project_id=in.(${projectIdsString})&select=id,project_id&limit=10000`,
            { timeout: 15000 }
          );
          const eqArray = Array.isArray(equipmentForProjects.data) ? equipmentForProjects.data : [];
          allowedEquipmentIds = [...new Set(eqArray.map((eq: any) => eq.id).filter(Boolean))];
          
          // If there is no equipment for these projects, there can be no progress entries
          if (allowedEquipmentIds.length === 0) {
            return [];
          }
        } catch (equipmentFilterError) {
          console.warn('⚠️ Error resolving equipment IDs for project filter in getAllProgressEntries (non-fatal):', equipmentFilterError);
          // Fallback: behave as before without equipment_id filter
          allowedEquipmentIds = null;
        }
      }

      const pageLimit = limit || 200; // Default 200, but can be overridden for pagination
      const pageOffset = offset || 0;
      let url = `/equipment_progress_entries?select=id,equipment_id,entry_text,entry_type,created_at,created_by,audio_data,audio_duration,image_url,image_description&order=created_at.desc&limit=${pageLimit}&offset=${pageOffset}`;
      if (startDate) {
        url += `&created_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&created_at=lte.${endDate}`;
      }
      if (allowedEquipmentIds && allowedEquipmentIds.length > 0) {
        const eqIdsString = allowedEquipmentIds.join(',');
        url += `&equipment_id=in.(${eqIdsString})`;
      }
      
      // PERFORMANCE: Add timeout handling and retry logic (same as getAllProgressImages)
      let response;
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          response = await api.get(url, { timeout: 20000 }); // 20 second timeout
          break; // Success, exit retry loop
        } catch (error: any) {
          // Check if it's a timeout error
          if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
            retries++;
            if (retries > maxRetries) {
              console.error('❌ Error fetching all progress entries: Query timeout after retries', error);
              return []; // Return empty array instead of crashing
            }
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
          throw error; // Re-throw if not a timeout
        }
      }
      
      const entries = Array.isArray(response?.data) ? response.data : [];
      
      // PERFORMANCE: Fetch equipment data separately in batches to avoid timeouts
      if (entries.length > 0) {
        const equipmentIds = [...new Set(entries.map((entry: any) => entry.equipment_id).filter(Boolean))];
        
        // Fetch equipment data in smaller batches (reduced from 50 to 15)
        const equipmentMap: Record<string, any> = {};
        const batchSize = 15; // Reduced from 50 to prevent timeouts
        
        for (let i = 0; i < equipmentIds.length; i += batchSize) {
          const batch = equipmentIds.slice(i, i + batchSize);
          try {
            const equipmentResponse = await api.get(
              `/equipment?id=in.(${batch.join(',')})&select=id,tag_number,type,name,project_id&limit=${batchSize}`,
              { timeout: 15000 }
            ).catch(() => ({ data: [] }));
            
            (equipmentResponse.data || []).forEach((eq: any) => {
              equipmentMap[eq.id] = eq;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching equipment batch (non-fatal):', error);
          }
        }
        
        // Fetch project data separately if needed
        const projectIds = [...new Set(Object.values(equipmentMap).map((eq: any) => eq.project_id).filter(Boolean))];
        const projectMap: Record<string, any> = {};
        
        if (projectIds.length > 0) {
          try {
            const projectResponse = await api.get(
              `/projects?id=in.(${projectIds.join(',')})&select=id,name&limit=100`,
              { timeout: 10000 }
            ).catch(() => ({ data: [] }));
            
            (projectResponse.data || []).forEach((proj: any) => {
              projectMap[proj.id] = proj;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching projects (non-fatal):', error);
          }
        }
        
        // Attach equipment and project data to entries
        entries.forEach((entry: any) => {
          if (entry.equipment_id) {
            const equipment = equipmentMap[entry.equipment_id];
            entry.equipment = equipment ? {
              ...equipment,
              projects: equipment.project_id ? projectMap[equipment.project_id] : null
            } : {
              // Fallback: Create minimal equipment object if fetch failed
              id: entry.equipment_id,
              tag_number: 'Unknown',
              type: 'Equipment',
              project_id: null
            };
          } else {
            // Entry has no equipment_id - set equipment to null
            entry.equipment = null;
          }
        });
      }
      
      // Fetch user data separately for entries that have created_by
      const userIds = [...new Set(entries.map((entry: any) => entry.created_by).filter(Boolean))];
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`, { timeout: 10000 });
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data:', userError);
        }
      }
      
      // Merge user data into entries and add entry_type for filtering
      return entries.map((entry: any) => ({
        ...entry,
        created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null,
        entry_type: entry.entry_type || 'progress_entry' // Ensure entry_type exists for filtering
      }));
    } catch (error: any) {
      // Don't log aborted requests as errors
      if (error?.name !== 'AbortError') {
        console.error('❌ Error fetching all progress entries:', error);
      }
      return [];
    }
  },

  // Get all progress entries METADATA ONLY (no image/audio blobs) for Company Highlights - All Updates
  // Optimized for fast initial load; can be combined with a separate heavy-data loader if needed.
  async getAllProgressEntriesMetadata(startDate?: string, endDate?: string, projectIds?: string[], limit?: number, offset?: number) {
    try {
      // Resolve allowed equipment IDs for the provided projects (if any)
      let allowedEquipmentIds: string[] | null = null;
      if (projectIds && projectIds.length > 0) {
        try {
          const projectIdsString = projectIds.join(',');
          const equipmentForProjects = await api.get(
            `/equipment?project_id=in.(${projectIdsString})&select=id,project_id&limit=10000`,
            { timeout: 15000 }
          );
          const eqArray = Array.isArray(equipmentForProjects.data) ? equipmentForProjects.data : [];
          allowedEquipmentIds = [...new Set(eqArray.map((eq: any) => eq.id).filter(Boolean))];

          // If there is no equipment for these projects, there can be no progress entries
          if (allowedEquipmentIds.length === 0) {
            return [];
          }
        } catch (equipmentFilterError) {
          console.warn('⚠️ Error resolving equipment IDs for project filter in getAllProgressEntriesMetadata (non-fatal):', equipmentFilterError);
          allowedEquipmentIds = null; // Fallback: no equipment_id filter
        }
      }

      const pageLimit = limit || 200;
      const pageOffset = offset || 0;
      // NOTE: We intentionally do NOT select image_url or audio_data here to keep payload light.
      let url = `/equipment_progress_entries?select=id,equipment_id,entry_text,entry_type,created_at,created_by&order=created_at.desc&limit=${pageLimit}&offset=${pageOffset}`;
      if (startDate) {
        url += `&created_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&created_at=lte.${endDate}`;
      }
      if (allowedEquipmentIds && allowedEquipmentIds.length > 0) {
        const eqIdsString = allowedEquipmentIds.join(',');
        url += `&equipment_id=in.(${eqIdsString})`;
      }

      // Basic metadata fetch with retries on timeout
      let response;
      let retries = 0;
      const maxRetries = 2;
      while (retries <= maxRetries) {
        try {
          response = await api.get(url, { timeout: 20000 });
          break;
        } catch (error: any) {
          if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
            retries++;
            if (retries > maxRetries) {
              console.error('❌ Error fetching progress entries metadata: Query timeout after retries', error);
              return [];
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
          throw error;
        }
      }

      const entries = Array.isArray(response?.data) ? response.data : [];

      // Attach equipment and project metadata (same pattern as full entries API, but metadata-only)
      if (entries.length > 0) {
        const equipmentIds = [...new Set(entries.map((entry: any) => entry.equipment_id).filter(Boolean))];

        const equipmentMap: Record<string, any> = {};
        const batchSize = 50;
        for (let i = 0; i < equipmentIds.length; i += batchSize) {
          const batch = equipmentIds.slice(i, i + batchSize);
          try {
            const equipmentResponse = await api.get(
              `/equipment?id=in.(${batch.join(',')})&select=id,tag_number,type,name,project_id&limit=${batchSize}`,
              { timeout: 15000 }
            ).catch(() => ({ data: [] }));

            (equipmentResponse.data || []).forEach((eq: any) => {
              equipmentMap[eq.id] = eq;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching equipment batch for metadata (non-fatal):', error);
          }
        }

        const projectIdsForEq = [...new Set(Object.values(equipmentMap).map((eq: any) => eq.project_id).filter(Boolean))];
        const projectMap: Record<string, any> = {};
        if (projectIdsForEq.length > 0) {
          try {
            const projectResponse = await api.get(
              `/projects?id=in.(${projectIdsForEq.join(',')})&select=id,name&limit=100`,
              { timeout: 10000 }
            ).catch(() => ({ data: [] }));

            (projectResponse.data || []).forEach((proj: any) => {
              projectMap[proj.id] = proj;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching projects for metadata (non-fatal):', error);
          }
        }

        entries.forEach((entry: any) => {
          if (entry.equipment_id) {
            const equipment = equipmentMap[entry.equipment_id];
            entry.equipment = equipment ? {
              ...equipment,
              projects: equipment.project_id ? projectMap[equipment.project_id] : null
            } : {
              id: entry.equipment_id,
              tag_number: 'Unknown',
              type: 'Equipment',
              project_id: null
            };
          } else {
            entry.equipment = null;
          }
        });
      }

      // Fetch user metadata for created_by
      const userIds = [...new Set(entries.map((entry: any) => entry.created_by).filter(Boolean))];
      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`, { timeout: 10000 });
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for metadata:', userError);
        }
      }

      // Merge user data into entries and add entry_type for filtering
      return entries.map((entry: any) => ({
        ...entry,
        created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null,
        entry_type: entry.entry_type || 'progress_entry'
      }));
    } catch (error: any) {
      console.error('❌ Error fetching progress entries metadata:', error);
      return [];
    }
  },

  // Get all progress images (for company highlights - Key Progress section)
  // PERFORMANCE: Simplified query to prevent statement timeouts
  async getAllProgressImages(startDate?: string, endDate?: string, projectIds?: string[], limit?: number, offset?: number) {
    try {
      // CRITICAL FIX: Simplified query - removed complex nested joins that cause timeouts
      // Fetch only essential fields first, then fetch related data separately if needed
      // Support pagination with limit and offset
      // IMPORTANT: If projectIds are provided, first resolve the allowed equipment IDs for those projects
      // and restrict the progress images query to those equipment_ids. This avoids loading images for
      // projects the user cannot see, without re-introducing heavy joins.
      let allowedEquipmentIds: string[] | null = null;
      if (projectIds && projectIds.length > 0) {
        try {
          const projectIdsString = projectIds.join(',');
          const equipmentForProjects = await api.get(
            `/equipment?project_id=in.(${projectIdsString})&select=id,project_id&limit=10000`,
            { timeout: 15000 }
          );
          const eqArray = Array.isArray(equipmentForProjects.data) ? equipmentForProjects.data : [];
          allowedEquipmentIds = [...new Set(eqArray.map((eq: any) => eq.id).filter(Boolean))];
          
          // If there is no equipment for these projects, there can be no progress images
          if (allowedEquipmentIds.length === 0) {
            return [];
          }
        } catch (equipmentFilterError) {
          console.warn('⚠️ Error resolving equipment IDs for project filter in getAllProgressImages (non-fatal):', equipmentFilterError);
          // Fallback: behave as before without equipment_id filter
          allowedEquipmentIds = null;
        }
      }

      const pageLimit = limit || 200; // Default 200, but can be overridden for pagination
      const pageOffset = offset || 0;
      let url = `/equipment_progress_images?select=id,equipment_id,image_url,description,uploaded_by,upload_date,created_at,audio_data,audio_duration&order=created_at.desc&limit=${pageLimit}&offset=${pageOffset}`;
      if (startDate) {
        url += `&created_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&created_at=lte.${endDate}`;
      }
      if (allowedEquipmentIds && allowedEquipmentIds.length > 0) {
        const eqIdsString = allowedEquipmentIds.join(',');
        url += `&equipment_id=in.(${eqIdsString})`;
      }
      
      // PERFORMANCE: Add timeout handling and retry logic
      let response;
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          response = await api.get(url, { timeout: 20000 }); // 20 second timeout
          break; // Success, exit retry loop
        } catch (error: any) {
          // Check if it's a timeout error
          if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
            retries++;
            if (retries > maxRetries) {
              console.error('❌ Error fetching progress images: Query timeout after retries', error);
              return []; // Return empty array instead of crashing
            }
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
          throw error; // Re-throw if not a timeout
        }
      }
      
      const images = Array.isArray(response?.data) ? response.data : [];
      
      // PERFORMANCE: Fetch equipment data separately in batches to avoid timeouts
      if (images.length > 0) {
        const equipmentIds = [...new Set(images.map((img: any) => img.equipment_id).filter(Boolean))];
        
        // Fetch equipment data in smaller batches (reduced from 50 to 15)
        const equipmentMap: Record<string, any> = {};
        const batchSize = 15; // Reduced from 50 to prevent timeouts
        
        for (let i = 0; i < equipmentIds.length; i += batchSize) {
          const batch = equipmentIds.slice(i, i + batchSize);
          try {
            const equipmentResponse = await api.get(
              `/equipment?id=in.(${batch.join(',')})&select=id,tag_number,type,name,project_id&limit=${batchSize}`,
              { timeout: 15000 }
            ).catch(() => ({ data: [] }));
            
            (equipmentResponse.data || []).forEach((eq: any) => {
              equipmentMap[eq.id] = eq;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching equipment batch (non-fatal):', error);
          }
        }
        
        // Fetch project data separately if needed
        const projectIds = [...new Set(Object.values(equipmentMap).map((eq: any) => eq.project_id).filter(Boolean))];
        const projectMap: Record<string, any> = {};
        
        if (projectIds.length > 0) {
          try {
            const projectResponse = await api.get(
              `/projects?id=in.(${projectIds.join(',')})&select=id,name&limit=100`,
              { timeout: 10000 }
            ).catch(() => ({ data: [] }));
            
            (projectResponse.data || []).forEach((proj: any) => {
              projectMap[proj.id] = proj;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching projects (non-fatal):', error);
          }
        }
        
        // Attach equipment and project data to images
        images.forEach((img: any) => {
          const equipment = equipmentMap[img.equipment_id];
          img.equipment = equipment ? {
            ...equipment,
            projects: equipment.project_id ? projectMap[equipment.project_id] : null
          } : null;
        });
      }
      
      // Fetch user data separately for images that have uploaded_by (if it's a UUID)
      // uploaded_by is a text field, so it might be a UUID or a name
      const uploadedByValues = images.map((img: any) => img.uploaded_by).filter(Boolean);
      // Check if uploaded_by values look like UUIDs (36 characters with dashes)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const userIds = [...new Set(uploadedByValues.filter((val: string) => uuidPattern.test(val)))];
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`);
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data:', userError);
        }
      }
      
      // Merge user data into images and transform to match expected format
      return images.map((img: any) => {
        const uploadedBy = img.uploaded_by;
        const isUuid = uploadedBy && uuidPattern.test(uploadedBy);
        const userInfo = isUuid && uploadedBy ? usersMap[uploadedBy] : null;
        
        return {
          id: img.id,
          image_url: img.image_url,
          image: img.image_url, // For compatibility
          description: img.description,
          image_description: img.description, // For compatibility
          audio_data: img.audio_data,
          audio: img.audio_data, // For compatibility
          audio_duration: img.audio_duration,
          audioDuration: img.audio_duration, // For compatibility
          created_at: img.created_at || img.upload_date,
          uploadDate: img.upload_date || img.created_at,
          upload_date: img.upload_date || img.created_at,
          uploaded_by: uploadedBy,
          created_by: uploadedBy, // For compatibility
          created_by_user: userInfo || (uploadedBy && !isUuid ? { full_name: uploadedBy } : null),
          entry_type: 'progress_image', // CRITICAL: Add entry_type for filtering in CompanyHighlights
          equipment: img.equipment || {
            id: img.equipment_id,
            tag_number: 'N/A',
            type: 'Equipment',
            project_id: null
          }
        };
      });
    } catch (error: any) {
      console.error('❌ Error fetching all progress images:', error);
      return [];
    }
  },

  // Get all progress images METADATA ONLY (no image/audio blobs) for Company Highlights - Key Progress
  // This is optimized for fast initial load and can be combined with a separate heavy-data loader.
  async getAllProgressImagesMetadata(startDate?: string, endDate?: string, projectIds?: string[], limit?: number, offset?: number) {
    try {
      // IMPORTANT: If projectIds are provided, resolve allowed equipment IDs for those projects first
      // and restrict the metadata query to those equipment_ids.
      let allowedEquipmentIds: string[] | null = null;
      if (projectIds && projectIds.length > 0) {
        try {
          const projectIdsString = projectIds.join(',');
          const equipmentForProjects = await api.get(
            `/equipment?project_id=in.(${projectIdsString})&select=id,project_id&limit=10000`,
            { timeout: 15000 }
          );
          const eqArray = Array.isArray(equipmentForProjects.data) ? equipmentForProjects.data : [];
          allowedEquipmentIds = [...new Set(eqArray.map((eq: any) => eq.id).filter(Boolean))];

          // If there is no equipment for these projects, there can be no progress images
          if (allowedEquipmentIds.length === 0) {
            return [];
          }
        } catch (equipmentFilterError) {
          console.warn('⚠️ Error resolving equipment IDs for project filter in getAllProgressImagesMetadata (non-fatal):', equipmentFilterError);
          // Fallback: behave as before without equipment_id filter
          allowedEquipmentIds = null;
        }
      }

      const pageLimit = limit || 200;
      const pageOffset = offset || 0;
      // NOTE: We intentionally do NOT select image_url or audio_data here to keep payload light.
      let url = `/equipment_progress_images?select=id,equipment_id,description,uploaded_by,upload_date,created_at&order=created_at.desc&limit=${pageLimit}&offset=${pageOffset}`;
      if (startDate) {
        url += `&created_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&created_at=lte.${endDate}`;
      }
      if (allowedEquipmentIds && allowedEquipmentIds.length > 0) {
        const eqIdsString = allowedEquipmentIds.join(',');
        url += `&equipment_id=in.(${eqIdsString})`;
      }

      // Basic metadata fetch with retries on timeout (same pattern as full images API)
      let response;
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          response = await api.get(url, { timeout: 20000 });
          break;
        } catch (error: any) {
          if (error?.code === 'ECONNABORTED' || error?.response?.data?.code === '57014' || error?.response?.status === 500) {
            retries++;
            if (retries > maxRetries) {
              console.error('❌ Error fetching progress images metadata: Query timeout after retries', error);
              return [];
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }
          throw error;
        }
      }

      const images = Array.isArray(response?.data) ? response.data : [];

      // Attach equipment and project data (same pattern as full images API, but still metadata-only)
      if (images.length > 0) {
        const equipmentIds = [...new Set(images.map((img: any) => img.equipment_id).filter(Boolean))];

        const equipmentMap: Record<string, any> = {};
        const batchSize = 50;
        for (let i = 0; i < equipmentIds.length; i += batchSize) {
          const batch = equipmentIds.slice(i, i + batchSize);
          try {
            const equipmentResponse = await api.get(
              `/equipment?id=in.(${batch.join(',')})&select=id,tag_number,type,name,project_id&limit=${batchSize}`,
              { timeout: 15000 }
            ).catch(() => ({ data: [] }));

            (equipmentResponse.data || []).forEach((eq: any) => {
              equipmentMap[eq.id] = eq;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching equipment batch for metadata (non-fatal):', error);
          }
        }

        const projectIds = [...new Set(Object.values(equipmentMap).map((eq: any) => eq.project_id).filter(Boolean))];
        const projectMap: Record<string, any> = {};
        if (projectIds.length > 0) {
          try {
            const projectResponse = await api.get(
              `/projects?id=in.(${projectIds.join(',')})&select=id,name&limit=100`,
              { timeout: 10000 }
            ).catch(() => ({ data: [] }));

            (projectResponse.data || []).forEach((proj: any) => {
              projectMap[proj.id] = proj;
            });
          } catch (error) {
            console.warn('⚠️ Error fetching projects for metadata (non-fatal):', error);
          }
        }

        images.forEach((img: any) => {
          const equipment = equipmentMap[img.equipment_id];
          img.equipment = equipment ? {
            ...equipment,
            projects: equipment.project_id ? projectMap[equipment.project_id] : null
          } : null;
        });
      }

      // Resolve uploaded_by user info (if it's a UUID). Same logic as full images API, but metadata-only.
      const uploadedByValues = images.map((img: any) => img.uploaded_by).filter(Boolean);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const userIds = [...new Set(uploadedByValues.filter((val: string) => uuidPattern.test(val)))];
      let usersMap: Record<string, any> = {};

      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`, { timeout: 10000 });
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for metadata:', userError);
        }
      }

      // Map to the same lightweight shape used by CompanyHighlights, but WITHOUT image/audio blobs
      return images.map((img: any) => {
        const uploadedBy = img.uploaded_by;
        const isUuid = uploadedBy && uuidPattern.test(uploadedBy);
        const userInfo = isUuid && uploadedBy ? usersMap[uploadedBy] : null;

        return {
          id: img.id,
          // No image_url or audio_data here on purpose (metadata-only)
          description: img.description,
          image_description: img.description,
          created_at: img.created_at || img.upload_date,
          uploadDate: img.upload_date || img.created_at,
          upload_date: img.upload_date || img.created_at,
          uploaded_by: uploadedBy,
          created_by: uploadedBy,
          created_by_user: userInfo || (uploadedBy && !isUuid ? { full_name: uploadedBy } : null),
          entry_type: 'progress_image',
          equipment: img.equipment || {
            id: img.equipment_id,
            tag_number: 'N/A',
            type: 'Equipment',
            project_id: null
          }
        };
      });
    } catch (error: any) {
      console.error('❌ Error fetching progress images metadata:', error);
      return [];
    }
  },

  // Get all VDCR documents with approval status (for company highlights)
  async getAllVDCRDocuments(startDate?: string, endDate?: string, projectIds?: string[]) {
    try {
      // Query vdcr_records directly to get status changes (not vdcr_documents)
      // Status changes are tracked in vdcr_records.updated_at
      let url = `/vdcr_records?select=id,project_id,status,updated_at,document_name,equipment_tag_numbers,updated_by,projects:project_id(id,name),updated_by_user:updated_by(full_name,email)&order=updated_at.desc`;
      if (startDate) {
        url += `&updated_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&updated_at=lte.${endDate}`;
      }
      // Filter by project IDs if provided
      if (projectIds && projectIds.length > 0) {
        const projectIdsString = projectIds.join(',');
        url += `&project_id=in.(${projectIdsString})`;
      }
      const response = await api.get(url);
      // Transform the data to match component expectations
      const records = Array.isArray(response.data) ? response.data : [];
      return records.map((record: any) => ({
        id: record.id,
        document_name: record.document_name || 'Document',
        equipment_ids: record.equipment_tag_numbers?.join(', ') || 'N/A',
        vdcr_records: {
          ...record,
          projects: record.projects
        },
        approved_by: record.updated_by_user?.full_name || record.status || 'Pending',
        created_at: record.updated_at, // Use updated_at as created_at for display
        updated_at: record.updated_at
      }));
    } catch (error: any) {
      console.error('❌ Error fetching all VDCR documents:', error);
      return [];
    }
  },

  // Get all equipment nearing completion (for manufacturing timeline)
  // Note: For timeline, we fetch ALL equipment sorted by days remaining (no date filtering)
  // Uses po_cdd (PO-CDD) field instead of completion_date
  async getAllEquipmentNearingCompletion(startDate?: string, endDate?: string, projectIds?: string[]) {
    try {
      // Fetch all equipment with po_cdd dates (including nulls, we'll filter in component)
      // Include project status to filter out completed projects
      let url = `/equipment?select=id,tag_number,type,name,manufacturing_serial,any_personal_title,progress,po_cdd,next_milestone,next_milestone_date,project_id,projects(id,name,status)&order=po_cdd.asc.nullsfirst`;
      // Only apply date filters if both are provided (for other use cases)
      // For timeline view, we don't pass dates, so it fetches all equipment
      if (startDate && endDate) {
        url += `&po_cdd=gte.${startDate}&po_cdd=lte.${endDate}`;
      }
      // Filter by project IDs if provided
      if (projectIds && projectIds.length > 0) {
        const projectIdsString = projectIds.join(',');
        url += `&project_id=in.(${projectIdsString})`;
      }
      const response = await api.get(url);
      return response.data || [];
    } catch (error: any) {
      console.error('❌ Error fetching equipment nearing completion:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      return [];
    }
  },

  // Get all equipment activities by project (creation, updates, progress entries)
  async getEquipmentProgressEntriesByProject(projectId: string) {
    try {
      // // console.log('📋 Fetching all equipment activities for project:', projectId);
      const response = await api.get(`/equipment?project_id=eq.${projectId}&select=id,tag_number,type,status,progress_entries,created_at,updated_at,created_by,updated_by,created_by_user:created_by(full_name,email),updated_by_user:updated_by(full_name,email)&order=updated_at.desc`);
      // // console.log('✅ Equipment data fetched successfully:', response.data);
      
      // Transform equipment data to comprehensive activity format
      const allActivities: any[] = [];
      
      (response.data as any[]).forEach((equipment: any) => {
        // Add equipment creation activity
        allActivities.push({
          id: `equipment-created-${equipment.id}`,
          activity_type: 'equipment_created',
          equipment_id: equipment.id,
          entry_text: `Equipment "${equipment.type}" (${equipment.tag_number}) was created`,
          entry_type: 'creation',
          created_by: equipment.created_by || 'System',
          created_at: equipment.created_at,
          equipment: {
            id: equipment.id,
            tag_number: equipment.tag_number,
            type: equipment.type,
            status: equipment.status
          },
          created_by_user: {
            full_name: equipment.created_by_user?.full_name || 'System',
            email: equipment.created_by_user?.email || ''
          }
        });

        // Add equipment update activity (if updated_at is different from created_at)
        if (equipment.updated_at && equipment.updated_at !== equipment.created_at) {
          allActivities.push({
            id: `equipment-updated-${equipment.id}`,
            activity_type: 'equipment_updated',
            equipment_id: equipment.id,
            entry_text: `Equipment "${equipment.type}" (${equipment.tag_number}) was updated`,
            entry_type: 'update',
            created_by: equipment.updated_by || 'System',
            created_at: equipment.updated_at,
            equipment: {
              id: equipment.id,
              tag_number: equipment.tag_number,
              type: equipment.type,
              status: equipment.status
            },
            created_by_user: {
              full_name: equipment.updated_by_user?.full_name || 'System',
              email: equipment.updated_by_user?.email || ''
            }
          });
        }

        // Add progress entries activities
        if (equipment.progress_entries && Array.isArray(equipment.progress_entries)) {
          equipment.progress_entries.forEach((entry: any) => {
            allActivities.push({
              id: entry.id,
              activity_type: 'progress_entry',
              equipment_id: equipment.id,
              entry_text: entry.comment,
              entry_type: entry.type,
              created_by: entry.uploadedBy,
              created_at: entry.uploadDate,
              equipment: {
                id: equipment.id,
                tag_number: equipment.tag_number,
                type: equipment.type,
                status: equipment.status
              },
              created_by_user: {
                full_name: entry.uploadedBy,
                email: ''
              }
            });
          });
        }
      });
      
      // Sort by created_at descending (newest first)
      allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // // console.log('✅ All equipment activities transformed successfully:', allActivities);
      return allActivities;
    } catch (error: any) {
      console.error('❌ Error fetching equipment activities:', error);
      return [];
    }
  },

  // Assign manager to project (Firm Admin assigns Project Manager or VDCR Manager)
  async assignManagerToProject(data: {
    user_id: string;
    project_id: string;
    role: 'project_manager' | 'vdcr_manager';
    assigned_by: string;
  }) {
    try {
      // // console.log('🔧 Assigning manager to project:', data);
      
      // Get user details first (need email for project_members table)
      const userResponse = await api.get(`/users?id=eq.${data.user_id}&select=email,full_name`);
      const user = userResponse.data[0];
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // First, remove any existing assignment for this user+project+role combination (use email, not user_id)
      await api.delete(`/project_members?email=eq.${user.email}&project_id=eq.${data.project_id}&role=eq.${data.role}`).catch(() => {
        // Ignore if no existing assignment
      });
      
      // Create new assignment in project_members (table uses email, not user_id)
      const memberResponse = await api.post('/project_members', {
        project_id: data.project_id,
        name: user.full_name,
        email: user.email,
        role: data.role,
        access_level: data.role,
        status: 'active',
        assigned_by: data.assigned_by
      });

      // // console.log('✅ Manager assigned to project successfully:', memberResponse.data);
      return memberResponse.data;
    } catch (error: any) {
      console.error('❌ Error assigning manager to project:', error);
      throw new Error(error.response?.data?.message || 'Failed to assign manager to project');
    }
  },

  // Remove manager from project
  async removeManagerFromProject(data: {
    user_id: string;
    project_id: string;
    role: 'project_manager' | 'vdcr_manager';
  }) {
    try {
      // // console.log('🗑️ Removing manager from project:', data);
      
      // Get user email first (project_members table uses email, not user_id)
      const userResponse = await api.get(`/users?id=eq.${data.user_id}&select=email`);
      const user = userResponse.data[0];
      
      if (!user || !user.email) {
        throw new Error('User email not found');
      }
      
      const response = await api.delete(`/project_members?email=eq.${user.email}&project_id=eq.${data.project_id}&role=eq.${data.role}`);
      
      // // console.log('✅ Manager removed from project successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error removing manager from project:', error);
      throw new Error(error.response?.data?.message || 'Failed to remove manager from project');
    }
  },

  // Get managers assigned to a project
  async getProjectManagers(projectId: string) {
    try {
      // // console.log('👥 Fetching project managers for project:', projectId);
      
      const response = await api.get(`/project_members?project_id=eq.${projectId}&role=in.(project_manager,vdcr_manager)&select=*`);
      
      // // console.log('✅ Project managers fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching project managers:', error);
      return [];
    }
  },

  // =====================================================
  // VDCR RECORDS API FUNCTIONS
  // =====================================================

  // Create VDCR record
  async createVDCRRecord(vdcrData: any) {
    try {
      // // console.log('📋 Creating VDCR record:', vdcrData);
      const response = await api.post('/vdcr_records', vdcrData);
      // // console.log('✅ VDCR record created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating VDCR record:', error);
      throw error;
    }
  },

  /**
   * Documentation tab Excel bulk upload: one RPC replaces N POST /vdcr_records + N syncVDCRToEquipment.
   * Returns { records: any[], count: number } (same row shape as vdcr_records). Requires migration `bulk_upload_vdcr_documentation`.
   * Falls back to per-row create in ProjectsVDCR if RPC is not deployed (404).
   */
  async bulkUploadVdcrDocumentation(rows: any[]): Promise<{ records: any[]; count: number }> {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { records: [], count: 0 };
    }
    try {
      const response = await api.post('/rpc/bulk_upload_vdcr_documentation', { p_rows: rows }, { timeout: 120000 });
      const data = response.data;
      if (data == null) {
        return { records: [], count: 0 };
      }
      if (typeof data === 'object' && data !== null && 'records' in data) {
        const rec = (data as any).records;
        const recordsArr = Array.isArray(rec)
          ? rec
          : typeof rec === 'string'
            ? (() => {
                try {
                  return JSON.parse(rec);
                } catch {
                  return [];
                }
              })()
            : [];
        const count = typeof (data as any).count === 'number' ? (data as any).count : recordsArr.length;
        return { records: recordsArr, count };
      }
      return { records: [], count: 0 };
    } catch (error: any) {
      console.error('❌ Error bulkUploadVdcrDocumentation:', error);
      throw error;
    }
  },

  // Get VDCR records by project
  async getVDCRRecordsByProject(projectId: string) {
    try {
      // // console.log('📋 Fetching VDCR records for project:', projectId);
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&select=*,updated_by_user:updated_by(full_name,email)&order=created_at.desc`);
      // // console.log('✅ VDCR records fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR records:', error);
      return [];
    }
  },

  /** Get unique department names for a project (from VDCR/Documentation tab). Used in Mark Complete dropdown and docs by department. */
  async getProjectDepartments(projectId: string): Promise<string[]> {
    try {
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&select=department`);
      const records = Array.isArray(response.data) ? response.data : [];
      const set = new Set<string>();
      for (const r of records) {
        const d = (r as { department?: string | null }).department;
        if (d != null && String(d).trim()) set.add(String(d).trim());
      }
      return Array.from(set).sort();
    } catch (err) {
      console.warn('⚠️ getProjectDepartments failed:', err);
      return [];
    }
  },

  /** Get unique department names for a firm (from project_members across all firm projects). */
  async getFirmDepartments(firmId: string): Promise<string[]> {
    if (!firmId) return [];
    try {
      const projectsResponse = await api.get(`/projects?firm_id=eq.${firmId}&select=id`);
      const projectIds = (Array.isArray(projectsResponse.data) ? projectsResponse.data : []).map((p: any) => p.id).filter(Boolean);
      if (projectIds.length === 0) return [];

      const membersResponse = await api.get(`/project_members?project_id=in.(${projectIds.join(',')})&select=department`);
      const members = Array.isArray(membersResponse.data) ? membersResponse.data : [];
      const set = new Set<string>();
      for (const m of members) {
        const d = (m as { department?: string | null }).department;
        if (d != null && String(d).trim()) set.add(String(d).trim());
      }
      return Array.from(set).sort();
    } catch (err) {
      console.warn('⚠️ getFirmDepartments failed:', err);
      return [];
    }
  },

  /** Get departments for Production & Pre-Dispatch checklist: VDCR + distinct department from checklist tasks (not QAP). If checklist table is missing (404), returns VDCR only. */
  async getChecklistDepartments(projectId: string): Promise<string[]> {
    const set = new Set<string>();
    try {
      const vdcrDepts = await this.getProjectDepartments(projectId);
      vdcrDepts.forEach((d) => set.add(d));
    } catch (err) {
      console.warn('⚠️ getChecklistDepartments (VDCR) failed:', err);
    }
    try {
      const eqRes = await api.get(`/equipment?project_id=eq.${projectId}&select=id`);
      const equipmentIds = (Array.isArray(eqRes.data) ? eqRes.data : []).map((e: any) => e.id);
      if (equipmentIds.length > 0) {
        const BATCH = 50;
        for (let i = 0; i < equipmentIds.length; i += BATCH) {
          const chunk = equipmentIds.slice(i, i + BATCH);
          const taskRes = await api.get(
            `/equipment_production_checklist_tasks?equipment_id=in.(${chunk.join(',')})&select=department`
          );
          const rows = Array.isArray(taskRes.data) ? taskRes.data : [];
          for (const row of rows) {
            const d = (row as { department?: string | null }).department;
            if (d != null && String(d).trim()) set.add(String(d).trim());
          }
        }
      }
    } catch (err) {
      // Checklist table may not exist yet (migration not run); keep VDCR departments only
      if (err && typeof err === 'object' && (err as any)?.response?.status !== 404) {
        console.warn('⚠️ getChecklistDepartments (checklist tasks) failed:', err);
      }
    }
    return Array.from(set).sort();
  },

  // ============================================================================
  // PRODUCTION & PRE-DISPATCH CHECKLIST (separate from QAP; own tables)
  // ============================================================================

  async getEquipmentProductionChecklistTasks(equipmentId: string) {
    try {
      const select = '*,created_by_user:created_by(full_name,email)';
      const res = await api.get(`/equipment_production_checklist_tasks?equipment_id=eq.${equipmentId}&select=${select}&order=sort_order.asc,created_at.asc`);
      const tasks: any[] = Array.isArray(res.data) ? res.data : [];
      if (tasks.length === 0) return [];
      const taskIds = tasks.map((t: any) => t.id).join(',');
      const compSelect = 'id,task_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
      const compRes = await api.get(`/equipment_production_checklist_task_completions?task_id=in.(${taskIds})&select=${compSelect}`);
      const completions: any[] = Array.isArray(compRes.data) ? compRes.data : [];
      const byTaskId: Record<string, any> = {};
      completions.forEach((c) => { byTaskId[c.task_id] = c; });
      return tasks.map((t: any) => ({ ...t, completion: byTaskId[t.id] || null }));
    } catch (err) {
      console.error('❌ getEquipmentProductionChecklistTasks:', err);
      throw err;
    }
  },

  async getStandaloneEquipmentProductionChecklistTasks(equipmentId: string) {
    try {
      const select = '*,created_by_user:created_by(full_name,email)';
      const res = await api.get(`/standalone_equipment_production_checklist_tasks?equipment_id=eq.${equipmentId}&select=${select}&order=sort_order.asc,created_at.asc`);
      const tasks: any[] = Array.isArray(res.data) ? res.data : [];
      if (tasks.length === 0) return [];
      const taskIds = tasks.map((t: any) => t.id).join(',');
      const compSelect = 'id,task_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,updated_by_user:updated_by(full_name),image_count,inspection_report_count,department';
      const compRes = await api.get(`/standalone_equipment_production_checklist_task_completions?task_id=in.(${taskIds})&select=${compSelect}`);
      const completions: any[] = Array.isArray(compRes.data) ? compRes.data : [];
      const byTaskId: Record<string, any> = {};
      completions.forEach((c) => { byTaskId[c.task_id] = c; });
      return tasks.map((t: any) => ({ ...t, completion: byTaskId[t.id] || null }));
    } catch (err) {
      console.error('❌ getStandaloneEquipmentProductionChecklistTasks:', err);
      throw err;
    }
  },

  /** Batch fetch checklist tasks for many equipment IDs. Returns Record<equipmentId, tasksWithCompletion[]>. */
  async getEquipmentProductionChecklistTasksBatch(equipmentIds: string[], isStandalone: boolean): Promise<Record<string, any[]>> {
    if (!equipmentIds?.length) return {};
    const dedupeKey = `${isStandalone ? 's' : 'p'}:${batchDedupeKey(equipmentIds)}`;
    const inflight = productionChecklistTasksBatchInFlight.get(dedupeKey);
    if (inflight) return await inflight;

    const loadPromise = (async (): Promise<Record<string, any[]>> => {
      const table = isStandalone ? 'standalone_equipment_production_checklist_tasks' : 'equipment_production_checklist_tasks';
      const compTable = isStandalone ? 'standalone_equipment_production_checklist_task_completions' : 'equipment_production_checklist_task_completions';
      try {
        const all: any[] = [];
        const BATCH = 40;
        const taskSelect = '*,created_by_user:created_by(full_name,email)';
        for (let i = 0; i < equipmentIds.length; i += BATCH) {
          const chunk = equipmentIds.slice(i, i + BATCH);
          const res = await api.get(`/${table}?equipment_id=in.(${chunk.join(',')})&select=${taskSelect}&order=sort_order.asc,created_at.asc`);
          const rows = Array.isArray(res.data) ? res.data : [];
          all.push(...rows);
        }
        if (all.length === 0) {
          return Object.fromEntries(equipmentIds.map((id) => [id, []]));
        }
        const taskIds = [...new Set(all.map((t: any) => t.id))];
        const compSelect = 'id,task_id,completed_on,completed_by_user_id,completed_by_display_name,notes,updated_on,updated_by,image_count,inspection_report_count,department';
        let completions: any[] = [];
        for (const idChunk of chunkIdsForInClause(taskIds)) {
          const compRes = await api.get(`/${compTable}?task_id=in.(${idChunk.join(',')})&select=${compSelect}`);
          completions.push(...(Array.isArray(compRes.data) ? compRes.data : []));
        }
        const byTaskId: Record<string, any> = {};
        completions.forEach((c) => { byTaskId[c.task_id] = c; });
        const withComp = all.map((t: any) => ({ ...t, completion: byTaskId[t.id] || null }));
        const result: Record<string, any[]> = {};
        equipmentIds.forEach((id) => { result[id] = []; });
        withComp.forEach((t: any) => {
          if (t.equipment_id) (result[t.equipment_id] = result[t.equipment_id] || []).push(t);
        });
        return result;
      } catch (err) {
        console.warn('⚠️ getEquipmentProductionChecklistTasksBatch failed:', err);
        return Object.fromEntries(equipmentIds.map((id) => [id, []]));
      }
    })();

    productionChecklistTasksBatchInFlight.set(dedupeKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      productionChecklistTasksBatchInFlight.delete(dedupeKey);
    }
  },

  /** Create a single checklist task (fast path for "Add task"; avoids merge which does 1 PATCH per existing task). */
  async createEquipmentProductionChecklistTask(equipmentId: string, task: {
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }) {
    const res = await api.post('/equipment_production_checklist_tasks', {
      equipment_id: equipmentId,
      task_title: task.task_title,
      task_detail: task.task_detail ?? null,
      department: task.department ?? null,
      assigned_to: task.assigned_to ?? null,
      reference_document_url: task.reference_document_url ?? null,
      reference_document_name: task.reference_document_name ?? null,
      reference_image_url: task.reference_image_url ?? null,
      sort_order: task.sort_order,
      created_by: task.created_by ?? null,
    }, { headers: { Prefer: 'return=representation' } });
    return Array.isArray(res.data) ? res.data[0] : res.data;
  },

  async deleteEquipmentProductionChecklistTask(taskId: string) {
    await api.delete(`/equipment_production_checklist_tasks?id=eq.${taskId}`);
  },

  async createStandaloneEquipmentProductionChecklistTask(equipmentId: string, task: {
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }) {
    const res = await api.post('/standalone_equipment_production_checklist_tasks', {
      equipment_id: equipmentId,
      task_title: task.task_title,
      task_detail: task.task_detail ?? null,
      department: task.department ?? null,
      assigned_to: task.assigned_to ?? null,
      reference_document_url: task.reference_document_url ?? null,
      reference_document_name: task.reference_document_name ?? null,
      reference_image_url: task.reference_image_url ?? null,
      sort_order: task.sort_order,
      created_by: task.created_by ?? null,
    }, { headers: { Prefer: 'return=representation' } });
    return Array.isArray(res.data) ? res.data[0] : res.data;
  },

  async deleteStandaloneEquipmentProductionChecklistTask(taskId: string) {
    await api.delete(`/standalone_equipment_production_checklist_tasks?id=eq.${taskId}`);
  },

  async updateEquipmentProductionChecklistTask(taskId: string, payload: {
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }) {
    await api.patch(`/equipment_production_checklist_tasks?id=eq.${taskId}`, payload);
  },

  async updateStandaloneEquipmentProductionChecklistTask(taskId: string, payload: {
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }) {
    await api.patch(`/standalone_equipment_production_checklist_tasks?id=eq.${taskId}`, payload);
  },

  async updateEquipmentProductionChecklistTasksMerge(equipmentId: string, tasks: Array<{
    id?: string;
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }>) {
    const selectFields = 'id,task_title,task_detail,department,assigned_to,reference_document_url,reference_document_name,reference_image_url,sort_order,created_by';
    const currentRes = await api.get(`/equipment_production_checklist_tasks?equipment_id=eq.${equipmentId}&select=${selectFields}`);
    const current: any[] = Array.isArray(currentRes.data) ? currentRes.data : [];
    const currentById: Record<string, any> = {};
    current.forEach((c) => {
      currentById[c.id] = c;
    });
    const keepIds = (tasks || []).filter((t) => t.id && !String(t.id).startsWith('new-')).map((t) => t.id as string);
    for (const t of tasks || []) {
      const body = {
        task_title: t.task_title,
        task_detail: t.task_detail ?? null,
        department: t.department ?? null,
        assigned_to: t.assigned_to ?? null,
        reference_document_url: t.reference_document_url ?? null,
        reference_document_name: t.reference_document_name ?? null,
        reference_image_url: t.reference_image_url ?? null,
        sort_order: t.sort_order,
        created_by: t.created_by ?? null,
      };
      if (t.id && !String(t.id).startsWith('new-')) {
        const prev = currentById[t.id];
        if (prev && productionChecklistMergeTaskUnchanged(prev, body)) {
          continue;
        }
        await api.patch(`/equipment_production_checklist_tasks?id=eq.${t.id}`, body);
      } else {
        await api.post('/equipment_production_checklist_tasks', { equipment_id: equipmentId, ...body }, { headers: { Prefer: 'return=representation' } });
      }
    }
    for (const c of current) {
      if (!keepIds.includes(c.id)) await api.delete(`/equipment_production_checklist_tasks?id=eq.${c.id}`);
    }
    return this.getEquipmentProductionChecklistTasks(equipmentId);
  },

  async updateStandaloneEquipmentProductionChecklistTasksMerge(equipmentId: string, tasks: Array<{
    id?: string;
    task_title: string;
    task_detail?: string | null;
    department?: string | null;
    assigned_to?: string | null;
    reference_document_url?: string | null;
    reference_document_name?: string | null;
    reference_image_url?: string | null;
    sort_order: number;
    created_by?: string | null;
  }>) {
    const selectFields = 'id,task_title,task_detail,department,assigned_to,reference_document_url,reference_document_name,reference_image_url,sort_order,created_by';
    const currentRes = await api.get(`/standalone_equipment_production_checklist_tasks?equipment_id=eq.${equipmentId}&select=${selectFields}`);
    const current: any[] = Array.isArray(currentRes.data) ? currentRes.data : [];
    const currentById: Record<string, any> = {};
    current.forEach((c) => {
      currentById[c.id] = c;
    });
    const keepIds = (tasks || []).filter((t) => t.id && !String(t.id).startsWith('new-')).map((t) => t.id as string);
    for (const t of tasks || []) {
      const body = {
        task_title: t.task_title,
        task_detail: t.task_detail ?? null,
        department: t.department ?? null,
        assigned_to: t.assigned_to ?? null,
        reference_document_url: t.reference_document_url ?? null,
        reference_document_name: t.reference_document_name ?? null,
        reference_image_url: t.reference_image_url ?? null,
        sort_order: t.sort_order,
        created_by: t.created_by ?? null,
      };
      if (t.id && !String(t.id).startsWith('new-')) {
        const prev = currentById[t.id];
        if (prev && productionChecklistMergeTaskUnchanged(prev, body)) {
          continue;
        }
        await api.patch(`/standalone_equipment_production_checklist_tasks?id=eq.${t.id}`, body);
      } else {
        await api.post('/standalone_equipment_production_checklist_tasks', { equipment_id: equipmentId, ...body }, { headers: { Prefer: 'return=representation' } });
      }
    }
    for (const c of current) {
      if (!keepIds.includes(c.id)) await api.delete(`/standalone_equipment_production_checklist_tasks?id=eq.${c.id}`);
    }
    return this.getStandaloneEquipmentProductionChecklistTasks(equipmentId);
  },

  async createEquipmentProductionChecklistTaskCompletion(taskId: string, data: {
    completed_on: string;
    completed_by_user_id?: string | null;
    completed_by_display_name?: string | null;
    notes?: string | null;
    department?: string | null;
    image_urls?: string[];
    inspection_report_urls?: string[];
    inspection_report_names?: (string | null)[];
    updated_by?: string | null;
  }, isStandalone: boolean) {
    const imageUrls = (data.image_urls && data.image_urls.length > 0) ? data.image_urls : [];
    const reportUrls = data.inspection_report_urls ?? [];
    const reportNames = data.inspection_report_names ?? reportUrls.map(() => null);
    const compTable = isStandalone ? 'standalone_equipment_production_checklist_task_completions' : 'equipment_production_checklist_task_completions';
    const imgTable = isStandalone ? 'standalone_equipment_production_checklist_completion_images' : 'equipment_production_checklist_completion_images';
    const repTable = isStandalone ? 'standalone_equipment_production_checklist_completion_reports' : 'equipment_production_checklist_completion_reports';
    const res = await api.post(`/${compTable}`, {
      task_id: taskId,
      completed_on: data.completed_on,
      completed_by_user_id: data.completed_by_user_id ?? null,
      completed_by_display_name: data.completed_by_display_name ?? null,
      notes: data.notes ?? null,
      department: data.department ?? null,
      image_url: imageUrls[0] ?? null,
      image_count: imageUrls.length,
      inspection_report_count: reportUrls.length,
      updated_by: data.updated_by ?? null,
    }, { headers: { Prefer: 'return=representation' } });
    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    const completionId = created?.id;
    if (completionId && imageUrls.length > 0) {
      for (let i = 0; i < imageUrls.length; i++) {
        await api.post(`/${imgTable}`, { completion_id: completionId, sort_order: i, image_url: imageUrls[i] ?? null });
      }
    }
    if (completionId && reportUrls.length > 0) {
      for (let i = 0; i < reportUrls.length; i++) {
        await api.post(`/${repTable}`, { completion_id: completionId, sort_order: i, report_url: reportUrls[i] ?? null, file_name: reportNames[i] ?? null });
      }
    }
    return res.data;
  },

  /** All completion images in one query (replaces N× getEquipmentProductionChecklistCompletionImageUrl). */
  async getEquipmentProductionChecklistCompletionImageUrls(completionId: string, isStandalone: boolean): Promise<string[]> {
    try {
      const imgTable = isStandalone ? 'standalone_equipment_production_checklist_completion_images' : 'equipment_production_checklist_completion_images';
      const res = await api.get(`/${imgTable}?completion_id=eq.${completionId}&order=sort_order.asc&select=image_url`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const urls = rows.map((r: any) => r.image_url).filter((u: unknown) => u != null && String(u).trim() !== '');
      if (urls.length > 0) return urls as string[];
      const compTable = isStandalone ? 'standalone_equipment_production_checklist_task_completions' : 'equipment_production_checklist_task_completions';
      const compRes = await api.get(`/${compTable}?id=eq.${completionId}&select=image_url`);
      const comp = Array.isArray(compRes.data) ? compRes.data[0] : compRes.data;
      if (comp?.image_url) return [comp.image_url];
      return [];
    } catch (err) {
      console.warn('⚠️ getEquipmentProductionChecklistCompletionImageUrls failed:', err);
      return [];
    }
  },

  async getEquipmentProductionChecklistCompletionImageUrl(completionId: string, index: number, isStandalone: boolean): Promise<string | null> {
    try {
      const imgTable = isStandalone ? 'standalone_equipment_production_checklist_completion_images' : 'equipment_production_checklist_completion_images';
      const res = await api.get(`/${imgTable}?completion_id=eq.${completionId}&order=sort_order.asc&offset=${index}&limit=1&select=image_url`);
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row?.image_url) return row.image_url;
      if (index === 0) {
        const compTable = isStandalone ? 'standalone_equipment_production_checklist_task_completions' : 'equipment_production_checklist_task_completions';
        const compRes = await api.get(`/${compTable}?id=eq.${completionId}&select=image_url`);
        const comp = Array.isArray(compRes.data) ? compRes.data[0] : compRes.data;
        return comp?.image_url ?? null;
      }
      return null;
    } catch (err) {
      console.warn('⚠️ getEquipmentProductionChecklistCompletionImageUrl failed:', err);
      return null;
    }
  },

  async getEquipmentProductionChecklistCompletionReports(completionId: string, isStandalone: boolean): Promise<Array<{ report_url: string | null; file_name: string | null; sort_order: number }>> {
    try {
      const repTable = isStandalone ? 'standalone_equipment_production_checklist_completion_reports' : 'equipment_production_checklist_completion_reports';
      const res = await api.get(`/${repTable}?completion_id=eq.${completionId}&order=sort_order.asc&select=report_url,file_name,sort_order`);
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.warn('⚠️ getEquipmentProductionChecklistCompletionReports failed:', err);
      return [];
    }
  },

  // Get VDCR records by status
  async getVDCRRecordsByStatus(projectId: string, status: string) {
    try {
      // // console.log('📋 Fetching VDCR records by status:', { projectId, status });
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&status=eq.${status}&select=*&order=created_at.desc`);
      // // console.log('✅ VDCR records by status fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR records by status:', error);
      return [];
    }
  },

  // Update VDCR record
  async updateVDCRRecord(vdcrId: string, updateData: any) {
    try {
      // // console.log('📋 Updating VDCR record:', { vdcrId, updateData });
      const response = await api.patch(`/vdcr_records?id=eq.${vdcrId}`, updateData);
      // // console.log('✅ VDCR record updated successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating VDCR record:', error);
      throw error;
    }
  },

  // Renumber VDCR records to have continuous SR numbers
  async renumberVDCRRecords(projectId: string) {
    try {
      console.log('🔄 Renumbering VDCR records for project:', projectId);
      
      // Get all VDCR records for the project
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&select=id,sr_no&order=sr_no.asc`);
      const records = Array.isArray(response.data) ? response.data : [];
      
      if (records.length === 0) {
        console.log('ℹ️ No VDCR records to renumber');
        return;
      }
      
      // Sort records by SR number (extract numeric value for proper sorting)
      const sortedRecords = [...records].sort((a, b) => {
        const srNoA = parseInt(String(a.sr_no).replace(/[^0-9]/g, '')) || 0;
        const srNoB = parseInt(String(b.sr_no).replace(/[^0-9]/g, '')) || 0;
        return srNoA - srNoB;
      });
      
      // Renumber sequentially starting from 1
      for (let i = 0; i < sortedRecords.length; i++) {
        const newSrNo = String(i + 1).padStart(3, '0'); // Format as 001, 002, 003, etc.
        const record = sortedRecords[i];
        
        // Only update if SR number has changed
        if (record.sr_no !== newSrNo) {
          try {
            await api.patch(`/vdcr_records?id=eq.${record.id}`, {
              sr_no: newSrNo
            });
            console.log(`✅ Renumbered record ${record.id}: ${record.sr_no} → ${newSrNo}`);
          } catch (updateError) {
            console.error(`⚠️ Error updating SR number for record ${record.id}:`, updateError);
            // Continue with other records even if one fails
          }
        }
      }
      
      console.log(`✅ Successfully renumbered ${sortedRecords.length} VDCR records`);
    } catch (error: any) {
      console.error('❌ Error renumbering VDCR records:', error);
      throw error;
    }
  },

  // Fetch VDCR records for a project with lightweight fields for weighting (sr_no, name, code_status)
  async getProjectVdcrDocsForWeighting(projectId: string) {
    try {
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&select=id,sr_no,document_name,code_status&order=sr_no.asc`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error('❌ Error fetching VDCR docs for weighting:', error);
      throw error;
    }
  },

  // Fetch existing per-project equipment weights for manufacturing
  async getProjectEquipmentWeights(projectId: string) {
    try {
      if (!projectId) return {};
      const response = await api.get(
        `/project_equipment_weights?project_id=eq.${projectId}&select=equipment_id,weight_pct`
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      const out: Record<string, number> = {};
      for (const row of rows) {
        if (row && row.equipment_id) {
          out[String(row.equipment_id)] = Number(row.weight_pct) || 0;
        }
      }
      return out;
    } catch (error: any) {
      console.error('❌ Error fetching project equipment weights:', error);
      throw error;
    }
  },

  // Fetch existing per-project VDCR weights
  async getProjectVdcrWeights(projectId: string) {
    try {
      const response = await api.get(`/project_vdcr_weights?project_id=eq.${projectId}&select=vdcr_record_id,weight_pct`);
      const rows = Array.isArray(response.data) ? response.data : [];
      const out: Record<string, number> = {};
      for (const row of rows) {
        if (row && row.vdcr_record_id) {
          out[String(row.vdcr_record_id)] = Number(row.weight_pct) || 0;
        }
      }
      return out;
    } catch (error: any) {
      console.error('❌ Error fetching project VDCR weights:', error);
      throw error;
    }
  },

  // Fetch per-project VDCR code completion factors (Code 1–4).
  // Backend stores factors as 0–1, but the UI works in 0–100 percentages.
  async getProjectVdcrCodeCompletionFactors(projectId: string) {
    try {
      if (!projectId) return {};
      const response = await api.get(
        `/project_vdcr_code_completion_weights?project_id=eq.${projectId}&select=code_status,completion_factor`
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      const out: Record<string, number> = {};
      for (const row of rows) {
        if (row && row.code_status != null) {
          const factor = Number(row.completion_factor);
          // Convert from 0–1 stored value to 0–100 for the UI.
          out[String(row.code_status)] = Number.isFinite(factor) ? factor * 100 : 0;
        }
      }
      return out;
    } catch (error: any) {
      console.error('❌ Error fetching project VDCR code completion factors:', error);
      throw error;
    }
  },

  // Save per-project VDCR code completion factors (Code 1–4) as 0–1 values.
  async saveProjectVdcrCodeCompletionFactors(
    projectId: string,
    factors: { code_status: string; percentage: number }[]
  ) {
    try {
      if (!projectId) return;
      const payload = (factors || []).map((f) => ({
        project_id: projectId,
        code_status: f.code_status,
        // Convert 0–100 UI percentage into 0–1 stored value with clamp for safety.
        completion_factor: Math.max(0, Math.min(100, f.percentage)) / 100,
      }));
      if (!payload.length) return;

      await api.post(
        `/project_vdcr_code_completion_weights?on_conflict=project_id,code_status`,
        payload,
        {
          headers: {
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error saving project VDCR code completion factors:', error);
      throw error;
    }
  },

  // Save per-project VDCR weights (upsert on project_id + vdcr_record_id)
  async saveProjectVdcrWeights(projectId: string, weights: { vdcr_record_id: string; weight_pct: number }[]) {
    try {
      if (!projectId) return;
      const payload = (weights || []).map((w) => ({
        project_id: projectId,
        vdcr_record_id: w.vdcr_record_id,
        weight_pct: w.weight_pct,
      }));
      if (!payload.length) {
        // No weights to save; caller may handle clearing separately if needed.
        return;
      }
      await api.post(
        `/project_vdcr_weights?on_conflict=project_id,vdcr_record_id`,
        payload,
        {
          headers: {
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error saving project VDCR weights:', error);
      throw error;
    }
  },

  // Save per-project equipment weights (upsert on project_id + equipment_id)
  async saveProjectEquipmentWeights(projectId: string, weights: { equipment_id: string; weight_pct: number }[]) {
    try {
      if (!projectId) return;
      const payload = (weights || []).map((w) => ({
        project_id: projectId,
        equipment_id: w.equipment_id,
        weight_pct: w.weight_pct,
      }));
      if (!payload.length) {
        return;
      }
      await api.post(
        `/project_equipment_weights?on_conflict=project_id,equipment_id`,
        payload,
        {
          headers: {
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error saving project equipment weights:', error);
      throw error;
    }
  },

  // Delete equipment documents when approved VDCR is deleted
  async deleteApprovedVDCRFromEquipment(vdcrId: string, equipmentTagNumbers: string[], documentName: string) {
    try {
      console.log('🔄 Deleting equipment documents for approved VDCR:', { vdcrId, equipmentTagNumbers, documentName });
      
      if (!equipmentTagNumbers || equipmentTagNumbers.length === 0) {
        console.log('ℹ️ No equipment tag numbers provided');
        return;
      }
      
      // Find equipment by tag numbers (check both equipment and standalone_equipment tables)
      const equipmentIds: string[] = [];
      
      for (const tagNumber of equipmentTagNumbers) {
        try {
          // Check project equipment
          const equipmentResponse = await api.get(`/equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const equipment = Array.isArray(equipmentResponse.data) ? equipmentResponse.data : [];
          if (equipment.length > 0) {
            equipmentIds.push(equipment[0].id);
          }
          
          // Check standalone equipment
          const standaloneResponse = await api.get(`/standalone_equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const standalone = Array.isArray(standaloneResponse.data) ? standaloneResponse.data : [];
          if (standalone.length > 0) {
            equipmentIds.push(standalone[0].id);
          }
        } catch (error) {
          console.warn(`⚠️ Error finding equipment for tag ${tagNumber}:`, error);
        }
      }
      
      if (equipmentIds.length === 0) {
        console.warn('⚠️ No equipment found for tag numbers:', equipmentTagNumbers);
        return;
      }
      
      // Delete VDCR Approved Documents for each equipment that match the document name
      for (const equipmentId of equipmentIds) {
        try {
          // Find documents with matching name and type
          const docsResponse = await api.get(
            `/equipment_documents?equipment_id=eq.${equipmentId}&document_type=eq.VDCR Approved Document&document_name=eq.${encodeURIComponent(documentName)}&select=id`
          );
          const docs = Array.isArray(docsResponse.data) ? docsResponse.data : [];
          
          // Delete each matching document
          for (const doc of docs) {
            try {
              await api.delete(`/equipment_documents?id=eq.${doc.id}`);
              console.log(`✅ Deleted VDCR Approved Document ${doc.id} from equipment ${equipmentId}`);
            } catch (deleteError) {
              console.error(`⚠️ Error deleting document ${doc.id}:`, deleteError);
            }
          }
        } catch (error: any) {
          console.error(`❌ Error deleting documents for equipment ${equipmentId}:`, error);
          // Continue with other equipment even if one fails
        }
      }
      
      console.log('✅ Successfully deleted equipment documents for approved VDCR');
    } catch (error: any) {
      console.error('❌ Error deleting approved VDCR from equipment:', error);
      throw error;
    }
  },

  // Remove VDCR-synced documents from equipment (by vdcr_record_id)
  async removeVDCRFromEquipment(vdcrId: string) {
    try {
      const response = await api.get(`/equipment_documents?vdcr_record_id=eq.${vdcrId}&select=id`);
      const docs = Array.isArray(response.data) ? response.data : [];
      for (const doc of docs) {
        await api.delete(`/equipment_documents?id=eq.${doc.id}`);
      }
      if (docs.length > 0) {
        console.log(`✅ Removed ${docs.length} VDCR document(s) from equipment for VDCR ${vdcrId}`);
      }
    } catch (error: any) {
      // Column may not exist yet; ignore
      if (error?.response?.status !== 400 && error?.response?.data?.code !== '42703') {
        console.warn('⚠️ Error removing VDCR from equipment:', error);
      }
    }
  },

  // Sync VDCR record to equipment documents when show_in_equipment_doc_tab is true (any status). Removes from equipment when false.
  async syncVDCRToEquipment(vdcrId: string) {
    try {
      const vdcrResponse = await api.get(`/vdcr_records?id=eq.${vdcrId}&select=*`);
      const vdcrRecords = Array.isArray(vdcrResponse.data) ? vdcrResponse.data : [];
      if (vdcrRecords.length === 0) {
        console.warn('⚠️ VDCR record not found:', vdcrId);
        return;
      }
      const vdcrRecord = vdcrRecords[0];
      const showInEquipmentDocTab = vdcrRecord.show_in_equipment_doc_tab !== false;
      if (!showInEquipmentDocTab) {
        await this.removeVDCRFromEquipment(vdcrId);
        return;
      }
      const equipmentTagNumbers = vdcrRecord.equipment_tag_numbers || [];
      if (!equipmentTagNumbers || equipmentTagNumbers.length === 0) {
        console.warn('⚠️ No equipment tag numbers found in VDCR record');
        return;
      }
      const equipmentIds: string[] = [];
      for (const tagNumber of equipmentTagNumbers) {
        try {
          const equipmentResponse = await api.get(`/equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const equipment = Array.isArray(equipmentResponse.data) ? equipmentResponse.data : [];
          if (equipment.length > 0) equipmentIds.push(equipment[0].id);
          const standaloneResponse = await api.get(`/standalone_equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const standalone = Array.isArray(standaloneResponse.data) ? standaloneResponse.data : [];
          if (standalone.length > 0) equipmentIds.push(standalone[0].id);
        } catch (error) {
          console.warn(`⚠️ Error finding equipment for tag ${tagNumber}:`, error);
        }
      }
      if (equipmentIds.length === 0) {
        console.warn('⚠️ No equipment found for tag numbers:', equipmentTagNumbers);
        return;
      }
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const userId = userData.id || null;
      const documentName = vdcrRecord.document_name || 'VDCR Document';
      const documentUrl = vdcrRecord.document_url || null;
      const codeStatus = vdcrRecord.code_status || null;
      const vdcrDocumentStatus = vdcrRecord.status || null;
      for (const equipmentId of equipmentIds) {
        try {
          let existingDocs: any[] = [];
          try {
            const existingResponse = await api.get(
              `/equipment_documents?equipment_id=eq.${equipmentId}&vdcr_record_id=eq.${vdcrId}&select=id`
            );
            existingDocs = Array.isArray(existingResponse.data) ? existingResponse.data : [];
          } catch {
            const fallback = await api.get(
              `/equipment_documents?equipment_id=eq.${equipmentId}&document_type=eq.VDCR Approved Document&document_name=eq.${encodeURIComponent(documentName)}&select=id`
            );
            existingDocs = Array.isArray(fallback.data) ? fallback.data : [];
          }
          const documentData: any = {
            equipment_id: equipmentId,
            document_name: documentName,
            document_type: 'VDCR Approved Document',
            document_url: documentUrl || '',
            upload_date: new Date().toISOString(),
            uploaded_by: userId,
            vdcr_record_id: vdcrId,
            vdcr_code_status: codeStatus,
            vdcr_document_status: vdcrDocumentStatus
          };
          if (existingDocs.length > 0) {
            await api.patch(`/equipment_documents?id=eq.${existingDocs[0].id}`, {
              document_url: documentUrl || '',
              upload_date: new Date().toISOString(),
              uploaded_by: userId,
              vdcr_record_id: vdcrId,
              vdcr_code_status: codeStatus,
              vdcr_document_status: vdcrDocumentStatus
            });
          } else {
            await api.post('/equipment_documents', documentData);
          }
        } catch (error: any) {
          console.error(`❌ Error syncing document to equipment ${equipmentId}:`, error);
        }
      }
      console.log('✅ Successfully synced VDCR to equipment documents');
    } catch (error: any) {
      console.error('❌ Error syncing VDCR to equipment:', error);
      throw error;
    }
  },

  // Sync approved VDCR record to equipment documents (legacy: only when status is approved; prefer syncVDCRToEquipment for show_in_equipment_doc_tab)
  async syncApprovedVDCRToEquipment(vdcrId: string) {
    try {
      console.log('🔄 Syncing approved VDCR to equipment documents:', vdcrId);
      
      // 1. Get the VDCR record
      const vdcrResponse = await api.get(`/vdcr_records?id=eq.${vdcrId}&select=*`);
      const vdcrRecords = Array.isArray(vdcrResponse.data) ? vdcrResponse.data : [];
      
      if (vdcrRecords.length === 0) {
        console.warn('⚠️ VDCR record not found:', vdcrId);
        return;
      }
      
      const vdcrRecord = vdcrRecords[0];
      
      // Only sync if status is 'approved'
      if (vdcrRecord.status !== 'approved') {
        console.log('ℹ️ VDCR record is not approved, skipping sync:', vdcrRecord.status);
        return;
      }
      
      // 2. Get equipment tag numbers from the VDCR record
      const equipmentTagNumbers = vdcrRecord.equipment_tag_numbers || [];
      
      if (!equipmentTagNumbers || equipmentTagNumbers.length === 0) {
        console.warn('⚠️ No equipment tag numbers found in VDCR record');
        return;
      }
      
      // 3. Find equipment by tag numbers (check both equipment and standalone_equipment tables)
      const equipmentIds: string[] = [];
      
      for (const tagNumber of equipmentTagNumbers) {
        try {
          // Check project equipment
          const equipmentResponse = await api.get(`/equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const equipment = Array.isArray(equipmentResponse.data) ? equipmentResponse.data : [];
          if (equipment.length > 0) {
            equipmentIds.push(equipment[0].id);
          }
          
          // Check standalone equipment
          const standaloneResponse = await api.get(`/standalone_equipment?tag_number=eq.${encodeURIComponent(tagNumber)}&select=id`);
          const standalone = Array.isArray(standaloneResponse.data) ? standaloneResponse.data : [];
          if (standalone.length > 0) {
            equipmentIds.push(standalone[0].id);
          }
        } catch (error) {
          console.warn(`⚠️ Error finding equipment for tag ${tagNumber}:`, error);
        }
      }
      
      if (equipmentIds.length === 0) {
        console.warn('⚠️ No equipment found for tag numbers:', equipmentTagNumbers);
        return;
      }
      
      // 4. Get user ID for uploaded_by field
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const userId = userData.id || null;
      
      // 5. Create or update equipment documents for each equipment
      const documentName = vdcrRecord.document_name || 'VDCR Document';
      const documentUrl = vdcrRecord.document_url || null;
      const revision = vdcrRecord.revision || '';
      
      for (const equipmentId of equipmentIds) {
        try {
          // Check if a VDCR Approved Document already exists for this equipment with the same document name and revision
          const existingDocsResponse = await api.get(
            `/equipment_documents?equipment_id=eq.${equipmentId}&document_type=eq.VDCR Approved Document&document_name=eq.${encodeURIComponent(documentName)}&select=id`
          );
          const existingDocs = Array.isArray(existingDocsResponse.data) ? existingDocsResponse.data : [];
          
          // If document exists, update it; otherwise create new
          const documentData: any = {
            equipment_id: equipmentId,
            document_name: documentName,
            document_type: 'VDCR Approved Document',
            document_url: documentUrl,
            upload_date: new Date().toISOString(),
            uploaded_by: userId
          };
          
          if (existingDocs.length > 0) {
            // Update existing document
            await api.patch(`/equipment_documents?id=eq.${existingDocs[0].id}`, {
              document_url: documentUrl,
              upload_date: new Date().toISOString(),
              uploaded_by: userId
            });
            console.log(`✅ Updated VDCR Approved Document for equipment ${equipmentId}`);
          } else {
            // Create new document
            await api.post('/equipment_documents', documentData);
            console.log(`✅ Created VDCR Approved Document for equipment ${equipmentId}`);
          }
        } catch (error: any) {
          console.error(`❌ Error syncing document to equipment ${equipmentId}:`, error);
          // Continue with other equipment even if one fails
        }
      }
      
      console.log('✅ Successfully synced approved VDCR to equipment documents');
    } catch (error: any) {
      console.error('❌ Error syncing approved VDCR to equipment:', error);
      throw error;
    }
  },

  // Delete VDCR record
  async deleteVDCRRecord(vdcrId: string) {
    try {
      // Delete related records first to avoid foreign key constraint violations
      // Order matters: delete child records before parent record
      
      // 1. Delete activity logs (critical - must succeed or VDCR deletion will fail)
      try {
        const activityLogsResponse = await api.delete(`/vdcr_activity_logs?vdcr_id=eq.${vdcrId}`);
        // Check if deletion was successful (Supabase returns empty array if RLS blocks it)
        if (activityLogsResponse.data && Array.isArray(activityLogsResponse.data) && activityLogsResponse.data.length === 0) {
          // This might mean RLS blocked it, but we'll continue and let the main delete fail with a clearer error
          console.warn('⚠️ Activity logs deletion returned empty - may be blocked by RLS');
        }
      } catch (error: any) {
        // Only ignore 404 (not found) errors
        if (error?.response?.status === 404) {
          // No records to delete, that's fine
        } else {
          // For other errors (like 403 RLS), log but continue - the main delete will show the real error
          console.warn('⚠️ Warning deleting activity logs:', error?.response?.status, error?.response?.data?.message || error?.message);
        }
      }
      
      // 2. Delete revision events
      try {
        await api.delete(`/vdcr_revision_events?vdcr_record_id=eq.${vdcrId}`);
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          console.warn('⚠️ Warning deleting revision events:', error?.response?.status, error?.response?.data?.message || error?.message);
        }
      }
      
      // 3. Delete document history
      try {
        await api.delete(`/vdcr_document_history?vdcr_record_id=eq.${vdcrId}`);
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          console.warn('⚠️ Warning deleting document history:', error?.response?.status, error?.response?.data?.message || error?.message);
        }
      }
      
      // 4. Delete documents
      try {
        await api.delete(`/vdcr_documents?vdcr_record_id=eq.${vdcrId}`);
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          console.warn('⚠️ Warning deleting documents:', error?.response?.status, error?.response?.data?.message || error?.message);
        }
      }
      
      // 5. Finally, delete the VDCR record itself
      const response = await api.delete(`/vdcr_records?id=eq.${vdcrId}`);
      
      // Check if deletion was successful (RLS may block and return empty array)
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('VDCR record deletion failed: No rows were deleted. This may be due to insufficient permissions or related records still exist.');
      }
      
      // // console.log('✅ VDCR record deleted successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting VDCR record:', error);
      
      // Provide more helpful error message
      if (error?.response?.status === 409) {
        const errorMessage = error?.response?.data?.message || error?.message || 'Foreign key constraint violation';
        throw new Error(`Cannot delete VDCR record: ${errorMessage}. Please ensure all related records are deleted first.`);
      }
      
      throw error;
    }
  },

  // =====================================================
  // VDCR DOCUMENTS API FUNCTIONS
  // =====================================================

  // Create VDCR document
  async createVDCRDocument(documentData: any) {
    try {
      // // console.log('📄 Creating VDCR document:', documentData);
      const response = await api.post('/vdcr_documents', documentData);
      // // console.log('✅ VDCR document created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating VDCR document:', error);
      throw error;
    }
  },

  // Get VDCR documents by record ID
  async getVDCRDocumentsByRecord(vdcrRecordId: string) {
    try {
      // // console.log('📄 Fetching VDCR documents for record:', vdcrRecordId);
      const response = await api.get(`/vdcr_documents?vdcr_record_id=eq.${vdcrRecordId}&select=*&order=created_at.desc`);
      // // console.log('✅ VDCR documents fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR documents:', error);
      return [];
    }
  },

  // =====================================================
  // VDCR REVISION EVENTS API FUNCTIONS
  // =====================================================

  // Create VDCR revision event
  async createVDCRRevisionEvent(eventData: any) {
    try {
      const response = await api.post('/vdcr_revision_events', eventData);
      return response.data;
    } catch (error: any) {
      // Only log if it's not a 404 (table doesn't exist yet)
      if (error?.response?.status !== 404) {
        console.error('❌ Error creating VDCR revision event:', error);
      }
      throw error;
    }
  },

  // Get VDCR revision events by record ID
  async getVDCRRevisionEvents(vdcrRecordId: string) {
    try {
      const response = await api.get(`/vdcr_revision_events?vdcr_record_id=eq.${vdcrRecordId}&select=*,created_by_user:created_by(full_name,email)&order=event_date.desc`);
      return response.data;
    } catch (error: any) {
      // Only log if it's not a 404 (table doesn't exist yet)
      if (error?.response?.status !== 404) {
        console.error('❌ Error fetching VDCR revision events:', error);
      }
      return [];
    }
  },

  /** Batch fetch VDCR revision events for many record IDs in one or few requests. Returns map of vdcr_record_id -> events[] (each sorted by event_date desc). */
  async getVDCRRevisionEventsBatch(vdcrRecordIds: string[]): Promise<Record<string, any[]>> {
    if (!vdcrRecordIds?.length) return {};
    const CHUNK = 40;
    const out: Record<string, any[]> = {};
    try {
      for (let i = 0; i < vdcrRecordIds.length; i += CHUNK) {
        const chunk = vdcrRecordIds.slice(i, i + CHUNK);
        const idsFilter = chunk.join(',');
        const response = await api.get(
          `/vdcr_revision_events?vdcr_record_id=in.(${idsFilter})&select=*,created_by_user:created_by(full_name,email)&order=event_date.desc`,
          { timeout: 20000 }
        );
        const list = Array.isArray(response.data) ? response.data : [];
        for (const row of list) {
          const rid = row.vdcr_record_id;
          if (!out[rid]) out[rid] = [];
          out[rid].push(row);
        }
      }
      for (const id of vdcrRecordIds) {
        if (out[id]) {
          out[id].sort((a: any, b: any) => {
            const tA = new Date(a.event_date).getTime();
            const tB = new Date(b.event_date).getTime();
            if (tB !== tA) return tB - tA;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        }
      }
      return out;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.error('❌ Error fetching VDCR revision events batch:', error);
      }
      return {};
    }
  },

  // Update VDCR revision event
  async updateVDCRRevisionEvent(eventId: string, updateData: any) {
    try {
      const response = await api.patch(`/vdcr_revision_events?id=eq.${eventId}`, updateData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating VDCR revision event:', error);
      throw error;
    }
  },

  // Delete VDCR revision event
  async deleteVDCRRevisionEvent(eventId: string) {
    try {
      await api.delete(`/vdcr_revision_events?id=eq.${eventId}`);
      return true;
    } catch (error: any) {
      console.error('❌ Error deleting VDCR revision event:', error);
      throw error;
    }
  },


  // Delete VDCR document
  async deleteVDCRDocument(documentId: string) {
    try {
      // // console.log('📄 Deleting VDCR document:', documentId);
      const response = await api.delete(`/vdcr_documents?id=eq.${documentId}`);
      // // console.log('✅ VDCR document deleted successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting VDCR document:', error);
      throw error;
    }
  },

  // =====================================================
  // INVITES API FUNCTIONS
  // =====================================================

  // Create invitation record
  async createInvite(inviteData: {
    email: string;
    full_name?: string;
    role: string;
    firm_id: string;
    project_id?: string;
    invited_by: string;
  }) {
    try {
      // Enforce max users limit (firm admin + members count toward the limit)
      if (inviteData.firm_id) {
        const [firm, firmUsers] = await Promise.all([
          fastAPI.getFirmById(inviteData.firm_id),
          fastAPI.getTeamMembersByFirm(inviteData.firm_id)
        ]);
        const maxUsers = firm?.max_users ?? 5;
        const currentCount = Array.isArray(firmUsers) ? firmUsers.length : 0;
        if (currentCount >= maxUsers) {
          throw new Error(`Maximum user limit (${maxUsers}) reached for this company.`);
        }
      }

      // Same email allowed multiple times only with the same role; block if email exists with a different role
      const normalizedEmail = (inviteData.email || '').toLowerCase().trim();
      const newRole = (inviteData.role || '').trim();
      if (normalizedEmail && newRole) {
        const invitesRes = await api.get('/invites?order=created_at.desc&limit=500');
        const list = Array.isArray(invitesRes.data) ? invitesRes.data : [];
        const hasDifferentRole = list.some(
          (inv: any) =>
            inv.email && (inv.email as string).toLowerCase().trim() === normalizedEmail && (inv.role || '').trim() !== newRole
        );
        if (hasDifferentRole) {
          throw new Error('This email already exists with a different role. Same email cannot have multiple roles.');
        }
      }

      // // console.log('📧 Creating invite record:', inviteData);
      
      // Generate invitation token
      const invitationToken = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set expiration to 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Create a simple system user entry first
      let invitedByUserId = inviteData.invited_by;
      // // console.log('🔍 Creating system user entry for foreign key constraint...');
      
      try {
        // Create a simple system user entry using REST API
        // // console.log('🔍 Creating system user via REST API...');
        const systemUserResponse = await api.post('/users', {
          id: inviteData.invited_by,
          email: 'system@system.com',
          full_name: 'System User',
          role: 'super_admin',
          is_active: true,
          firm_id: null,
          project_id: null,
          assigned_by: null,
          phone: null
        });
        
        // // console.log('✅ System user created via REST API:', systemUserResponse.data);
      } catch (error: any) {
        // console.log('⚠️ System user creation failed (might already exist):', error.response?.data || error.message);
      }
      
      // // console.log('🔍 Using provided user ID for invite:', invitedByUserId);
      
      // // console.log('📤 Sending invite data to API:', {
      //   email: inviteData.email,
      //   full_name: inviteData.full_name || null,
      //   role: inviteData.role,
      //   firm_id: inviteData.firm_id,
      //   project_id: inviteData.project_id || null,
      //   invited_by: invitedByUserId,
      //   status: 'pending',
      //   invitation_token: invitationToken,
      //   expires_at: expiresAt.toISOString()
      // });
      
      const response = await api.post('/invites', {
        email: inviteData.email,
        full_name: inviteData.full_name || null,
        role: inviteData.role,
        firm_id: inviteData.firm_id,
        project_id: inviteData.project_id || null,
        invited_by: invitedByUserId,
        status: 'pending',
        invitation_token: invitationToken,
        expires_at: expiresAt.toISOString()
      });
      
      // // console.log('✅ Invite created successfully!');
      // // console.log('📊 Response status:', response.status);
      // // console.log('📊 Response data:', response.data);
      
      // Send email notification for the invite
      try {
        // // console.log('📧 Sending email notification for invite...');
        const { sendEmailNotification } = await import('./notifications');
        
        // Get company name from localStorage or use default
        const companyName = localStorage.getItem('companyName') || 'Your Company';
        const dashboardUrl = `${window.location.origin}/signup`;
        
        await sendEmailNotification({
          admin_name: inviteData.full_name || inviteData.email,
          admin_email: inviteData.email,
          company_name: companyName,
          role: inviteData.role,
          dashboard_url: dashboardUrl
        });
        
        // // console.log('✅ Email notification sent for invite');
      } catch (emailError) {
        console.error('❌ Error sending email notification for invite:', emailError);
        // Don't throw error here, invite was created successfully
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating invite:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get pending invite by email (case-insensitive)
  async getInviteByEmail(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      if (!normalizedEmail) return null;

      // Single targeted query (replaces two limit=100 scans) — fewer login API calls.
      const enc = encodeURIComponent(normalizedEmail);
      // One HTTP request: targeted rows only (not limit=100 table scans).
      const response = await api.get(
        `/invites?email=ilike.${enc}&status=in.(pending,accepted)&order=created_at.desc&limit=10`
      );

      const rows: any[] = Array.isArray(response.data) ? response.data : [];

      const sameEmail = (inv: any) =>
        inv?.email && inv.email.toLowerCase().trim() === normalizedEmail;

      const pending = rows.find((inv: any) => inv.status === 'pending' && sameEmail(inv));
      if (pending) {
        if (pending.expires_at) {
          const expiresAt = new Date(pending.expires_at);
          if (expiresAt < new Date()) {
            await this.updateInviteStatus(pending.id, 'expired');
            const accepted = rows.find((inv: any) => inv.status === 'accepted' && sameEmail(inv));
            return accepted || null;
          }
        }
        return pending;
      }

      const accepted = rows.find((inv: any) => inv.status === 'accepted' && sameEmail(inv));
      return accepted || null;
    } catch (error: any) {
      console.error('❌ Error fetching invite:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      // Return null instead of throwing, so signup can proceed with fallback logic
      return null;
    }
  },

  // Update invite status
  async updateInviteStatus(inviteId: string, status: 'pending' | 'accepted' | 'expired') {
    try {
      // // console.log('🔄 Updating invite status:', { inviteId, status });
      
      const response = await api.patch(`/invites?id=eq.${inviteId}`, {
        status: status,
        updated_at: new Date().toISOString()
      });
      
      // // console.log('✅ Invite status updated successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating invite status:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get all invites for a firm (for future admin dashboard)
  async getInvitesByFirm(firmId: string) {
    try {
      // // console.log('📋 Fetching invites for firm:', firmId);
      
      const response = await api.get(`/invites?firm_id=eq.${firmId}&order=created_at.desc`);
      
      // // console.log('✅ Invites fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching firm invites:', error);
      return [];
    }
  },

  // Test function to check if invites table exists
  async testInvitesTable() {
    try {
      // // console.log('🔍 Testing if invites table exists...');
      
      const response = await api.get('/invites?limit=1');
      
      // // console.log('✅ Invites table exists and is accessible');
      // // console.log('📊 Test response:', response.data);
      return true;
    } catch (error: any) {
      console.error('❌ Invites table test failed:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      return false;
    }
  }
};

// =====================================================
// HIERARCHICAL ROLE MANAGEMENT FUNCTIONS
// =====================================================

// Firm Admin assigns Project Manager or VDCR Manager
export const assignProjectRole = async (data: {
  email: string;
  full_name: string;
  role: 'project_manager' | 'vdcr_manager';
  project_id: string;
  assigned_by: string; // Firm admin's user ID
}) => {
  try {
    // // console.log('🔧 Assigning project role:', data);
    
    // First create user in users table (use api so JWT is sent for RLS)
    const userResponse = await api.post('/users', {
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      project_id: data.project_id,
      assigned_by: data.assigned_by,
      is_active: true
    });

    // // console.log('✅ Project role assigned successfully:', userResponse.data);
    return userResponse.data;
  } catch (error: any) {
    console.error('❌ Error assigning project role:', error);
    throw new Error(error.response?.data?.message || 'Failed to assign project role');
  }
};

// Project Manager assigns Editor or Viewer
export const assignTeamRole = async (data: {
  email: string;
  full_name: string;
  role: 'editor' | 'viewer';
  project_id: string;
  assigned_by: string; // Project manager's user ID
}) => {
  try {
    // // console.log('👥 Assigning team role:', data);
    
    const userResponse = await api.post('/users', {
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      project_id: data.project_id,
      assigned_by: data.assigned_by,
      is_active: true
    });

    // // console.log('✅ Team role assigned successfully:', userResponse.data);
    return userResponse.data;
  } catch (error: any) {
    console.error('❌ Error assigning team role:', error);
    throw new Error(error.response?.data?.message || 'Failed to assign team role');
  }
};

// Get users by project
export const getUsersByProject = async (projectId: string) => {
  try {
    // // console.log('🔍 Fetching users for project:', projectId);
    
    const response = await api.get('/users', {
      params: {
        project_id: `eq.${projectId}`,
        select: 'id,email,full_name,role,assigned_by,created_at'
      }
    });

    // // console.log('✅ Users fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching project users:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project users');
  }
};

// Get users by firm (excluding project-specific users)
export const getUsersByFirm = async (firmId: string) => {
  try {
    // // console.log('🏢 Fetching users for firm:', firmId);
    
    const response = await api.get('/users', {
      params: {
        firm_id: `eq.${firmId}`,
        project_id: `is.null`,
        select: 'id,email,full_name,role,assigned_by,created_at'
      }
    });

    // // console.log('✅ Firm users fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching firm users:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch firm users');
  }
};

// Update user role
export const updateUserRole = async (userId: string, newRole: string) => {
  try {
    // // console.log('🔄 Updating user role:', { userId, newRole });
    
    const response = await api.patch(`/users?id=eq.${userId}`, { role: newRole });

    // // console.log('✅ User role updated successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error updating user role:', error);
    throw new Error(error.response?.data?.message || 'Failed to update user role');
  }
};

// Delete user
export const deleteUser = async (userId: string) => {
  try {
    // // console.log('🗑️ Deleting user:', userId);
    
    const response = await api.delete(`/users?id=eq.${userId}`);

    // // console.log('✅ User deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting user:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete user');
  }
};

// Categorized Document upload functions
export const uploadUnpricedPODocument = async (projectId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading unpriced PO document for project:', projectId);
    
    // First try to insert into separate table using api instance (has JWT interceptor for RLS)
    try {
      const response = await api.post('/unpriced_po_documents', {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      });

      // // console.log('✅ Unpriced PO document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents using api instance (has JWT interceptor for RLS)
      const currentResponse = await api.get('/projects', {
        params: {
          id: `eq.${projectId}`,
          select: 'unpriced_po_documents'
        }
      });
      
      const currentDocs = currentResponse.data[0]?.unpriced_po_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await api.patch('/projects', {
        unpriced_po_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        }
      });
      
      // // console.log('✅ Unpriced PO document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading unpriced PO document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload unpriced PO document');
  }
};

export const uploadDesignInputsDocument = async (projectId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading design inputs document for project:', projectId);
    
    // First try to insert into separate table using api instance (has JWT interceptor for RLS)
    try {
      const response = await api.post('/design_inputs_documents', {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      });

      // // console.log('✅ Design inputs document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents using api instance (has JWT interceptor for RLS)
      const currentResponse = await api.get('/projects', {
        params: {
          id: `eq.${projectId}`,
          select: 'design_inputs_documents'
        }
      });
      
      const currentDocs = currentResponse.data[0]?.design_inputs_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await api.patch('/projects', {
        design_inputs_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        }
      });
      
      // // console.log('✅ Design inputs document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading design inputs document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload design inputs document');
  }
};

export const uploadClientReferenceDocument = async (projectId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading client reference document for project:', projectId);
    
    // First try to insert into separate table using api instance (has JWT interceptor for RLS)
    try {
      const response = await api.post('/client_reference_documents', {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      });

      // // console.log('✅ Client reference document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents using api instance (has JWT interceptor for RLS)
      const currentResponse = await api.get('/projects', {
        params: {
          id: `eq.${projectId}`,
          select: 'client_reference_documents'
        }
      });
      
      const currentDocs = currentResponse.data[0]?.client_reference_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await api.patch('/projects', {
        client_reference_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        }
      });
      
      // // console.log('✅ Client reference document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading client reference document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload client reference document');
  }
};

export const uploadOtherDocument = async (projectId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading other document for project:', projectId);
    
    // First try to insert into separate table using api instance (has JWT interceptor for RLS)
    try {
      const response = await api.post('/other_documents', {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      });

      // // console.log('✅ Other document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents using api instance (has JWT interceptor for RLS)
      const currentResponse = await api.get('/projects', {
        params: {
          id: `eq.${projectId}`,
          select: 'other_documents'
        }
      });
      
      const currentDocs = currentResponse.data[0]?.other_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await api.patch('/projects', {
        other_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        }
      });
      
      // // console.log('✅ Other document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading other document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload other document');
  }
};

export const uploadEquipmentDocument = async (equipmentId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading equipment document for equipment:', equipmentId);
    // // console.log('📄 Document data:', documentData);
    
    const requestData = {
      equipment_id: equipmentId,
      document_name: documentData.name,
      document_url: documentData.url,
      document_type: documentData.equipmentType,
      file_size: documentData.size,
      uploaded_by: documentData.uploadedBy || null
    };
    
    // // console.log('📄 Request data for equipment_documents table:', requestData);
    // // console.log('📄 Request data types:', {
    //   equipment_id: typeof requestData.equipment_id,
    //   document_name: typeof requestData.document_name,
    //   document_url: typeof requestData.document_url,
    //   document_type: typeof requestData.document_type,
    //   file_size: typeof requestData.file_size,
    //   uploaded_by: typeof requestData.uploaded_by
    // });
    
    // Insert into equipment_documents table using api instance (has JWT interceptor for RLS)
    const response = await api.post('/equipment_documents', requestData);

    // // console.log('✅ Equipment document uploaded successfully:', response.data);
    // // console.log('✅ Response status:', response.status);
    // // console.log('✅ Full response:', response);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error uploading equipment document:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    console.error('❌ Full error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      config: error.config
    });
    throw new Error(error.response?.data?.message || 'Failed to upload equipment document');
  }
};

type ProjectDocBatchItem = {
  name: string;
  url: string;
  uploadedBy: string;
  size: number;
  mimeType: string;
};

/** Bulk insert into unpriced_po_documents (one HTTP request). Falls back to per-row upload on failure. */
export const batchInsertUnpricedPODocuments = async (projectId: string, items: ProjectDocBatchItem[]) => {
  if (items.length === 0) return [];
  const body = items.map((d) => ({
    project_id: projectId,
    document_name: d.name,
    file_url: d.url,
    uploaded_by: d.uploadedBy,
    file_size: d.size,
    mime_type: d.mimeType,
  }));
  try {
    const response = await api.post('/unpriced_po_documents', body, {
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(response.data) ? response.data : [response.data];
  } catch {
    const out: any[] = [];
    for (const d of items) {
      const r = await uploadUnpricedPODocument(projectId, {
        name: d.name,
        url: d.url,
        uploadedBy: d.uploadedBy,
        size: d.size,
        mimeType: d.mimeType,
      });
      out.push(Array.isArray(r) ? r[0] : r);
    }
    return out;
  }
};

/** Bulk insert into design_inputs_documents (one HTTP request). Falls back to per-row upload on failure. */
export const batchInsertDesignInputsDocuments = async (projectId: string, items: ProjectDocBatchItem[]) => {
  if (items.length === 0) return [];
  const body = items.map((d) => ({
    project_id: projectId,
    document_name: d.name,
    file_url: d.url,
    uploaded_by: d.uploadedBy,
    file_size: d.size,
    mime_type: d.mimeType,
  }));
  try {
    const response = await api.post('/design_inputs_documents', body, {
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(response.data) ? response.data : [response.data];
  } catch {
    const out: any[] = [];
    for (const d of items) {
      const r = await uploadDesignInputsDocument(projectId, {
        name: d.name,
        url: d.url,
        uploadedBy: d.uploadedBy,
        size: d.size,
        mimeType: d.mimeType,
      });
      out.push(Array.isArray(r) ? r[0] : r);
    }
    return out;
  }
};

/** Bulk insert into client_reference_documents (one HTTP request). Falls back to per-row upload on failure. */
export const batchInsertClientReferenceDocuments = async (projectId: string, items: ProjectDocBatchItem[]) => {
  if (items.length === 0) return [];
  const body = items.map((d) => ({
    project_id: projectId,
    document_name: d.name,
    file_url: d.url,
    uploaded_by: d.uploadedBy,
    file_size: d.size,
    mime_type: d.mimeType,
  }));
  try {
    const response = await api.post('/client_reference_documents', body, {
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(response.data) ? response.data : [response.data];
  } catch {
    const out: any[] = [];
    for (const d of items) {
      const r = await uploadClientReferenceDocument(projectId, {
        name: d.name,
        url: d.url,
        uploadedBy: d.uploadedBy,
        size: d.size,
        mimeType: d.mimeType,
      });
      out.push(Array.isArray(r) ? r[0] : r);
    }
    return out;
  }
};

/** Bulk insert into other_documents (one HTTP request). Falls back to per-row upload on failure. */
export const batchInsertOtherDocuments = async (projectId: string, items: ProjectDocBatchItem[]) => {
  if (items.length === 0) return [];
  const body = items.map((d) => ({
    project_id: projectId,
    document_name: d.name,
    file_url: d.url,
    uploaded_by: d.uploadedBy,
    file_size: d.size,
    mime_type: d.mimeType,
  }));
  try {
    const response = await api.post('/other_documents', body, {
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(response.data) ? response.data : [response.data];
  } catch {
    const out: any[] = [];
    for (const d of items) {
      const r = await uploadOtherDocument(projectId, {
        name: d.name,
        url: d.url,
        uploadedBy: d.uploadedBy,
        size: d.size,
        mimeType: d.mimeType,
      });
      out.push(Array.isArray(r) ? r[0] : r);
    }
    return out;
  }
};

export type EquipmentDocBatchRow = {
  equipmentId: string;
  name: string;
  url: string;
  uploadedBy: string;
  size: number;
  mimeType: string;
  equipmentType: string;
  equipmentTagNumber: string;
};

/** Bulk insert into equipment_documents (one HTTP request). Falls back to per-row upload on failure. */
export const batchInsertEquipmentDocuments = async (rows: EquipmentDocBatchRow[]) => {
  if (rows.length === 0) return [];
  const body = rows.map((r) => ({
    equipment_id: r.equipmentId,
    document_name: r.name,
    document_url: r.url,
    document_type: r.equipmentType,
    file_size: r.size,
    uploaded_by: r.uploadedBy || null,
  }));
  try {
    const response = await api.post('/equipment_documents', body, {
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(response.data) ? response.data : [response.data];
  } catch {
    const out: any[] = [];
    for (const r of rows) {
      const uploaded = await uploadEquipmentDocument(r.equipmentId, {
        name: r.name,
        url: r.url,
        uploadedBy: r.uploadedBy,
        size: r.size,
        mimeType: r.mimeType,
        equipmentType: r.equipmentType,
        equipmentTagNumber: r.equipmentTagNumber,
      });
      out.push(Array.isArray(uploaded) ? uploaded[0] : uploaded);
    }
    return out;
  }
};

type NewProjectEquipmentRow = {
  type: string;
  tag_number: string;
  job_number: string;
  manufacturing_serial: string;
  size?: string;
  material?: string;
  design_code?: string;
  status?: string;
  progress?: number;
  progress_phase?: string;
};

/**
 * Create project equipment in bulk with one-time limit + uniqueness checks.
 * This avoids N calls to createEquipment() for new project creation.
 */
export const createProjectEquipmentBatch = async (
  projectId: string,
  rows: NewProjectEquipmentRow[]
): Promise<{ created: any[]; failures: Array<{ tag: string; message: string }> }> => {
  if (!projectId || rows.length === 0) return { created: [], failures: [] };

  const failures: Array<{ tag: string; message: string }> = [];
  try {
    // One-time firm and limit checks (instead of per-equipment checks)
    const projectRes = await api.get(`/projects?id=eq.${projectId}&select=firm_id`);
    const firmId = (projectRes.data as any[])?.[0]?.firm_id;
    if (firmId) {
      const firm = await fastAPI.getFirmById(firmId);
      const limit = firm?.max_equipment_limit;
      if (limit != null && typeof limit === 'number') {
        const count = await fastAPI.getEquipmentCountByFirm(firmId);
        if (count + rows.length > limit) {
          return {
            created: [],
            failures: rows.map((r) => ({
              tag: r.tag_number || r.type || '—',
              message: `Equipment limit reached (${count}/${limit}).`,
            })),
          };
        }
      }
    }

    // One-time global uniqueness check for job numbers across both tables
    const jobNumbers = [...new Set(rows.map((r) => (r.job_number || '').trim()).filter((j) => !!j && j !== 'TBD'))];
    const conflictingJobs = new Set<string>();
    if (jobNumbers.length > 0) {
      const encoded = jobNumbers.map((j) => encodeURIComponent(j)).join(',');
      const [projEq, standaloneEq] = await Promise.all([
        api.get(`/equipment?job_number=in.(${encoded})&select=job_number`).catch(() => ({ data: [] })),
        api.get(`/standalone_equipment?job_number=in.(${encoded})&select=job_number`).catch(() => ({ data: [] })),
      ]);
      (Array.isArray(projEq.data) ? projEq.data : []).forEach((r: any) => {
        if (r?.job_number) conflictingJobs.add(String(r.job_number).trim());
      });
      (Array.isArray(standaloneEq.data) ? standaloneEq.data : []).forEach((r: any) => {
        if (r?.job_number) conflictingJobs.add(String(r.job_number).trim());
      });
    }

    const creatable = rows
      .map((r) => ({ ...r, _job: (r.job_number || '').trim() }))
      .filter((r) => {
        if (r._job && r._job !== 'TBD' && conflictingJobs.has(r._job)) {
          failures.push({
            tag: r.tag_number || r.type || '—',
            message: `Job Number "${r.job_number}" already exists`,
          });
          return false;
        }
        return true;
      })
      .map((r) => ({
        project_id: projectId,
        type: r.type,
        tag_number: r.tag_number || 'TBD',
        job_number: r.job_number || 'TBD',
        manufacturing_serial: r.manufacturing_serial || 'TBD',
        size: r.size || '',
        material: r.material || '',
        design_code: r.design_code || '',
        status: r.status || 'pending',
        progress: typeof r.progress === 'number' ? r.progress : 0,
        progress_phase: r.progress_phase || 'documentation',
      }));

    if (creatable.length === 0) return { created: [], failures };

    const response = await api.post('/equipment', creatable, {
      headers: { Prefer: 'return=representation' },
    });
    const created = Array.isArray(response.data) ? response.data : [response.data];
    return { created, failures };
  } catch (error: any) {
    console.error('❌ Error in createProjectEquipmentBatch:', error);
    return {
      created: [],
      failures: rows.map((r) => ({
        tag: r.tag_number || r.type || '—',
        message: error?.response?.data?.message || error?.message || 'Failed to create equipment',
      })),
    };
  }
};

/** Get VDCR record IDs linked to this equipment (via equipment_documents.vdcr_record_id). Used to fetch VDCR activity for recent activity. */
export const getEquipmentVdcrRecordIds = async (equipmentId: string): Promise<string[]> => {
  try {
    const response = await api.get('/equipment_documents', {
      params: {
        equipment_id: `eq.${equipmentId}`,
        vdcr_record_id: 'not.is.null',
        select: 'vdcr_record_id'
      }
    });
    const rows = Array.isArray(response.data) ? response.data : [];
    const ids = [...new Set(rows.map((r: any) => r.vdcr_record_id).filter(Boolean))];
    return ids;
  } catch (error: any) {
    console.warn('⚠️ getEquipmentVdcrRecordIds failed (non-fatal):', error?.response?.data || error?.message);
    return [];
  }
};

// Get equipment documents metadata only (no document_url) - for on-demand doc load to avoid loading all URLs
export const getEquipmentDocumentsMetadata = async (equipmentId: string) => {
  try {
    const response = await api.get('/equipment_documents', {
      params: {
        equipment_id: `eq.${equipmentId}`,
        select: 'id,equipment_id,document_name,document_type,upload_date,uploaded_by,created_at,vdcr_code_status,vdcr_document_status,vdcr_record_id',
        order: 'created_at.desc'
      }
    });
    let documents = Array.isArray(response.data) ? response.data : [];
    const userIds = [...new Set(documents.map((doc: any) => doc.uploaded_by).filter((id: any) => id && typeof id === 'string' && id.length === 36))];
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const usersResponse = await api.get('/users', { params: { id: `in.(${userIds.join(',')})`, select: 'id,full_name,email' } });
        const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
        usersMap = users.reduce((acc: any, u: any) => { acc[u.id] = { full_name: u.full_name, email: u.email }; return acc; }, {});
      } catch (e) { console.warn('⚠️ Could not fetch user data for equipment documents metadata:', e); }
    }
    return documents.map((doc: any) => ({
      ...doc,
      uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null
    }));
  } catch (error: any) {
    console.error('❌ Error fetching equipment documents metadata:', error);
    return [];
  }
};

const DOCS_METADATA_BATCH_CHUNK = 50;

/** Batch fetch equipment documents metadata for many equipment IDs. Returns Record<equipmentId, doc[]>. Reduces N requests to 1 (or few if chunked). */
export const getEquipmentDocumentsMetadataBatch = async (equipmentIds: string[]): Promise<Record<string, any[]>> => {
  if (!equipmentIds?.length) return {};
  if (import.meta.env.DEV) {
    const reqCount = Math.ceil(equipmentIds.length / DOCS_METADATA_BATCH_CHUNK) + 1; // docs chunk(s) + 1 users
    console.log(`[Batch] Documents metadata: ${reqCount} request(s) for ${equipmentIds.length} equipment (was ${equipmentIds.length}+ before batching)`);
  }
  try {
    const allDocs: any[] = [];
    for (let i = 0; i < equipmentIds.length; i += DOCS_METADATA_BATCH_CHUNK) {
      const chunk = equipmentIds.slice(i, i + DOCS_METADATA_BATCH_CHUNK);
      const response = await api.get('/equipment_documents', {
        params: {
          equipment_id: `in.(${chunk.join(',')})`,
          select: 'id,equipment_id,document_name,document_type,upload_date,uploaded_by,created_at,vdcr_code_status,vdcr_document_status,vdcr_record_id',
          order: 'created_at.desc'
        }
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      allDocs.push(...rows);
    }
    const userIds = [...new Set(allDocs.map((doc: any) => doc.uploaded_by).filter((id: any) => id && typeof id === 'string' && id.length === 36))];
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const usersResponse = await api.get('/users', { params: { id: `in.(${userIds.join(',')})`, select: 'id,full_name,email' } });
        const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
        usersMap = users.reduce((acc: any, u: any) => { acc[u.id] = { full_name: u.full_name, email: u.email }; return acc; }, {});
      } catch (e) { console.warn('⚠️ Could not fetch user data for equipment documents metadata batch:', e); }
    }
    const withUsers = allDocs.map((doc: any) => ({
      ...doc,
      uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null
    }));
    const result: Record<string, any[]> = {};
    for (const id of equipmentIds) result[id] = [];
    for (const doc of withUsers) {
      if (doc.equipment_id) {
        (result[doc.equipment_id] = result[doc.equipment_id] || []).push(doc);
      }
    }
    return result;
  } catch (error: any) {
    console.error('❌ Error fetching equipment documents metadata batch:', error);
    return Object.fromEntries(equipmentIds.map((id) => [id, []]));
  }
};

// Get single document URL by id (for on-demand preview - fetch only when user clicks View)
export const getDocumentUrlById = async (documentId: string, isStandalone: boolean): Promise<{ document_url: string; document_name?: string; upload_date?: string; uploaded_by?: string; uploaded_by_user?: { full_name?: string } } | null> => {
  const id = documentId != null ? String(documentId).trim() : '';
  if (!id) return null;
  try {
    const table = isStandalone ? 'standalone_equipment_documents' : 'equipment_documents';
    const response = await api.get(`/${table}`, {
      params: {
        id: `eq.${id}`,
        select: 'document_url,document_name,upload_date,uploaded_by',
        limit: 1
      }
    });
    const rows = Array.isArray(response.data) ? response.data : [];
    const row = rows[0];
    if (!row?.document_url) return null;
    return row;
  } catch (error: any) {
    console.warn('⚠️ getDocumentUrlById failed (non-fatal):', error);
    return null;
  }
};

const DOCUMENT_URL_BATCH_CHUNK = 80;

/** Batch-fetch document_url rows by id (one or few HTTP calls vs N × getDocumentUrlById). Used by dossier export/preload. */
export const getDocumentUrlsByIds = async (
  documentIds: string[],
  isStandalone: boolean
): Promise<Record<string, { id: string; document_url: string; document_name?: string; upload_date?: string; uploaded_by?: string }>> => {
  const ids = [...new Set(documentIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return {};
  const table = isStandalone ? 'standalone_equipment_documents' : 'equipment_documents';
  const out: Record<string, { id: string; document_url: string; document_name?: string; upload_date?: string; uploaded_by?: string }> = {};
  try {
    for (let i = 0; i < ids.length; i += DOCUMENT_URL_BATCH_CHUNK) {
      const chunk = ids.slice(i, i + DOCUMENT_URL_BATCH_CHUNK);
      const response = await api.get(`/${table}`, {
        params: {
          id: `in.(${chunk.join(',')})`,
          select: 'id,document_url,document_name,upload_date,uploaded_by',
        },
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      for (const row of rows) {
        if (row?.id && row?.document_url) {
          out[String(row.id)] = {
            id: String(row.id),
            document_url: row.document_url,
            document_name: row.document_name,
            upload_date: row.upload_date,
            uploaded_by: row.uploaded_by,
          };
        }
      }
    }
  } catch (error: any) {
    console.warn('⚠️ getDocumentUrlsByIds failed (non-fatal):', error);
  }
  return out;
};

const EQUIPMENT_DOCS_BY_IDS_CHUNK = 50;

/**
 * Load equipment_documents for many equipment IDs in one (or few) requests, with the same user merge as getDocumentsByEquipment.
 * Replaces N per-equipment calls when opening project edit form.
 */
export const getEquipmentDocumentsForEquipmentIds = async (equipmentIds: string[]): Promise<Record<string, any[]>> => {
  const ids = [...new Set((equipmentIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return {};
  const allDocs: any[] = [];
  try {
    for (let i = 0; i < ids.length; i += EQUIPMENT_DOCS_BY_IDS_CHUNK) {
      const chunk = ids.slice(i, i + EQUIPMENT_DOCS_BY_IDS_CHUNK);
      const response = await api.get('/equipment_documents', {
        params: {
          equipment_id: `in.(${chunk.join(',')})`,
          select: '*',
          order: 'upload_date.desc',
        },
      });
      allDocs.push(...(Array.isArray(response.data) ? response.data : []));
    }
  } catch (error: any) {
    console.error('❌ getEquipmentDocumentsForEquipmentIds:', error);
    return Object.fromEntries(ids.map((id) => [id, []]));
  }

  const userIds = [
    ...new Set(
      allDocs.map((doc: any) => doc.uploaded_by).filter((id: any) => id && typeof id === 'string' && id.length === 36)
    ),
  ];
  let usersMap: Record<string, any> = {};
  if (userIds.length > 0) {
    try {
      const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`);
      const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
      usersMap = users.reduce((acc: any, user: any) => {
        acc[user.id] = { full_name: user.full_name, email: user.email };
        return acc;
      }, {});
    } catch (userError) {
      console.warn('⚠️ Could not fetch user data for getEquipmentDocumentsForEquipmentIds:', userError);
    }
  }

  const merged = allDocs.map((doc: any) => ({
    ...doc,
    uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null,
  }));

  const result: Record<string, any[]> = {};
  for (const id of ids) result[id] = [];
  for (const doc of merged) {
    const eqId = doc.equipment_id;
    if (eqId && result[eqId]) {
      result[eqId].push(doc);
    }
  }
  return result;
};

// Get equipment documents for an equipment
export const getEquipmentDocuments = async (equipmentId: string) => {
  try {
    // // console.log('📄 Fetching documents for equipment:', equipmentId);
    
    // Fetch documents first using api instance (has JWT interceptor for RLS)
    const response = await api.get('/equipment_documents', {
      params: {
        equipment_id: `eq.${equipmentId}`,
        select: '*',
        order: 'created_at.desc'
      }
    });

    let documents = Array.isArray(response.data) ? response.data : [];
    
    // Fetch user data for uploaded_by fields
    const userIds = [...new Set(documents
      .map((doc: any) => doc.uploaded_by)
      .filter((id: any) => id && typeof id === 'string' && id.length === 36) // UUID check
    )];
    
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const usersResponse = await api.get('/users', {
          params: {
            id: `in.(${userIds.join(',')})`,
            select: 'id,full_name,email'
          }
        });
        
        const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
        usersMap = users.reduce((acc: any, user: any) => {
          acc[user.id] = { full_name: user.full_name, email: user.email };
          return acc;
        }, {});
      } catch (userError) {
        console.warn('⚠️ Could not fetch user data for equipment documents:', userError);
      }
    }
    
    // Merge user data into documents
    documents = documents.map((doc: any) => ({
      ...doc,
      uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null
    }));

    // // console.log('📄 Equipment documents fetched:', documents);
    return documents;
  } catch (error: any) {
    console.error('❌ Error fetching equipment documents:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    return [];
  }
};

// Delete equipment document
export const deleteEquipmentDocument = async (documentId: string) => {
  try {
    // // console.log('🗑️ Deleting equipment document:', documentId);
    
    const response = await api.delete('/equipment_documents', {
      params: {
        id: `eq.${documentId}`
      }
    });

    // // console.log('✅ Equipment document deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting equipment document:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete equipment document');
  }
};

// ============================================================================
// STANDALONE EQUIPMENT DOCUMENTS FUNCTIONS
// ============================================================================

// Upload standalone equipment document
export const uploadStandaloneEquipmentDocument = async (equipmentId: string, documentData: any) => {
  try {
    // // console.log('📄 Uploading standalone equipment document for equipment:', equipmentId);
    // // console.log('📄 Document data:', documentData);
    
    const requestData = {
      equipment_id: equipmentId,
      document_name: documentData.name,
      document_url: documentData.url,
      document_type: documentData.equipmentType,
      file_size: documentData.size,
      uploaded_by: documentData.uploadedBy || null
    };
    
    // Insert into standalone_equipment_documents table using api instance (has JWT interceptor for RLS)
    const response = await api.post('/standalone_equipment_documents', requestData);

    // // console.log('✅ Standalone equipment document uploaded successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error uploading standalone equipment document:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    throw new Error(error.response?.data?.message || 'Failed to upload standalone equipment document');
  }
};

// Bulk insert standalone equipment documents to reduce per-file POST calls.
export const uploadStandaloneEquipmentDocumentsBulk = async (equipmentId: string, documents: any[]) => {
  try {
    if (!equipmentId || !Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const rows = documents.map((documentData: any) => ({
      equipment_id: equipmentId,
      document_name: documentData.name,
      document_url: documentData.url,
      document_type: documentData.equipmentType,
      file_size: documentData.size,
      uploaded_by: documentData.uploadedBy || null
    }));

    const response = await api.post('/standalone_equipment_documents', rows);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error bulk uploading standalone equipment documents:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload standalone equipment documents');
  }
};

// Get standalone equipment documents metadata only (no document_url) - for on-demand doc load
export const getStandaloneEquipmentDocumentsMetadata = async (equipmentId: string) => {
  try {
    const response = await api.get('/standalone_equipment_documents', {
      params: {
        equipment_id: `eq.${equipmentId}`,
        select: 'id,equipment_id,document_name,document_type,upload_date,uploaded_by,created_at',
        order: 'created_at.desc'
      }
    });
    let documents = Array.isArray(response.data) ? response.data : [];
    const needsUserFetch = documents.some((doc: any) => doc.uploaded_by && typeof doc.uploaded_by === 'string' && doc.uploaded_by.length === 36);
    if (needsUserFetch) {
      const userIds = [...new Set(documents.map((doc: any) => doc.uploaded_by).filter((id: any) => id && typeof id === 'string' && id.length === 36))];
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get('/users', { params: { id: `in.(${userIds.join(',')})`, select: 'id,full_name,email' } });
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          const usersMap = users.reduce((acc: any, u: any) => { acc[u.id] = { full_name: u.full_name, email: u.email }; return acc; }, {});
          documents = documents.map((doc: any) => ({ ...doc, uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null }));
        } catch (e) { console.warn('⚠️ Could not fetch user data for standalone documents metadata:', e); }
      }
    }
    return documents;
  } catch (error: any) {
    console.error('❌ Error fetching standalone equipment documents metadata:', error);
    return [];
  }
};

/** Batch fetch standalone equipment documents metadata for many equipment IDs. Returns Record<equipmentId, doc[]>. Reduces N requests to 1 (or few if chunked). */
export const getStandaloneEquipmentDocumentsMetadataBatch = async (equipmentIds: string[]): Promise<Record<string, any[]>> => {
  if (!equipmentIds?.length) return {};
  try {
    const allDocs: any[] = [];
    for (let i = 0; i < equipmentIds.length; i += DOCS_METADATA_BATCH_CHUNK) {
      const chunk = equipmentIds.slice(i, i + DOCS_METADATA_BATCH_CHUNK);
      const response = await api.get('/standalone_equipment_documents', {
        params: {
          equipment_id: `in.(${chunk.join(',')})`,
          select: 'id,equipment_id,document_name,document_type,upload_date,uploaded_by,created_at',
          order: 'created_at.desc'
        }
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      allDocs.push(...rows);
    }
    const userIds = [...new Set(allDocs.map((doc: any) => doc.uploaded_by).filter((id: any) => id && typeof id === 'string' && id.length === 36))];
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const usersResponse = await api.get('/users', { params: { id: `in.(${userIds.join(',')})`, select: 'id,full_name,email' } });
        const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
        usersMap = users.reduce((acc: any, u: any) => { acc[u.id] = { full_name: u.full_name, email: u.email }; return acc; }, {});
      } catch (e) { console.warn('⚠️ Could not fetch user data for standalone documents metadata batch:', e); }
    }
    const withUsers = allDocs.map((doc: any) => ({
      ...doc,
      uploaded_by_user: doc.uploaded_by ? usersMap[doc.uploaded_by] : null
    }));
    const result: Record<string, any[]> = {};
    for (const id of equipmentIds) result[id] = [];
    for (const doc of withUsers) {
      if (doc.equipment_id) {
        (result[doc.equipment_id] = result[doc.equipment_id] || []).push(doc);
      }
    }
    return result;
  } catch (error: any) {
    console.error('❌ Error fetching standalone equipment documents metadata batch:', error);
    return Object.fromEntries(equipmentIds.map((id) => [id, []]));
  }
};

// Get standalone equipment documents for an equipment
export const getStandaloneEquipmentDocuments = async (equipmentId: string) => {
  try {
    // // console.log('📄 Fetching standalone equipment documents for equipment:', equipmentId);
    
    // Fetch documents with user information via foreign key join (standalone references public.users)
    // Using api instance (has JWT interceptor for RLS)
    const response = await api.get('/standalone_equipment_documents', {
      params: {
        equipment_id: `eq.${equipmentId}`,
        select: '*,uploaded_by_user:uploaded_by(full_name,email)',
        order: 'created_at.desc'
      }
    });

    let documents = Array.isArray(response.data) ? response.data : [];
    
    // If foreign key join didn't work, fetch user data separately
    const needsUserFetch = documents.some((doc: any) => 
      doc.uploaded_by && 
      !doc.uploaded_by_user && 
      typeof doc.uploaded_by === 'string' && 
      doc.uploaded_by.length === 36
    );
    
    if (needsUserFetch) {
      const userIds = [...new Set(documents
        .map((doc: any) => doc.uploaded_by)
        .filter((id: any) => id && typeof id === 'string' && id.length === 36)
      )];
      
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get('/users', {
            params: {
              id: `in.(${userIds.join(',')})`,
              select: 'id,full_name,email'
            }
          });
          
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          const usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
          
          // Merge user data into documents
          documents = documents.map((doc: any) => ({
            ...doc,
            uploaded_by_user: doc.uploaded_by_user || (doc.uploaded_by ? usersMap[doc.uploaded_by] : null)
          }));
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data for standalone equipment documents:', userError);
        }
      }
    }

    // // console.log('📄 Standalone equipment documents fetched:', documents);
    return documents;
  } catch (error: any) {
    console.error('❌ Error fetching standalone equipment documents:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    return [];
  }
};

// Delete standalone equipment document
export const deleteStandaloneEquipmentDocument = async (documentId: string) => {
  try {
    // // console.log('🗑️ Deleting standalone equipment document:', documentId);
    
    const response = await api.delete('/standalone_equipment_documents', {
      params: {
        id: `eq.${documentId}`
      }
    });

    // // console.log('✅ Standalone equipment document deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting standalone equipment document:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete standalone equipment document');
  }
};

// Get documents for a project
export const getProjectDocuments = async (projectId: string) => {
  try {
    // // console.log('📄 Fetching documents for project:', projectId);
    
    const response = await api.get('/project_documents', {
      params: {
        project_id: `eq.${projectId}`,
        select: '*',
        order: 'created_at.desc'
      }
    });

    // // console.log('✅ Documents fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching project documents:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project documents');
  }
};

// Delete document
export const deleteDocument = async (documentId: string) => {
  try {
    // // console.log('🗑️ Deleting document:', documentId);
    
    const response = await api.delete(`/project_documents?id=eq.${documentId}`);

    // // console.log('✅ Document deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting document:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete document');
  }
};

// Get document by ID
export const getDocumentById = async (documentId: string) => {
  try {
    // // console.log('📄 Fetching document by ID:', documentId);
    
    const response = await api.get('/project_documents', {
      params: {
        id: `eq.${documentId}`,
        select: '*'
      }
    });

    // // console.log('✅ Document fetched successfully:', response.data);
    return response.data[0]; // Return first (and only) document
  } catch (error: any) {
    console.error('❌ Error fetching document:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch document');
  }
};

// Update project document links
export const updateProjectDocumentLinks = async (projectId: string, documentType: string, documentLinks: any[]) => {
  try {
    // // console.log('🔄 Updating project document links:', { projectId, documentType, documentLinks });
    
    const updateData: any = {};
    updateData[documentType] = documentLinks;
    
    const response = await api.patch(`/projects?id=eq.${projectId}`, updateData);

    // // console.log('✅ Project document links updated successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error updating project document links:', error);
    throw new Error(error.response?.data?.message || 'Failed to update project document links');
  }
};

// Delete a project document
export const deleteProjectDocument = async (documentId: string, documentType: 'unpriced_po_documents' | 'design_inputs_documents' | 'client_reference_documents' | 'other_documents', projectId: string) => {
  try {
    // First try to delete from separate table
    const tableMap: Record<string, string> = {
      'unpriced_po_documents': 'unpriced_po_documents',
      'design_inputs_documents': 'design_inputs_documents',
      'client_reference_documents': 'client_reference_documents',
      'other_documents': 'other_documents'
    };

    const tableName = tableMap[documentType];
    
    if (tableName) {
      try {
        // Try deleting from separate table
        await api.delete(`/${tableName}?id=eq.${documentId}`);
        // console.log('✅ Document deleted from separate table');
        return { success: true };
      } catch (tableError: any) {
        // If separate table doesn't exist or document not found, update JSONB column
        // console.log('⚠️ Document not in separate table, updating JSONB column');
        
        // Get current documents
        const projectResponse = await api.get('/projects', {
          params: {
            id: `eq.${projectId}`,
            select: documentType
          }
        });
        
        const currentDocs = projectResponse.data[0]?.[documentType] || [];
        const updatedDocs = currentDocs.filter((doc: any) => doc.id !== documentId && doc.document_name !== documentId);
        
        // Update JSONB column
        await updateProjectDocumentLinks(projectId, documentType, updatedDocs);
        // console.log('✅ Document removed from JSONB column');
        return { success: true };
      }
    }
    
    throw new Error('Invalid document type');
  } catch (error: any) {
    console.error('❌ Error deleting project document:', error);
    throw error;
  }
};

// Get project document links
export const getProjectDocumentLinks = async (projectId: string) => {
  try {
    // // console.log('📄 Fetching project document links for project:', projectId);
    
    const response = await api.get('/projects', {
      params: {
        id: `eq.${projectId}`,
        select: 'unpriced_po_documents,design_inputs_documents,client_reference_documents,other_documents'
      }
    });

    // // console.log('✅ Project document links fetched successfully:', response.data);
    return response.data[0]; // Return first (and only) project
  } catch (error: any) {
    console.error('❌ Error fetching project document links:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project document links');
  }
};

// Check if equipment_documents table exists
export const checkEquipmentDocumentsTable = async () => {
  try {
    // // console.log('🔍 CHECKING: Checking equipment_documents table...');
    const response = await api.get('/equipment_documents?limit=1');
    // // console.log('✅ CHECKING: Table exists and accessible:', response.data);
    return true;
  } catch (error: any) {
    console.error('❌ CHECKING: Table check failed:', error);
    console.error('❌ CHECKING: Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
};

// Create document entry in database
export const createDocument = async (documentData: {
  equipment_id: string;
  document_name: string;
  document_url: string;
  document_type: string;
  file_size: number;
  uploaded_by: string;
}) => {
  try {
    // // console.log('📄 PERFECT: Creating document entry in database:', documentData);
    // // console.log('📄 PERFECT: Document data:', {
    //   equipment_id: documentData.equipment_id,
    //   document_name: documentData.document_name,
    //   document_url: documentData.document_url,
    //   document_type: documentData.document_type,
    //   file_size: documentData.file_size,
    //   uploaded_by: documentData.uploaded_by,
    //   upload_date: new Date().toISOString()
    // });
    
    const dbStart = Date.now();
    const response = await api.post('/equipment_documents', {
      equipment_id: documentData.equipment_id,
      document_name: documentData.document_name,
      document_url: documentData.document_url,
      document_type: documentData.document_type,
      file_size: documentData.file_size,
      uploaded_by: documentData.uploaded_by,
      upload_date: new Date().toISOString()
    }, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
    
    const dbTime = Date.now() - dbStart;
    // // console.log('📄 PERFECT: Database insert completed in', dbTime, 'ms');
    // // console.log('✅ PERFECT: Document created in database:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ PERFECT: Error creating document:', error);
    console.error('❌ PERFECT: Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    console.error('❌ PERFECT: Full error response:', error.response);
    console.error('❌ PERFECT: Error config:', error.config);
    throw error;
  }
};

export default api;
