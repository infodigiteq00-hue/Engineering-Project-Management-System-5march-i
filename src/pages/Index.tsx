import { useState, useMemo, useEffect, useRef } from "react";
import UnifiedProjectView from "@/components/dashboard/UnifiedProjectView";
import ProjectFilters from "@/components/dashboard/ProjectFilters";
import ProjectHeader from "@/components/dashboard/ProjectHeader";
import ProjectSummaryCards from "@/components/dashboard/ProjectSummaryCards";
import CompanyHighlights from "@/components/dashboard/CompanyHighlights";
import EquipmentGrid from "@/components/dashboard/EquipmentGrid";
import StandaloneEquipmentTab from "@/components/dashboard/StandaloneEquipmentTab";
import DossierReportWizard from "@/components/dossier/DossierReportWizard";
import type { DossierParams } from "@/components/dossier/DossierReportWizard";
import TasksTab from "@/components/dashboard/TasksTab";
import CompletionCertificatesTab from "@/components/dashboard/CompletionCertificatesTab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AddProjectForm from "@/components/forms/AddProjectForm";
import { fastAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationReads, UnreadEntityDot } from "@/contexts/NotificationReadsContext";
import axios from "axios";
import { logProjectCreated, logProjectUpdated, logProjectDeleted } from "@/lib/activityLogger";
import { generateRecommendationLetterWord } from "@/utils/wordGenerator";
import { getCache, setCache, prefetchWithCache, CACHE_KEYS, clearCache, removeCache, initializeCacheCleanup, getCacheEvenIfExpired } from "@/utils/cache";




// Dynamic projects will be loaded from Supabase
const mockProjects: any[] = [];
   

interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  equipmentCount: number;
  activeEquipment: number;
  progress: number;
  status: 'active' | 'delayed' | 'on-track' | 'completed';
  manager: string;
  deadline: string;
  completedDate?: string;
  poNumber: string;
  equipmentBreakdown: {
    heatExchanger?: number;
    pressureVessel?: number;
    storageTank?: number;
    reactor?: number;
    other?: number;
  };
  servicesIncluded?: string[];
  scopeOfWork?: string;
  recommendationLetter?: {
    status: 'not-requested' | 'requested' | 'received';
    requestDate?: string;
    lastReminderDate?: string;
    lastReminderDateTime?: string;
    reminderCount?: number;
    clientEmail?: string;
    clientContactPerson?: string;
    receivedDocument?: {
      name: string;
      uploaded: boolean;
      type: string;
      size?: number;
      uploadDate?: string;
      file?: File;
      url?: string;
    };
  };
}



const Index = () => {
  const { toast } = useToast();
  const { firmId: authFirmId, firmData: authFirmData, userRole: authUserRole, userName: authUserName, loading: authLoading } = useAuth();
  const { hasUnread, markAsSeen } = useNotificationReads();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedProjectTab, setSelectedProjectTab] = useState<string>("equipment");
  const [projects, setProjects] = useState(mockProjects);
  const [filteredProjects, setFilteredProjects] = useState(mockProjects);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [equipmentCarouselIndex, setEquipmentCarouselIndex] = useState<Record<string, number>>({});
  const [showAddProjectForm, setShowAddProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const fetchProjectsRef = useRef<(() => Promise<void>) | null>(null);
  
  // User data state - initialize from localStorage immediately for instant display on refresh
  const [userName, setUserName] = useState<string>(() => {
    // Try direct localStorage keys first (set by AuthContext)
    const storedName = localStorage.getItem('userName');
    if (storedName) return storedName;
    // Fallback to userData object
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    return userData?.full_name || '';
  });
  const [userRole, setUserRole] = useState<string>(() => {
    // Try direct localStorage keys first (set by AuthContext)
    const storedRole = localStorage.getItem('userRole');
    if (storedRole) return storedRole;
    // Fallback to userData object
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    return userData?.role || '';
  });
  const [userEmail, setUserEmail] = useState<string>(() => {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    return userData?.email || '';
  });
  const [loading, setLoading] = useState(true);
  
  // Firm data state - initialize from localStorage for instant display (company name and logo set at login)
  const [firmName, setFirmName] = useState<string>(() => {
    return localStorage.getItem('companyName') || JSON.parse(localStorage.getItem('userData') || '{}').company_name || '';
  });
  const [firmLogo, setFirmLogo] = useState<string | null>(() => {
    return localStorage.getItem('companyLogo') || JSON.parse(localStorage.getItem('userData') || '{}').logo_url || null;
  });
  
  // PDF Viewer state
  const [currentPDF, setCurrentPDF] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState<string>('');
  const [showPDFViewer, setShowPDFViewer] = useState<boolean>(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Dossier Report wizard (additive feature – opens over dashboard, no route change)
  const [dossierParams, setDossierParams] = useState<DossierParams | null>(null);

  // Standalone Equipment state
  const [standaloneEquipment, setStandaloneEquipment] = useState<any[]>([]);
  const [standaloneEquipmentLoading, setStandaloneEquipmentLoading] = useState(false);
  const [standaloneEquipmentSummary, setStandaloneEquipmentSummary] = useState<{
    total: number;
    active: number;
    dispatched: number;
    completed: number;
  } | null>(null);
  
  // Pagination state for project cards
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Project card metrics (doc %, manufacturing %, inspection/TPI % and counts) for 2×2 progress grid
  const [projectCardMetrics, setProjectCardMetrics] = useState<Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal?: number; inspectionTpiDone?: number }>>({});

  // Cached summary stats state (for instant display)
  const [cachedSummaryStats, setCachedSummaryStats] = useState<{ totalProjects: number; totalEquipment: number } | null>(null);
  
  // Cached tab counters state (for instant display - NEVER CLEAR)
  const [cachedTabCounters, setCachedTabCounters] = useState<{ 
    projects: number; 
    standaloneEquipment: number; 
    completionCertificates: number;
  } | null>(null);

  // Services paused by super admin - blocks all user actions
  const [servicesPaused, setServicesPaused] = useState(false);

  // Tab visibility: only run data fetches when window is in foreground (no background API)
  const [isWindowVisible, setIsWindowVisible] = useState(() => (typeof document !== 'undefined' ? document.visibilityState === 'visible' : true));
  useEffect(() => {
    const handler = () => setIsWindowVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Initialize cache cleanup on app startup
  useEffect(() => {
    initializeCacheCleanup();
  }, []);

  // Load cached summary stats on mount for instant display
  useEffect(() => {
    const cachedStats = getCache<{ totalProjects: number; totalEquipment: number }>(CACHE_KEYS.SUMMARY_STATS);
    if (cachedStats) {
      setCachedSummaryStats(cachedStats);
    }
  }, []);

  // Load cached tab counters on mount for instant display (NEVER CLEAR)
  useEffect(() => {
    const cachedCounters = getCache<{ 
      projects: number; 
      standaloneEquipment: number; 
      completionCertificates: number;
    }>(CACHE_KEYS.TAB_COUNTERS);
    if (cachedCounters) {
      setCachedTabCounters(cachedCounters);
    }
  }, []);

  // Tab counters: use cache only on mount (no API). Standalone count updated when user opens equipment tab.

  // Load user data from AuthContext and localStorage on component mount
  useEffect(() => {
    // Wait for AuthContext to finish loading
    if (authLoading) {
      return;
    }

    // Load and set user data from AuthContext (preferred) or localStorage (fallback)
    const loadUserData = async () => {
      try {
        // Use AuthContext values if available, otherwise fall back to localStorage
        if (authUserName && authUserRole) {
          setUserName(authUserName);
          setUserRole(authUserRole);
          
          // Get email from localStorage as fallback
          const userData = JSON.parse(localStorage.getItem('userData') || '{}');
          setUserEmail(userData.email || '');
        } else {
          // Fallback to localStorage if AuthContext values not available
          // First check direct localStorage keys (userName, userRole) - these are set by AuthContext
          const storedUserName = localStorage.getItem('userName');
          const storedUserRole = localStorage.getItem('userRole');
          
          if (storedUserName && storedUserRole) {
            setUserName(storedUserName);
            setUserRole(storedUserRole);
            
            // Get email from userData object
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            setUserEmail(userData.email || '');
          } else {
            // Fallback to userData object if direct keys don't exist
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            
            if (userData && userData.full_name) {
              setUserName(userData.full_name);
              setUserRole(userData.role);
              setUserEmail(userData.email);
            } else {
              // Set fallback values
              setUserName('User');
              setUserRole('user');
              setUserEmail('');
            }
          }
        }
        
        // Use firm data from AuthContext (single source - no duplicate getFirmById)
        const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
        if (firmId && authFirmData) {
          setFirmName(authFirmData.name || '');
          const logo = authFirmData.logo_url ?? null;
          setFirmLogo(logo);
          if (logo) localStorage.setItem('companyLogo', logo);
          else localStorage.removeItem('companyLogo');
          const role = authUserRole || localStorage.getItem('userRole');
          if (role !== 'super_admin') {
            setServicesPaused(authFirmData.services_paused ?? false);
          }
        } else if (firmId) {
          // Fallback: use cached values from localStorage until AuthContext has firmData
          setFirmName(localStorage.getItem('companyName') || '');
          setFirmLogo(localStorage.getItem('companyLogo'));
        }
        
        setLoading(false);
      } catch (error) {
        console.error('❌ Error loading user data:', error);
        setUserName('User');
        setUserRole('user');
        setUserEmail('');
        setLoading(false);
      }
    };

    loadUserData();
  }, [authLoading, authUserName, authUserRole, authFirmId, authFirmData]);

  // Sync services_paused from AuthContext firmData (Realtime updates happen there; no polling or duplicate API)
  useEffect(() => {
    const role = authUserRole || localStorage.getItem('userRole');
    if (role === 'super_admin') return;
    if (authFirmData && typeof authFirmData.services_paused === 'boolean') {
      setServicesPaused(authFirmData.services_paused);
    }
  }, [authFirmId, authUserRole, authFirmData]);

  // Refs to avoid frontend loop: double-fetch on load and refetch on every tab focus
  const projectsFetchTriggeredRef = useRef(false);
  const isProjectsFetchInProgressRef = useRef(false); // burst Refresh clicks → only one request
  // Once standalone equipment has been loaded, keep using state when switching back to tab (no refetch)
  const standaloneDataLoadedRef = useRef(false);
  // Preserve Projects pagination when switching main tabs (e.g. Projects page 2 -> Standalone -> back to Projects = stay on page 2)
  const projectsPageWhenLeftRef = useRef<number | null>(null);

  // Reset fetch flags when auth is loading (e.g. logout) so next login triggers fresh fetches
  useEffect(() => {
    if (authLoading) {
      projectsFetchTriggeredRef.current = false;
      standaloneDataLoadedRef.current = false;
    }
  }, [authLoading]);

  // Fetch projects only when auth is ready. No refetch on tab focus — fresh data only on load or manual refresh.
  useEffect(() => {
    let isMounted = true;

    // Wait for AuthContext to finish loading - do NOT fetch while authLoading is true (prevents double fetch)
    if (authLoading) {
      return;
    }

    const localStorageFirmId = JSON.parse(localStorage.getItem('userData') || '{}').firm_id || localStorage.getItem('firmId');
    const localStorageUserRole = localStorage.getItem('userRole');
    if (!localStorageFirmId || !localStorageUserRole) {
      return;
    }

    if (!isWindowVisible) {
      setLoading(false);
      return;
    }

    if (projectsFetchTriggeredRef.current) {
      return;
    }
    projectsFetchTriggeredRef.current = true;

    const fetchProjectsFromSupabase = async () => {
      if (isProjectsFetchInProgressRef.current) return;
      isProjectsFetchInProgressRef.current = true;
      try {
        // Get firmId from AuthContext or localStorage (fallback)
        const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id || localStorage.getItem('firmId');
        
        if (!firmId) {
          console.error('❌ No firmId found. AuthContext:', { authFirmId, authLoading, authUserRole }, 'localStorage userData:', localStorage.getItem('userData'), 'localStorage firmId:', localStorage.getItem('firmId'));
          return;
        }
        
        // console.log('🔄 Fetching projects...', { authFirmId, firmId, authUserRole, fromAuthContext: !!authFirmId, fromLocalStorage: !authFirmId });

        // Fetch projects from Supabase with role-based filtering
        // Use values from AuthContext, with localStorage as fallback
        const userRole = authUserRole || localStorage.getItem('userRole');
        const userId = localStorage.getItem('userId');
        
        // Create cache key based on user context
        const cacheKey = `${CACHE_KEYS.PROJECT_CARDS}_${firmId}_${userRole || 'none'}_${userId || 'none'}`;
        
        // Always fetch fresh data when auth becomes available (after refresh)
        // Don't rely on cache on initial load after refresh - ensure fresh data
        setLoading(true);
        await fetchFreshProjects(firmId, userRole || undefined, userId || undefined, cacheKey);
        
      } catch (error) {
        console.error('❌ Error fetching projects from Supabase:', error);
        setLoading(false);
      } finally {
        isProjectsFetchInProgressRef.current = false;
      }
    };

    // Helper function to fetch and transform projects
    const fetchFreshProjects = async (firmId: string, userRole?: string, userId?: string, cacheKey?: string) => {
      try {
        // console.log('📡 Calling fastAPI.getProjectsByFirm...', { firmId, userRole, userId });
        // console.log('⏱️ API call started at:', new Date().toISOString());
        
        let supabaseProjects;
        try {
          // Add timeout wrapper
          const apiPromise = fastAPI.getProjectsByFirm(firmId, userRole, userId);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API call timeout after 60 seconds')), 60000)
          );
          
          supabaseProjects = await Promise.race([apiPromise, timeoutPromise]) as any;
          
          // console.log('⏱️ API call completed at:', new Date().toISOString());
          // console.log('📦 Received projects from API:', { 
          //   isArray: Array.isArray(supabaseProjects), 
          //   length: supabaseProjects?.length || 0,
          //   firstProject: supabaseProjects?.[0],
          //   type: typeof supabaseProjects
          // });
        } catch (apiError: any) {
          console.error('⏱️ API call failed at:', new Date().toISOString());
          console.error('❌ API call failed:', apiError);
          console.error('❌ API error details:', {
            message: apiError?.message,
            response: apiError?.response?.data,
            status: apiError?.response?.status,
            config: apiError?.config?.url,
            stack: apiError?.stack
          });
          throw apiError;
        }
        
        if (supabaseProjects && Array.isArray(supabaseProjects) && supabaseProjects.length > 0) {
          // Use getProjectsByFirm response as single source (no duplicate getEquipmentByProject per project)
          const standardTypes = ['Heat Exchanger', 'Pressure Vessel', 'Storage Tank', 'Reactor'];
          const mapApiBreakdownToUi = (apiBreakdown: Record<string, number> | undefined) => {
            if (!apiBreakdown || typeof apiBreakdown !== 'object') return {};
            return {
              heatExchanger: apiBreakdown['Heat Exchanger'] ?? 0,
              pressureVessel: apiBreakdown['Pressure Vessel'] ?? 0,
              storageTank: apiBreakdown['Storage Tank'] ?? 0,
              reactor: apiBreakdown['Reactor'] ?? 0,
              ...Object.fromEntries(
                Object.entries(apiBreakdown)
                  .filter(([k]) => !standardTypes.includes(k))
                  .map(([k, v]) => [k.replace(/\s+/g, '').toLowerCase(), v])
              ),
            };
          };

          const transformedProjects = (supabaseProjects as any[]).map((project: any) => {
            const equipmentData = Array.isArray(project.equipment) ? project.equipment : [];
            const equipmentBreakdown = mapApiBreakdownToUi(project.equipmentBreakdown);

            // Create lightweight project metadata for caching (without full equipment arrays)
            const projectMetadata = {
            id: project.id,
            name: project.name,
            client: project.client,
            location: project.location || 'TBD',
            equipmentCount: project.equipmentCount || project.equipment_count || 0,
            activeEquipment: project.active_equipment || 0,
            progress: project.progress || 0,
            status: project.status || 'active',
            manager: project.manager || 'TBD',
            deadline: project.deadline || 'TBD',
            completedDate: project.completed_date ,
            poNumber: project.po_number || 'TBD',
            scopeOfWork: project.scope_of_work || '',
            // Add default values for other fields
            salesOrderDate: project.sales_order_date || '',
            clientIndustry: project.client_industry || 'TBD',
            servicesIncluded: project.services_included ? 
              (typeof project.services_included === 'object' ? 
                Object.entries(project.services_included)
                  .filter(([_, value]) => value === true)
                  .map(([key, _]) => key) : 
                project.services_included) : [],
            consultant: project.consultant || 'TBD',
            tpiAgency: project.tpi_agency || 'TBD',
            clientFocalPoint: project.client_focal_point || 'Not specified',
            vdcrManager: project.vdcr_manager || 'TBD',
            kickoffMeetingNotes: project.kickoff_meeting_notes || '',
            specialProductionNotes: project.special_production_notes || '',
            equipmentBreakdown: equipmentBreakdown,
            // Document metadata (just names, not full data)
            unpricedPOFile: project.unpriced_po_documents && project.unpriced_po_documents.length > 0 ? 
              { name: project.unpriced_po_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            designInputsPID: project.design_inputs_documents && project.design_inputs_documents.length > 0 ? 
              { name: project.design_inputs_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            clientReferenceDoc: project.client_reference_documents && project.client_reference_documents.length > 0 ? 
              { name: project.client_reference_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            otherDocuments: project.other_documents && project.other_documents.length > 0 ? 
              project.other_documents.map((doc: any) => ({ name: doc.document_name || 'Document', uploaded: true, type: doc.mime_type || 'PDF' })) : null,
            unpricedPODocuments: project.unpriced_po_documents || [],
            designInputsDocuments: project.design_inputs_documents || [],
            clientReferenceDocuments: project.client_reference_documents || [],
            otherDocumentsLinks: project.other_documents || [],
            // Recommendation letter data
            recommendationLetter: project.recommendation_letter || {
              status: 'not-requested' as const,
              reminderCount: 0
            },
            // Don't include full equipment array in cached metadata - it's too large
            // Equipment will be cached separately per-project when needed
            equipment: [] // Empty array for cached version - will be loaded on-demand
          };
            const docTotal = Number(project.doc_total) ?? 0;
            const docCode1 = Number(project.doc_code1) ?? 0;
            const docCode2 = Number(project.doc_code2) ?? 0;
            const docCode3 = Number(project.doc_code3) ?? 0;
            const docCode4 = Number(project.doc_code4) ?? 0;

            return {
              ...projectMetadata,
              equipment: equipmentData,
              doc_total: docTotal,
              doc_code1: docCode1,
              doc_code2: docCode2,
              doc_code3: docCode3,
              doc_code4: docCode4,
            };
          });

          // Update state with Supabase data
          setProjects(transformedProjects as any);
          setFilteredProjects(transformedProjects as any);
          setLoading(false);
          // Doc % from project list (same source as documentation tab); merge RPC when it returns
          const metricsFromProjects: Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal?: number; inspectionTpiDone?: number }> = {};
          (supabaseProjects as any[]).forEach((p: any) => {
            const total = Number(p.doc_total) ?? 0;
            const c1 = Number(p.doc_code1) ?? 0;
            const c2 = Number(p.doc_code2) ?? 0;
            const c3 = Number(p.doc_code3) ?? 0;
            const c4 = Number(p.doc_code4) ?? 0;
            let docPct = 0;
            if (total > 0) {
              const share = 100 / total;
              docPct = c1 * share * 1 + c2 * share * 0.8 + c3 * share * 0.5 + c4 * share * 0;
            }
            const equipmentData = Array.isArray(p.equipment) ? p.equipment : [];
            const mfgPct = equipmentData.length > 0
              ? equipmentData.reduce((s: number, eq: any) => s + (Number(eq.progress) || 0), 0) / equipmentData.length
              : 0;
            metricsFromProjects[p.id] = {
              docProgressPct: Math.round(docPct * 10) / 10,
              manufacturingProgressPct: mfgPct,
              inspectionTpiPct: 0,
              inspectionTpiTotal: 0,
              inspectionTpiDone: 0,
            };
          });
          setProjectCardMetrics(metricsFromProjects);
          fastAPI.getProjectCardMetrics(transformedProjects.map((p: any) => p.id)).then((rpc) => {
            setProjectCardMetrics((prev) => ({ ...prev, ...rpc }));
          }).catch(() => {});
          const projectCount = transformedProjects.length;
          const completedCount = (transformedProjects as any[]).filter((p: any) => p.status === 'completed').length;
          const prevCounters = getCache<{ projects: number; standaloneEquipment: number; completionCertificates: number }>(CACHE_KEYS.TAB_COUNTERS);
          const tabCounters = prevCounters
            ? { ...prevCounters, projects: projectCount, completionCertificates: completedCount }
            : { projects: projectCount, standaloneEquipment: 0, completionCertificates: completedCount };
          setCachedTabCounters(tabCounters);
          setCache(CACHE_KEYS.TAB_COUNTERS, tabCounters, { ttl: 24 * 60 * 60 * 1000 });

          // Cache the transformed projects (metadata only, without full equipment arrays)
          // Only cache active projects (not completed), limit to 24 projects max
          if (cacheKey) {
            // Filter out completed projects and limit to 24
            const activeProjects = transformedProjects
              .filter((p: any) => p.status !== 'completed')
              .slice(0, 24); // Limit to 24 projects max
            
            // Create lightweight version without equipment arrays for caching
            const lightweightProjects = activeProjects.map((p: any) => ({
              ...p,
              equipment: [] // Remove equipment array to save space
            }));
            setCache(cacheKey, lightweightProjects, { 
              ttl: 10 * 60 * 1000, // 10 minutes TTL
              maxSize: 1 * 1024 * 1024 // 1MB max for project cards cache
            });
          }
        } else {
          console.warn('⚠️ No projects returned from API or empty array', { 
            supabaseProjects, 
            isArray: Array.isArray(supabaseProjects),
            length: supabaseProjects?.length || 0 
          });
          setProjects([]);
          setFilteredProjects([]);
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ Error fetching projects from Supabase:', error);
        // Preserve existing data: restore from cache if available, otherwise leave state unchanged
        if (cacheKey) {
          const cached = getCacheEvenIfExpired<any[]>(cacheKey);
          if (cached && Array.isArray(cached) && cached.length > 0) {
            setProjects(cached);
            setFilteredProjects(cached);
            const metricsFromCache: Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal?: number; inspectionTpiDone?: number }> = {};
            cached.forEach((p: any) => {
              const total = Number(p.doc_total) ?? 0;
              const c1 = Number(p.doc_code1) ?? 0, c2 = Number(p.doc_code2) ?? 0, c3 = Number(p.doc_code3) ?? 0, c4 = Number(p.doc_code4) ?? 0;
              let docPct = total > 0 ? (c1 * 1 + c2 * 0.8 + c3 * 0.5 + c4 * 0) * (100 / total) : 0;
              const equipmentData = Array.isArray(p.equipment) ? p.equipment : [];
              const mfgPct = equipmentData.length > 0 ? equipmentData.reduce((s: number, eq: any) => s + (Number(eq.progress) || 0), 0) / equipmentData.length : 0;
              metricsFromCache[p.id] = { docProgressPct: Math.round(docPct * 10) / 10, manufacturingProgressPct: mfgPct, inspectionTpiPct: 0, inspectionTpiTotal: 0, inspectionTpiDone: 0 };
            });
            setProjectCardMetrics(metricsFromCache);
            fastAPI.getProjectCardMetrics(cached.map((p: any) => p.id)).then((rpc) => setProjectCardMetrics((prev) => ({ ...prev, ...rpc }))).catch(() => {});
          }
        }
        setLoading(false);
      }
    };

    fetchProjectsRef.current = fetchProjectsFromSupabase;
    fetchProjectsFromSupabase();
    
    return () => {
      isMounted = false;
      fetchProjectsRef.current = null;
    };
    
    // Only when auth becomes ready. No refetch on tab focus — use manual refresh for fresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Apply filters when projects change
  useEffect(() => {
    if (projects.length > 0) {
      applyFilters(activeFilters);
    }
  }, [projects]);

  // Cleanup PDF URLs on component unmount
  useEffect(() => {
    return () => {
      // Clean up any blob URLs when component unmounts
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Clean Tab System
  const [activeTab, setActiveTab] = useState<'all' | 'overdue' | 'active'>('all');
  
  // Main Tab System (Projects, Standalone Equipment, Tasks, Completion Certificates)
  const [mainTab, setMainTab] = useState<'projects' | 'equipment' | 'tasks' | 'certificates'>('projects');
  // Store the previous tab before navigating to project view (for back navigation)
  const [previousTab, setPreviousTab] = useState<'projects' | 'equipment' | 'tasks' | 'certificates' | null>(null);

  // Manage Weightage modal state (per-project VDCR doc weighting for documentation progress)
  const [weightageModalProjectId, setWeightageModalProjectId] = useState<string | null>(null);
  const [weightageActiveTab, setWeightageActiveTab] = useState<'documentation' | 'manufacturing'>('documentation');
  const [weightageDocs, setWeightageDocs] = useState<{ id: string; sr_no: string; document_name: string; code_status: string; weight_pct: number; isFixed: boolean; input: string }[]>([]);
  const [weightageManufacturingEquipments, setWeightageManufacturingEquipments] = useState<
    { id: string; title: string; tag_number: string; weight_pct: number; isFixed: boolean; input: string }[]
  >([]);
  const [weightageLoading, setWeightageLoading] = useState(false);
  const [weightageSaving, setWeightageSaving] = useState(false);
  const [codeCompletionFactors, setCodeCompletionFactors] = useState<
    { code_status: 'Code 1' | 'Code 2' | 'Code 3' | 'Code 4'; label: string; percentage: string; defaultPercentage: number }[]
  >([
    { code_status: 'Code 1', label: 'Code 1', percentage: '100', defaultPercentage: 100 },
    { code_status: 'Code 2', label: 'Code 2', percentage: '80', defaultPercentage: 80 },
    { code_status: 'Code 3', label: 'Code 3', percentage: '50', defaultPercentage: 50 },
    { code_status: 'Code 4', label: 'Code 4', percentage: '0', defaultPercentage: 0 },
  ]);

  const openManageWeightage = async (projectId: string) => {
    try {
      setWeightageLoading(true);
      setWeightageModalProjectId(projectId);
      setWeightageActiveTab('documentation');

      const [docs, weights, factors, equipment, equipmentWeightsRaw] = await Promise.all([
        fastAPI.getProjectVdcrDocsForWeighting(projectId),
        fastAPI.getProjectVdcrWeights(projectId),
        fastAPI.getProjectVdcrCodeCompletionFactors(projectId),
        fastAPI.getEquipmentByProject(projectId),
        fastAPI.getProjectEquipmentWeights(projectId).catch(() => ({} as Record<string, number>)),
      ]);
      const equipmentWeights = equipmentWeightsRaw && typeof equipmentWeightsRaw === 'object' ? equipmentWeightsRaw : {};

      const docsArray = Array.isArray(docs) ? docs : [];
      const totalDocs = docsArray.length;
      let defaultShare = totalDocs > 0 ? 100 / totalDocs : 0;

      const rows = docsArray.map((d: any) => {
        const id = String(d.id);
        const existingWeight = weights[id];
        const hasCustom = existingWeight != null && !Number.isNaN(existingWeight);
        const base = hasCustom ? Number(existingWeight) : defaultShare;
        return {
          id,
          sr_no: String(d.sr_no ?? ''),
          document_name: String(d.document_name ?? ''),
          code_status: String(d.code_status ?? ''),
          weight_pct: base,
          // On initial load, treat all rows as flexible so that changes to one row
          // rebalance the others. Rows become fixed only when the user edits them.
          isFixed: false,
          input: Number.isFinite(base) ? base.toFixed(1) : '',
        };
      });

      // Normalize to 100% only when we did NOT load custom weights (avoid overwriting saved weights when opening panel)
      const hasSavedDocWeights = docsArray.some((d: any) => {
        const w = weights[String(d.id)];
        return w != null && !Number.isNaN(Number(w));
      });
      if (!hasSavedDocWeights) {
        const fixedTotal = rows.filter(r => r.isFixed).reduce((sum, r) => sum + (r.weight_pct || 0), 0);
        const flexible = rows.filter(r => !r.isFixed);
        const remaining = Math.max(0, 100 - fixedTotal);
        if (flexible.length > 0) {
          const per = remaining / flexible.length;
          for (const r of flexible) {
            r.weight_pct = per;
          }
        }
      }

      setWeightageDocs(rows);

      // Prepare manufacturing rows – use saved weights if present, else equal share; normalize to 100%
      const equipmentArray = Array.isArray(equipment) ? equipment : [];
      const totalEquipments = equipmentArray.length;
      const defaultEquipmentShare = totalEquipments > 0 ? 100 / totalEquipments : 0;
      let equipmentRows = equipmentArray.map((eq: any) => {
        const id = String(eq.id);
        const existingWeight = equipmentWeights[id];
        const base = existingWeight != null && !Number.isNaN(existingWeight)
          ? Number(existingWeight)
          : defaultEquipmentShare;
        return {
          id,
          title: String(eq.manufacturing_serial ?? eq.any_personal_title ?? eq.name ?? eq.type ?? 'Untitled equipment'),
          tag_number: String(eq.tag_number ?? ''),
          weight_pct: base,
          isFixed: false,
          input: Number.isFinite(base) ? base.toFixed(1) : '',
        };
      });
      // Normalize so total is exactly 100% (fixes stale or bad stored data)
      const mfgTotal = equipmentRows.reduce((sum, eq) => sum + (eq.weight_pct || 0), 0);
      if (equipmentRows.length > 0 && Number.isFinite(mfgTotal) && mfgTotal > 0 && Math.abs(mfgTotal - 100) > 0.01) {
        const scale = 100 / mfgTotal;
        equipmentRows = equipmentRows.map((eq) => {
          const w = (eq.weight_pct || 0) * scale;
          return { ...eq, weight_pct: w, input: w.toFixed(1) };
        });
      }
      setWeightageManufacturingEquipments(equipmentRows);

      // Initialize per-code completion factors (0–100%) for this project.
      setCodeCompletionFactors((prev) =>
        prev.map((entry) => {
          const existing = factors?.[entry.code_status];
          if (existing == null || Number.isNaN(existing)) {
            return {
              ...entry,
              percentage: entry.defaultPercentage.toString(),
            };
          }
          const numeric = Math.max(0, Math.min(100, Number(existing)));
          return {
            ...entry,
            percentage: numeric.toString(),
          };
        })
      );
    } catch (error: any) {
      console.error('❌ Failed to open Manage Weightage modal:', error);
      toast({
        title: 'Error',
        description: error?.response?.data?.message || error?.message || 'Failed to load documents for weightage.',
        variant: 'destructive',
      });
      setWeightageModalProjectId(null);
    } finally {
      setWeightageLoading(false);
    }
  };

  const recalculateFlexibleWeights = () => {
    setWeightageDocs((prev) => {
      const docs = [...prev];
      const fixedTotal = docs.filter(d => d.isFixed).reduce((sum, d) => sum + (d.weight_pct || 0), 0);
      const flexibleDocs = docs.filter(d => !d.isFixed);
      const remaining = Math.max(0, 100 - fixedTotal);
      if (flexibleDocs.length > 0) {
        const per = remaining / flexibleDocs.length;
        flexibleDocs.forEach(d => {
          d.weight_pct = per;
          d.input = per.toFixed(1);
        });
      }
      return docs;
    });
  };

  const handleWeightChange = (id: string, value: string) => {
    // Allow easy typing: digits and a single decimal point.
    let cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5);

    setWeightageDocs((prev) => {
      const docs = prev.map((d) => {
        if (d.id !== id) return d;
        if (cleaned === '') {
          // Let the field be empty while typing; treat as 0 for now but keep isFixed so we don't auto-fill.
          return { ...d, input: '', weight_pct: 0, isFixed: true };
        }
        const numeric = parseFloat(cleaned);
        const clamped = isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric)); // 0–100 with decimals
        return {
          ...d,
          input: cleaned,
          weight_pct: clamped,
          isFixed: true,
        };
      });

      // Recalculate flexible docs after applying this change (do NOT touch fixed docs)
      const fixedTotal = docs.filter(d => d.isFixed).reduce((sum, d) => sum + (d.weight_pct || 0), 0);
      const flexibleDocs = docs.filter(d => !d.isFixed);
      const remaining = Math.max(0, 100 - fixedTotal);
      if (flexibleDocs.length > 0) {
        const per = remaining / flexibleDocs.length;
        flexibleDocs.forEach(d => {
          d.weight_pct = per;
          d.input = per.toFixed(1);
        });
      }

      return docs;
    });
  };

  const adjustWeightByStep = (id: string, delta: number) => {
    setWeightageDocs((prev) => {
      const docs = prev.map((d) => {
        if (d.id !== id) return d;
        const current = d.input === '' ? 0 : parseFloat(d.input) || 0;
        const next = Math.max(0, Math.min(100, current + delta));
        return {
          ...d,
          input: next.toFixed(1),
          weight_pct: next,
          isFixed: true,
        };
      });

      const fixedTotal = docs.filter(d => d.isFixed).reduce((sum, d) => sum + (d.weight_pct || 0), 0);
      const flexibleDocs = docs.filter(d => !d.isFixed);
      const remaining = Math.max(0, 100 - fixedTotal);
      if (flexibleDocs.length > 0) {
        const per = remaining / flexibleDocs.length;
        flexibleDocs.forEach(d => {
          d.weight_pct = per;
          d.input = per.toFixed(1);
        });
      }

      return docs;
    });
  };

  const handleResetWeightage = () => {
    if (!weightageDocs.length) return;
    const confirmed = window.confirm('Reset all document weights to equal percentages (default)?');
    if (!confirmed) return;

    setWeightageDocs((prev) => {
      const docs = [...prev];
      if (!docs.length) return docs;
      const per = 100 / docs.length;
      return docs.map((d) => ({
        ...d,
        weight_pct: per,
        isFixed: false,
        input: String(Math.round(per)),
      }));
    });
  };

  const handleResetManufacturingWeightage = () => {
    if (!weightageManufacturingEquipments.length) return;
    const confirmed = window.confirm('Reset all equipment weights to equal percentages (default)?');
    if (!confirmed) return;

    setWeightageManufacturingEquipments((prev) => {
      const list = [...prev];
      if (!list.length) return list;
      const per = 100 / list.length;
      return list.map((eq) => ({
        ...eq,
        weight_pct: per,
        isFixed: false,
        input: per.toFixed(1),
      }));
    });
  };

  // Manufacturing weight change – same logic as handleWeightChange (documentation)
  const handleManufacturingWeightChange = (id: string, value: string) => {
    let cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5);

    setWeightageManufacturingEquipments((prev) => {
      const list = prev.map((eq) => {
        if (eq.id !== id) return eq;
        if (cleaned === '') {
          return { ...eq, input: '', weight_pct: 0, isFixed: true };
        }
        const numeric = parseFloat(cleaned);
        const clamped = isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric));
        return { ...eq, input: cleaned, weight_pct: clamped, isFixed: true };
      });

      const fixedTotal = list.filter((eq) => eq.isFixed).reduce((sum, eq) => sum + (eq.weight_pct || 0), 0);
      const flexibleList = list.filter((eq) => !eq.isFixed);
      const remaining = Math.max(0, 100 - fixedTotal);
      if (flexibleList.length > 0) {
        const per = remaining / flexibleList.length;
        flexibleList.forEach((eq) => {
          eq.weight_pct = per;
          eq.input = per.toFixed(1);
        });
      }

      return list;
    });
  };

  // Manufacturing step adjust – same logic as adjustWeightByStep (documentation)
  const adjustManufacturingWeightByStep = (id: string, delta: number) => {
    setWeightageManufacturingEquipments((prev) => {
      const list = prev.map((eq) => {
        if (eq.id !== id) return eq;
        const current = eq.input === '' ? 0 : parseFloat(eq.input) || 0;
        const next = Math.max(0, Math.min(100, current + delta));
        return { ...eq, input: next.toFixed(1), weight_pct: next, isFixed: true };
      });

      const fixedTotal = list.filter((eq) => eq.isFixed).reduce((sum, eq) => sum + (eq.weight_pct || 0), 0);
      const flexibleList = list.filter((eq) => !eq.isFixed);
      const remaining = Math.max(0, 100 - fixedTotal);
      if (flexibleList.length > 0) {
        const per = remaining / flexibleList.length;
        flexibleList.forEach((eq) => {
          eq.weight_pct = per;
          eq.input = per.toFixed(1);
        });
      }

      return list;
    });
  };

  const handleCodeCompletionFactorChange = (code_status: 'Code 1' | 'Code 2' | 'Code 3' | 'Code 4', value: string) => {
    let cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5);

    setCodeCompletionFactors((prev) =>
      prev.map((entry) => {
        if (entry.code_status !== code_status) return entry;
        if (cleaned === '') {
          return { ...entry, percentage: '' };
        }
        const numeric = parseFloat(cleaned);
        const clamped = isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric));
        return { ...entry, percentage: clamped.toString() };
      })
    );
  };

  const handleResetCodeCompletionFactors = () => {
    setCodeCompletionFactors((prev) =>
      prev.map((entry) => ({
        ...entry,
        percentage: entry.defaultPercentage.toString(),
      }))
    );
  };

  const handleSaveWeightage = async () => {
    if (!weightageModalProjectId) return;
    try {
      setWeightageSaving(true);

      const docs = weightageDocs;
      const total = docs.reduce((sum, d) => sum + (d.weight_pct || 0), 0);
      if (!Number.isFinite(total) || total <= 0) {
        toast({
          title: 'Invalid Weights',
          description: 'Total weight must be greater than 0%.',
          variant: 'destructive',
        });
        setWeightageSaving(false);
        return;
      }

      // Require total to be very close to 100 to avoid confusing scaling (allow small decimal tolerance)
      if (Math.abs(total - 100) > 0.1) {
        toast({
          title: 'Please Adjust Weights',
          description: `Total weight must equal 100%. It is currently ${total.toFixed(1)}%.`,
          variant: 'destructive',
        });
        setWeightageSaving(false);
        return;
      }

      // Require at least one code to have 100% completion value so max progress can still reach 100%.
      const hasFullCode = codeCompletionFactors.some((entry) => {
        const numeric = parseFloat(entry.percentage);
        const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : entry.defaultPercentage;
        return Math.abs(clamped - 100) < 0.1;
      });
      if (!hasFullCode) {
        toast({
          title: 'Please Set One Code to 100%',
          description: 'At least one code (e.g. Code 1) must have a completion value of 100% so overall documentation can reach 100%.',
          variant: 'destructive',
        });
        setWeightageSaving(false);
        return;
      }

      const payload = docs.map((d) => ({
        vdcr_record_id: d.id,
        weight_pct: Math.max(0, d.weight_pct),
      }));

      await fastAPI.saveProjectVdcrWeights(weightageModalProjectId, payload);

      // Save per-code completion factors for this project.
      const factorPayload = codeCompletionFactors.map((entry) => {
        const numeric = parseFloat(entry.percentage);
        const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : entry.defaultPercentage;
        return {
          code_status: entry.code_status,
          percentage: clamped,
        };
      });

      await fastAPI.saveProjectVdcrCodeCompletionFactors(weightageModalProjectId, factorPayload);

      // Refresh project card metrics so documentation ring reflects new weights
      try {
        await fastAPI
          .getProjectCardMetrics([weightageModalProjectId])
          .then((rpc) => setProjectCardMetrics((prev) => ({ ...prev, ...rpc })))
          .catch(() => {});
      } catch {
        // Ignore refresh error, weights are still saved
      }

      toast({
        title: 'Weights Saved',
        description: 'Documentation weightage has been updated for this project.',
      });
      setWeightageModalProjectId(null);
    } catch (error: any) {
      console.error('❌ Error saving documentation weightage:', error);
      toast({
        title: 'Error',
        description: error?.response?.data?.message || error?.message || 'Failed to save documentation weightage.',
        variant: 'destructive',
      });
    } finally {
      setWeightageSaving(false);
    }
  };

  // Equipment onboarding lock: firm's Equipment tab is locked for N days after creation (set by super admin)
  const [equipmentLock, setEquipmentLock] = useState<{ isLocked: boolean; daysRemaining: number; totalDays: number } | null>(null);
  const [equipmentLockModalOpen, setEquipmentLockModalOpen] = useState(false);

  // Compute equipment lock from AuthContext firmData (no duplicate getFirmById)
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('epms_force_equipment_lock') === '1') {
      setEquipmentLock({ isLocked: true, daysRemaining: 30, totalDays: 90 });
      return;
    }
    if (!authFirmId || authLoading || !authFirmData) {
      if (!authFirmId || authLoading) return;
      setEquipmentLock({ isLocked: false, daysRemaining: 0, totalDays: 0 });
      return;
    }
    const createdAt = authFirmData.created_at;
    const unlockDays = authFirmData.equipment_unlock_days;
    if (createdAt == null || createdAt === undefined) {
      setEquipmentLock({ isLocked: false, daysRemaining: 0, totalDays: 0 });
      return;
    }
    const totalDays = typeof unlockDays === 'number' ? Math.max(0, unlockDays) : 90;
    const created = new Date(createdAt);
    const unlockDate = new Date(created);
    unlockDate.setDate(unlockDate.getDate() + totalDays);
    const now = new Date();
    const isLocked = now < unlockDate;
    const daysRemaining = isLocked ? Math.max(1, Math.ceil((unlockDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;
    setEquipmentLock({ isLocked, daysRemaining, totalDays });
  }, [authFirmId, authLoading, authFirmData]);

  // When equipment is locked and user is on Standalone Equipment tab, switch them to projects
  useEffect(() => {
    if (equipmentLock?.isLocked && mainTab === 'equipment') {
      setMainTab('projects');
    }
  }, [equipmentLock?.isLocked, mainTab]);

  // Fetch standalone equipment only when user opens the Equipment tab. Once loaded, preserve in state – no refetch when switching back.
  useEffect(() => {
    if (mainTab !== 'equipment' || !isWindowVisible) return;

    // Already loaded in this session – use existing state, no new requests
    if (standaloneDataLoadedRef.current) {
      setStandaloneEquipmentLoading(false);
      return;
    }

    const cacheKey = `${CACHE_KEYS.EQUIPMENT}_standalone`;
    const cachedEquipment = getCache<any[]>(cacheKey);

    // Cache is "stripped" if it has progress metadata/entries but missing display fields (images or created_by_user/entry_text)
    const isCacheStripped = (list: any[] | null) => {
      if (!list?.length) return false;
      const first = list[0];
      const hasMetaNoImages = (first.progress_images_metadata?.length > 0) && !(first.progress_images?.length > 0);
      const hasEntriesNoCreator = (first.progress_entries?.length > 0) && first.progress_entries.some(
        (e: any) => !e.created_by_user && !e.entry_text && !e.text
      );
      return hasMetaNoImages || hasEntriesNoCreator;
    };

    const fetchStandaloneEquipment = async () => {
      try {
        setStandaloneEquipmentLoading(true);

        // Valid cache: use only if it has full display data (images + entries with created_by_user/entry_text)
        if (cachedEquipment !== null && Array.isArray(cachedEquipment) && cachedEquipment.length > 0 && !isCacheStripped(cachedEquipment)) {
          const limitedCached = cachedEquipment.slice(0, 24);
          setStandaloneEquipment(limitedCached);
          standaloneDataLoadedRef.current = true;
          setStandaloneEquipmentLoading(false);
          const count = limitedCached.length;
          const prevCounters = getCache<{ projects: number; standaloneEquipment: number; completionCertificates: number }>(CACHE_KEYS.TAB_COUNTERS);
          const tabCounters = prevCounters ? { ...prevCounters, standaloneEquipment: count } : { projects: 0, standaloneEquipment: count, completionCertificates: 0 };
          setCachedTabCounters(tabCounters);
          setCache(CACHE_KEYS.TAB_COUNTERS, tabCounters, { ttl: 24 * 60 * 60 * 1000 });
          return;
        }

        // No valid cache (or stripped): use expired only if not stripped, then fetch when visible
        const expiredCache = getCacheEvenIfExpired<any[]>(cacheKey);
        if (expiredCache !== null && Array.isArray(expiredCache) && expiredCache.length > 0 && !isCacheStripped(expiredCache)) {
          setStandaloneEquipment(expiredCache.slice(0, 24));
          setStandaloneEquipmentLoading(false);
        }

        // Single fetch (tab is active and visible, first time in this session)
        const equipment = await fastAPI.getStandaloneEquipment();

        if (equipment && Array.isArray(equipment) && equipment.length > 0) {
          const first24 = equipment.slice(0, 24);
          // Keep full progress_images, progress_images_metadata, and progress_entries so UI shows images/entries correctly without extra API calls.
          // Only strip heavy document blobs; preserve created_by_user and entry_text for "Uploaded by" and description.
          const lightweight = first24.map((eq: any) => ({
            ...eq,
            progress_images: eq.progress_images ?? [],
            progress_images_metadata: eq.progress_images_metadata ?? [],
            progress_entries: eq.progress_entries ?? [],
            documents: [],
            images: [],
          }));
          setCache(cacheKey, lightweight, {
            ttl: 24 * 60 * 60 * 1000,
            maxSize: 4 * 1024 * 1024,
          });
          setStandaloneEquipment(first24);
          standaloneDataLoadedRef.current = true;
          const count = first24.length;
          const prevCounters = getCache<{ projects: number; standaloneEquipment: number; completionCertificates: number }>(CACHE_KEYS.TAB_COUNTERS);
          const tabCounters = prevCounters ? { ...prevCounters, standaloneEquipment: count } : { projects: 0, standaloneEquipment: count, completionCertificates: 0 };
          setCachedTabCounters(tabCounters);
          setCache(CACHE_KEYS.TAB_COUNTERS, tabCounters, { ttl: 24 * 60 * 60 * 1000 });
        } else if (standaloneEquipment.length === 0) {
          setStandaloneEquipment([]);
          standaloneDataLoadedRef.current = true;
        }
      } catch (error) {
        console.error('❌ Error fetching standalone equipment:', error);
        toast({
          title: "Error",
          description: "Failed to load standalone equipment. Showing cached data if available.",
          variant: "destructive",
        });
      } finally {
        setStandaloneEquipmentLoading(false);
      }
    };

    fetchStandaloneEquipment();
  }, [mainTab, isWindowVisible, toast]);
  
  // Template data for download
  const certificateTemplates = [
    {
      id: '1',
      name: 'Project Completion Certificate - Standard',
      description: 'Standard completion certificate template for engineering projects',
      fileName: 'completion-certificate-standard.docx',
      category: 'completion'
    },
    {
      id: '2',
      name: 'Project Completion Certificate - Detailed',
      description: 'Detailed completion certificate with equipment breakdown',
      fileName: 'completion-certificate-detailed.docx',
      category: 'completion'
    },
    {
      id: '3',
      name: 'Recommendation Letter - Client Template',
      description: 'Template for requesting client recommendation letters',
      fileName: 'recommendation-letter-request.docx',
      category: 'recommendation'
    },
    {
      id: '4',
      name: 'Quality Assurance Certificate',
      description: 'QA certificate template for completed projects',
      fileName: 'qa-certificate-template.docx',
      category: 'qa'
    },
    {
      id: '5',
      name: 'Final Inspection Certificate',
      description: 'Final inspection certificate template',
      fileName: 'final-inspection-certificate.docx',
      category: 'inspection'
    }
  ];
  
  // Hardcoded user data for demo
  // useEffect(() => {
  //   // User data is already set in useState above
  // }, []);
  
  // Separate filtered projects for each tab
  const overdueProjects = useMemo(() => {
    return filteredProjects.filter(project => {
      try {
        const deadline = new Date(project.deadline);
        const today = new Date();
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Only show as overdue if past deadline AND not completed
        return diffDays < 0 && project.status !== 'completed';
      } catch (error) {
        return false;
      }
    });
  }, [filteredProjects]);
  
  const activeProjects = useMemo(() => {
    return filteredProjects.filter(project => {
      try {
        const deadline = new Date(project.deadline);
        const today = new Date();
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Active projects: not overdue, not completed, and have a future deadline
        return diffDays >= 0 && project.status !== 'completed';
      } catch (error) {
        return false;
      }
    });
  }, [filteredProjects]);
  
  const completedProjects = useMemo(() => {
    return filteredProjects.filter(project => project.status === 'completed');
  }, [filteredProjects]);
  
  // For "All Projects" tab: only show non-completed projects (completed projects are shown in Completion Certificates tab)
  const allProjects = useMemo(() => {
    return filteredProjects.filter(project => project.status !== 'completed');
  }, [filteredProjects]);
  
  // Current projects to display based on active tab (completed projects are only shown in Completion Certificates tab)
  const currentProjects = activeTab === 'overdue' ? overdueProjects : 
                         activeTab === 'active' ? activeProjects :
                         allProjects;
  
  // Pagination: Calculate total pages and slice projects
  const totalProjectPages = Math.ceil(currentProjects.length / itemsPerPage);
  const startProjectIndex = (currentPage - 1) * itemsPerPage;
  const endProjectIndex = startProjectIndex + itemsPerPage;
  const paginatedProjects = currentProjects.slice(startProjectIndex, endProjectIndex);
  
  // Pre-cache equipment for the first visible project on current page (and keep per-project cache so last 2 visited pages stay valid).
  // One project per page cached by id; when user switches page 1 <-> page 2 we don't refetch if cache allows.
  useEffect(() => {
    if (paginatedProjects.length === 0 || mainTab !== 'projects' || selectedProject) return;

    const visibleActiveProjects = paginatedProjects.filter((p: any) => p.status !== 'completed');
    if (visibleActiveProjects.length === 0) return;

    const firstProject = visibleActiveProjects[0];
    const cacheKey = `${CACHE_KEYS.EQUIPMENT}_${firstProject.id}`;
    if (getCache<any[]>(cacheKey) !== null) return;

    const timeoutId = setTimeout(async () => {
      try {
        const equipment = await fastAPI.getEquipmentByProject(firstProject.id, { progressImagesLatestOnly: true });
        if (equipment && Array.isArray(equipment) && equipment.length > 0) {
          const lightweight = equipment.map((eq: any) => ({
            ...eq,
            progress_images: (eq.progress_images?.length && eq.progress_images[0]) ? [eq.progress_images[0]] : [],
            progress_images_metadata: eq.progress_images_metadata?.map((img: any) => ({
              id: img.id,
              description: img.description,
              uploaded_by: img.uploaded_by,
              upload_date: img.upload_date,
            })) || [],
            progress_entries: eq.progress_entries?.map((entry: any) => ({
              id: entry.id,
              text: entry.text || entry.entry_text,
              date: entry.date || entry.created_at,
              type: entry.type,
              created_at: entry.created_at,
              entry_text: entry.entry_text,
              created_by_user: entry.created_by_user,
              users: entry.users,
              uploadedBy: entry.uploadedBy,
            })) || [],
            documents: [],
            images: [],
          }));
          setCache(cacheKey, lightweight, {
            ttl: 10 * 60 * 1000,
            maxSize: 4 * 1024 * 1024,
          });
        }
      } catch (error) {
        console.warn(`Failed to pre-cache equipment for project ${firstProject.id}:`, error);
      }
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [paginatedProjects, currentPage, mainTab, selectedProject]);

  // Reset to page 1 when tab changes or if current page is out of bounds
  useEffect(() => {
    if (currentPage > totalProjectPages && totalProjectPages > 0) {
      setCurrentPage(1);
    }
  }, [activeTab, currentPage, totalProjectPages]);
  
  // Mock VDCR data for ProjectDetails
  const mockVDCRData = [
    {
      id: "1",
      srNo: "001",
      equipmentTagNo: ["HE-UNIT-001"],
      mfgSerialNo: ["HE-001-2024-REL"],
      jobNo: ["JOB-2024-001"],
      clientDocNo: "REL-HE-001-GA-001",
      internalDocNo: "INT-GA-HE-001-2024",
      documentName: "General Assembly Drawing",
      revision: "Rev-02",
      codeStatus: "Code 2",
      status: "approved" as const,
      lastUpdate: "Jul 10, 2024",
      remarks: "General assembly drawing for heat exchanger unit",
      updatedBy: "John Doe",
      documentUrl: "/documents/vdcr/HE-001-GA-001.pdf"
    },
    {
      id: "2",
      srNo: "002",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003"],
      clientDocNo: "REL-HE-ALL-PQP-001",
      internalDocNo: "INT-PQP-HE-ALL-2024",
      documentName: "Project Quality Plan",
      revision: "Rev-01",
      codeStatus: "Code 3",
      status: "sent-for-approval" as const,
      lastUpdate: "Jul 12, 2024",
      remarks: "Quality plan covering all heat exchanger units",
      updatedBy: "Sarah Wilson",
      documentUrl: "/documents/vdcr/HE-ALL-PQP-001.docx"
    },
    {
      id: "3",
      srNo: "003",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003", "HE-UNIT-004", "HE-UNIT-005"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL", "HE-004-2024-REL", "HE-005-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003", "JOB-2024-004", "JOB-2024-005"],
      clientDocNo: "REL-HE-ALL-MTC-001",
      internalDocNo: "INT-MTC-HE-ALL-2024",
      documentName: "Material Test Certificate SS 316L Plates",
      revision: "Rev-01",
      codeStatus: "Code 1",
      status: "received-for-comment" as const,
      lastUpdate: "Jul 08, 2024",
      remarks: "Material test certificates for SS 316L plates",
      updatedBy: "Mike Johnson",
      documentUrl: "/documents/vdcr/HE-ALL-MTC-001.pdf"
    },
    {
      id: "4",
      srNo: "004",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REF"],
      jobNo: ["JOB-2024-001", "JOB-2024-002"],
      clientDocNo: "REL-HE-GRP1-IOM-001",
      internalDocNo: "INT-IOM-HE-GRP1-2024",
      documentName: "Installation & Operation Manual - Group 1",
      revision: "Rev-00",
      codeStatus: "Code 4",
      status: "sent-for-approval" as const,
      lastUpdate: "Jul 14, 2024",
      remarks: "Installation manual for group 1 heat exchangers",
      updatedBy: "Lisa Chen",
      documentUrl: "/documents/vdcr/HE-GRP1-IOM-001.pdf"
    },
    {
      id: "5",
      srNo: "005",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003", "HE-UNIT-004"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL", "HE-004-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003", "JOB-2024-004"],
      clientDocNo: "REL-HE-ALL-WPS-001",
      internalDocNo: "INT-WPS-HE-ALL-2024",
      documentName: "Welding Procedure Specification - All Heat Exchanger",
      revision: "Rev-02",
      codeStatus: "Code 2",
      status: "approved" as const,
      lastUpdate: "Jul 09, 2024",
      remarks: "Welding procedure specification for all heat exchangers",
      updatedBy: "David Brown",
      documentUrl: "/documents/vdcr/HE-ALL-WPS-001.pdf"
    }
  ];
  
  const [activeFilters, setActiveFilters] = useState({
    client: 'All Clients',
    equipmentType: 'All Equipment',
    manager: 'All Managers',
    searchQuery: ''
  });

  // Calculate totals excluding completed projects (completed projects are shown in Completion Certificates tab)
  const nonCompletedProjects = activeFilters.client === 'All Clients' && 
                       activeFilters.manager === 'All Managers' && 
                       activeFilters.equipmentType === 'All Equipment' && 
                               !activeFilters.searchQuery 
                               ? projects.filter(p => p.status !== 'completed')
                               : filteredProjects.filter(p => p.status !== 'completed');
  
  const totalProjects = nonCompletedProjects.length;
  const totalEquipment = nonCompletedProjects.reduce((sum, project) => sum + project.equipmentCount, 0);

  // Cache tab counters (NEVER CLEAR - critical for first glance UI)
  useEffect(() => {
    const tabCounters = {
      projects: totalProjects,
      standaloneEquipment: standaloneEquipment.length,
      completionCertificates: completedProjects.length
    };
    // Cache with very long TTL (24 hours) - these should persist
    setCache(CACHE_KEYS.TAB_COUNTERS, tabCounters, { ttl: 24 * 60 * 60 * 1000 }); // 24 hours TTL
    setCachedTabCounters(tabCounters);
  }, [totalProjects, standaloneEquipment.length, completedProjects.length]);

  // Cache summary stats when projects change and filters are at default (no active filters)
  useEffect(() => {
    // Only cache when no filters are active (default view)
    if (activeFilters.client === 'All Clients' && 
        activeFilters.manager === 'All Managers' && 
        activeFilters.equipmentType === 'All Equipment' && 
        !activeFilters.searchQuery &&
        projects.length > 0) {
      const summaryStats = {
        totalProjects,
        totalEquipment
      };
      setCache(CACHE_KEYS.SUMMARY_STATS, summaryStats, { ttl: 10 * 60 * 1000 }); // 10 minutes TTL
      setCachedSummaryStats(summaryStats);
    }
  }, [totalProjects, totalEquipment, activeFilters, projects.length]);

  // Handle project selection and navigation. Only mark project as read when opening from a project card, not from an update card in Company Highlights.
  const handleSelectProject = (projectId: string, initialTab: string = "equipment", options?: { fromUpdateCard?: boolean }) => {
    if (!options?.fromUpdateCard) {
      markAsSeen(`project_${projectId}`);
    }
    // Store the current tab before switching (for back navigation)
    if (mainTab !== 'projects') {
      setPreviousTab(mainTab);
      setMainTab('projects');
    } else {
      // If already on projects tab, store 'projects' as previous tab
      setPreviousTab('projects');
    }
    setSelectedProject(projectId);
    setSelectedProjectTab(initialTab);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setSelectedProjectTab("equipment");
    // Restore the previous tab if it was stored, otherwise default to 'projects'
    if (previousTab) {
      setMainTab(previousTab);
      setPreviousTab(null);
    } else {
      setMainTab('projects');
    }
  };

  // Handle adding new project to database
  const handleAddNewProject = async (projectData: any) => {
    try {
      
      // Get current user's firm_id from AuthContext (preferred) or localStorage (fallback)
      const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
      
      if (!firmId) {
        console.error('❌ Firm ID not found');
        return;
      }

      // Fetch updated projects from Supabase
      const userRole = localStorage.getItem('userRole');
      const userId = localStorage.getItem('userId');
      const updatedProjects = await fastAPI.getProjectsByFirm(firmId, userRole || undefined, userId || undefined);
      
      // Transform Supabase data to match our project structure
      const transformedProjects = (updatedProjects as any[]).map((project: any) => {
        // Calculate equipment breakdown from equipment data (same as fetchProjectsFromSupabase)
        let equipmentBreakdown = {};
        if (project.equipment && Array.isArray(project.equipment) && project.equipment.length > 0) {
          const equipment = project.equipment;
          const standardTypes = ['Heat Exchanger', 'Pressure Vessel', 'Storage Tank', 'Reactor'];
          const otherEquipment = equipment.filter((eq: any) => !standardTypes.includes(eq.type));
          
          // Create breakdown with actual equipment names for "other" types
          equipmentBreakdown = {
            heatExchanger: equipment.filter((eq: any) => eq.type === 'Heat Exchanger').length,
            pressureVessel: equipment.filter((eq: any) => eq.type === 'Pressure Vessel').length,
            storageTank: equipment.filter((eq: any) => eq.type === 'Storage Tank').length,
            reactor: equipment.filter((eq: any) => eq.type === 'Reactor').length,
            // Add actual equipment types instead of generic "other"
            ...otherEquipment.reduce((acc: any, eq: any) => {
              const typeKey = eq.type.replace(/\s+/g, '').toLowerCase();
              acc[typeKey] = (acc[typeKey] || 0) + 1;
              return acc;
            }, {})
          };
        }
        
        return {
          id: project.id,
          name: project.name,
          client: project.client,
          location: project.location || 'TBD',
          equipmentCount: project.equipment_count || project.equipmentCount || 0,
          activeEquipment: project.active_equipment || 0,
          progress: project.progress || 0,
          status: project.status || 'active',
          manager: project.manager || 'TBD',
          deadline: project.deadline || 'TBD',
          poNumber: project.po_number || 'TBD',
          scopeOfWork: project.scope_of_work || '',
          // Add default values for other fields
          salesOrderDate: project.sales_order_date || '',
          clientIndustry: project.client_industry || 'TBD',
          servicesIncluded: project.services_included ? 
            (typeof project.services_included === 'object' ? 
              Object.entries(project.services_included)
                .filter(([_, value]) => value === true)
                .map(([key, _]) => key) : 
              project.services_included) : [],
          consultant: project.consultant || 'TBD',
          tpiAgency: project.tpi_agency || 'TBD',
          clientFocalPoint: project.client_focal_point || 'Not specified',
          vdcrManager: project.vdcr_manager || 'TBD',
          kickoffMeetingNotes: project.kickoff_meeting_notes || '',
          specialProductionNotes: project.special_production_notes || '',
          equipmentBreakdown: equipmentBreakdown,
          equipment: project.equipment || []
        };
      });

      // Update state with fresh data from Supabase
      setProjects(transformedProjects);
      setFilteredProjects(transformedProjects);
      const metricsFromProjects: Record<string, { docProgressPct: number; manufacturingProgressPct: number; inspectionTpiPct: number; inspectionTpiTotal?: number; inspectionTpiDone?: number }> = {};
      (updatedProjects as any[]).forEach((p: any) => {
        const total = Number(p.doc_total) ?? 0;
        const c1 = Number(p.doc_code1) ?? 0, c2 = Number(p.doc_code2) ?? 0, c3 = Number(p.doc_code3) ?? 0, c4 = Number(p.doc_code4) ?? 0;
        let docPct = total > 0 ? (c1 * 1 + c2 * 0.8 + c3 * 0.5 + c4 * 0) * (100 / total) : 0;
        const equipmentData = Array.isArray(p.equipment) ? p.equipment : [];
        const mfgPct = equipmentData.length > 0 ? equipmentData.reduce((s: number, eq: any) => s + (Number(eq.progress) || 0), 0) / equipmentData.length : 0;
        metricsFromProjects[p.id] = { docProgressPct: Math.round(docPct * 10) / 10, manufacturingProgressPct: mfgPct, inspectionTpiPct: 0, inspectionTpiTotal: 0, inspectionTpiDone: 0 };
      });
      setProjectCardMetrics(metricsFromProjects);
      fastAPI.getProjectCardMetrics(transformedProjects.map((p: any) => p.id)).then((rpc) => setProjectCardMetrics((prev) => ({ ...prev, ...rpc }))).catch(() => {});

      // Invalidate and update project cards cache (lightweight version)
      // Only cache active projects (not completed), limit to 24 projects max
      const cacheKey = `${CACHE_KEYS.PROJECT_CARDS}_${firmId}_${userRole || 'none'}_${userId || 'none'}`;
      const activeProjects = transformedProjects
        .filter((p: any) => p.status !== 'completed')
        .slice(0, 24); // Limit to 24 projects max
      const lightweightProjects = activeProjects.map((p: any) => ({
        ...p,
        equipment: [] // Remove equipment array to save space
      }));
      setCache(cacheKey, lightweightProjects, { 
        ttl: 10 * 60 * 1000, // 10 minutes TTL
        maxSize: 1 * 1024 * 1024 // 1MB max
      });
      
    } catch (error) {
      console.error('❌ Error refreshing projects:', error);
      toast({
        title: "Error",
        description: "Failed to refresh projects. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle editing existing project
  const handleEditProject = async (projectId: string) => {
    try {
      
      // Get firmId from AuthContext (preferred) or localStorage (fallback)
      const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
      
      if (!firmId) {
        toast({ title: 'Error', description: 'Firm ID not found. Please login again.', variant: 'destructive' });
        return;
      }

      // Fetch complete project data from Supabase
      const projectResponse = await fastAPI.getProjectById(projectId);
      const projectToEdit = projectResponse[0]; // API returns array
      
      if (!projectToEdit) {
        console.error('❌ Project not found:', projectId);
        toast({ title: 'Error', description: 'Project not found. Please try again.', variant: 'destructive' });
        return;
      }
      
      // Fetch equipment data for this project
      const equipmentResponse = await fastAPI.getEquipmentByProject(projectId);
      const equipmentData = equipmentResponse || [];
      
      // Transform equipment data to form format - CRITICAL: Preserve IDs
      const equipmentDetails = (equipmentData as any[]).reduce((acc: any, equipment: any) => {
        // Validate that equipment from database has ID
        if (!equipment.id) {
          console.error('❌ CRITICAL: Equipment loaded from database is missing ID!', equipment);
          // Skip equipment without ID - it shouldn't exist
          return acc;
        }
        
        const type = equipment.type || 'Other';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push({
          id: equipment.id, // CRITICAL: ID must be preserved for edit mode
          tagNumber: equipment.tag_number || '',
          jobNumber: equipment.job_number || '',
          manufacturingSerial: equipment.manufacturing_serial || '',
          size: equipment.size || '',
          material: equipment.material || '',
          designCode: equipment.design_code || '',
          documents: [] // Equipment documents will be handled separately
        });
        return acc;
      }, {});
      
      // Transform project data to form format with all available data
      const editFormData = {
        id: projectToEdit.id,
        projectTitle: projectToEdit.name || '',
        clientName: projectToEdit.client || '',
        plantLocation: projectToEdit.location || '',
        poNumber: projectToEdit.po_number || '',
        salesOrderDate: projectToEdit.created_at ? new Date(projectToEdit.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        completionDate: projectToEdit.deadline || '',
        clientIndustry: projectToEdit.client_industry ,
        projectManager: projectToEdit.manager || '',
        consultant: projectToEdit.consultant,
        tpiAgency: projectToEdit.tpi_agency ,
        clientFocalPoint: projectToEdit.client_focal_point || '',
        vdcrManager: projectToEdit.vdcr_manager ,
        servicesIncluded: projectToEdit.services_included || {
          design: false,
          manufacturing: false,
          testing: false,
          documentation: false,
          installationSupport: false,
          commissioning: false
        },
        scopeDescription: projectToEdit.scope_of_work || '',
        unpricedPOFile: null, // File objects can't be restored, but we'll show existing documents
        designInputsPID: null,
        clientReferenceDoc: null,
        otherDocuments: null,
        kickoffMeetingNotes: projectToEdit.kickoff_meeting_notes || '',
        specialProductionNotes: projectToEdit.special_production_notes || '',
        // Document links from JSONB columns
        unpricedPODocuments: projectToEdit.unpriced_po_documents || [],
        designInputsDocuments: projectToEdit.design_inputs_documents || [],
        clientReferenceDocuments: projectToEdit.client_reference_documents || [],
        otherDocumentsLinks: projectToEdit.other_documents || [],
        // Equipment data
        equipment: equipmentDetails,
        // Additional project data
        status: projectToEdit.status || 'active',
        progress: projectToEdit.progress || 0,
        equipmentCount: projectToEdit.equipment_count || 0,
        activeEquipment: projectToEdit.active_equipment || 0
      };
      
      setEditingProject(editFormData);
      setShowAddProjectForm(true);
      setEditMode(true);
      
    } catch (error) {
      console.error('❌ Error fetching project data for editing:', error);
      toast({ title: 'Error', description: 'Failed to load project data for editing. Please try again.', variant: 'destructive' });
    }
  };

  // Handle deleting project and associated equipment
  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone. This will also delete all associated equipment.')) {
      try {
        // Project + equipment + related rows: single fastAPI.deleteProject (batched child deletes; no duplicate getEquipmentByProject + N deleteEquipment calls).
        // Get project name for logging before deletion
        const projectToDelete = projects.find(p => p.id === projectId);
        const projectName = projectToDelete?.name || 'Unknown Project';
        
        // Then delete the project
        await fastAPI.deleteProject(projectId);
        
        // Log project deletion
        await logProjectDeleted(projectId, projectName);
        
          // Update local state
          setProjects(prev => prev.filter(p => p.id !== projectId));
          setFilteredProjects(prev => prev.filter(p => p.id !== projectId));
          
          // Invalidate project cards cache
          const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
          const userRole = authUserRole || localStorage.getItem('userRole');
          const userId = localStorage.getItem('userId');
          if (firmId) {
            const cacheKey = `${CACHE_KEYS.PROJECT_CARDS}_${firmId}_${userRole || 'none'}_${userId || 'none'}`;
            removeCache(cacheKey);
          }
          
          // Also invalidate equipment cache for this project
          removeCache(`${CACHE_KEYS.EQUIPMENT}_${projectId}`);
        
        // Navigate back to project list if currently viewing the deleted project
        if (selectedProject === projectId) {
          setSelectedProject(null);
          setSelectedProjectTab('equipment');
        }
        
        toast({
          title: "Success",
          description: "Project and associated equipment deleted successfully!",
          variant: "default"
        });
        
      } catch (error) {
        console.error('❌ Error deleting project:', error);
        toast({
          title: "Error",
          description: "Failed to delete project. Please try again.",
          variant: "destructive"
        });
      }
    }
  };


  // Handle marking project as completed
  const handleCompleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to mark this project as completed? This action cannot be undone.')) {
      try {
        const completionDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        
        // Update project in database
        const updateData = {
          status: 'completed',
          completed_date: completionDate,
          progress: 100
        };
        
        await fastAPI.updateProject(projectId, updateData);
        
        // Get project name for logging
        const projectToComplete = projects.find(p => p.id === projectId);
        const projectName = projectToComplete?.name || 'Unknown Project';
        
        // Log project completion
        await logProjectUpdated(projectId, projectName, {
          status: { old: projectToComplete?.status || 'active', new: 'completed' },
          progress: { old: projectToComplete?.progress || 0, new: 100 }
        });
        
        // Update local state
        setProjects(prevProjects => 
          prevProjects.map(project => 
            project.id === projectId 
              ? { ...project, status: 'completed' as const, completedDate: completionDate, progress: 100 }
              : project
          )
        );
        
        setFilteredProjects(prevFilteredProjects => 
          prevFilteredProjects.map(project => 
            project.id === projectId 
              ? { ...project, status: 'completed' as const, completedDate: completionDate, progress: 100 }
              : project
          )
        );
        
        toast({ title: 'Success', description: 'Project marked as completed!' });
        
      } catch (error) {
        console.error('❌ Error completing project:', error);
        toast({ title: 'Error', description: 'Failed to complete project. Please try again.', variant: 'destructive' });
      }
    }
  };

  
  // Recommendation Letter Functions
  const handleRequestRecommendationLetter = async (project: Project) => {
    const clientEmail = project.recommendationLetter?.clientEmail || `contact@${project.client.toLowerCase().replace(/\s+/g, '')}.com`;
    const clientContact = project.recommendationLetter?.clientContactPerson || 'Project Manager';
    
    try {
      // Generate Word file template
      const wordData = {
        projectName: project.name,
        client: project.client,
        location: project.location,
        completionDate: project.completedDate || new Date().toISOString().split('T')[0],
        poNumber: project.poNumber,
        manager: project.manager,
        clientContact: clientContact
      };

      const wordBlob = await generateRecommendationLetterWord(wordData);
      // Add timestamp to make filename unique and avoid duplicate errors
      const timestamp = Date.now();
      // Remove spaces from project name for file path to avoid URL encoding issues
      const projectNameForPath = project.name.replace(/\s+/g, '_');
      let filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${timestamp}.doc`;
      
      // Convert blob to File
      const wordFile = new File([wordBlob], filePath.split('/').pop() || 'Recommendation_Letter.doc', {
        type: 'application/msword'
      });

      let publicUrl;

      // Try upload with retry logic for duplicate errors
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Use edge function for secure upload (service role key not exposed)
          const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
          publicUrl = await uploadFileViaEdgeFunction({
            bucket: 'project-documents',
            filePath,
            file: wordFile
          });
          break;
        } catch (error: any) {
          // If duplicate error, retry with new timestamp
          if ((error.message?.includes('409') || error.message?.includes('400')) && attempt < 2) {
            const newTimestamp = Date.now();
            filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${newTimestamp}.doc`;
            continue;
          } else {
            console.error('❌ Storage upload failed:', error);
            throw error;
          }
        }
      }

      if (!publicUrl) {
        throw new Error('Failed to upload file after retries');
      }

      // Create professional email template with download link
      const subject = `Recommendation Letter Request - ${project.name} Project`;
      const emailBody = `Dear ${clientContact},

I hope this email finds you well.

We are pleased to inform you that the ${project.name} project has been successfully completed on ${project.completedDate}. We are grateful for the opportunity to work with ${project.client} and are proud of the quality work delivered.

As we continue to grow our business and showcase our capabilities to potential clients, we would be extremely grateful if you could provide us with a recommendation letter/testimonial highlighting:

• Quality of work delivered
• Adherence to timelines and specifications  
• Professional conduct and communication
• Overall satisfaction with our services

This recommendation would be invaluable in helping us demonstrate our track record of successful project delivery to future clients.

If you need any additional information about the project or our services, please do not hesitate to contact us.

Thank you for your time and consideration.

Best regards,
${project.manager}
Project Manager

---
Project Details:
Project Name: ${project.name}
Client: ${project.client}
Location: ${project.location}
Completion Date: ${project.completedDate}
PO Number: ${project.poNumber}`;

      // Create Gmail compose URL instead of mailto to open in Gmail
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      
      // Open Gmail compose window
      window.open(gmailComposeUrl, '_blank');

      // Show toast notification
      toast({
        title: "Email Opened",
        description: `Recommendation letter request email opened.`,
      });
    } catch (error) {
      console.error('Error generating Word file:', error);
      toast({
        title: "Error",
        description: "Failed to generate Word file. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Update project status in database
    const recommendationLetterData = {
      status: 'requested' as const,
      requestDate: new Date().toISOString().split('T')[0],
      reminderCount: 0,
      clientEmail,
      clientContactPerson: clientContact
    };
    
    try {
      await fastAPI.updateProject(project.id, {
        recommendation_letter: recommendationLetterData
      });
      
      // Update local state
      const updatedProjects = projects.map(p => 
        p.id === project.id 
          ? { 
              ...p, 
              recommendationLetter: recommendationLetterData
            } as Project
          : p
      );
      
      setProjects(updatedProjects as Project[]);
      setFilteredProjects(updatedProjects as Project[]);
      
      toast({
        title: "Success",
        description: "Recommendation letter request saved!",
      });
    } catch (error) {
      console.error('❌ Error saving recommendation letter request:', error);
      toast({
        title: "Error",
        description: "Failed to save request. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSendRecommendationReminder = async (project: Project) => {
    const clientEmail = project.recommendationLetter?.clientEmail || `contact@${project.client.toLowerCase().replace(/\s+/g, '')}.com`;
    const clientContact = project.recommendationLetter?.clientContactPerson || 'Project Manager';
    const reminderCount = (project.recommendationLetter?.reminderCount || 0) + 1;
    const now = new Date();
    const lastReminderDateTime = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    try {
      // Generate Word file template for reminder
      const wordData = {
        projectName: project.name,
        client: project.client,
        location: project.location,
        completionDate: project.completedDate || new Date().toISOString().split('T')[0],
        poNumber: project.poNumber,
        manager: project.manager,
        clientContact: clientContact
      };

      const wordBlob = await generateRecommendationLetterWord(wordData);
      // Add timestamp to make filename unique and avoid duplicate errors
      const timestamp = Date.now();
      // Remove spaces from project name for file path to avoid URL encoding issues
      const projectNameForPath = project.name.replace(/\s+/g, '_');
      let filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${timestamp}.doc`;
      
      // Convert blob to File
      const wordFile = new File([wordBlob], filePath.split('/').pop() || 'Recommendation_Letter.doc', {
        type: 'application/msword'
      });

      let publicUrl;

      // Try upload with retry logic for duplicate errors
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Use edge function for secure upload (service role key not exposed)
          const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
          publicUrl = await uploadFileViaEdgeFunction({
            bucket: 'project-documents',
            filePath,
            file: wordFile
          });
          break;
        } catch (error: any) {
          // If duplicate error, retry with new timestamp
          if ((error.message?.includes('409') || error.message?.includes('400')) && attempt < 2) {
            const newTimestamp = Date.now();
            filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${newTimestamp}.doc`;
            continue;
          } else {
            console.error('❌ Storage upload failed:', error);
            throw error;
          }
        }
      }

      if (!publicUrl) {
        throw new Error('Failed to upload file after retries');
      }

      // Create gentle reminder email template with download link
      const subject = `Gentle Reminder - Recommendation Letter Request - ${project.name} Project`;
      const emailBody = `Dear ${clientContact},

I hope you are doing well.

This is a gentle follow-up regarding our request for a recommendation letter for the ${project.name} project that was completed on ${project.completedDate}.

We understand you have a busy schedule, but we would be extremely grateful if you could spare a few minutes to provide us with a brief testimonial or recommendation letter. Your feedback would be incredibly valuable for our business growth.

If you have already sent the recommendation letter and we may have missed it, please let us know and we will check our records.

Thank you for your time and continued support.

Best regards,
${project.manager}
Project Manager

---
Project: ${project.name} | Client: ${project.client} | Completed: ${project.completedDate}

Note: Please download the Recommendation Letter template using the link above, fill in the details, sign it, and send it back to us.`;

      // Create Gmail compose URL instead of mailto to open in Gmail
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      
      // Open Gmail compose window
      window.open(gmailComposeUrl, '_blank');

      // Show toast notification
      toast({
        title: "Email Opened",
        description: `Recommendation letter request email opened.`,
      });
    } catch (error) {
      console.error('Error generating Word file:', error);
      toast({
        title: "Error",
        description: "Failed to generate Word file. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Update project status in database - keep it as 'requested' but with reminder tracking
    const recommendationLetterData = {
      ...project.recommendationLetter,
      status: 'requested' as const, // Keep as requested, not reminder_sent
      lastReminderDate: new Date().toISOString().split('T')[0],
      lastReminderDateTime,
      reminderCount
    };
    
    try {
      await fastAPI.updateProject(project.id, {
        recommendation_letter: recommendationLetterData
      });
      
      // Update local state
      const updatedProjects = projects.map(p => 
        p.id === project.id 
          ? { 
              ...p, 
              recommendationLetter: recommendationLetterData
            } as Project
          : p
      );
      
      setProjects(updatedProjects as Project[]);
      setFilteredProjects(updatedProjects as Project[]);
      
      toast({
        title: "Success",
        description: `Reminder email sent! (Reminder #${reminderCount})`,
      });
    } catch (error) {
      console.error('❌ Error saving reminder:', error);
      toast({
        title: "Error",
        description: "Failed to save reminder. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleUploadRecommendationLetter = (project: Project) => {
    // Create a hidden file input element for PDF upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.style.position = 'absolute';
    fileInput.style.left = '-9999px';
    fileInput.style.visibility = 'hidden';
    
    // Handle file selection
    fileInput.addEventListener('change', async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (!file) {
        return; // User cancelled
      }
      
      // Validate file type (PDF only)
      if (file.type !== 'application/pdf') {
        toast({
          title: "Error",
          description: "Please select a PDF file only.",
          variant: "destructive"
        });
        return;
      }
      
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: "Error",
          description: "File size too large. Please select a PDF smaller than 10MB.",
          variant: "destructive"
        });
        return;
      }
      
      // Show upload progress
      toast({
        title: "Uploading",
        description: `Uploading "${file.name}"...`,
      });
      
      try {
        // Use unique folder path to avoid conflicts: {projectName}/Recommendation Letters/{timestamp}_{filename}
        const fileName = `${project.name}/Recommendation Letters/${Date.now()}_${file.name}`;
        
        // Use edge function for secure upload (service role key not exposed)
        const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
        const publicUrl = await uploadFileViaEdgeFunction({
          bucket: 'project-documents',
          filePath: fileName,
          file
        });
        
        // Create document metadata
        const uploadedDocument = {
          name: file.name,
          uploaded: true,
          type: file.type,
          size: file.size,
          uploadDate: new Date().toISOString(),
          url: publicUrl
        };
        
        // Update project in database
        const recommendationLetterData = {
          ...project.recommendationLetter,
          status: 'received' as const,
          receivedDocument: uploadedDocument
        };
        
        await fastAPI.updateProject(project.id, {
          recommendation_letter: recommendationLetterData
        });
        
        // Update local state
        const updatedProjects = projects.map(p => 
          p.id === project.id 
            ? { 
                ...p, 
                recommendationLetter: recommendationLetterData
              } as Project
            : p
        );
        
        setProjects(updatedProjects as Project[]);
        setFilteredProjects(updatedProjects as Project[]);
        
        toast({
          title: "Success",
          description: `Successfully uploaded recommendation letter! (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        });
      } catch (error) {
        console.error('❌ Error uploading recommendation letter:', error);
        toast({
          title: "Error",
          description: "Failed to upload recommendation letter. Please try again.",
          variant: "destructive"
        });
      }
    });
    
    // Add to DOM, trigger click, and clean up after
    document.body.appendChild(fileInput);
    fileInput.click();
    
    // Clean up after a delay to ensure the file dialog has opened
    setTimeout(() => {
      if (document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
      }
    }, 1000);
  };

  // PDF Viewer Functions
  const handleViewRecommendationLetter = (project: Project) => {
    const doc = project.recommendationLetter?.receivedDocument;
    if (doc && doc.url) {
      // Use URL from database (Supabase Storage URL)
      setPdfUrl(doc.url);
      setCurrentPDF(null); // No File object when loading from database
      setPdfTitle(`${project.name} - Recommendation Letter`);
      setShowPDFViewer(true);
    } else if (doc && doc.file) {
      // Fallback: Create object URL from File object (for in-memory files)
      const url = URL.createObjectURL(doc.file);
      setCurrentPDF(doc.file);
      setPdfUrl(url);
      setPdfTitle(`${project.name} - Recommendation Letter`);
      setShowPDFViewer(true);
    } else {
      toast({
        title: "Error",
        description: "No PDF file available to view.",
        variant: "destructive"
      });
    }
  };

  const closePDFViewer = () => {
    setShowPDFViewer(false);
    // Clean up object URL to prevent memory leaks
    if (pdfUrl && pdfUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pdfUrl);
    }
    setCurrentPDF(null);
    setPdfUrl(null);
    setPdfTitle('');
  };



  // Apply filters to project list
  const applyFilters = (filters: any) => {
    setActiveFilters(filters);
    
    let filtered = projects.filter(project => {
      // Client filter
      if (filters.client !== 'All Clients' && project.client !== filters.client) {
        return false;
      }
      
      
      // Manager filter
      if (filters.manager !== 'All Managers' && project.manager !== filters.manager) {
        return false;
      }
      
      // Equipment type filter
      if (filters.equipmentType !== 'All Equipment') {
        const hasEquipmentType = Object.entries(project.equipmentBreakdown).some(([type, count]) => {
          if ((count as number) > 0) {
            const normalizedType = type === 'heatExchanger' ? 'Heat Exchanger' :
                                 type === 'pressureVessel' ? 'Pressure Vessel' :
                                 type === 'storageTank' ? 'Storage Tank' :
                                 type === 'reactor' ? 'Reactor' : 'Other';
            return normalizedType === filters.equipmentType;
          }
          return false;
        });
        if (!hasEquipmentType) return false;
      }
      
      // Search query filter
      if (filters.searchQuery) 
      {
        const searchLower = filters.searchQuery.toLowerCase();
        const matchesSearch = 
          project.name.toLowerCase().includes(searchLower) ||
          project.poNumber.toLowerCase().includes(searchLower) ||
          project.client.toLowerCase().includes(searchLower) ||
          project.location.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    setFilteredProjects(filtered);
  };

  // Handle updating project data
  const handleUpdateProject = async (updatedProjectData: any) => {
    try {
      
      // Update in Supabase
      const projectDataForSupabase = {
        name: updatedProjectData.projectTitle,
        client: updatedProjectData.clientName,
        location: updatedProjectData.plantLocation || 'TBD',
        manager: updatedProjectData.projectManager,
        deadline: updatedProjectData.completionDate || null,
        po_number: updatedProjectData.poNumber || 'TBD',
        scope_of_work: updatedProjectData.scopeDescription || '',
        client_focal_point: updatedProjectData.clientFocalPoint || '',
        status: 'active'
      };
      
      await fastAPI.updateProject(updatedProjectData.id, projectDataForSupabase);
      
      // Refetch full project (including documents) so Documents Uploaded tab shows newly added docs
      const freshProjectArray = await fastAPI.getProjectById(updatedProjectData.id);
      const freshProject = Array.isArray(freshProjectArray) && freshProjectArray.length > 0 ? freshProjectArray[0] : null;
      
      // Update local state with fresh project data (including document arrays)
    const updatedProjects = projects.map(p => {
        if (p.id !== updatedProjectData.id) return p;
        if (!freshProject) {
          return { ...p, name: updatedProjectData.projectTitle, client: updatedProjectData.clientName, location: updatedProjectData.plantLocation, manager: updatedProjectData.projectManager, deadline: updatedProjectData.completionDate, poNumber: updatedProjectData.poNumber, clientFocalPoint: updatedProjectData.clientFocalPoint };
        }
        return {
          ...p,
          name: freshProject.name || updatedProjectData.projectTitle,
          client: freshProject.client || updatedProjectData.clientName,
          location: freshProject.location || updatedProjectData.plantLocation,
          manager: freshProject.manager || updatedProjectData.projectManager,
          deadline: freshProject.deadline || updatedProjectData.completionDate,
          poNumber: freshProject.po_number || updatedProjectData.poNumber,
          clientFocalPoint: freshProject.client_focal_point || updatedProjectData.clientFocalPoint,
          unpricedPODocuments: freshProject.unpriced_po_documents || [],
          designInputsDocuments: freshProject.design_inputs_documents || [],
          clientReferenceDocuments: freshProject.client_reference_documents || [],
          otherDocumentsLinks: freshProject.other_documents || []
        };
    });
    setProjects(updatedProjects);
    setFilteredProjects([...updatedProjects]);
    
    // Update project cards cache (lightweight version)
    // Only cache active projects (not completed), limit to 24 projects max
    const firmId = authFirmId || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
    const userRole = authUserRole || localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    if (firmId) {
      const cacheKey = `${CACHE_KEYS.PROJECT_CARDS}_${firmId}_${userRole || 'none'}_${userId || 'none'}`;
      const activeProjects = updatedProjects
        .filter((p: any) => p.status !== 'completed')
        .slice(0, 24); // Limit to 24 projects max
      const lightweightProjects = activeProjects.map((p: any) => ({
        ...p,
        equipment: [] // Remove equipment array to save space
      }));
      setCache(cacheKey, lightweightProjects, { 
        ttl: 10 * 60 * 1000, // 10 minutes TTL
        maxSize: 1 * 1024 * 1024 // 1MB max
      });
    }
      
    setShowAddProjectForm(false);
    setEditMode(false);
    setEditingProject(null);
      
      // Show success message
      toast({ title: 'Success', description: 'Project updated successfully!' });
      
    } catch (error) {
      console.error('❌ Error updating project:', error);
      toast({ title: 'Error', description: 'Failed to update project. Please try again.', variant: 'destructive' });
    }
  };


  const selectedProjectData = projects.find(p => p.id === selectedProject);
  
  // Handle template download
  const handleDownloadTemplate = (template: typeof certificateTemplates[0]) => {
    // Create a simple text file as template (in production, this would be a real DOCX file)
    const content = `Template: ${template.name}\n\n${template.description}\n\nThis is a sample template file. In production, this would be a proper DOCX file.`;
    const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Template Downloaded',
      description: `${template.name} has been downloaded successfully.`,
    });
  };
  
  // Debug: Log selected project data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Blocking modal when super admin has paused company services */}
      {servicesPaused && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" aria-modal="true" role="dialog">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4 text-center">
            <p className="text-lg font-medium text-gray-900">Your services are temporarily paused.</p>
            <p className="mt-4 text-sm font-medium text-gray-700">Contact administrator</p>
            <p className="mt-2 text-sm text-gray-700">
              Email: <a href="mailto:info@digiteqsolution.com" className="text-blue-600 hover:underline">info@digiteqsolution.com</a>
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Contact number: <a href="tel:9067610118" className="text-blue-600 hover:underline">9067610118</a>
            </p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <ProjectHeader loading={loading} userName={userName} userRole={userRole} firmName={firmName} firmLogo={firmLogo} />

        {/* Main Tab Navigation */}
        <div className="mt-6">
          <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden">
            <nav className="-mb-px flex space-x-8 min-w-max flex-nowrap px-1">
              <button
                onClick={() => {
                  markAsSeen('projects');
                  setMainTab('projects');
                  if (projectsPageWhenLeftRef.current != null) {
                    setCurrentPage(projectsPageWhenLeftRef.current);
                    projectsPageWhenLeftRef.current = null;
                  }
                }}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'projects'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="flex items-center gap-1.5">
                    Projects ({projects.length > 0 ? totalProjects : (cachedTabCounters?.projects || cachedSummaryStats?.totalProjects || 0)})
                    {hasUnread('projects', projects.map((p: any) => ({ id: p.id, updated_at: p.updated_at, last_update: p.last_update }))) && (
                      <span className="relative flex h-2 w-2 shrink-0" title="New updates – click to view">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                  </span>
                </div>
              </button>
              <button
                onClick={() => {
                  if (equipmentLock?.isLocked) {
                    setEquipmentLockModalOpen(true);
                    return;
                  }
                  if (mainTab === 'projects') projectsPageWhenLeftRef.current = currentPage;
                  markAsSeen('standalone_equipment');
                  setMainTab('equipment');
                }}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  equipmentLock?.isLocked
                    ? 'border-transparent text-gray-400 cursor-not-allowed opacity-70'
                    : mainTab === 'equipment'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="flex items-center gap-1.5">
                    Standalone Equipment ({standaloneEquipmentSummary?.total ?? cachedTabCounters?.standaloneEquipment ?? standaloneEquipment.length})
                    {hasUnread('standalone_equipment', standaloneEquipment.map((e: any) => ({ id: e.id, updated_at: e.updated_at, last_update: e.last_update }))) && (
                      <span className="relative flex h-2 w-2 shrink-0" title="New updates – click to view">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                  </span>
                </div>
              </button>
              
              {/* Completion Certificates conditionally render */}
              {userRole === 'firm_admin' && (
                <button
                  onClick={() => {
                    if (mainTab === 'projects') projectsPageWhenLeftRef.current = currentPage;
                    setMainTab('certificates');
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                    mainTab === 'certificates'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Completion Certificates ({projects.length > 0 ? completedProjects.length : (cachedTabCounters?.completionCertificates || 0)})
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                    if (mainTab === 'projects') projectsPageWhenLeftRef.current = currentPage;
                    setMainTab('tasks');
                  }}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'tasks'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Tasks
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {mainTab === 'projects' && !selectedProject ? (
          <>
            <ProjectSummaryCards 
              totalProjects={cachedSummaryStats?.totalProjects ?? totalProjects} 
              totalEquipment={cachedSummaryStats?.totalEquipment ?? totalEquipment} 
            />

            {/* Company Highlights Section */}
            <CompanyHighlights
              onSelectProject={handleSelectProject}
              onMarkAsRead={markAsSeen}
              initialProjectIds={filteredProjects.length > 0 ? filteredProjects.map((p: any) => p.id) : undefined}
              isFirmAdmin={userRole === 'firm_admin'}
            />

            {/* Expandable Project Filters */}
            <div className="mb-6 sm:mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div 
                  className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors gap-2 sm:gap-0"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                    </svg>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-gray-800 whitespace-nowrap min-w-0 truncate" title="Project Filters & Actions">Project Filters & Actions</h3>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {userRole !== 'vdcr_manager' && userRole !== 'editor' && userRole !== 'viewer' && (
                      <Button 
                        onClick={() => setShowAddProjectForm(true)} 
                        className="bg-blue-600 hover:bg-blue-700 text-xs md:text-sm px-2 py-1 md:px-4 md:py-2 h-7 md:h-9 shrink-0"
                      >
                        <svg className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add New Project
                      </Button>
                    )}
                    <svg 
                      className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {filtersExpanded && (
                  <div className="border-t border-gray-200 p-3 sm:p-4 bg-gray-50">
                    <ProjectFilters 
                      onFilterChange={applyFilters}
                      onAddNewProject={handleAddNewProject}
                      onApplyFilters={applyFilters}
                      projects={projects}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Project Overview */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-4 sm:mb-6 min-w-0">
                <h2 className="text-lg min-[480px]:text-xl sm:text-2xl font-bold text-gray-800 leading-tight min-w-0 break-words">Projects Overview</h2>
                <div className="text-xs sm:text-sm text-gray-600 sm:text-right min-w-0 shrink-0">
                  <span className="break-words">Showing {currentProjects.length} of {totalProjects} projects</span>
                </div>
              </div>

              {/* Clean Tab System */}
              <div className="mb-6">
                <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden xl:overflow-x-visible scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <nav className="-mb-px flex min-w-max space-x-6 sm:space-x-8 px-3 sm:px-0 whitespace-nowrap pb-0.5">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'all'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      All Projects ({allProjects.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('active')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'active'
                          ? 'border-green-500 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Active Projects ({activeProjects.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('overdue')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'overdue'
                          ? 'border-red-500 text-red-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Overdue Projects ({overdueProjects.length})
                    </button>
                  </nav>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? (
                  // Skeleton loading for projects
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="h-24 bg-white p-4">
                        <Skeleton className="h-6 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2 mb-1" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <div className="p-4 border-t border-gray-100">
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  ))
                ) : (
                  paginatedProjects.map((project, index) => {
                  // Check if deadline is valid
                  const hasValidDeadline = project.deadline && !isNaN(new Date(project.deadline).getTime());
                  
                  let diffDays = 0;
                  let isOverdue = false;
                  
                  if (hasValidDeadline) {
                    const deadline = new Date(project.deadline);
                    const today = new Date();
                    const diffTime = deadline.getTime() - today.getTime();
                    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    // Only consider overdue if not completed and past deadline
                    isOverdue = diffDays < 0 && project.status !== 'completed';
                  }

                  return (
                    <div 
                      key={project.id} 
                      onClick={() => handleSelectProject(project.id, "equipment")}
                      className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] border transition-all duration-300 overflow-hidden group cursor-pointer flex flex-col ${
                        project.status === 'completed' ? 'h-[750px]' : 'h-[650px]'
                      } ${
                      isOverdue 
                        ? 'border-red-200 hover:border-red-300 hover:shadow-[0_4px_16px_rgba(239,68,68,0.15),0_2px_8px_rgba(239,68,68,0.1)]' 
                        : 'border-gray-100 hover:border-gray-200 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.08)]'
                      }`}
                    >
                      {/* Blue strip title row – client on first line; plant location under on hover; strip expands on hover */}
                      <div className="min-h-[4.5rem] sm:min-h-[4.25rem] group-hover:min-h-[5.75rem] sm:group-hover:min-h-[5.5rem] bg-blue-600 px-4 pt-3 pb-3 text-white border-b border-blue-700 relative group-hover:bg-blue-700 transition-all duration-200 ease-out">
                        {/* Click Indicator */}
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0">
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                              <h3 className="text-base sm:text-xl font-bold text-white min-w-0 truncate" title={project.name}>{project.name}</h3>
                              <UnreadEntityDot entityKey={`project_${project.id}`} updatedAt={project.updated_at ?? project.last_update} />
                            </div>
                            <div className="flex flex-row items-center gap-2 text-xs sm:text-sm text-white/90 min-w-0 overflow-hidden">
                              <span className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="truncate" title={project.client}>{project.client}</span>
                              </span>
                            </div>
                            {/* Plant location: under client, visible and strip expands on hover */}
                            <div className="overflow-hidden max-h-0 group-hover:max-h-[1.75rem] transition-[max-height] duration-200 ease-out">
                              <span className="flex items-center gap-1 min-w-0 overflow-hidden text-xs sm:text-sm text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="truncate" title={project.location}>{project.location}</span>
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-row items-center justify-end sm:flex-col sm:items-end sm:justify-start gap-1 sm:gap-1 mt-1 sm:mt-0">
                            <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-0">
                              {/* PO number: collapsed until hover, then expands and pushes icons down with slide */}
                              <div className="overflow-hidden max-h-0 group-hover:max-h-[2.25rem] transition-[max-height] duration-200 ease-out">
                                <span className="block text-xs sm:text-sm text-white/90 truncate max-w-full opacity-0 group-hover:opacity-100 transition-opacity duration-200" title={project.poNumber || '—'}>
                                  {project.poNumber || '—'}
                                </span>
                              </div>
                              {userRole !== 'vdcr_manager' && userRole !== 'editor' && userRole !== 'viewer' && (
                              <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 transition-transform duration-200 ease-out">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditProject(project.id);
                                  }}
                                  className="p-1 sm:p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-md transition-colors min-w-[28px] min-h-[28px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                                  title="Edit Project"
                                >
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProject(project.id);
                                  }}
                                  className="p-1 sm:p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-md transition-colors min-w-[28px] min-h-[28px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                                  title="Delete Project"
                                >
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                                {project.status !== 'completed' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCompleteProject(project.id);
                                    }}
                                    className="p-1 sm:p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-md transition-colors min-w-[28px] min-h-[28px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                                    title="Mark as Completed"
                                  >
                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                     {/* Recommendation Letter Actions - Only for Completed Projects */}
                     {project.status === 'completed' && (
                        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-green-50">
                          <div className="text-sm font-medium text-gray-700 mb-3">Recommendation Letter</div>
                          <div className="flex gap-2">
                            {project.recommendationLetter?.status === 'received' ? (
                              <>
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span>Received</span>
                                </div>
                                 {project.recommendationLetter.receivedDocument && (
                                   <Button 
                                     variant="outline" 
                                     size="sm"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleViewRecommendationLetter(project);
                                     }}
                                     className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-300"
                                   >
                                     <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                     </svg>
                                     View Letter
                                   </Button>
                                 )}
                              </>
                            ) : project.recommendationLetter?.status === 'requested' ? (
                              <>
                                <div className="flex items-center gap-2 text-yellow-600 text-sm mb-3">
                                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                  <span>Requested</span>
                                </div>
                                <div className="flex gap-2">
                                  {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? (
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs flex-shrink-0">
                                      <div className="flex items-center gap-1 text-orange-700 font-medium mb-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                        </svg>
                                        {project.recommendationLetter.reminderCount} sent
                                      </div>
                                      {project.recommendationLetter.lastReminderDateTime && (
                                        <div className="text-orange-600 text-xs">Last: {project.recommendationLetter.lastReminderDateTime}</div>
                                      )}
                                    </div>
                                  ) : null}
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSendRecommendationReminder(project);
                                    }}
                                    className="flex-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50 border-orange-300"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                    </svg>
                                    {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? 'Send Another' : 'Send Reminder'}
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUploadRecommendationLetter(project);
                                    }}
                                    className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    Upload Letter
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRequestRecommendationLetter(project);
                                  }}
                                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  Request Letter
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUploadRecommendationLetter(project);
                                  }}
                                  className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  Upload Letter
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 2×2 Progress grid – screenshot match: same ring size/thickness, colors, fonts, 3D-ish */}
                      {(() => {
                        const metrics = projectCardMetrics[project.id];
                        const docPct = metrics?.docProgressPct ?? 0;
                        // Manufacturing: use RPC result (weighted by project_equipment_weights when set, else equal 100/n per equipment). Only fall back to local average if RPC not yet available.
                        const equipmentList = project.equipment && Array.isArray(project.equipment) ? project.equipment : [];
                        const n = equipmentList.length;
                        const mfgPctFromEquipment = n > 0
                          ? equipmentList.reduce((sum: number, eq: any) => sum + (Number(eq.progress) || 0), 0) / n
                          : null;
                        const mfgPct = (metrics?.manufacturingProgressPct != null)
                          ? metrics.manufacturingProgressPct
                          : (mfgPctFromEquipment !== null ? mfgPctFromEquipment : 0);
                        const inspPct = metrics?.inspectionTpiPct ?? 0;
                        const RING_SIZE = 84;
                        const STROKE_WIDTH = 10;
                        const CircularBar = ({ value, strokeColor, trackColor }: { value: number; strokeColor: string; trackColor: string }) => {
                          const radius = (RING_SIZE / 2) - STROKE_WIDTH / 2 - 1;
                          const c = 2 * Math.PI * radius;
                          const offset = c * (1 - Math.min(100, Math.max(0, value)) / 100);
                          return (
                            <div className="relative inline-flex items-center justify-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.06)]" style={{ width: RING_SIZE, height: RING_SIZE }}>
                              <svg width={RING_SIZE} height={RING_SIZE} className="transform -rotate-90" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                                <circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={radius} fill="none" strokeWidth={STROKE_WIDTH} strokeLinecap="round" className="transition-[stroke] duration-200" style={{ stroke: 'var(--ring-track, ' + trackColor + ')' }} />
                                <circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={radius} fill="none" strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-[stroke] duration-200" style={{ stroke: 'var(--ring-fill, ' + strokeColor + ')' }} />
                              </svg>
                              <span className="absolute text-xl font-bold text-gray-900 group-hover/box:!text-white tabular-nums transition-colors">{Math.round(value)}%</span>
                            </div>
                          );
                        };
                        const cardBase = 'group/box rounded-xl border border-gray-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col items-center justify-center p-4 max-[400px]:p-2.5 min-h-[120px] max-[400px]:min-h-[108px] transition-all duration-200 hover:shadow-md cursor-pointer';
                        const keyInfoCardBase = 'group/box rounded-xl border border-gray-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] flex flex-col justify-center p-4 max-[400px]:p-2.5 min-h-[120px] max-[400px]:min-h-[108px] transition-all duration-200 hover:shadow-md cursor-pointer';
                        const deadlineDate = project.deadline && !isNaN(new Date(project.deadline).getTime()) ? new Date(project.deadline) : null;
                        const daysToGo = deadlineDate && project.status !== 'completed'
                          ? Math.ceil((deadlineDate.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
                          : null;
                        const deadlineLabel = deadlineDate ? deadlineDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : (project.deadline || '—');
                        return (
                          <div className="p-4 sm:p-5 max-[400px]:p-2.5 border-b border-gray-100 bg-[#f8f8fa] flex-1 flex flex-col min-h-0">
                            <div className="grid grid-cols-2 gap-4 max-[400px]:gap-2.5 flex-1 min-h-0">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); if (equipmentLock?.isLocked) { setEquipmentLockModalOpen(true); return; } handleSelectProject(project.id, "equipment"); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (equipmentLock?.isLocked) { setEquipmentLockModalOpen(true); return; } handleSelectProject(project.id, "equipment"); } }}
                                className={`${cardBase} [--ring-fill:#f97316] [--ring-track:#fed7aa] hover:!border-orange-500 hover:!bg-orange-500 hover:[--ring-fill:white] hover:[--ring-track:rgba(255,255,255,0.4)]`}
                              >
                                <span className="text-sm max-[400px]:text-xs font-medium text-gray-800 group-hover/box:!text-white mb-2 max-[400px]:mb-1 text-center transition-colors">Manufacturing</span>
                                <CircularBar value={mfgPct} strokeColor="#f97316" trackColor="#fed7aa" />
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); handleSelectProject(project.id, "vdcr"); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleSelectProject(project.id, "vdcr"); } }}
                                className={`${cardBase} [--ring-fill:#22c55e] [--ring-track:#bbf7d0] hover:!border-green-600 hover:!bg-green-600 hover:[--ring-fill:white] hover:[--ring-track:rgba(255,255,255,0.4)]`}
                              >
                                <span className="text-sm max-[400px]:text-xs font-medium text-gray-800 group-hover/box:!text-white mb-2 max-[400px]:mb-1 text-center transition-colors">Documentation</span>
                                <CircularBar value={docPct} strokeColor="#22c55e" trackColor="#bbf7d0" />
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); if (equipmentLock?.isLocked) { setEquipmentLockModalOpen(true); return; } handleSelectProject(project.id, "equipment"); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (equipmentLock?.isLocked) { setEquipmentLockModalOpen(true); return; } handleSelectProject(project.id, "equipment"); } }}
                                className={`${cardBase} [--ring-fill:#3b82f6] [--ring-track:#bfdbfe] hover:!border-blue-600 hover:!bg-blue-600 hover:[--ring-fill:white] hover:[--ring-track:rgba(255,255,255,0.4)]`}
                              >
                                <span className="text-sm max-[400px]:text-xs font-medium text-gray-800 group-hover/box:!text-white mb-2 max-[400px]:mb-1 text-center transition-colors">TPI & Inspections</span>
                                <CircularBar value={inspPct} strokeColor="#3b82f6" trackColor="#bfdbfe" />
                                <span className="text-xs max-[400px]:text-[10px] text-gray-600 group-hover/box:!text-white/90 mt-1 max-[400px]:mt-0.5 tabular-nums">{(metrics?.inspectionTpiDone ?? 0)} of {metrics?.inspectionTpiTotal ?? 0}</span>
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); handleSelectProject(project.id, "project-details"); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleSelectProject(project.id, "project-details"); } }}
                                className={`${keyInfoCardBase} hover:!border-gray-700 hover:!bg-gray-700`}
                              >
                                <span className="text-sm max-[400px]:text-xs font-medium text-gray-800 group-hover/box:!text-white mb-1.5 max-[400px]:mb-1 transition-colors leading-tight">Delivery Date – {deadlineLabel}</span>
                                <div className="flex items-center gap-3 max-[400px]:gap-1.5 mt-1">
                                  <div className="flex-shrink-0 w-10 h-10 max-[400px]:w-7 max-[400px]:h-7 rounded-lg bg-blue-100 group-hover/box:bg-white/20 flex items-center justify-center transition-colors">
                                    <svg className="w-5 h-5 max-[400px]:w-3.5 max-[400px]:h-3.5 text-blue-600 group-hover/box:!text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  </div>
                                  <div className="flex items-baseline gap-1 max-[400px]:gap-0.5 min-w-0 overflow-hidden">
                                    <span className="text-2xl max-[400px]:text-xl font-bold text-gray-900 group-hover/box:!text-white tabular-nums transition-colors leading-none">{daysToGo != null ? daysToGo : '—'}</span>
                                    <span className="text-sm max-[400px]:text-[11px] font-medium text-gray-700 group-hover/box:!text-white/90 whitespace-nowrap truncate transition-colors">Days to Go</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}


                      {/* Action Buttons */}
                      <div className="p-4 sm:p-6 border-t border-gray-100 bg-white mt-auto">
                        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3 overflow-visible">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (equipmentLock?.isLocked) {
                                setEquipmentLockModalOpen(true);
                                return;
                              }
                              handleSelectProject(project.id, "equipment");
                            }}
                            className={`w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center font-medium transition-all duration-200 ${
                              equipmentLock?.isLocked
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-80'
                                : 'bg-white hover:bg-blue-50 border-gray-300 text-gray-700 hover:text-blue-700 hover:border-blue-300'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="sm:hidden">Equip</span>
                            <span className="hidden sm:inline">View Equipment</span>
                          </Button>
                          {(userRole === 'firm_admin' || userRole === 'project_manager' || userRole === 'vdcr_manager') ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openManageWeightage(project.id);
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-green-50 border-gray-300 text-gray-700 hover:text-green-700 hover:border-green-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="sm:hidden">Weight</span>
                              <span className="hidden sm:inline">Manage Weightage</span>
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProject(project.id, "vdcr");
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-green-50 border-gray-300 text-gray-700 hover:text-green-700 hover:border-green-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="sm:hidden">VDCR</span>
                              <span className="hidden sm:inline">View VDCR</span>
                            </Button>
                          )}
                          {userRole !== 'vdcr_manager' && userRole !== 'editor' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProject(project.id, "project-details");
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-purple-50 border-gray-300 text-gray-700 hover:text-purple-700 hover:border-purple-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="sm:hidden">Details</span>
                              <span className="hidden sm:inline">Details</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
              </div>
              
              {/* Pagination Controls for Projects */}
              {totalProjectPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mt-6 pt-4 border-t border-gray-200">
                  <div className="text-xs sm:text-sm text-gray-600 min-w-0 order-2 sm:order-1 text-center sm:text-left">
                    Showing {startProjectIndex + 1} to {Math.min(endProjectIndex, currentProjects.length)} of {currentProjects.length} projects
                  </div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2 order-1 sm:order-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalProjectPages) }, (_, i) => {
                        let pageNum;
                        if (totalProjectPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalProjectPages - 2) {
                          pageNum = totalProjectPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`min-w-[28px] sm:min-w-0 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium rounded-md ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalProjectPages, prev + 1))}
                      disabled={currentPage === totalProjectPages}
                      className="px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : mainTab === 'tasks' ? (
          <TasksTab />
        ) : mainTab === 'certificates' && userRole === 'firm_admin' ? (
          <CompletionCertificatesTab
            projects={projects}
            certificateTemplates={certificateTemplates}
            equipmentCarouselIndex={equipmentCarouselIndex}
            userRole={userRole}
            equipmentLock={equipmentLock}
            onShowEquipmentLockModal={() => setEquipmentLockModalOpen(true)}
            onDownloadTemplate={handleDownloadTemplate}
            onSelectProject={handleSelectProject}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onRequestRecommendationLetter={handleRequestRecommendationLetter}
            onSendRecommendationReminder={handleSendRecommendationReminder}
            onUploadRecommendationLetter={handleUploadRecommendationLetter}
            onViewRecommendationLetter={handleViewRecommendationLetter}
            onSetEquipmentCarouselIndex={setEquipmentCarouselIndex}
          />
        ) : null}

        {/* Standalone Equipment tab: mount only when user clicks the tab – no requests until then */}
        {mainTab === 'equipment' && (
          <StandaloneEquipmentTab
            standaloneEquipment={standaloneEquipment}
            standaloneEquipmentLoading={standaloneEquipmentLoading}
            onSummaryChange={setStandaloneEquipmentSummary}
            onOpenDossierReport={setDossierParams}
          />
        )}

        {/* Selected Project View - Show in Projects tab or Certificates tab */}
        {((mainTab === 'projects' || mainTab === 'certificates') && selectedProject) ? (
          <UnifiedProjectView
            projectId={selectedProject}
            projectName={selectedProjectData?.name || "Project"}
            onBack={handleBackToProjects}
            equipment={selectedProjectData?.equipment || []}
            vdcrData={mockVDCRData}
            projectData={selectedProjectData || mockProjects[0]}
            initialTab={selectedProjectTab}
            userRole={userRole}
            equipmentLock={equipmentLock}
            onOpenDossierReport={setDossierParams}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onCompleteProject={handleCompleteProject}
            onDocumentDeleted={(projectId, documentId, documentType) => {
              const docKey = documentType === 'unpriced_po_documents' ? 'unpricedPODocuments'
                : documentType === 'design_inputs_documents' ? 'designInputsDocuments'
                : documentType === 'client_reference_documents' ? 'clientReferenceDocuments'
                : 'otherDocumentsLinks';
              const removeDoc = (p: any) => {
                if (p.id !== projectId) return p;
                const arr = p[docKey];
                if (!Array.isArray(arr)) return p;
                return { ...p, [docKey]: arr.filter((d: any) => d.id !== documentId) };
              };
              setProjects(prev => prev.map(removeDoc));
              setFilteredProjects(prev => prev.map(removeDoc));
              fetchProjectsRef.current?.();
            }}
          />
        ) : null}

      {/* Dossier Report wizard overlay (additive feature) */}
      {dossierParams && (
        <DossierReportWizard params={dossierParams} onClose={() => setDossierParams(null)} />
      )}

      {/* Manage Weightage Modal */}
      {weightageModalProjectId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50" aria-modal="true" role="dialog">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-gray-200 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Manage project weightage</h2>
                <p className="text-[11px] sm:text-xs text-gray-600">
                  We understand not all documents and equipments are the same.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWeightageModalProjectId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <nav
                className="relative flex w-full overflow-hidden rounded-full bg-gray-100/90 p-1"
                aria-label="Project weightage mode"
              >
                <div
                  className={`absolute top-0.5 bottom-0.5 rounded-full shadow-sm transition-[left,width,background-color] duration-300 ease-out ${
                    weightageActiveTab === 'documentation' ? 'bg-[#2B62FF]' : 'bg-emerald-500'
                  }`}
                  style={{
                    left: weightageActiveTab === 'documentation' ? '2px' : 'calc(50% + 2px)',
                    width: 'calc(50% - 4px)',
                  }}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setWeightageActiveTab('documentation')}
                  className={`relative z-10 flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
                    weightageActiveTab === 'documentation' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Documentation weightage
                </button>
                <button
                  type="button"
                  onClick={() => setWeightageActiveTab('manufacturing')}
                  className={`relative z-10 flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
                    weightageActiveTab === 'manufacturing' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Equipment weightage
                </button>
              </nav>
            </div>
            <div className="px-5 py-3 overflow-auto flex-1 space-y-4">
              {weightageActiveTab === 'documentation' ? (
                <>
                  <div className="flex items-center justify-between text-[11px] sm:text-xs text-gray-700">
                    <span>
                      Total documentation weight:&nbsp;
                      <span className="font-semibold">
                        {weightageDocs.reduce((sum, d) => sum + (d.weight_pct || 0), 0).toFixed(1)}%
                      </span>
                    </span>
                    {weightageLoading && (
                      <span className="text-gray-500">Loading documents…</span>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-800">
                          Code completion values (per project)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetCodeCompletionFactors}
                        className="ml-auto text-[10px] sm:text-[11px] leading-tight text-blue-600 hover:text-blue-700 text-right"
                        disabled={weightageSaving}
                      >
                        <span className="block">Reset codes</span>
                        <span className="block">to default</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {codeCompletionFactors.map((entry) => (
                        <div key={entry.code_status} className="flex flex-col gap-1">
                          <span className="text-[11px] sm:text-xs font-medium text-gray-700">{entry.label}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d*"
                              value={entry.percentage}
                              onChange={(e) => handleCodeCompletionFactorChange(entry.code_status, e.target.value)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-[11px] sm:text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                            />
                            <span className="text-[11px] sm:text-xs text-gray-600">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {weightageDocs.length === 0 && !weightageLoading && (
                    <div className="text-sm text-gray-600">No documentation rows found for this project.</div>
                  )}
                  {weightageDocs.length > 0 && (
                    <table className="min-w-full text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-2 py-2 text-left font-medium text-gray-700 w-16">SR</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-700">Document</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-700 w-24">Code</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-700 w-28">Weight %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weightageDocs.map((doc) => (
                          <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                            <td className="px-2 py-2 text-gray-800 whitespace-nowrap">{doc.sr_no}</td>
                            <td className="px-2 py-2 text-gray-800">
                              <div className="max-w-xs sm:max-w-md truncate" title={doc.document_name}>
                                {doc.document_name}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{doc.code_status}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                                  onClick={() => adjustWeightByStep(doc.id, -1)}
                                >
                                  –
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="\d*"
                                  value={doc.input}
                                  onChange={(e) => handleWeightChange(doc.id, e.target.value)}
                                  className="w-16 px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm text-center focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                                />
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                                  onClick={() => adjustWeightByStep(doc.id, 1)}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-gray-700">
                      <span>
                        Total manufacturing weight:&nbsp;
                        <span className="font-semibold">
                          {weightageManufacturingEquipments.reduce((sum, eq) => sum + (eq.weight_pct || 0), 0).toFixed(1)}%
                        </span>
                      </span>
                      {weightageLoading && (
                        <span className="text-gray-500">Loading equipments…</span>
                      )}
                    </div>
                    {weightageManufacturingEquipments.length > 0 && (() => {
                      const total = weightageManufacturingEquipments.reduce((sum, eq) => sum + (eq.weight_pct || 0), 0);
                      const diff = 100 - total;
                      const isOk = Math.abs(diff) < 0.1;
                      return (
                        <p className={`text-[11px] ${isOk ? 'text-green-600 font-medium' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          {isOk ? 'Balance: 100% ✓' : diff > 0 ? `${diff.toFixed(1)}% remaining to reach 100%` : `${Math.abs(diff).toFixed(1)}% over 100%`}
                        </p>
                      );
                    })()}
                  </div>
                  {weightageManufacturingEquipments.length === 0 && !weightageLoading && (
                    <div className="text-sm text-gray-600">
                      No equipments found for this project yet. Once equipments are added, you&apos;ll see how each one contributes to manufacturing progress here.
                    </div>
                  )}
                  {weightageManufacturingEquipments.length > 0 && (
                    <table className="min-w-full text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-2 py-2 text-left font-medium text-gray-700">Equipment title</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-700 w-32">Tag no.</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-700 w-32">Weight %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weightageManufacturingEquipments.map((eq) => (
                          <tr key={eq.id} className="border-b border-gray-100 hover:bg-gray-50/70">
                            <td className="px-2 py-2 text-gray-800">
                              <div className="max-w-xs sm:max-w-md truncate" title={eq.title}>
                                {eq.title}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{eq.tag_number || '-'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                                  onClick={() => adjustManufacturingWeightByStep(eq.id, -1)}
                                >
                                  –
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="\d*"
                                  value={eq.input}
                                  onChange={(e) => handleManufacturingWeightChange(eq.id, e.target.value)}
                                  className="w-16 px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <span className="text-[11px] sm:text-xs text-gray-600">%</span>
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                                  onClick={() => adjustManufacturingWeightByStep(eq.id, 1)}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              {weightageActiveTab === 'documentation' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetWeightage}
                    disabled={weightageSaving || weightageLoading || weightageDocs.length === 0}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeightageModalProjectId(null)}
                    disabled={weightageSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveWeightage}
                    disabled={weightageSaving || weightageLoading || weightageDocs.length === 0}
                  >
                    {weightageSaving ? 'Saving…' : 'Save Weightage'}
                  </Button>
                </>
              )}
              {weightageActiveTab === 'manufacturing' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetManufacturingWeightage}
                    disabled={weightageManufacturingEquipments.length === 0}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeightageModalProjectId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!weightageModalProjectId) return;
                      try {
                        const list = weightageManufacturingEquipments.map((eq) => ({
                          equipment_id: eq.id,
                          weight_pct: Math.max(0, eq.weight_pct || 0),
                        }));
                        const total = list.reduce((s, w) => s + w.weight_pct, 0);
                        const scale = total > 0 ? 100 / total : 1;
                        const payload = list.map((w) => ({ ...w, weight_pct: Math.round(w.weight_pct * scale * 100) / 100 }));
                        await fastAPI.saveProjectEquipmentWeights(weightageModalProjectId, payload);
                        toast({
                          title: 'Weights Saved',
                          description: 'Equipment weightage has been updated for this project.',
                        });
                        setWeightageModalProjectId(null);
                      } catch (error: any) {
                        console.error('❌ Error saving manufacturing weightage:', error);
                        toast({
                          title: 'Error',
                          description: error?.response?.data?.message || error?.message || 'Failed to save manufacturing weightage.',
                          variant: 'destructive',
                        });
                      }
                    }}
                    disabled={weightageManufacturingEquipments.length === 0}
                  >
                    Save Weightage
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      
      {/* Add Project Form Modal */}
      {showAddProjectForm && (
        <AddProjectForm
          onClose={() => {
            setShowAddProjectForm(false);
            setEditMode(false);
            setEditingProject(null);
          }}
          onSubmit={editMode ? handleUpdateProject : handleAddNewProject}
          editData={editMode ? editingProject : null}
          isEditMode={editMode}
        />
      )}

      {/* Equipment onboarding lock modal */}
      {equipmentLockModalOpen && equipmentLock?.isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEquipmentLockModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-blue-600">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Equipment available soon</h3>
            </div>
            <p className="text-gray-700">
              <strong className="text-blue-600">{equipmentLock.daysRemaining} day{equipmentLock.daysRemaining !== 1 ? 's' : ''} to go</strong> until the Equipment dashboard is unlocked.
            </p>
            <p className="text-sm text-gray-600">
              To help you and your team get accustomed to the app faster and avoid confusion, we prefer going step by step. We had set a timer of <strong>{equipmentLock.totalDays} days</strong> since your onboarding—only <strong>{equipmentLock.daysRemaining} days to go</strong>. Enjoy exploring the rest of the platform in the meantime!
            </p>
            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
              For any emergency, please contact your company admin or our support team.
            </p>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setEquipmentLockModalOpen(false)} className="bg-blue-600 hover:bg-blue-700">
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {showPDFViewer && pdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800 truncate">{pdfTitle}</h2>
              <button
                onClick={closePDFViewer}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* PDF Content */}
            <div className="flex-1 p-4 sm:p-6 overflow-hidden">
              <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full"
                  style={{ minHeight: '400px' }}
                  title="PDF Viewer"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={closePDFViewer}
                className="px-4 py-2"
              >
                Close
              </Button>
              {currentPDF && (
                <Button
                  variant="default"
                  onClick={() => {
                    const url = URL.createObjectURL(currentPDF);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = currentPDF.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;