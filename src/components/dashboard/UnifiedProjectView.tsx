import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Building, FileText, PieChart, Target, BarChart3, Calendar, ClipboardList, AlertTriangle, TrendingUp, Users, Download, Settings, Clock, User, ArrowRight, Image, Wrench, FileCheck, UserPlus, Link2 } from "lucide-react";
import EquipmentGrid from "./EquipmentGrid";
import ProjectsVDCR from "./ProjectsVDCR";
import ProjectDetails from "./ProjectDetails";
import { ClientViewModal } from "./ClientViewModal";
import { fastAPI } from "@/lib/api";
import { sendProjectTeamEmailNotification } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logTeamMemberAdded, logTeamMemberAddedBatch } from "@/lib/activityLogger";

interface UnifiedProjectViewProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
  equipment: any[];
  vdcrData: any[];
  projectData: any;
  initialTab?: string;
  userRole?: string;
  equipmentLock?: { isLocked: boolean; daysRemaining: number; totalDays: number } | null;
  onEditProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onDocumentDeleted?: (projectId: string, documentId: string, documentType: 'unpriced_po_documents' | 'design_inputs_documents' | 'client_reference_documents' | 'other_documents') => void;
  /** Open dossier report wizard for an equipment (additive feature) */
  onOpenDossierReport?: (params: { projectId: string; equipmentId: string; projectName: string; equipment: any }) => void;
}

const UnifiedProjectView = ({ 
  projectId, 
  projectName, 
  onBack,
  equipment, 
  vdcrData, 
  projectData,
  initialTab = "equipment",
  userRole = "",
  equipmentLock = null,
  onEditProject,
  onDeleteProject,
  onCompleteProject,
  onDocumentDeleted,
  onOpenDossierReport
}: UnifiedProjectViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(
    (equipmentLock?.isLocked && initialTab === "equipment") ? "vdcr" : initialTab);

  // When equipment is locked and user landed on equipment tab, keep them on vdcr
  useEffect(() => {
    if (equipmentLock?.isLocked && activeTab === "equipment") {
      setActiveTab("vdcr");
    }
  }, [equipmentLock?.isLocked]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigateToTab = (event: CustomEvent) => {
      const { tab } = event.detail;
      if (tab === 'settings') {
        setActiveTab('settings');
      }
    };

    window.addEventListener('navigateToTab', handleNavigateToTab as EventListener);
    
    return () => {
      window.removeEventListener('navigateToTab', handleNavigateToTab as EventListener);
    };
  }, []);

  // Debug: Log project data
  // // console.log('🔍 UnifiedProjectView received projectData:', projectData);
  // // console.log('📊 Project ID:', projectId);
  // // console.log('📊 Project Name:', projectName);
  // // console.log('🔧 Equipment data received:', equipment);

  // Search states
  const [vdcrSearchQuery, setVdcrSearchQuery] = useState("");
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");

  // Documentation Overview states
  const [selectedVDCRStatus, setSelectedVDCRStatus] = useState('approved');

  // Team connections state - removed as not needed

  // Team Management states
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);

  // Client view (share with client) modal
  const [clientViewModalOpen, setClientViewModalOpen] = useState(false);

  // Filter equipment based on user role and equipment assignments
  const filteredEquipment = useMemo(() => {
    if (!equipment || equipment.length === 0) {
      return [];
    }
    
    // Get current user info - check multiple sources for email
    let currentUserEmail = '';
    try {
      // Try from auth context first
      if (user?.email) {
        currentUserEmail = user.email;
      } else {
        // Try from localStorage userData object
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        currentUserEmail = userData.email || localStorage.getItem('userEmail') || '';
      }
    } catch (error) {
      console.error('Error getting user email:', error);
      currentUserEmail = localStorage.getItem('userEmail') || '';
    }
    
    const currentUserRole = userRole || localStorage.getItem('userRole') || '';
    
    // Normalize email for comparison
    const normalizedUserEmail = currentUserEmail.toLowerCase().trim();
    
    // Debug logging (can be removed after testing)
    // console.log('🔍 Equipment Filtering Debug:', {
    //   currentUserEmail: normalizedUserEmail,
    //   currentUserRole,
    //   teamMembersCount: teamMembers.length,
    //   teamMembersLoading,
    //   equipmentCount: equipment?.length || 0,
    //   teamMemberEmails: teamMembers.map((m: any) => m.email?.toLowerCase().trim())
    // });
    
    // Only firm_admin sees all equipment; project_manager and vdcr_manager see assigned equipment only
    if (currentUserRole === 'firm_admin') {
      return equipment;
    }
    
    // For project_manager, vdcr_manager, editors and viewers - filter by equipment assignments
    if (currentUserRole === 'project_manager' || currentUserRole === 'vdcr_manager' || currentUserRole === 'editor' || currentUserRole === 'viewer') {
      // If team members are still loading, wait (don't show equipment yet)
      if (teamMembersLoading) {
        // console.log('⏳ Team members still loading - waiting...');
        return [];
      }
      
      // If team members haven't loaded yet, return empty array (will update when loaded)
      if (teamMembers.length === 0) {
        // console.log('⏳ Team members not loaded yet - waiting...');
        return [];
      }
      
      // Find the current user's team member record for this project
      const userTeamMember = teamMembers.find((member: any) => {
        const memberEmail = (member.email || '').toLowerCase().trim();
        return memberEmail === normalizedUserEmail;
      });
      
      // console.log('🔍 User team member search:', {
      //   searchingFor: normalizedUserEmail,
      //   found: !!userTeamMember,
      //   memberEmail: userTeamMember?.email,
      //   assignments: userTeamMember?.equipmentAssignments,
      //   assignmentsLength: userTeamMember?.equipmentAssignments?.length
      // });
      
      if (!userTeamMember) {
        // console.log('⚠️ User not found in team members - showing no equipment');
        return [];
      }
      
      if (!userTeamMember.equipmentAssignments || userTeamMember.equipmentAssignments.length === 0) {
        // console.log('⚠️ No equipment assignments found for user - showing no equipment');
        return [];
      }
      
      const assignments = Array.isArray(userTeamMember.equipmentAssignments) 
        ? userTeamMember.equipmentAssignments 
        : [];
      
      // Check if user has "All Equipment" assignment
      if (assignments.includes('All Equipment')) {
        // console.log('✅ User has "All Equipment" assignment - showing all equipment');
        return equipment;
      }
      
      // Filter equipment based on assignments
      const filtered = equipment.filter((eq: any) => {
        const eqId = eq.id;
        const eqName = eq.name;
        const eqTagNumber = eq.tagNumber || eq.tag_number;
        
        // Check if equipment ID is in assignments
        if (eqId && assignments.includes(eqId)) {
          return true;
        }
        
        // Check if equipment name is in assignments
        if (eqName && assignments.includes(eqName)) {
          return true;
        }
        
        // Check if equipment tag number is in assignments
        if (eqTagNumber && assignments.includes(eqTagNumber)) {
          return true;
        }
        
        return false;
      });
      
      // console.log(`✅ Filtered equipment: ${filtered.length} of ${equipment.length} items`, {
      //   assignments,
      //   equipmentIds: equipment.map(eq => eq.id)
      // });
      return filtered;
    }
    
    // Default: return all equipment (for other roles or if role is not recognized)
    // console.log('⚠️ Unknown role or no filtering applied - showing all equipment');
    return equipment;
  }, [equipment, teamMembers, teamMembersLoading, user?.email, userRole]);

  // VDCR and Equipment Logs states
  const [vdcrRecords, setVdcrRecords] = useState<any[]>([]); // Activity logs for Activity Log tab
  const [vdcrDocuments, setVdcrDocuments] = useState<any[]>([]); // Actual VDCR records for Birdview
  const [isLoadingVDCR, setIsLoadingVDCR] = useState(false);
  const [equipmentProgressEntries, setEquipmentProgressEntries] = useState<any[]>([]);
  const [isLoadingEquipmentLogs, setIsLoadingEquipmentLogs] = useState(false);
  const vdcrLoadedForProjectRef = useRef<string | null>(null);
  const teamLoadedForProjectRef = useRef<string | null>(null);
  const equipmentLogsLoadedForProjectRef = useRef<string | null>(null);
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    documentUrl: '',
    documentName: ''
  });

  // Load VDCR activity logs and actual VDCR records
  const loadVDCRData = async () => {
    try {
      setIsLoadingVDCR(true);
      // console.log('🔄 Loading VDCR data for project:', projectId);
      
      // Load activity logs for Activity Log tab
      try {
        const { activityApi } = await import('@/lib/activityApi');
        // console.log('📄 UnifiedProjectView: Fetching VDCR activity logs for project:', projectId);
        const logs = await activityApi.getVDCRActivityLogs(projectId);
        const logsArray = Array.isArray(logs) ? logs : [];
        // console.log('📄 UnifiedProjectView: VDCR activity logs loaded:', {
        //   count: logsArray.length,
        //   firstLog: logsArray[0],
        //   allLogs: logsArray
        // });
        setVdcrRecords(logsArray);
      } catch (error) {
        console.error('❌ UnifiedProjectView: Error loading VDCR activity logs:', error);
        setVdcrRecords([]);
      }
      
      // Load actual VDCR records for Birdview
      try {
        const { fastAPI } = await import('@/lib/api');
        const records = await fastAPI.getVDCRRecordsByProject(projectId);
        let recordsArray = Array.isArray(records) ? records : [];
        // If vdcr_records.document_url is missing, fall back to latest revision-event document_url
        // so Birdview preview button remains available for newly uploaded docs.
        try {
          const ids = recordsArray.map((r: any) => r?.id).filter((id: any) => !!id);
          if (ids.length > 0) {
            const eventsMap = await fastAPI.getVDCRRevisionEventsBatch(ids);
            recordsArray = recordsArray.map((r: any) => {
              if (r?.document_url) return r;
              const events = Array.isArray(eventsMap?.[r.id]) ? eventsMap[r.id] : [];
              const latestWithUrl = events.find((e: any) => !!e?.document_url);
              return latestWithUrl?.document_url
                ? { ...r, document_url: latestWithUrl.document_url }
                : r;
            });
          }
        } catch (eventErr) {
          console.warn('⚠️ UnifiedProjectView: Could not enrich VDCR URLs from revision events:', eventErr);
        }
        // console.log('✅ Loaded VDCR records:', recordsArray.length, 'records');
        setVdcrDocuments(recordsArray);
      } catch (error) {
        console.error('❌ Error loading VDCR records:', error);
        setVdcrDocuments([]);
      }
    } catch (error) {
      console.error('❌ Error loading VDCR data:', error);
      setVdcrRecords([]);
      setVdcrDocuments([]);
    } finally {
      setIsLoadingVDCR(false);
      vdcrLoadedForProjectRef.current = projectId;
    }
  };

  // Load equipment activity logs from equipment_activity_logs table
  const loadEquipmentProgressEntries = async () => {
    try {
      setIsLoadingEquipmentLogs(true);
      // console.log('🔧 UnifiedProjectView: Loading equipment logs for project:', projectId);
      // Import activityApi to fetch from equipment_activity_logs table
      const { activityApi } = await import('@/lib/activityApi');
      const entries = await activityApi.getEquipmentActivityLogs(projectId);
      const entriesArray = Array.isArray(entries) ? entries : [];
      // console.log('🔧 UnifiedProjectView: Equipment logs loaded:', {
      //   count: entriesArray.length,
      //   firstEntry: entriesArray[0],
      //   allEntries: entriesArray
      // });
      setEquipmentProgressEntries(entriesArray);
    } catch (error) {
      console.error('❌ UnifiedProjectView: Error loading equipment activity logs:', error);
      setEquipmentProgressEntries([]);
    } finally {
      setIsLoadingEquipmentLogs(false);
      equipmentLogsLoadedForProjectRef.current = projectId;
    }
  };

  // Fetch team members from project_members table (memoized with useCallback)
  const fetchTeamMembers = useCallback(async () => {
    try {
      setTeamMembersLoading(true);
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // // console.log('🔄 SETTINGS TAB: Fetching project members for project:', projectId);

      // Fetch from project_members table
      const teamData = await fastAPI.getProjectMembers(projectId);
      // // console.log('👥 Raw project members data:', teamData);

      // Transform the data to match the expected format
      const transformedMembers = (teamData as any[]).map((member, index) => ({
        id: member.id || `member-${index}`,
        name: member.name || 'Unknown',
        email: member.email || '',
        phone: member.phone || '',
        position: member.position || '',
        department: member.department || '',
        role: member.role || 'viewer',
      permissions: member.permissions && member.permissions.length > 0 ? member.permissions : getPermissionsByRole(member.role || 'viewer'),
        status: member.status || 'active',
        avatar: member.avatar || (member.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase(),
        lastActive: member.last_active || 'Unknown',
        equipmentAssignments: member.equipment_assignments || [],
        dataAccess: member.data_access || [],
        accessLevel: member.access_level || 'viewer'
      }));

      // // console.log('✅ Transformed project members:', transformedMembers.length);
      // // console.log('✅ Team members details:', transformedMembers);
      setTeamMembers(transformedMembers);
      teamLoadedForProjectRef.current = projectId;
    } catch (error) {
      // console.error('❌ Error fetching team members:', error);
      setTeamMembers([]);
    } finally {
      setTeamMembersLoading(false);
    }
  }, [projectId]); // Memoized with projectId dependency

  // Fetch existing firm members for dropdown (when add member modal opens)
  const fetchExistingFirmMembers = useCallback(async () => {
    try {
      setIsLoadingExistingMembers(true);
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;
      
      if (!firmId) {
        setExistingFirmMembers([]);
        return;
      }

      const members = await fastAPI.getAllFirmTeamMembers(firmId);
      setExistingFirmMembers(members || []);
    } catch (error) {
      console.error('❌ Error fetching existing firm members:', error);
      setExistingFirmMembers([]);
    } finally {
      setIsLoadingExistingMembers(false);
    }
  }, []);

  // Helper functions for role-based data
  const getPermissionsByRole = (role) => {
    const rolePermissions = {
      'firm_admin': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'project_manager': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'vdcr_manager': ['view', 'edit', 'approve_vdcr', 'manage_vdcr'],
      'design_engineer': ['view', 'edit', 'manage_equipment'],
      'quality_inspector': ['view', 'comment'],
      'welder': ['view'],
      'viewer': ['view']
    };
    return rolePermissions[role] || ['view'];
  };

  const getDataAccessByRole = (role) => {
    const roleAccess = {
      'firm_admin': ['Full Company Access', 'Can Edit All Data', 'Manage All Projects'],
      'project_manager': ['Full Project Access', 'Can Edit All Data', 'Cannot Edit Documentation'],
      'vdcr_manager': ['Documentation Tab Access', 'Can Edit Documentation', 'Documentation Birdview', 'Documentation Logs'],
      'design_engineer': ['Assigned Equipment Only', 'Can Add Progress Images', 'Can Add Progress Entries', 'Access to Documentation & Other Tabs', 'No Access to Settings & Project Details'],
      'quality_inspector': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data', 'Access to Documentation & Other Tabs', 'No Access to Settings & Project Details'],
      'welder': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data'],
      'viewer': ['Read-Only Access', 'Cannot Edit Data']
    };
    return roleAccess[role] || ['Read-Only Access'];
  };

  // Load tab data only when user opens that tab (keeps equipment view ~9 requests; no VDCR/team/logs until clicked)
  useEffect(() => {
    if (!projectId || activeTab !== 'settings') return;
    if (teamLoadedForProjectRef.current === projectId) return;
    fetchTeamMembers();
  }, [projectId, activeTab, projectData?.id]);

  useEffect(() => {
    if (!projectId) return;
    // Avoid duplicate VDCR requests on Documentation tab:
    // ProjectsVDCR already fetches its own data when activeTab === 'vdcr'.
    const shouldLoadParentVdcrData =
      activeTab === 'vdcr-overview' ||
      activeTab === 'progress-logs';
    if (!shouldLoadParentVdcrData) return;
    if (vdcrLoadedForProjectRef.current === projectId) return;
    loadVDCRData();
  }, [projectId, activeTab, projectData?.id]);

  useEffect(() => {
    // Load when user opens Project Chronology tab (progress-logs) or equipment-activity so Equipment Logs sub-tab has data
    if (!projectId || (activeTab !== 'progress-logs' && activeTab !== 'equipment-activity')) return;
    if (equipmentLogsLoadedForProjectRef.current === projectId) return;
    loadEquipmentProgressEntries();
  }, [projectId, activeTab, projectData?.id]);

  // Listen for team member creation events
  useEffect(() => {
    const handleTeamMemberCreated = (event: any) => {
      // // console.log('🔄 Team member created event received:', event.detail);
      // // console.log('🔄 Refreshing team list...');
      fetchTeamMembers();
    };

    const handleProjectCreated = (event: any) => {
      // // console.log('🔄 Project created event received:', event.detail);
      if (event.detail.teamMembersAdded) {
        // // console.log('🔄 Project created with team members, refreshing team list...');
        fetchTeamMembers();
      }
    };

    const handleEquipmentChanged = (event: any) => {
      // // console.log('🔄 Equipment changed event received:', event.detail);
      // // console.log('🔄 Refreshing equipment activities...');
      loadEquipmentProgressEntries();
    };

    window.addEventListener('teamMemberCreated', handleTeamMemberCreated);
    window.addEventListener('projectCreated', handleProjectCreated);
    window.addEventListener('equipmentChanged', handleEquipmentChanged);

    return () => {
      window.removeEventListener('teamMemberCreated', handleTeamMemberCreated);
      window.removeEventListener('projectCreated', handleProjectCreated);
      window.removeEventListener('equipmentChanged', handleEquipmentChanged);
    };
  }, []);

  // Auto-refresh equipment activities every 60 seconds (optimized - only when tab is active)
  // Only refresh when user is actively viewing the Chronology tab (progress-logs or equipment-activity)
  useEffect(() => {
    if (projectId && (activeTab === 'progress-logs' || activeTab === 'equipment-activity')) {
      const interval = setInterval(() => {
        loadEquipmentProgressEntries();
      }, 60000); // 60 seconds - reduced frequency for better performance

      return () => clearInterval(interval);
    }
  }, [projectId, activeTab]);

  // Expose refresh function to parent components (memoized)
  const refreshTeamMembers = useCallback(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]); // Memoized with fetchTeamMembers dependency

  const [roles, setRoles] = useState([
    {
      name: "project_manager",
      displayName: "Project Manager",
      permissions: ["view", "edit", "delete", "manage_team", "approve_vdcr", "manage_equipment"],
      color: "bg-blue-100 text-blue-800"
    },
    {
      name: "vdcr_manager",
      displayName: "Documentation Manager",
      permissions: ["view", "edit", "approve_vdcr", "manage_vdcr"],
      color: "bg-teal-100 text-teal-800"
    },
    {
      name: "editor",
      displayName: "Editor",
      permissions: ["view", "edit", "manage_equipment"],
      color: "bg-blue-100 text-blue-800"
    },
    {
      name: "viewer",
      displayName: "Viewer",
      permissions: ["view"],
      color: "bg-gray-100 text-gray-800"
    }
  ]);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    department: "",
    role: "",
    permissions: [],
    equipmentAssignments: [],
    dataAccess: [],
    accessLevel: "viewer"
  });
  const [addMemberAvailableDepartments, setAddMemberAvailableDepartments] = useState<string[]>([]);
  const [addMemberNewDepartmentInput, setAddMemberNewDepartmentInput] = useState('');
  
  // Existing members state for dropdown
  const [existingFirmMembers, setExistingFirmMembers] = useState<any[]>([]);
  const [isLoadingExistingMembers, setIsLoadingExistingMembers] = useState(false);
  const [selectedExistingMemberEmail, setSelectedExistingMemberEmail] = useState<string>("");
  const [isExistingMemberMode, setIsExistingMemberMode] = useState(false);
  const [bulkMemberUploading, setBulkMemberUploading] = useState(false);

  // Available permissions list
  const availablePermissions = [
    { key: "view", label: "View" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete" },
    { key: "manage_team", label: "Manage Team" },
    { key: "approve_vdcr", label: "Approve Documentation" },
    { key: "manage_equipment", label: "Manage Equipment" },
    { key: "comment", label: "Comment" }
  ];

  // Map database role to display role
  const mapRoleToDisplay = (dbRole: string): string => {
    const roleMap: { [key: string]: string } = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'Documentation Manager',
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    return roleMap[dbRole] || dbRole;
  };

  const addCustomMemberDepartment = () => {
    const value = addMemberNewDepartmentInput.trim();
    if (!value) return;
    setAddMemberAvailableDepartments((prev) => Array.from(new Set([...prev, value])).sort());
    setNewMember((prev) => ({ ...prev, department: value }));
    setAddMemberNewDepartmentInput('');
  };

  // Handle existing member selection
  const handleExistingMemberSelect = async (email: string) => {
    if (email === "" || email === "new") {
      // User selected "Add New Member"
      setIsExistingMemberMode(false);
      setSelectedExistingMemberEmail("");
      setNewMember({
        name: "",
        email: "",
        phone: "",
        position: "",
        department: "",
        role: "",
        permissions: [],
        equipmentAssignments: [],
        dataAccess: [],
        accessLevel: "viewer"
      });
      return;
    }

    // Find the selected member
    const selectedMember = existingFirmMembers.find(m => m.email === email);
    if (selectedMember) {
      setIsExistingMemberMode(true);
      setSelectedExistingMemberEmail(email);
      
      // Map role from database format to display format
      const displayRole = mapRoleToDisplay(selectedMember.role || selectedMember.access_level || 'viewer');
      
      // Get role permissions
      const roleObj = roles.find(r => r.name === selectedMember.role || r.name === selectedMember.access_level);
      
      // Try to prefill department from firm member, then project member record.
      let prefillDepartment = (selectedMember.department || '').trim();
      if (!prefillDepartment && projectId && projectId !== 'standalone') {
        try {
          const projectMembers = await fastAPI.getProjectMembers(projectId);
          const projectMember = (Array.isArray(projectMembers) ? projectMembers : []).find(
            (m: any) => (m.email || '').toLowerCase() === email.toLowerCase()
          );
          prefillDepartment = (projectMember?.department || '').trim();
        } catch {
          // Keep fallback empty if lookup fails.
        }
      }

      // Auto-fill member data (locked fields)
      setNewMember({
        name: selectedMember.name,
        email: selectedMember.email,
        phone: selectedMember.phone || "",
        position: "", // Position stays empty - user must enter it
        department: prefillDepartment,
        role: displayRole,
        permissions: roleObj ? roleObj.permissions : [],
        equipmentAssignments: [],
        dataAccess: [],
        accessLevel: selectedMember.access_level || selectedMember.role || "viewer"
      });
    }
  };

  // Reset form when modal closes
  const handleCloseAddMember = () => {
    setShowAddMember(false);
    setIsExistingMemberMode(false);
    setSelectedExistingMemberEmail("");
    setAddMemberNewDepartmentInput('');
    setNewMember({
      name: "",
      email: "",
      phone: "",
      position: "",
      department: "",
      role: "",
      permissions: [],
      equipmentAssignments: [],
      dataAccess: [],
      accessLevel: "viewer"
    });
  };

  // Fetch existing members when add member modal opens
  useEffect(() => {
    if (showAddMember) {
      fetchExistingFirmMembers();
    }
  }, [showAddMember, fetchExistingFirmMembers]);

  useEffect(() => {
    if (!showAddMember && !showEditMember) return;
    setAddMemberNewDepartmentInput('');
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const firmId = userData.firm_id;
    if (firmId) {
      fastAPI.getFirmDepartments(firmId).then(setAddMemberAvailableDepartments);
    } else {
      setAddMemberAvailableDepartments([]);
    }
  }, [showAddMember, showEditMember, projectId]);

  // Function to handle permission toggle
  const togglePermission = (permissionKey) => {
    setNewMember(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionKey)
        ? prev.permissions.filter(p => p !== permissionKey)
        : [...prev.permissions, permissionKey]
    }));
  };

  const BULK_MEMBER_ROLE_OPTIONS = ['Project Manager', 'Documentation Manager', 'Editor', 'Viewer'];

  const downloadTeamMembersTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Team Members');
      sheet.addRow(['Full Name', 'Email', 'Phone Number', 'Position Title', 'Department', 'Equipment Assignment', 'Role']);
      sheet.addRow(['Jane Doe', 'jane@example.com', '9876543210', 'Engineer', 'Engineering', 'All Equipment', 'Editor']);
      sheet.addRow(['John Smith', 'john@example.com', '9123456780', 'Inspector', 'Quality', (equipment[0]?.manufacturing_serial || equipment[0]?.tag_number || equipment[0]?.type || 'Equipment Name'), 'Viewer']);

      sheet.columns = [
        { width: 22 },
        { width: 28 },
        { width: 16 },
        { width: 22 },
        { width: 20 },
        { width: 30 },
        { width: 26 },
      ];

      for (let row = 2; row <= 2000; row++) {
        sheet.getCell(`G${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${BULK_MEMBER_ROLE_OPTIONS.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Invalid Role',
          error: 'Select one of: Project Manager, Documentation Manager, Editor, Viewer'
        };
      }

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Team_Members_Bulk_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Team_Members_Bulk_Template.xlsx' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to download template.', variant: 'destructive' });
    }
  };

  const parseEquipmentAssignmentsFromCell = (raw: string): string[] => {
    const value = (raw || '').trim();
    if (!value) return [];
    if (value.toLowerCase() === 'all equipment') {
      return ['All Equipment', ...equipment.map((eq: any) => eq.id)];
    }
    const names = value.split(',').map((s) => s.trim()).filter(Boolean);
    const assignmentIds: string[] = [];
    names.forEach((name) => {
      const target = equipment.find((eq: any) => {
        const candidates = [
          eq.manufacturing_serial,
          eq.tag_number,
          eq.tagNumber,
          eq.type,
          eq.id,
        ].map((x) => String(x || '').trim().toLowerCase());
        return candidates.includes(name.toLowerCase());
      });
      if (target?.id && !assignmentIds.includes(target.id)) assignmentIds.push(target.id);
    });
    return assignmentIds;
  };

  const handleBulkTeamMembersUpload = async (file: File) => {
    setBulkMemberUploading(true);
    try {
      const XLSX = await import('xlsx-js-style').then((m: any) => m.default);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows || rows.length < 2) {
        toast({ title: 'No rows', description: 'No valid rows found in file.', variant: 'destructive' });
        return;
      }

      const roleMapping: Record<string, string> = {
        'project manager': 'project_manager',
        'documentation manager': 'vdcr_manager',
        editor: 'editor',
        viewer: 'viewer'
      };
      const firmId = localStorage.getItem('firmId') || (JSON.parse(localStorage.getItem('userData') || '{}').firm_id ?? '');
      const currentUserId = user?.id || localStorage.getItem('userId') || 'system';
      const created: string[] = [];
      const skipped: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const fullName = String(r[0] || '').trim();
        const email = String(r[1] || '').trim();
        const phone = String(r[2] || '').trim();
        const position = String(r[3] || '').trim();
        const department = String(r[4] || '').trim();
        const equipmentAssignmentRaw = String(r[5] || '').trim();
        const roleDisplay = String(r[6] || '').trim();
        if (!fullName && !email && !position && !roleDisplay) continue;
        if (!fullName || !email || !position || !roleDisplay) {
          skipped.push(`Row ${i + 1}`);
          continue;
        }

        const dbRole = roleMapping[roleDisplay.toLowerCase()];
        if (!dbRole) {
          skipped.push(`Row ${i + 1}`);
          continue;
        }

        const roleObj = roles.find((x) => x.name === dbRole);
        const equipmentAssignments = parseEquipmentAssignmentsFromCell(equipmentAssignmentRaw);
        if (equipmentAssignments.length === 0) {
          skipped.push(`Row ${i + 1}`);
          continue;
        }

        try {
          // Keep the same invite flow as single Add Member submit.
          await fastAPI.createInvite({
            email,
            full_name: fullName,
            role: dbRole,
            firm_id: firmId || '',
            project_id: projectId,
            invited_by: currentUserId
          });

          await fastAPI.createProjectMember({
            project_id: projectId,
            name: fullName,
            email,
            phone: phone || '',
            position,
            department: department || null,
            role: dbRole,
            status: 'active',
            permissions: roleObj ? roleObj.permissions : getPermissionsByRole(dbRole),
            equipment_assignments: equipmentAssignments,
            data_access: [],
            access_level: dbRole,
            avatar: fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
            last_active: new Date().toISOString()
          });
          created.push(fullName);
        } catch {
          skipped.push(`Row ${i + 1}`);
        }
      }

      await fetchTeamMembers();
      toast({
        title: 'Bulk upload complete',
        description: `Created ${created.length} member(s).${skipped.length ? ` Skipped ${skipped.length} row(s): ${skipped.join(', ')}` : ''}`,
        variant: skipped.length ? 'default' : 'default'
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to upload members.', variant: 'destructive' });
    } finally {
      setBulkMemberUploading(false);
    }
  };

  // Documentation Overview functions
  const calculateVDCRStats = () => {
    // Use actual VDCR records for Birdview stats
    const records = vdcrDocuments || [];
    return {
      approved: records.filter(record => record.status === 'approved').length,
      underReview: records.filter(record => record.status === 'received-for-comment').length,
      sentForApproval: records.filter(record => record.status === 'sent-for-approval').length,
      rejected: records.filter(record => record.status === 'rejected').length,
      pending: records.filter(record => record.status === 'pending').length
    };
  };

  const getVDCRDocumentsByStatus = (status: string) => {
    // Use actual VDCR records for Birdview (not activity logs)
    const records = vdcrDocuments || [];
    const filteredRecords = records.filter(record => record.status === status);
    return filteredRecords.map(record => ({
      documentName: record.document_name || 'Unknown Document',
      revision: record.revision || 'Rev-00',
      remarks: record.remarks || 'No remarks',
      lastUpdate: record.last_update || record.updated_at ? new Date(record.last_update || record.updated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : new Date().toLocaleDateString(),
      updatedBy: record.updated_by_user?.full_name || record.updated_by || 'Unknown User',
      daysAgo: record.last_update || record.updated_at ? 
        `${Math.floor((new Date().getTime() - new Date(record.last_update || record.updated_at).getTime()) / (1000 * 60 * 60 * 24))} days ago` : 
        'Unknown',
      documentUrl: record.document_url || undefined,
      equipmentTags: record.equipment_tag_numbers || []
    }));
  };

  // Export functions
  const exportVDCRLogsToExcel = () => {
    const logs = vdcrRecords || [];
    const vdcrData = logs.map(log => {
      const documentName = log.vdcr_record?.document_name || 
                          log.metadata?.documentName || 
                          'Documentation Activity';
      let status = 'Activity';
      if (log.activity_type === 'vdcr_status_changed') {
        status = log.new_value === 'approved' ? 'Approved' :
                log.new_value === 'rejected' ? 'Rejected' :
                log.new_value === 'received-for-comment' ? 'Received with Comments' :
                log.new_value === 'sent-for-approval' ? 'Sent for Approval' :
                log.new_value === 'pending' ? 'Pending' : 'Activity';
      } else if (log.vdcr_record?.status) {
        status = log.vdcr_record.status === 'approved' ? 'Approved' :
                log.vdcr_record.status === 'rejected' ? 'Rejected' :
                log.vdcr_record.status === 'received-for-comment' ? 'Received with Comments' :
                log.vdcr_record.status === 'sent-for-approval' ? 'Sent for Approval' :
                log.vdcr_record.status === 'pending' ? 'Pending' : 'Activity';
      }
      
      return {
        'Activity Type': log.activity_type || 'Unknown',
        'Action': log.action_description || 'Unknown',
        'Status': status,
        'Document': documentName,
        'Updated': log.created_at ? new Date(log.created_at).toLocaleDateString() : 'Unknown',
        'Time Ago': log.created_at ? 
          `${Math.floor((new Date().getTime() - new Date(log.created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago` : 
          'Unknown',
        'Updated By': log.created_by_user?.full_name || 'Unknown User'
      };
    });

    exportToExcel(vdcrData, 'Documentation_Logs');
  };

  const exportEquipmentLogsToExcel = () => {
    const entries = equipmentProgressEntries || [];
    const equipmentData = entries.map((entry, index) => ({
      'Status': entry.activity_type === 'equipment_created' ? 'Created' :
                entry.activity_type === 'equipment_updated' ? 'Updated' :
                entry.entry_type === 'general' ? 'In Progress' :
                entry.entry_type === 'completed' ? 'Completed' :
                entry.entry_type === 'testing' ? 'Testing' :
                entry.entry_type === 'inspection' ? 'Inspection' : 'Activity',
      'Equipment': entry.equipment?.type || 'Unknown Equipment',
      'Unit': entry.activity_type === 'equipment_created' ? 
               `Equipment "${entry.equipment?.type}" (${entry.equipment?.tag_number}) was created` :
               entry.activity_type === 'equipment_updated' ? 
               `Equipment "${entry.equipment?.type}" (${entry.equipment?.tag_number}) was updated` :
               `${entry.equipment?.tag_number || 'Unknown'} - ${entry.entry_text?.substring(0, 50) || 'Progress update'}`,
      'Updated': entry.created_at ? new Date(entry.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
      'Time Ago': entry.created_at ? 
        `${Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago` : 
        'Unknown',
      'Updated By': entry.created_by_user?.full_name || entry.created_by || 'Unknown User'
    }));

    exportToExcel(equipmentData, 'Equipment_Logs');
  };

  const exportToExcel = (data: any[], filename: string) => {
    // Convert data to CSV format
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Team Management functions
  const addTeamMember = async () => {
    if (newMember.name && newMember.email && newMember.position && newMember.role && newMember.equipmentAssignments?.length) {
      try {
        // // console.log('👥 Adding new team member:', newMember);
        
      const role = roles.find(r => r.name === newMember.role);
      
      // Map frontend role names to database role values
      const roleMapping: { [key: string]: string } = {
        'Project Manager': 'project_manager', 
        'Documentation Manager': 'vdcr_manager', 
        'Editor': 'editor',
        'Viewer': 'viewer'
      };
      
      const dbRole = roleMapping[newMember.role] || 'viewer';
      
        const memberData = {
          project_id: projectId,
        name: newMember.name,
        email: newMember.email,
        phone: newMember.phone || "",
        position: newMember.position,
        department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
        role: dbRole,
        status: "active",
          permissions: role ? role.permissions : [],
          equipment_assignments: newMember.equipmentAssignments || [],
          data_access: newMember.dataAccess || [],
          access_level: newMember.accessLevel || "viewer",
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          last_active: new Date().toISOString()
        };

        // Create invite only for NEW members (not when assigning existing firm member to project)
        const firmId = localStorage.getItem('firmId') || (JSON.parse(localStorage.getItem('userData') || '{}').firm_id ?? '');
        const currentUserId = user?.id || localStorage.getItem('userId');
        if (!isExistingMemberMode) {
          try {
            await fastAPI.createInvite({
              email: newMember.email,
              full_name: newMember.name,
              role: dbRole,
              firm_id: firmId || '',
              project_id: projectId,
              invited_by: currentUserId || 'system'
            });
          } catch (inviteError: any) {
            const message = inviteError?.message || 'This email already exists with a different role. Same email cannot have multiple roles.';
            toast({ title: 'Error', description: message, variant: 'destructive' });
            return;
          }
        }

        // // console.log('👥 Member data to save:', memberData);
        
        // Save to database
        const savedMember = await fastAPI.createProjectMember(memberData);
        // // console.log('✅ Team member saved to database:', savedMember);
        
        // Keep submit path lean: only core add-member APIs should run on click.
        // Non-critical follow-up APIs are disabled to avoid request spikes in Settings tab.
        const runNonCriticalPostAddApis = false;

        // Log team member addition for all assigned equipment in a single batch entry (if any)
        if (runNonCriticalPostAddApis && newMember.equipmentAssignments && newMember.equipmentAssignments.length > 0) {
          const equipmentIds = newMember.equipmentAssignments.filter(id => id !== "All Equipment");
          const equipmentList = equipmentIds
            .map(equipmentId => {
              const targetEquipment = equipment.find(eq => eq.id === equipmentId);
              if (targetEquipment) {
                // Get tag number - check multiple possible fields and handle empty strings
                // Debug log to see what fields are available
                // // console.log(`🔍 Equipment ${equipmentId} data:`, {
                // tagNumber: targetEquipment.tagNumber,
                //   tag: targetEquipment.tag,
                //   tag_number: targetEquipment.tag_number,
                //   type: targetEquipment.type
                // });
                
                let tagNumber = targetEquipment.tagNumber || 
                               targetEquipment.tag || 
                               targetEquipment.tag_number || 
                               '';
                // Handle empty strings, null, undefined
                if (!tagNumber || typeof tagNumber !== 'string' || !tagNumber.trim()) {
                  tagNumber = 'Unknown';
                } else {
                  tagNumber = tagNumber.trim();
                }
                
                return {
                  id: equipmentId,
                  type: targetEquipment.type || 'Equipment',
                  tagNumber: tagNumber
                };
              }
              return null;
            })
            .filter(Boolean) as Array<{ id: string; type: string; tagNumber: string }>;
          
          if (equipmentList.length > 0) {
            try {
              // // console.log(`📝 Logging team member addition batch for ${equipmentList.length} equipment...`);
              await logTeamMemberAddedBatch(
                projectId,
                equipmentList,
                newMember.name,
                newMember.position || newMember.role || 'viewer'
              );
              // // console.log(`✅ Activity logged: Team member added to ${equipmentList.length} equipment`);
            } catch (logError) {
              // console.error(`⚠️ Error logging team member addition batch activity (non-fatal):`, logError);
            }
          }
        }
        
        // Send email notification to the new team member (MOVED BEFORE EQUIPMENT ASSIGNMENT)
        try {
          if (!runNonCriticalPostAddApis) throw new Error('Email notification disabled for request optimization');
          // // console.log('📧 Sending email notification to new team member...');
          // // console.log('📧 New member data:', newMember);
          // // console.log('📧 Project name:', projectName);
          
          // Get company name from firm_id instead of userData
          const userData = JSON.parse(localStorage.getItem('userData') || '{}');
          const firmId = userData.firm_id;

          let companyName = 'Your Company'; // Default fallback
          // // console.log('📧 Firm ID from userData:', firmId);
          // // console.log('📧 Full userData from localStorage:', userData);
          
          // Try to get company name from localStorage first (faster)
          if (userData.company_name) {
            companyName = userData.company_name;
            // // console.log('📧 Company name from localStorage:', companyName);
          } else if (projectData && projectData.client) {
            // Use project client as company name
            companyName = projectData.client;
            // // console.log('📧 Company name from project client:', companyName);
          } else if (firmId) {
            // Fallback: try database (but with timeout)
            try {
              // // console.log('📧 Fetching company name from database...');
              const { DatabaseService } = await import('@/lib/database');
              
              // Add timeout to prevent hanging
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database fetch timeout')), 3000)
              );
              
              const firmData = await Promise.race([
                DatabaseService.getFirm(firmId),
                timeoutPromise
              ]);
              
              companyName = (firmData as { name?: string })?.name || 'Your Company';
              // // console.log('📧 Company name fetched from database:', companyName);
            } catch (error) {
              // console.error('❌ Error fetching company name:', error);
              // // console.log('📧 Using fallback company name due to error');
              companyName = 'Your Company'; // Keep fallback
            }
          } else {
            // // console.log('📧 No firm ID found, using fallback company name');
          }
          
          // // console.log('📧 Final company name to use:', companyName);
          
          // Get dashboard URL
          const dashboardUrl = window.location.origin;
          
          // Send email notification
          const emailResult = await sendProjectTeamEmailNotification({
            project_name: projectName,
            team_member_name: newMember.name,
            team_member_email: newMember.email,
            role: newMember.role,
            company_name: companyName,
            dashboard_url: dashboardUrl,
            equipment_name: '' // Empty for general team members
          });
          
          // // console.log('📧 Email notification result:', emailResult);
          // // console.log('📧 Email details sent:', {
          //   to_name: newMember.name,
          //   to_email: newMember.email,
          //   project_name: projectName,
          //   role: newMember.role,
          //   company_name: companyName,
          //   dashboard_url: dashboardUrl
          // });
          
          if (emailResult.success) {
            // // console.log('✅ Email notification sent successfully');
          } else {
            // // console.log('⚠️ Email notification failed:', emailResult.message);
          }
        } catch (emailError) {
          // console.error('❌ Error sending email notification:', emailError);
        }
        
        // Add user to selected equipment Team tabs (MOVED AFTER EMAIL)
        if (runNonCriticalPostAddApis && newMember.equipmentAssignments && newMember.equipmentAssignments.length > 0) {
          const equipmentIds = newMember.equipmentAssignments.filter(id => id !== "All Equipment");

          // Map display role to equipment_team_positions role (only accepts 'editor' or 'viewer')
          const equipmentRoleMap: { [key: string]: 'editor' | 'viewer' } = {
            'Project Manager': 'editor',
            'Documentation Manager': 'editor',
            'Editor': 'editor',
            'Viewer': 'viewer'
          };
          const equipmentRole = equipmentRoleMap[newMember.role] || 'viewer';

          const bulkTeamPositions = equipmentIds
            .filter((equipmentId) => equipment.some(eq => eq.id === equipmentId))
            .map((equipmentId) => ({
              equipment_id: equipmentId,
              position_name: newMember.position,
              person_name: newMember.name,
              email: newMember.email,
              phone: newMember.phone,
              department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
              role: equipmentRole
            }));

          if (bulkTeamPositions.length > 0) {
            try {
              // Single request for all selected equipment (reduces request burst on Add Member submit)
              await fastAPI.createTeamPositionsBulk(bulkTeamPositions);
            } catch {
              // Fallback to one-by-one if bulk insert fails for any reason
              for (const teamPositionData of bulkTeamPositions) {
                try {
                  await fastAPI.createTeamPosition(teamPositionData);
                } catch {
                  // Non-critical: team_positions is auxiliary data for equipment Team tabs
                }
              }
            }
          }
        }
        
        // Update team list locally to avoid an immediate extra fetch.
        const savedRow = Array.isArray(savedMember) ? savedMember[0] : savedMember;
        if (savedRow) {
          const transformedMember = {
            id: savedRow.id || `member-${Date.now()}`,
            name: savedRow.name || newMember.name || 'Unknown',
            email: savedRow.email || newMember.email || '',
            phone: savedRow.phone || newMember.phone || '',
            position: savedRow.position || newMember.position || '',
            department: savedRow.department || ((newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : ''),
            role: savedRow.role || dbRole || 'viewer',
            permissions: savedRow.permissions && savedRow.permissions.length > 0
              ? savedRow.permissions
              : (role ? role.permissions : getPermissionsByRole(savedRow.role || dbRole || 'viewer')),
            status: savedRow.status || 'active',
            avatar: savedRow.avatar || (savedRow.name || newMember.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
            lastActive: savedRow.last_active || 'Unknown',
            equipmentAssignments: savedRow.equipment_assignments || newMember.equipmentAssignments || [],
            dataAccess: savedRow.data_access || newMember.dataAccess || [],
            accessLevel: savedRow.access_level || newMember.accessLevel || 'viewer'
          };
          setTeamMembers(prev => {
            const exists = prev.some((m: any) => m.id === transformedMember.id);
            if (exists) return prev;
            return [transformedMember, ...prev];
          });
        }
        
        // Reset form
      setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
      setShowAddMember(false);
        
        toast({ title: 'Success', description: 'Team member added successfully.' });
        
      } catch (error) {
        // console.error('❌ Error adding team member:', error);
        toast({ title: 'Error', description: 'Error adding team member. Please try again.', variant: 'destructive' });
      }
    }
  };

  const editTeamMember = (member) => {
    setSelectedMember(member);
    
    // Map database role values back to display names for the dropdown
    const roleDisplayMapping: { [key: string]: string } = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'Documentation Manager', 
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    
    const displayRole = roleDisplayMapping[member.role] || 'Viewer';
    
    setNewMember({
      name: member.name,
      email: member.email,
      phone: member.phone || "",
      position: member.position || "",
      department: member.department || "",
      role: displayRole,
      permissions: member.permissions,
      equipmentAssignments: member.equipmentAssignments || [],
      dataAccess: member.dataAccess || [],
      accessLevel: member.accessLevel || "viewer"
    });
    setShowEditMember(true);
  };

  const updateTeamMember = async () => {
    if (selectedMember && newMember.name && newMember.email && newMember.role) {
      try {
        // // console.log('👥 Updating team member:', selectedMember.id, newMember);
        
      const role = roles.find(r => r.name === newMember.role);
      
      // Map frontend role names to database role values
      const roleMapping: { [key: string]: string } = {
        'Project Manager': 'project_manager',
        'Documentation Manager': 'vdcr_manager', 
        'Editor': 'editor',
        'Viewer': 'viewer'
      };
      
      const dbRole = roleMapping[newMember.role] || 'viewer';
      
        const memberData = {
              name: newMember.name,
              email: newMember.email,
          phone: newMember.phone || "",
          position: newMember.position || "",
          department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
              role: dbRole,
          permissions: role ? role.permissions : selectedMember.permissions,
          equipment_assignments: newMember.equipmentAssignments || selectedMember.equipmentAssignments || [],
          data_access: newMember.dataAccess || selectedMember.dataAccess || [],
          access_level: newMember.accessLevel || selectedMember.accessLevel || "viewer",
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          updated_at: new Date().toISOString()
        };

        // // console.log('👥 Member data to update:', memberData);
        
        // Update in database
        await fastAPI.updateProjectMember(selectedMember.id, memberData);
        // // console.log('✅ Team member updated in database');
        
        // Refresh team members list
        await fetchTeamMembers();
        
        // Reset form
      setShowEditMember(false);
      setSelectedMember(null);
        setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
        
        toast({ title: 'Success', description: 'Team member updated successfully!' });
        
      } catch (error) {
        // console.error('❌ Error updating team member:', error);
        toast({ title: 'Error', description: 'Error updating team member. Please try again.', variant: 'destructive' });
      }
    }
  };

  const removeTeamMember = async (memberId) => {
    if (window.confirm("Are you sure you want to remove this team member?")) {
      try {
        // // console.log('👥 Removing team member:', memberId);
        
        // Delete from database
        await fastAPI.deleteProjectMember(memberId);
        // // console.log('✅ Team member deleted from database');
        
        // Refresh team members list
        await fetchTeamMembers();
        
        toast({ title: 'Success', description: 'Team member removed successfully!' });
        
      } catch (error) {
        // console.error('❌ Error removing team member:', error);
        toast({ title: 'Error', description: 'Error removing team member. Please try again.', variant: 'destructive' });
      }
    }
  };

  const toggleMemberStatus = async (memberId) => {
    try {
      const member = teamMembers.find(m => m.id === memberId);
      if (!member) return;
      
      const newStatus = member.status === "active" ? "inactive" : "active";
      // // console.log('👥 Toggling member status:', memberId, newStatus);
      
      // Update in database
      await fastAPI.updateProjectMember(memberId, { 
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      // // console.log('✅ Member status updated in database');
      
      // Refresh team members list
      await fetchTeamMembers();
      
      toast({ title: 'Success', description: `Member ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!` });
      
    } catch (error) {
      // console.error('❌ Error toggling member status:', error);
      toast({ title: 'Error', description: 'Error updating member status. Please try again.', variant: 'destructive' });
    }
  };

  const getRoleColor = (role) => {
    const roleColors = {
      'project_manager': 'bg-blue-100 text-blue-800',
      'vdcr_manager': 'bg-teal-100 text-teal-800',
      'editor': 'bg-blue-100 text-blue-800',
      'viewer': 'bg-gray-100 text-gray-800',
      'design_engineer': 'bg-blue-100 text-blue-800',
      'quality_engineer': 'bg-green-100 text-green-800',
      'client_representative': 'bg-orange-100 text-orange-800',
      'firm_admin': 'bg-red-100 text-red-800'
    };
    return roleColors[role] || 'bg-gray-100 text-gray-800';
  };

  const getPermissionLabel = (permission) => {
    const labels = {
      view: "View",
      edit: "Edit",
      delete: "Delete",
      manage_team: "Manage Team",
      approve_vdcr: "Approve Documentation",
      manage_equipment: "Manage Equipment",
      comment: "Comment"
    };
    return labels[permission] || permission;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-2 sm:py-8">
      <div className="container mx-auto px-1">
        {/* Header with Back Button */}
        <div className="mb-4 sm:mb-6">
          <Button
            onClick={onBack}
            variant="outline"
            className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold text-gray-700 hover:text-white hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 border-2 border-gray-300 hover:border-blue-600 transition-all duration-300 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            <ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
            Back to Dashboard
          </Button>
        </div>

        {/* Main Overview Card - Common for All Tabs */}
        <div className="mb-4 sm:mb-6 bg-white rounded-lg p-4 sm:p-6 lg:p-8 border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building size={20} className="text-white sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 break-words">
                {projectName}
              </h1>
              <p className="text-sm sm:text-base text-gray-600 break-words">
                Project Management & Equipment Tracking
              </p>
            </div>
            {/* <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setClientViewModalOpen(true)}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Share with client
            </Button> 
            */}
          </div>
          
          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Project Status</p>
                  <div className="text-xl sm:text-2xl font-semibold text-gray-900 capitalize truncate">{projectData?.status || 'Active'}</div>
                </div>
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 ml-3">
                  <Target size={18} className="text-blue-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-green-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Equipment Progress</p>
                  <div className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">
                    {equipment?.filter(eq => {
                      // Check if equipment is active based on data (using API field names)
                      const hasProgressImages = eq.progress_images && eq.progress_images.length > 0;
                      const hasProgressEntries = eq.progress_entries && eq.progress_entries.length > 0;
                      const hasTechnicalSections = eq.technical_sections && eq.technical_sections.length > 0;
                      const hasCustomFields = eq.custom_fields && eq.custom_fields.length > 0;
                      const hasTeamCustomFields = eq.team_custom_fields && eq.team_custom_fields.length > 0;
                      
                      return hasProgressImages || hasProgressEntries || hasTechnicalSections || hasCustomFields || hasTeamCustomFields;
                    }).length || 0} / {equipment?.length || 0}
                  </div>
                  <p className="text-xs text-gray-500">Active / Total</p>
                </div>
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0 ml-3">
                  <BarChart3 size={18} className="text-green-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Project Documents</p>
                  <div className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">{vdcrDocuments?.length || 0}</div>
                  <p className="text-xs text-gray-500">Total Records</p>
                </div>
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 ml-3">
                  <FileText size={18} className="text-blue-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-orange-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 mb-2">Deadline</p>
                  <div className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1 truncate">{projectData?.deadline || 'TBD'}</div>
                  <p className="text-xs text-gray-500">Target Date</p>
                </div>
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0 ml-3">
                  <Calendar size={18} className="text-orange-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Tabbed Interface - tabs align with content width, horizontally scrollable on small screens */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="w-full overflow-x-auto overflow-y-hidden xl:overflow-x-visible xl:overflow-y-visible mb-16 scroll-smooth p-1 scrollbar-hide">
            <TabsList className={`flex xl:grid flex-nowrap min-w-max xl:min-w-0 xl:w-full bg-transparent rounded-2xl p-2 gap-2 ${(userRole === 'vdcr_manager' || userRole === 'editor') ? 'xl:grid-cols-4' : userRole === 'viewer' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'}`}>
            <TabsTrigger 
              value="equipment"
              disabled={equipmentLock?.isLocked}
              className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 flex-shrink-0 disabled:opacity-60 disabled:pointer-events-none disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <Building size={20} className="text-blue-600 data-[state=active]:text-white" />
              </div>
              <span className="truncate">Equipment</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="vdcr" 
              className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-green-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-green-600 data-[state=active]:hover:to-green-700 flex-shrink-0"
            >
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <FileText size={20} className="text-green-600 data-[state=active]:text-white" />
              </div>
              <span className="truncate">Documentation</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="vdcr-overview" 
              className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-teal-600 data-[state=active]:hover:to-teal-700 flex-shrink-0"
            >
              <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <BarChart3 size={20} className="text-teal-600 data-[state=active]:text-white" />
              </div>
              <span className="truncate">Docs Birdview</span>
            </TabsTrigger>
            
            <TabsTrigger 
              value="progress-logs" 
              className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 flex-shrink-0"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <TrendingUp size={20} className="text-blue-600 data-[state=active]:text-white" />
              </div>
              <span className="truncate">Project Chronology</span>
            </TabsTrigger>
            
            {userRole !== 'vdcr_manager' && userRole !== 'editor' && (
              <TabsTrigger 
                value="project-details" 
                className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-orange-600 data-[state=active]:hover:to-orange-700 flex-shrink-0"
              >
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                  <Users size={20} className="text-orange-600 data-[state=active]:text-white" />
                </div>
                <span className="truncate">Project Details</span>
              </TabsTrigger>
            )}

            {userRole !== 'vdcr_manager' && userRole !== 'editor' && userRole !== 'viewer' && (
              <TabsTrigger 
                value="settings" 
                className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-gray-600 data-[state=active]:hover:to-gray-700 flex-shrink-0"
              >
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                  <Settings size={20} className="text-gray-600 data-[state=active]:text-white" />
                </div>
                <span className="truncate">Settings</span>
              </TabsTrigger>
            )}
            </TabsList>
          </div>

          {/* Equipment Tab - mount only when active to avoid loading equipment APIs while opening other tabs (e.g., Project Details). */}
          <TabsContent value="equipment" className="space-y-6 mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-3 sm:px-6 py-3 sm:py-4 border-b border-blue-200">
                <h2 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                  <Building size={24} className="text-blue-600" />
                  Equipment Management
                </h2>
                <p className="text-blue-600 text-xs mt-1">Manage and track all project equipment</p>
              </div>
              <div className="p-3 sm:p-6">
                <EquipmentGrid
                  key={`equipment-${projectId}-${filteredEquipment.length}`}
                  equipment={filteredEquipment}
                  projectName={projectName}
                  projectId={projectId}
                  onBack={onBack}
                  onViewDetails={() => setActiveTab("project-details")}
                  onViewVDCR={() => setActiveTab("vdcr")}
                  onUserAdded={() => {
                    // // console.log('🔄 SETTINGS TAB: onUserAdded callback triggered, refreshing team members...');
                    fetchTeamMembers();
                  }}
                  onActivityUpdate={() => {
                    // // console.log('🔄 Activity updated, refreshing equipment activity logs...');
                    loadEquipmentProgressEntries();
                  }}
                  onOpenDossierReport={onOpenDossierReport}
                />
              </div>
            </div>
          </TabsContent>

          {/* VDCR Tab */}
          <TabsContent value="vdcr" className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-3 sm:px-6 py-3 sm:py-4 border-b border-green-200 min-w-0">
                <h2 className="text-base sm:text-lg md:text-xl font-semibold text-green-800 flex items-center gap-2 flex-wrap">
                  <FileText size={20} className="sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
                  <span className="break-words">Documentation Management</span>
                </h2>
                <p className="text-green-600 text-xs sm:text-sm mt-1 break-words">Handle all documentation records and approvals</p>
              </div>
              <div className="p-3 sm:p-6">
                <ProjectsVDCR
                  projectId={projectId}
                  projectName={projectName}
                  onBack={onBack}
                  onViewDetails={() => setActiveTab("project-details")}
                  onViewEquipment={() => setActiveTab("equipment")}
                />
              </div>
            </div>
          </TabsContent>

          {/* Documentation Overview Tab */}
          <TabsContent value="vdcr-overview" className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-teal-50 to-teal-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-teal-200">
                <h2 className="text-lg sm:text-xl font-semibold text-teal-800 flex items-center gap-2">
                  <BarChart3 size={20} className="sm:w-6 sm:h-6 text-teal-600" />
                  Documentation Overview
                </h2>
                <p className="text-teal-600 text-xs sm:text-sm mt-1">Summary and key metrics for documentation</p>
              </div>
              <div className="p-4 sm:p-6">
                <div className="space-y-4 sm:space-y-6">
                  {/* Documentation Status Overview with Tabs */}
                  <div className="mb-4 sm:mb-6">
                    <h2 className="text-lg sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                      <FileText size={20} className="sm:w-6 sm:h-6 mr-2 sm:mr-3 text-blue-600" />
                      Documentation Status Overview
                    </h2>
                    
                    {/* VDCR Status Tabs */}
                    <div className="bg-white border border-gray-200 rounded-lg">
                      <div className="border-b border-gray-200">
                        <nav className="flex space-x-4 sm:space-x-8 px-3 sm:px-6 overflow-x-auto scrollbar-hide" aria-label="Documentation Status Tabs">
                          <button
                            onClick={() => setSelectedVDCRStatus('approved')}
                            className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${selectedVDCRStatus === 'approved'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span className="hidden sm:inline">Approved Documents</span>
                            <span className="sm:hidden">Approved</span>
                            <span className="ml-1 sm:ml-2 bg-green-100 text-green-800 text-xs font-medium px-1.5 sm:px-2.5 py-0.5 rounded-full">
                              {calculateVDCRStats().approved}
                            </span>
                          </button>
                          
                          <button
                            onClick={() => setSelectedVDCRStatus('received-for-comment')}
                            className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${selectedVDCRStatus === 'received-for-comment'
                                ? 'border-yellow-500 text-yellow-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span className="hidden sm:inline">Received with Comments</span>
                            <span className="sm:hidden">Comments</span>
                            <span className="ml-1 sm:ml-2 bg-yellow-100 text-yellow-800 text-xs font-medium px-1.5 sm:px-2.5 py-0.5 rounded-full">
                              {calculateVDCRStats().underReview}
                            </span>
                          </button>
                          
                          <button
                            onClick={() => setSelectedVDCRStatus('sent-for-approval')}
                            className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${selectedVDCRStatus === 'sent-for-approval'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span className="hidden sm:inline">Sent for Approval</span>
                            <span className="sm:hidden">Sent</span>
                            <span className="ml-1 sm:ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-1.5 sm:px-2.5 py-0.5 rounded-full">
                              {calculateVDCRStats().sentForApproval}
                            </span>
                          </button>
                          
                          <button
                            onClick={() => setSelectedVDCRStatus('pending')}
                            className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${selectedVDCRStatus === 'pending'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            Pending
                            <span className="ml-1 sm:ml-2 bg-orange-100 text-orange-800 text-xs font-medium px-1.5 sm:px-2.5 py-0.5 rounded-full">
                              {calculateVDCRStats().pending}
                            </span>
                          </button>
                          
                          <button
                            onClick={() => setSelectedVDCRStatus('rejected')}
                            className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${selectedVDCRStatus === 'rejected'
                                ? 'border-red-500 text-red-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span className="hidden sm:inline">Rejected Documents</span>
                            <span className="sm:hidden">Rejected</span>
                            <span className="ml-1 sm:ml-2 bg-red-100 text-red-800 text-xs font-medium px-1.5 sm:px-2.5 py-0.5 rounded-full">
                              {calculateVDCRStats().rejected}
                            </span>
                          </button>
                        </nav>
                      </div>
                      
                      {/* Tab Content */}
                      <div className="p-4 sm:p-6">
                        <div className="mb-3 sm:mb-4">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-700">
                            {selectedVDCRStatus === 'approved' && 'Approved Documents'}
                            {selectedVDCRStatus === 'received-for-comment' && 'Documents Received with Comments'}
                            {selectedVDCRStatus === 'sent-for-approval' && 'Documents Sent for Approval'}
                            {selectedVDCRStatus === 'pending' && 'Pending Documents'}
                            {selectedVDCRStatus === 'rejected' && 'Rejected Documents'}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 mt-1">
                            {getVDCRDocumentsByStatus(selectedVDCRStatus).length} document{getVDCRDocumentsByStatus(selectedVDCRStatus).length !== 1 ? 's' : ''} found
                          </p>
                        </div>
                        
                        <div className="space-y-2 sm:space-y-3">
                          {getVDCRDocumentsByStatus(selectedVDCRStatus).map((doc, index) => (
                            <div key={index} className="relative p-2.5 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                              {/* Days Ago Counter - Absolute Top Right */}
                              <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2">
                                <div className="flex flex-col items-end gap-1 sm:gap-2">
                                  <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-3 py-0.5 sm:py-1 md:py-2 bg-blue-50 text-blue-700 text-[10px] sm:text-xs md:text-sm font-medium rounded-full border border-blue-200">
                                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="whitespace-nowrap">{doc.daysAgo}</span>
                                  </span>
                                  
                                  {/* Preview Button - Under Days Counter */}
                                  {doc.documentUrl && (
                                    <button
                                      onClick={() => {
                                        if (doc.documentUrl && doc.documentUrl !== '#') {
                                          setPreviewModal({
                                            isOpen: true,
                                            documentUrl: doc.documentUrl,
                                            documentName: doc.documentName
                                          });
                                        } else {
                                          toast({ title: 'Notice', description: 'Document URL not available for preview' });
                                        }
                                      }}
                                      className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2.5 py-0.5 sm:py-1 md:py-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors border border-blue-200 hover:border-blue-300 text-[10px] sm:text-xs md:text-sm font-medium shadow-sm hover:shadow-md"
                                      title="Click to preview document"
                                    >
                                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      <span className="hidden sm:inline">Preview</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-1.5 sm:gap-2 md:gap-3 pr-16 sm:pr-20 md:pr-24">
                                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-3 md:h-3 rounded-full mt-0.5 sm:mt-1 flex-shrink-0 ${selectedVDCRStatus === 'approved' ? 'bg-green-500' :
                                  selectedVDCRStatus === 'received-for-comment' ? 'bg-yellow-500' :
                                  selectedVDCRStatus === 'sent-for-approval' ? 'bg-blue-500' :
                                  'bg-red-500'
                                }`}></div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                        <p className="text-[11px] sm:text-xs md:text-sm font-medium text-gray-800 truncate">{doc.documentName}</p>
                                        <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-200 px-1 sm:px-1.5 md:px-2 py-0.5 rounded flex-shrink-0 w-fit">{doc.revision?.replace(/^Rev\s+Rev/i, 'Rev-').replace(/^Rev\s+/i, '') || doc.revision}</span>
                                      </div>
                                      <p className="text-[10px] sm:text-xs text-gray-500 mb-1.5 sm:mb-2 line-clamp-2">{doc.remarks}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-4 text-[10px] sm:text-xs text-gray-400 mb-2 sm:mb-3">
                                    <div className="flex items-center gap-1">
                                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="truncate">{doc.lastUpdate}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="truncate">{doc.updatedBy}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Action Buttons - Bottom Section */}
                              <div className="flex flex-col gap-2 sm:gap-3 pt-2 sm:pt-3 border-t border-gray-200">
                                {/* Equipment Section - Improved Layout */}
                                <div className="space-y-1.5 sm:space-y-2">
                                  <div className="flex items-center gap-1">
                                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <span className="text-[10px] sm:text-xs text-gray-500 font-medium">Equipment:</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 sm:gap-1.5">
                                    {doc.equipmentTags.map((tag, tagIndex) => (
                                      <span 
                                        key={tagIndex} 
                                        className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 text-gray-700 text-[10px] sm:text-xs font-medium rounded-full border border-gray-300 max-w-full"
                                        title={tag}
                                      >
                                        <span className="truncate max-w-[100px] sm:max-w-[120px] md:max-w-[150px]">{tag}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                
                                {/* Status Badge */}
                                <div className="flex justify-end">
                                  <span className={`inline-flex items-center px-1.5 sm:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${selectedVDCRStatus === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                                    selectedVDCRStatus === 'received-for-comment' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                                    selectedVDCRStatus === 'sent-for-approval' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    selectedVDCRStatus === 'pending' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                                    'bg-red-100 text-red-800 border border-red-200'
                                  }`}>
                                    <span className="hidden sm:inline">
                                      {selectedVDCRStatus === 'approved' ? 'Approved' :
                                       selectedVDCRStatus === 'received-for-comment' ? 'Received with Comments' :
                                       selectedVDCRStatus === 'sent-for-approval' ? 'Sent for Approval' :
                                       selectedVDCRStatus === 'pending' ? 'Pending' :
                                       'Rejected'}
                                    </span>
                                    <span className="sm:hidden">
                                      {selectedVDCRStatus === 'approved' ? 'Approved' :
                                       selectedVDCRStatus === 'received-for-comment' ? 'Comments' :
                                       selectedVDCRStatus === 'sent-for-approval' ? 'Sent' :
                                       selectedVDCRStatus === 'pending' ? 'Pending' :
                                       'Rejected'}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {getVDCRDocumentsByStatus(selectedVDCRStatus).length === 0 && (
                            <div className="text-center py-6 sm:py-8 text-gray-500">
                              <svg className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <p className="text-xs sm:text-sm">No documents found in this category</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Progress Logs Tab */}
          <TabsContent value="progress-logs" className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-blue-200">
                <h2 className="text-lg sm:text-xl font-semibold text-blue-800 flex items-center gap-2">
                  <TrendingUp size={20} className="text-blue-600 sm:w-6 sm:h-6" />
                  Progress Logs
                </h2>
                <p className="text-blue-600 text-xs sm:text-sm mt-1">Track project progress updates and milestones</p>
              </div>
              <div className="p-4 sm:p-6">
                {/* Progress Logs Subtabs */}
                <Tabs defaultValue="vdcr-logs" className="w-full">
                  <TabsList className={`mb-4 sm:mb-6 bg-transparent rounded-xl p-1 sm:p-2 overflow-x-auto sm:overflow-visible whitespace-nowrap flex sm:grid gap-2 sm:gap-0 ${userRole === 'vdcr_manager' ? 'w-fit sm:grid-cols-1 mx-auto' : 'w-full sm:grid-cols-2'}`}>
                    <TabsTrigger 
                      value="vdcr-logs" 
                      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 group flex-shrink-0"
                    >
                      <FileText size={16} className="text-blue-600 group-data-[state=active]:text-white transition-colors duration-200 sm:w-5 sm:h-5" />
                      Documentation Logs
                    </TabsTrigger>
                    
                    {userRole !== 'vdcr_manager' && (
                      <TabsTrigger 
                        value="equipment-logs" 
                        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 group flex-shrink-0"
                      >
                        <Building size={16} className="text-blue-600 group-data-[state=active]:text-white transition-colors duration-200 sm:w-5 sm:h-5" />
                        Equipment Logs
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Documentation Logs Subtab */}
                  <TabsContent value="vdcr-logs" className="space-y-4 sm:space-y-6">
                    <div className="space-y-4 sm:space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <h3 className="text-base sm:text-xl font-semibold text-gray-800 flex items-center gap-2">
                          <FileText size={18} className="text-blue-600 sm:w-5 sm:h-5" />
                          Documentation Activity Log
                        </h3>
                        <Button
                          onClick={exportVDCRLogsToExcel}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1 sm:gap-2 bg-white hover:bg-blue-50 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 transition-all duration-200 text-xs sm:text-sm px-3"
                        >
                          <Download size={14} className="sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">Export to Excel</span>
                          <span className="sm:hidden">Export</span>
                        </Button>
                      </div>

                      {/* Search Bar */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search documentation logs by document, status, or user..."
                          value={vdcrSearchQuery}
                          onChange={(e) => setVdcrSearchQuery(e.target.value)}
                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        />
                        <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        {vdcrSearchQuery && (
                          <button
                            onClick={() => setVdcrSearchQuery("")}
                            className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                          >
                            <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      
                    <div className="space-y-4">
                        {/* Filtered Documentation Logs */}
                        {(() => {
                          // console.log('📄 UnifiedProjectView: Rendering VDCR logs, vdcrRecords:', {
                          //   length: vdcrRecords?.length || 0,
                          //   records: vdcrRecords
                          // });
                          // Use VDCR activity logs from database
                          const vdcrLogs = (vdcrRecords || []).map((log, index) => {
                            // Determine status based on activity type and new_value
                            let status = 'Activity';
                            if (log.activity_type === 'vdcr_status_changed') {
                              status = log.new_value === 'approved' ? 'Approved' :
                                       log.new_value === 'rejected' ? 'Rejected' :
                                       log.new_value === 'received-for-comment' ? 'Received for Comments' :
                                       log.new_value === 'sent-for-approval' ? 'Sent for Approval' :
                                       log.new_value === 'pending' ? 'Pending' : 'Activity';
                            } else if (log.vdcr_record?.status) {
                              status = log.vdcr_record.status === 'approved' ? 'Approved' :
                                      log.vdcr_record.status === 'rejected' ? 'Rejected' :
                                      log.vdcr_record.status === 'received-for-comment' ? 'Received with Comments' :
                                      log.vdcr_record.status === 'sent-for-approval' ? 'Sent for Approval' :
                                      log.vdcr_record.status === 'pending' ? 'Pending' : 'Activity';
                            }
                            
                            // Get document name from metadata or vdcr_record
                            const documentName = log.vdcr_record?.document_name || 
                                                log.metadata?.documentName || 
                                                'Documentation Activity';
                            
                            return {
                              id: log.id || index + 1,
                              status: status,
                              document: documentName,
                              updated: log.created_at ? new Date(log.created_at).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: '2-digit', 
                                year: 'numeric' 
                              }) : new Date().toLocaleDateString(),
                              timeAgo: log.created_at ? 
                                `${Math.floor((new Date().getTime() - new Date(log.created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago` : 
                                'Unknown',
                              updatedBy: log.created_by_user?.full_name || 'Unknown User',
                              activityType: log.activity_type,
                              actionDescription: log.action_description,
                              fieldName: log.field_name,
                              oldValue: log.old_value,
                              newValue: log.new_value,
                              metadata: log.metadata
                            };
                          });

                          const filteredLogs = vdcrSearchQuery
                            ? vdcrLogs.filter(log =>
                                log.document.toLowerCase().includes(vdcrSearchQuery.toLowerCase()) ||
                                log.status.toLowerCase().includes(vdcrSearchQuery.toLowerCase()) ||
                                log.updatedBy.toLowerCase().includes(vdcrSearchQuery.toLowerCase()) ||
                                log.updated.toLowerCase().includes(vdcrSearchQuery.toLowerCase()) ||
                                (log.actionDescription && log.actionDescription.toLowerCase().includes(vdcrSearchQuery.toLowerCase())) ||
                                (log.activityType && log.activityType.toLowerCase().includes(vdcrSearchQuery.toLowerCase()))
                              )
                            : vdcrLogs;

                          if (filteredLogs.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                                <p>No documentation logs match the search criteria.</p>
                                <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="max-h-96 overflow-y-auto space-y-2 sm:space-y-3 pr-1.5 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                              {filteredLogs.map((log) => (
                                <div key={log.id} className="relative flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full mt-1 ${log.status === 'Approved' ? 'bg-green-500' :
                                    log.status === 'Rejected' ? 'bg-red-500' :
                                    log.status === 'Received with Comments' ? 'bg-yellow-500' :
                                    log.status === 'Pending' ? 'bg-blue-500' :
                                    log.status === 'In Progress' ? 'bg-blue-500' : 'bg-gray-500'
                                  }`}></div>
                                  <div className="flex-1 min-w-0 pr-16 sm:pr-0">
                                    <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                                      {log.activityType === 'vdcr_created' ? 'Documentation Record Created' :
                                       log.activityType === 'vdcr_field_updated' ? `Documentation ${log.fieldName || 'Field'} Updated` :
                                       log.activityType === 'vdcr_status_changed' ? `Documentation Status Changed to ${log.status}` :
                                       log.activityType === 'vdcr_document_uploaded' ? 'Documentation Uploaded' :
                                       log.activityType === 'vdcr_deleted' ? 'Documentation Record Deleted' :
                                       `Documentation ${log.status}`}
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-gray-500 truncate">{log.document}</p>
                                    
                                    {/* Show highlighted old → new values for field updates */}
                                    {(log.activityType === 'vdcr_field_updated' || log.activityType === 'vdcr_status_changed') && log.oldValue !== null && log.newValue !== null ? (
                                      <div className="mt-2 space-y-1.5">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                                          <span className="font-medium text-gray-700 flex-shrink-0">{log.fieldName || 'Field'}:</span>
                                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                            <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">
                                              {String(log.oldValue || 'Not set')}
                                            </span>
                                            <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                            <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">
                                              {String(log.newValue || 'Not set')}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : log.actionDescription ? (
                                      <p className="text-[10px] sm:text-xs text-gray-400 mt-1 line-clamp-2">{log.actionDescription}</p>
                                    ) : null}
                                    
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 mt-1">
                                      <p className="text-[11px] sm:text-xs text-gray-400">Updated: {log.updated} | {log.timeAgo}</p>
                                      <p className="text-[11px] sm:text-xs text-blue-600 font-medium">Updated by: {log.updatedBy}</p>
                                    </div>
                                  </div>
                                  {/* Mobile badge - absolute top-right */}
                                  <div className={`sm:hidden absolute top-2 right-2 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${log.status === 'Approved' ? 'bg-green-100 text-green-800 border-green-200' :
                                    log.status === 'Rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                    log.status === 'Received with Comments' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                    log.status === 'Pending' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    log.status === 'In Progress' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                                  }`}>
                                    {log.status}
                                  </div>
                                  {/* Desktop badge - inline */}
                                  <div className={`hidden sm:block text-xs font-medium px-3 py-1 rounded-full border ${log.status === 'Approved' ? 'bg-green-100 text-green-800 border-green-200' :
                                    log.status === 'Rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                    log.status === 'Received with Comments' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                    log.status === 'Pending' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    log.status === 'In Progress' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                                  }`}>
                                    {log.status}
                                  </div>
                        </div>
                              ))}
                        </div>
                          );
                        })()}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Equipment Logs Subtab */}
                  {userRole !== 'vdcr_manager' && (
                    <TabsContent value="equipment-logs" className="space-y-4 sm:space-y-6">
                    <div className="space-y-4 sm:space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <h3 className="text-base sm:text-xl font-semibold text-gray-800 flex items-center gap-2">
                          <Building size={18} className="text-blue-600 sm:w-5 sm:h-5" />
                          Equipment Activity Log
                        </h3>
                        <Button
                          onClick={exportEquipmentLogsToExcel}
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1 sm:gap-2 bg-white hover:bg-blue-50 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 transition-all duration-200 text-xs sm:text-sm px-3"
                        >
                          <Download size={14} className="sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">Export to Excel</span>
                          <span className="sm:hidden">Export</span>
                        </Button>
                      </div>

                      {/* Search Bar */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search equipment logs by unit, status, or user..."
                          value={equipmentSearchQuery}
                          onChange={(e) => setEquipmentSearchQuery(e.target.value)}
                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        />
                        <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        {equipmentSearchQuery && (
                          <button
                            onClick={() => setEquipmentSearchQuery("")}
                            className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                          >
                            <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                    </div>
                    
                    <div className="space-y-4">
                        {/* Filtered Equipment Logs */}
                        {(() => {
                          // Helper function to format date
                          const formatDate = (dateString: string) => {
                            if (!dateString) return 'Unknown';
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                          };

                          // Helper function to calculate time ago
                          const getTimeAgo = (dateString: string) => {
                            if (!dateString) return 'Unknown';
                            const days = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
                            if (days === 0) return 'Today';
                            if (days === 1) return '1 day ago';
                            return `${days} days ago`;
                          };

                          // Helper function to format values properly (handle objects, arrays, null, etc.)
                          const formatValue = (value: any, fieldName?: string): string => {
                            // Handle null/undefined
                            if (value === null || value === undefined || value === '') {
                              return 'Not set';
                            }
                            
                            // Handle progress field - add % if it's a number or numeric string
                            if (fieldName?.toLowerCase().includes('progress')) {
                              const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                              if (!isNaN(numValue) && isFinite(numValue)) {
                                return `${numValue}%`;
                              }
                            }
                            
                            // Handle arrays
                            if (Array.isArray(value)) {
                              if (value.length === 0) return 'Empty';
                              // For technical sections array, show summary
                              if (fieldName?.toLowerCase().includes('technical') && value.length > 0) {
                                const sectionNames = value.map((s: any) => s?.name || s?.section_name || 'Unnamed').filter(Boolean);
                                if (sectionNames.length > 0) {
                                  return `${value.length} section${value.length > 1 ? 's' : ''} (${sectionNames.slice(0, 3).join(', ')}${sectionNames.length > 3 ? '...' : ''})`;
                                }
                              }
                              // For other arrays, show count or first few items
                              if (value.length <= 3) {
                                return value.map((v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                              }
                              return `${value.length} items`;
                            }
                            
                            // Handle objects
                            if (typeof value === 'object') {
                              // For technical sections object/array, try to extract meaningful info
                              if (fieldName?.toLowerCase().includes('technical')) {
                                try {
                                  // If it's an array of sections
                                  if (Array.isArray(value)) {
                                    const sections = value.filter(Boolean);
                                    if (sections.length > 0) {
                                      const names = sections.map((s: any) => s?.name || s?.section_name || 'Section').slice(0, 3);
                                      return `${sections.length} section${sections.length > 1 ? 's' : ''}: ${names.join(', ')}${sections.length > 3 ? '...' : ''}`;
                                    }
                                  }
                                  // If it's a single section object
                                  if (value.name || value.section_name) {
                                    return `Section: ${value.name || value.section_name}`;
                                  }
                                } catch (e) {
                                  // Fall through to JSON stringify
                                }
                              }
                              
                              // For custom fields, show field count
                              if (fieldName?.toLowerCase().includes('custom') && Array.isArray(value)) {
                                return `${value.length} field${value.length !== 1 ? 's' : ''}`;
                              }
                              
                              // Try to stringify objects meaningfully
                              try {
                                const str = JSON.stringify(value);
                                // If too long, truncate
                                if (str.length > 100) {
                                  return str.substring(0, 100) + '...';
                                }
                                return str;
                              } catch (e) {
                                return 'Object';
                              }
                            }
                            
                            // Handle boolean
                            if (typeof value === 'boolean') {
                              return value ? 'Yes' : 'No';
                            }
                            
                            // Default: convert to string
                            const str = String(value);
                            
                            // Handle empty strings
                            if (str.trim() === '') {
                              return 'Not set';
                            }
                            
                            return str;
                          };

                          // Helper function to parse changes from metadata or action description
                          const parseChanges = (log: any) => {
                            const changes: Array<{ field: string; old: string; new: string }> = [];
                            
                            // Special handling for technical_sections
                            if (log.metadata?.changes?.technical_sections) {
                              const techChange = log.metadata.changes.technical_sections;
                              if (techChange && typeof techChange === 'object' && ('old' in techChange || 'new' in techChange)) {
                                // Parse technical sections to show what actually changed
                                const oldSections = techChange.old;
                                const newSections = techChange.new;
                                
                                if (Array.isArray(oldSections) && Array.isArray(newSections)) {
                                  const oldNames = oldSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                  const newNames = newSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                  
                                  if (JSON.stringify(oldNames.sort()) !== JSON.stringify(newNames.sort())) {
                                    changes.push({
                                      field: 'Technical Sections',
                                      old: formatValue(oldSections, 'technical_sections'),
                                      new: formatValue(newSections, 'technical_sections')
                                    });
                                  } else {
                                    // Same sections, but might have field changes - check individual section fields
                                    newSections.forEach((newSec: any, idx: number) => {
                                      const oldSec = oldSections.find((s: any) => 
                                        (s?.name || s?.section_name) === (newSec?.name || newSec?.section_name)
                                      );
                                      
                                      if (oldSec && newSec.customFields) {
                                        const sectionName = newSec.name || newSec.section_name || `Section ${idx + 1}`;
                                        
                                        // Check for field changes in this section
                                        const oldFields = oldSec.customFields || [];
                                        const newFields = newSec.customFields || [];
                                        
                                        oldFields.forEach((oldField: any) => {
                                          const newField = newFields.find((f: any) => f.name === oldField.name);
                                          if (newField && newField.value !== oldField.value) {
                                            changes.push({
                                              field: `${sectionName} - ${oldField.name}`,
                                              old: formatValue(oldField.value),
                                              new: formatValue(newField.value)
                                            });
                                          }
                                        });
                                        
                                        // Check for new fields
                                        newFields.forEach((newField: any) => {
                                          if (!oldFields.find((f: any) => f.name === newField.name)) {
                                            changes.push({
                                              field: `${sectionName} - ${newField.name}`,
                                              old: 'Not set',
                                              new: formatValue(newField.value)
                                            });
                                          }
                                        });
                                      }
                                    });
                                  }
                                } else {
                                  changes.push({
                                    field: 'Technical Sections',
                                    old: formatValue(oldSections, 'technical_sections'),
                                    new: formatValue(newSections, 'technical_sections')
                                  });
                                }
                              }
                            }
                            
                            // Try to get other changes from metadata (excluding technical_sections which we handled above)
                            if (log.metadata?.changes && typeof log.metadata.changes === 'object') {
                              Object.entries(log.metadata.changes).forEach(([field, change]: [string, any]) => {
                                // Skip technical_sections as we already handled it
                                if (field === 'technical_sections') return;
                                
                                if (change && typeof change === 'object' && ('old' in change || 'new' in change)) {
                                  const formattedOld = formatValue(change.old, field);
                                  const formattedNew = formatValue(change.new, field);
                                  
                                  // Skip futile changes: "Not set" → "Not set" or identical values
                                  if (formattedOld === formattedNew) return;
                                  if (formattedOld === 'Not set' && formattedNew === 'Not set') return;
                                  if (formattedOld === 'Not-set' && formattedNew === 'Not-set') return;
                                  
                                  // Normalize both values to check if they're effectively the same (empty/not assigned)
                                  const normalizeForEmpty = (val: string): string => {
                                    const lower = val.toLowerCase().trim();
                                    if (lower === 'not set' || lower === 'not-set' || lower === 'not assigned' || 
                                        lower === 'null' || lower === 'undefined' || lower === '') {
                                      return 'empty';
                                    }
                                    return lower;
                                  };
                                  
                                  const oldNormalized = normalizeForEmpty(formattedOld);
                                  const newNormalized = normalizeForEmpty(formattedNew);
                                  
                                  // Skip if both are effectively empty/not assigned
                                  if (oldNormalized === 'empty' && newNormalized === 'empty') {
                                    return;
                                  }
                                  
                                  const formattedField = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                  changes.push({
                                    field: formattedField,
                                    old: formattedOld,
                                    new: formattedNew
                                  });
                                }
                              });
                            }
                            
                            // Fallback to old_value and new_value if available
                            if (changes.length === 0 && (log.old_value !== undefined || log.new_value !== undefined)) {
                              const formattedOld = formatValue(log.old_value, log.field_name);
                              const formattedNew = formatValue(log.new_value, log.field_name);
                              
                              // Skip futile changes here too
                              if (formattedOld !== formattedNew && 
                                  !(formattedOld === 'Not set' && formattedNew === 'Not set') &&
                                  !(formattedOld === 'Not-set' && formattedNew === 'Not-set')) {
                                changes.push({
                                  field: log.field_name ? log.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Field',
                                  old: formattedOld,
                                  new: formattedNew
                                });
                              }
                            }
                            
                            // Final filter: remove any remaining futile entries
                            return changes.filter(change => {
                              const oldNorm = String(change.old).trim().toLowerCase();
                              const newNorm = String(change.new).trim().toLowerCase();
                              
                              // Skip if identical
                              if (oldNorm === newNorm) return false;
                              
                              // Skip if both are "not set"/"not assigned" variations (equivalent empty states)
                              const emptyVariants = ['not set', 'not-set', 'not assigned', 'null', 'undefined', ''];
                              if (emptyVariants.includes(oldNorm) && emptyVariants.includes(newNorm)) return false;
                              
                              return true;
                            });
                          };

                          // Helper function to get activity type badge info
                          const getActivityTypeInfo = (activityType: string) => {
                            const types: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
                              'equipment_created': { label: 'Created', color: 'text-green-800', bgColor: 'bg-green-100', borderColor: 'border-green-200', icon: Building },
                              'equipment_updated': { label: 'Updated', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: Wrench },
                              'equipment_deleted': { label: 'Deleted', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: AlertTriangle },
                              'progress_image_uploaded': { label: 'Progress Image', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: Image },
                              'technical_specs_updated': { label: 'Technical Specs', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                              'technical_section_added': { label: 'Tech Section Added', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                              'document_uploaded': { label: 'Document Added', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                              'document_updated': { label: 'Document Updated', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                              'team_member_added': { label: 'Team Member', color: 'text-teal-800', bgColor: 'bg-teal-100', borderColor: 'border-teal-200', icon: UserPlus },
                              'team_member_removed': { label: 'Team Member', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: UserPlus },
                              'progress_updated': { label: 'Progress', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: TrendingUp }
                            };
                            
                            return types[activityType] || { 
                              label: 'Activity', 
                              color: 'text-gray-800', 
                              bgColor: 'bg-gray-100', 
                              borderColor: 'border-gray-200', 
                              icon: FileText 
                            };
                          };

                          // Use real equipment activity logs from equipment_activity_logs table
                          const entries = equipmentProgressEntries || [];
                          // console.log('🔧 UnifiedProjectView: Rendering equipment logs, equipmentProgressEntries:', {
                          //   length: entries.length,
                          //   entries: entries
                          // });
                          const equipmentLogs = entries.map((log: any, index: number) => {
                            const changes = parseChanges(log);
                            const activityInfo = getActivityTypeInfo(log.activity_type || '');
                            // For batch entries, show simplified count; otherwise single tag number
                            let tagNumber = 'Unknown';
                            if (log.metadata?.isBatch && log.metadata?.equipmentList) {
                              // Just show count in header - detailed list shown below
                              const count = log.metadata.equipmentCount || log.metadata.equipmentList.length || 0;
                              tagNumber = `${count} equipment`;
                            } else {
                              tagNumber = log.metadata?.tagNumber || log.metadata?.tag_number || 'Unknown';
                            }
                            const equipmentType = log.metadata?.equipmentType || log.metadata?.equipment_type || 'Equipment';
                            
                            return {
                              id: log.id || index + 1,
                              activityType: log.activity_type,
                              activityInfo,
                              equipmentType,
                              tagNumber,
                              changes,
                              description: log.action_description || '',
                              metadata: log.metadata || {},
                              updated: formatDate(log.created_at),
                              timeAgo: getTimeAgo(log.created_at),
                              updatedBy: log.created_by_user?.full_name || log.created_by || 'Unknown User',
                              oldValue: log.old_value,
                              newValue: log.new_value,
                              fieldName: log.field_name
                            };
                          });

                          const filteredLogs = equipmentSearchQuery
                            ? equipmentLogs.filter(log =>
                                log.equipmentType.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                                log.tagNumber.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                                log.activityInfo.label.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                                log.updatedBy.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                                log.description.toLowerCase().includes(equipmentSearchQuery.toLowerCase())
                              )
                            : equipmentLogs;

                          if (filteredLogs.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                <Building size={32} className="mx-auto mb-2 text-gray-300" />
                                <p>No equipment logs match the search criteria.</p>
                                <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="max-h-96 overflow-y-auto space-y-3 pr-1.5 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                              {filteredLogs.map((log) => {
                                const ActivityIcon = log.activityInfo.icon;
                                
                                return (
                                  <div key={log.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3 sm:p-4">
                                    {/* Header: Equipment Tag + Activity Type Badge */}
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
                                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[10px] sm:text-xs md:text-sm font-semibold rounded-lg shadow-sm whitespace-nowrap flex-shrink-0">
                                          <Building size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                                          <span className="truncate max-w-[80px] sm:max-w-none">{log.tagNumber}</span>
                                        </span>
                                        {!log.metadata?.isBatch && log.equipmentType !== 'Equipment' && (
                                          <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">({log.equipmentType})</span>
                                        )}
                                      </div>
                                      <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-full border w-fit ${log.activityInfo.bgColor} ${log.activityInfo.color} ${log.activityInfo.borderColor}`}>
                                        <ActivityIcon size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                        <span className="whitespace-nowrap">{log.activityInfo.label}</span>
                                      </span>
                                    </div>

                                    {/* Activity-Specific Content */}
                                    <div className="space-y-2 mb-3">
                                      {/* Equipment Updates - Show Changes */}
                                      {(log.activityType === 'equipment_updated' || log.changes.length > 0) && log.changes.length > 0 && (
                                        <div className="space-y-1.5">
                                          {log.changes
                                            .filter(change => {
                                              // Filter out progress percentage changes if progress_phase is also changing
                                              // (progress is automatically set based on phase, so it's redundant)
                                              if (change.field.toLowerCase() === 'progress' || change.field.toLowerCase() === 'progress %') {
                                                const hasPhaseChange = log.changes.some(c => 
                                                  c.field.toLowerCase() === 'progress phase' || 
                                                  c.field.toLowerCase() === 'progress_phase'
                                                );
                                                if (hasPhaseChange) {
                                                  return false; // Hide progress % when phase is changing
                                                }
                                              }
                                              return true;
                                            })
                                            .map((change, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                              <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Progress Image Added */}
                                      {log.activityType === 'progress_image_uploaded' && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                          <Image size={12} className="sm:w-[14px] sm:h-[14px] text-blue-600 flex-shrink-0" />
                                          <span className="flex-shrink-0">New progress image added</span>
                                          {log.metadata?.imageDescription && (
                                            <span className="text-gray-500 truncate">- {log.metadata.imageDescription}</span>
                                          )}
                                        </div>
                                      )}

                                      {/* Technical Specs Updates */}
                                      {(log.activityType === 'technical_specs_updated' || log.activityType === 'technical_section_added') && (
                                        <div className="space-y-1.5">
                                          {log.metadata?.sectionName && (
                                            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm mb-2 flex-wrap">
                                              <Wrench size={12} className="sm:w-[14px] sm:h-[14px] text-orange-600 flex-shrink-0" />
                                              <span className="font-medium text-gray-700">Section: <span className="text-gray-900 truncate">{log.metadata.sectionName}</span></span>
                                            </div>
                                          )}
                                          {log.changes.length > 0 ? (
                                            <div className={log.metadata?.sectionName ? "ml-0 sm:ml-5 space-y-1.5" : "space-y-1.5"}>
                                              {log.changes.map((change, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                                  <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                    <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                    <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                    <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <span className="text-xs text-gray-600">Technical sections updated</span>
                                          )}
                                        </div>
                                      )}

                                      {/* Document Added/Updated */}
                                      {(log.activityType === 'document_uploaded' || log.activityType === 'document_updated') && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                          <FileCheck size={12} className="sm:w-[14px] sm:h-[14px] text-indigo-600 flex-shrink-0" />
                                          <span className="font-medium flex-shrink-0">Document:</span>
                                          <span className="text-gray-900 truncate">{log.metadata?.fileName || log.metadata?.documentName || 'Unknown'}</span>
                                          {log.metadata?.documentType && (
                                            <span className="text-gray-500 truncate">({log.metadata.documentType})</span>
                                          )}
                                        </div>
                                      )}

                                      {/* Team Member Added */}
                                      {log.activityType === 'team_member_added' && (
                                        <div className="space-y-2">
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                            <UserPlus size={12} className="sm:w-[14px] sm:h-[14px] text-teal-600 flex-shrink-0" />
                                            <span className="font-medium truncate">{log.metadata?.memberName || 'Team member'}</span>
                                            <span className="text-gray-600 flex-shrink-0">added as</span>
                                            <span className="px-1.5 sm:px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 font-medium whitespace-nowrap flex-shrink-0">
                                              {log.metadata?.role || 'Member'}
                                            </span>
                                          </div>
                                          {/* Show equipment list for batch entries */}
                                          {log.metadata?.isBatch && log.metadata?.equipmentList && (
                                            <div className="ml-0 sm:ml-5 space-y-1">
                                              <span className="text-[10px] sm:text-xs font-medium text-gray-600">Equipment:</span>
                                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                                {log.metadata.equipmentList.map((eq: any, idx: number) => (
                                                  <span key={idx} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 truncate max-w-[150px] sm:max-w-none">
                                                    {eq.tagNumber} ({eq.type})
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Fallback: Show description if no specific format */}
                                      {log.changes.length === 0 && 
                                       !['progress_image_uploaded', 'technical_specs_updated', 'technical_section_added', 'document_uploaded', 'document_updated', 'team_member_added'].includes(log.activityType) && (
                                        <p className="text-xs sm:text-sm text-gray-600">{log.description}</p>
                                      )}
                                    </div>

                                    {/* Footer: Date and User */}
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                        <Clock size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                        <span className="truncate">{log.updated}</span>
                                        <span className="text-gray-400 hidden sm:inline">|</span>
                                        <span className="truncate">{log.timeAgo}</span>
                                      </div>
                                      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                        <User size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                        <span className="text-blue-600 font-medium truncate">{log.updatedBy}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </TabsContent>
                  )}
                </Tabs>
                  </div>
                </div>
          </TabsContent>

          {/* Project Details Tab */}
          {userRole !== 'vdcr_manager' && userRole !== 'editor' && (
            <TabsContent value="project-details" className="space-y-6 mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-orange-200">
                <h2 className="text-xl font-semibold text-orange-800 flex items-center gap-2">
                  <Users size={24} className="text-orange-600" />
                  Project Details
                </h2>
                <p className="text-orange-600 text-sm mt-1">Complete project information and team details</p>
              </div>
              <div className="p-6">
                <ProjectDetails
                  project={projectData}
                  onBack={onBack}
                  onViewEquipment={() => setActiveTab("equipment")}
                  onViewVDCR={() => setActiveTab("vdcr")}
                  vdcrData={vdcrData}
                  onEditProject={onEditProject}
                  onDeleteProject={onDeleteProject}
                  onCompleteProject={onCompleteProject}
                  onDocumentDeleted={onDocumentDeleted}
                />
              </div>
            </div>
          </TabsContent>
          )}

          {/* Settings Tab */}
          {userRole !== 'vdcr_manager' && userRole !== 'editor' && userRole !== 'viewer' && (
      <TabsContent value="settings" className="space-y-6 mt-8">
        <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
            <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Settings size={20} className="text-gray-600 sm:w-6 sm:h-6" />
              Team & Permissions Settings
            </h2>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage team members and control access permissions</p>
          </div>
          <div className="p-6">
            <div className="space-y-6">
                  {/* Team Management Header */}
                  <div className="flex items-center justify-between mb-6 sm:mb-8">
                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800">Team Members</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage who has access to this project and their permissions</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 ml-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs sm:text-sm border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        onClick={downloadTeamMembersTemplate}
                      >
                        <Download size={14} className="mr-2" />
                        Download Sample Template
                      </Button>
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          disabled={bulkMemberUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleBulkTeamMembersUpload(f);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white border border-green-600"
                          asChild
                          disabled={bulkMemberUploading}
                        >
                          <span>
                            <FileText size={14} className="mr-2" />
                            {bulkMemberUploading ? 'Uploading...' : 'Bulk Upload Document'}
                          </span>
                        </Button>
                      </label>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <Users size={16} className="sm:w-4 sm:h-4" />
                      Add Member
                    </button>
                    </div>
                  </div>

                  {/* Team Interconnections Section - Removed as not needed */}

                    {/* Team Members List */}
                    <div className="space-y-4">
                    {teamMembersLoading ? (
                      <div className="text-center py-6 sm:py-8">
                        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-500 mt-2 text-xs sm:text-sm">Loading team members...</p>
                      </div>
                    ) : teamMembers.length === 0 ? (
                      <div className="text-center py-6 sm:py-8">
                        <Users size={36} className="mx-auto text-gray-300 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
                        <p className="text-gray-500 text-sm sm:text-base">No team members found</p>
                        <p className="text-xs sm:text-sm text-gray-400 mt-1">Add team members to get started</p>
                      </div>
                    ) : (
                      teamMembers.map((member) => (
                      <div key={member.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 font-semibold text-xs sm:text-sm lg:text-lg">{member.avatar}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-800 text-xs sm:text-sm lg:text-base truncate">{member.name}</h4>
                              <p className="text-xs sm:text-sm text-gray-600 truncate">{member.email}</p>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                                <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                                  {member.position || 'No Position'}
                                </span>
                                <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {member.status}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2">
                            {/* <span className="text-xs text-gray-500">Last active: {member.lastActive}</span> */}
                            <button
                              onClick={() => editTeamMember(member)}
                              className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex-shrink-0"
                            >
                              Edit
                            </button>
                            {/* <button
                              onClick={() => toggleMemberStatus(member.id)}
                                className={`px-3 py-1 text-sm rounded-md transition-colors ${member.status === 'active'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {member.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button> */}
                            <button
                              onClick={() => removeTeamMember(member.id)}
                              className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors flex-shrink-0"
                            >
                              Remove
                            </button>
                      </div>
                    </div>
                    
                        {/* Equipment Assignments */}
                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                          <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Equipment Assignments:</h5>
                          <div className="flex flex-wrap gap-1 sm:gap-2">
                            {member.equipmentAssignments.map((equipmentId, index) => {
                              // Find equipment by ID to get name/MSN
                              const assignedEquipment = equipment.find(eq => eq.id === equipmentId);
                              const displayName = assignedEquipment 
                                ? (assignedEquipment.manufacturing_serial || assignedEquipment.tag_number || assignedEquipment.type || equipmentId)
                                : equipmentId;
                              
                              return (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                                >
                                  {displayName}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Data Access Levels */}
                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                          <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Data Access:</h5>
                          <div className="space-y-1 sm:space-y-2">
                            {member.role === 'project_manager' && (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Full Project Access</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Manage All Equipment</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Approve Documentation</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Manage Team Members</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Access to All Tabs</span>
                                </div>
                              </>
                            )}
                            {member.role === 'vdcr_manager' && (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Documentation Management Access</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Approve Documentation</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can View All Equipment</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Access to Documentation & Equipment Tabs</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">No Access to Settings</span>
                                </div>
                              </>
                            )}
                            {member.role === 'editor' && (
                              <>
                                <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Assigned Equipment Only</span>
                              </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Add Progress Images</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can Add Progress Entries</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Access to Documentation & Other Tabs</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">No Access to Settings & Project Details</span>
                                </div>
                              </>
                            )}
                            {member.role === 'viewer' && (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Read-Only Access</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can View Assigned Equipment</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">Can View Progress & Documentation</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">No Edit Permissions</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                  <span className="text-xs text-gray-600">No Access to Settings</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Access Level Badge */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Access Level:</h5>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)} border`}>
                              {roles.find(r => r.name === member.role)?.displayName || member.role}
                            </span>
                        </div>

                        {/* Department Badge */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Department:</h5>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            {member.department || 'No Department'}
                          </span>
                        </div>

                        {/* Permissions Display */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Permissions:</h5>
                          <div className="flex flex-wrap gap-2">
                            {(() => {
                              const role = roles.find(r => r.name === member.role);
                              const rolePermissions = role ? role.permissions : [];
                              return rolePermissions.map((permission, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                >
                                  {getPermissionLabel(permission)}
                                </span>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                      ))
                    )}
                  </div>


                </div>
              </div>
            </div>

            {/* Add Member Modal */}
            {showAddMember && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  {/* Header */}
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-xl font-semibold text-gray-900">Add New Team Member</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Fill in the details to add a new team member</p>
                      </div>
                      <button
                        onClick={handleCloseAddMember}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                      >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                    {/* Select Existing Member or Add New */}
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Select Team Member</h4>
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                          Choose Existing Member or Add New *
                        </label>
                        <Select
                          value={selectedExistingMemberEmail}
                          onValueChange={(value) => handleExistingMemberSelect(value)}
                          disabled={isLoadingExistingMembers}
                          required
                        >
                          <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white hover:bg-gray-50">
                            <SelectValue placeholder={isLoadingExistingMembers ? "Loading members..." : "Select or Add New Member..."} />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 sm:max-h-96">
                            {existingFirmMembers.length > 0 && (
                              <>
                                {existingFirmMembers.map((member, index) => (
                                  <React.Fragment key={member.email}>
                                    {index > 0 && (
                                      <div className="border-t border-gray-200 my-1"></div>
                                    )}
                                    <SelectItem 
                                      value={member.email} 
                                      className="py-2.5 sm:py-3 px-3 sm:px-4 focus:bg-indigo-50"
                                    >
                                      <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
                                        <div className="text-xs sm:text-sm font-medium text-gray-900">
                                          {member.name}
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-gray-600">
                                          {member.email}
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-gray-500">
                                          {mapRoleToDisplay(member.role || member.access_level || 'viewer')}
                                        </div>
                                      </div>
                                    </SelectItem>
                                  </React.Fragment>
                                ))}
                              </>
                            )}
                            {existingFirmMembers.length > 0 && (
                              <div className="border-t border-gray-200 my-1"></div>
                            )}
                            <SelectItem value="new" className="text-xs sm:text-sm py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-indigo-600 focus:bg-indigo-50">
                              ➕ Add New Team Member
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {isExistingMemberMode && (
                          <p className="mt-2 text-[10px] sm:text-xs text-blue-600 flex items-start gap-1.5">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="flex-1">Existing member selected. Name, email, phone, and access level are locked. Position and department(s) can be edited.</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Basic Information Section */}
                    <div className="space-y-3 sm:space-y-5">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                          <input
                            type="text"
                            value={newMember.name}
                            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                            disabled={isExistingMemberMode}
                            className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                              isExistingMemberMode 
                                ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                                : 'bg-gray-50 hover:bg-white'
                            }`}
                            placeholder="Enter full name"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                          <input
                            type="email"
                            value={newMember.email}
                            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                            disabled={isExistingMemberMode}
                            className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                              isExistingMemberMode 
                                ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                                : 'bg-gray-50 hover:bg-white'
                            }`}
                            placeholder="Enter email address"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                          <input
                            type="tel"
                            value={newMember.phone || ''}
                            onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                            disabled={isExistingMemberMode}
                            className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                              isExistingMemberMode 
                                ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                                : 'bg-gray-50 hover:bg-white'
                            }`}
                            placeholder="Enter phone number"
                            pattern="[0-9]{10}"
                            title="Please enter a 10-digit phone number"
                            maxLength={10}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                          <input
                            type="text"
                            value={newMember.position || ''}
                            onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:bg-blue-50"
                            placeholder="e.g., Engineer, Inspector, Manager"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Department (optional)</label>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 mb-2">
                          Suggestions are dynamic and limited to this firm only.
                        </p>
                        <Select
                          value={newMember.department || '__none__'}
                          onValueChange={(value) => {
                            if (value === '__add_new__') {
                              setNewMember((prev) => ({ ...prev, department: '__add_new__' }));
                              return;
                            }
                            setNewMember((prev) => ({ ...prev, department: value === '__none__' ? '' : value }));
                          }}
                        >
                          <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white">
                            <SelectValue placeholder="Select department..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No department</SelectItem>
                            {addMemberAvailableDepartments.map((d) => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                            <SelectItem value="__add_new__">+ Add new department...</SelectItem>
                          </SelectContent>
                        </Select>
                        {newMember.department === '__add_new__' && (
                          <div className="mt-2 flex gap-2">
                            <Input
                              value={addMemberNewDepartmentInput}
                              onChange={e => setAddMemberNewDepartmentInput(e.target.value)}
                              placeholder="Add new department"
                              className="h-9"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addCustomMemberDepartment();
                                }
                              }}
                            />
                            <Button type="button" size="sm" variant="outline" className="h-9" onClick={addCustomMemberDepartment}>
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Equipment Assignment Section */}
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Equipment Assignment</h4>
                        </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {/* All Equipment Option */}
                        <label className="flex items-center gap-2 sm:gap-3 cursor-pointer p-2.5 sm:p-3 hover:bg-green-50 rounded-lg border border-gray-200 transition-all duration-200 hover:border-green-300 hover:shadow-sm">
                          <input
                            type="checkbox"
                            checked={newMember.equipmentAssignments?.includes("All Equipment") || false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Auto-select all equipment when "All Equipment" is checked
                                const allEquipmentIds = equipment.map(eq => eq.id);
                                setNewMember({
                                  ...newMember,
                                  equipmentAssignments: ["All Equipment", ...allEquipmentIds]
                                });
                              } else {
                                // Deselect all equipment when "All Equipment" is unchecked
                                setNewMember({
                                  ...newMember,
                                  equipmentAssignments: []
                                });
                              }
                            }}
                            className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 focus:ring-2 transition-all duration-200 flex-shrink-0"
                          />
                          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">All Equipment</span>
                        </label>
                        
                        {/* Dynamic Equipment List */}
                        {equipment.map((eq) => {
                          const equipmentDisplayName = eq.manufacturing_serial || eq.tag_number || eq.type || eq.id;
                          return (
                            <label key={eq.id} className="flex items-center gap-2 sm:gap-3 cursor-pointer p-2.5 sm:p-3 hover:bg-green-50 rounded-lg border border-gray-200 transition-all duration-200 hover:border-green-300 hover:shadow-sm">
                              <input
                                type="checkbox"
                                checked={newMember.equipmentAssignments?.includes(eq.id) || false}
                                onChange={(e) => {
                                  const currentAssignments = newMember.equipmentAssignments || [];
                                  if (e.target.checked) {
                                    const newAssignments = [...currentAssignments, eq.id];
                                    // Auto-check "All Equipment" if all individual equipment is selected
                                    const allEquipmentIds = equipment.map(eq => eq.id);
                                    const allSelected = allEquipmentIds.every(id => newAssignments.includes(id));
                                    if (allSelected && !newAssignments.includes("All Equipment")) {
                                      newAssignments.push("All Equipment");
                                    }
                                    setNewMember({
                                      ...newMember,
                                      equipmentAssignments: newAssignments
                                    });
                                  } else {
                                    const newAssignments = currentAssignments.filter(item => item !== eq.id);
                                    // Auto-uncheck "All Equipment" if any individual equipment is deselected
                                    if (newAssignments.includes("All Equipment")) {
                                      newAssignments.splice(newAssignments.indexOf("All Equipment"), 1);
                                    }
                                    setNewMember({
                                      ...newMember,
                                      equipmentAssignments: newAssignments
                                    });
                                  }
                                }}
                                className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 focus:ring-2 transition-all duration-200 flex-shrink-0"
                              />
                              <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{equipmentDisplayName}</span>
                            </label>
                          );
                        })}
                        </div>
                      

                        </div>

                    {/* Role & Access Section */}
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Role & Access Level</h4>
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Select Role *</label>
                        <Select
                          value={newMember.role}
                          onValueChange={(value) => {
                            const role = value;
                            setNewMember({
                              ...newMember, 
                              role: role,
                              accessLevel: role === 'Project Manager' ? 'project_manager' : 
                                          role === 'Documentation Manager' ? 'vdcr_manager' : 
                                          role === 'Editor' ? 'editor' : 'viewer',
                              permissions: role === 'Project Manager' ? ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'] :
                                         role === 'Documentation Manager' ? ['view', 'edit', 'approve_vdcr', 'manage_vdcr'] :
                                         role === 'Editor' ? ['view', 'edit', 'manage_equipment'] : ['view', 'comment']
                            });
                          }}
                          disabled={isExistingMemberMode}
                          required
                        >
                          <SelectTrigger className={`w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}>
                            <SelectValue placeholder="Choose a role..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 sm:max-h-96">
                            <SelectItem value="Project Manager" className="text-xs sm:text-sm py-2">
                              Project Manager (Full Access)
                            </SelectItem>
                            <SelectItem value="Documentation Manager" className="text-xs sm:text-sm py-2">
                              Documentation Manager (Documentation Management)
                            </SelectItem>
                            <SelectItem value="Editor" className="text-xs sm:text-sm py-2">
                              Editor (Can Add Progress)
                            </SelectItem>
                            <SelectItem value="Viewer" className="text-xs sm:text-sm py-2">
                              Viewer (Read Only)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {/* Role Description with Data Access */}
                        {newMember.role && (
                          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-[10px] sm:text-xs text-blue-700 font-medium mb-2 sm:mb-3">Default Data Access for Selected Role:</p>
                            <div className="text-[10px] sm:text-xs text-blue-700 space-y-1 sm:space-y-2">
                              {newMember.role === 'Project Manager' && (
                                <div className="space-y-1">
                                  <div>• Full Project Access</div>
                                  <div>• Can Manage All Equipment</div>
                                  <div>• Can Approve Documentation</div>
                                  <div>• Can Manage Team Members</div>
                                  <div>• Access to All Tabs</div>
                                </div>
                              )}
                              {newMember.role === 'Documentation Manager' && (
                                <div className="space-y-1">
                                  <div>• Full Documentation Management Access</div>
                                  <div>• Can Edit Documentation</div>
                                  <div>• Access to Documentation Birdview Tab</div>
                                  <div>• Access to Documentation Logs in Project Chronology</div>
                                </div>
                              )}
                              {newMember.role === 'Editor' && (
                                <div className="space-y-1">
                                  <div>• Can See Assigned Equipment Only</div>
                                  <div>• Can Add Progress Images</div>
                                  <div>• Can Add Progress Entries</div>
                                  <div>• Cannot Edit Existing Data</div>
                                  <div>• Access to Documentation & Other Tabs (except Settings & Project Details)</div>
                                </div>
                              )}
                              {newMember.role === 'Viewer' && (
                                <div className="space-y-1">
                                  <div>• Read-Only Access</div>
                                  <div>• Can View Assigned Equipment</div>
                                  <div>• Can View Progress & VDCR</div>
                                  <div>• No Edit Permissions</div>
                                  <div>• No Access to Settings</div>
                                </div>
                              )}
            </div>
                          </div>
                        )}
                      </div>
                    </div>


                </div>

                  {/* Action Buttons */}
                  <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                      <button
                        onClick={addTeamMember}
                        disabled={!newMember.name || !newMember.email || !newMember.position || !newMember.role || !newMember.equipmentAssignments?.length}
                        className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                      >
                        Add Team Member
                      </button>
                      <button
                        onClick={handleCloseAddMember}
                        className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                      >
                        Cancel
                      </button>
              </div>
            </div>
                </div>
              </div>
            )}

            {/* Edit Member Modal */}
            {showEditMember && selectedMember && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  {/* Header */}
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-xl font-semibold text-gray-900">Edit Team Member</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Update the team member's information and permissions</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowEditMember(false);
                          setSelectedMember(null);
                          setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                        }}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                      >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                    {/* Basic Information Section */}
                    <div className="space-y-3 sm:space-y-5">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                          <input
                            type="text"
                            value={newMember.name}
                            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                            placeholder="Enter full name"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                          <input
                            type="email"
                            value={newMember.email}
                            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                            placeholder="Enter email address"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                          <input
                            type="tel"
                            value={newMember.phone || ''}
                            onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                            placeholder="Enter phone number"
                            pattern="[0-9]{10}"
                            title="Please enter a 10-digit phone number"
                            maxLength={10}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                          <input
                            type="text"
                            value={newMember.position || ''}
                            onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                            placeholder="e.g., Engineer, Inspector, Manager"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Department (optional)</label>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 mb-2">Suggestions are dynamic and limited to this firm only.</p>
                        <Select
                          value={newMember.department || '__none__'}
                          onValueChange={(value) => {
                            if (value === '__add_new__') {
                              setNewMember((prev) => ({ ...prev, department: '__add_new__' }));
                              return;
                            }
                            setNewMember((prev) => ({ ...prev, department: value === '__none__' ? '' : value }));
                          }}
                        >
                          <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white">
                            <SelectValue placeholder="Select department..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No department</SelectItem>
                            {addMemberAvailableDepartments.map((d) => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                            <SelectItem value="__add_new__">+ Add new department...</SelectItem>
                          </SelectContent>
                        </Select>
                        {newMember.department === '__add_new__' && (
                          <div className="mt-2 flex gap-2">
                            <Input
                              value={addMemberNewDepartmentInput}
                              onChange={e => setAddMemberNewDepartmentInput(e.target.value)}
                              placeholder="Add new department"
                              className="h-9"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addCustomMemberDepartment();
                                }
                              }}
                            />
                            <Button type="button" size="sm" variant="outline" className="h-9" onClick={addCustomMemberDepartment}>
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Equipment Assignment Section */}
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Equipment Assignment</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <label className="flex items-center gap-2 sm:gap-3 cursor-pointer p-2.5 sm:p-3 hover:bg-green-50 rounded-lg border border-gray-200 transition-all duration-200 hover:border-green-300 hover:shadow-sm">
                          <input
                            type="checkbox"
                            checked={newMember.equipmentAssignments?.includes("All Equipment") || false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const allEquipmentIds = equipment.map(eq => eq.id);
                                setNewMember({
                                  ...newMember,
                                  equipmentAssignments: ["All Equipment", ...allEquipmentIds]
                                });
                              } else {
                                setNewMember({
                                  ...newMember,
                                  equipmentAssignments: []
                                });
                              }
                            }}
                            className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 focus:ring-2 transition-all duration-200 flex-shrink-0"
                          />
                          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">All Equipment</span>
                        </label>
                        
                        {/* Dynamic Equipment List */}
                        {equipment.map((eq) => {
                          const equipmentDisplayName = eq.manufacturing_serial || eq.tag_number || eq.type || eq.id;
                          return (
                            <label key={eq.id} className="flex items-center gap-2 sm:gap-3 cursor-pointer p-2.5 sm:p-3 hover:bg-green-50 rounded-lg border border-gray-200 transition-all duration-200 hover:border-green-300 hover:shadow-sm">
                              <input
                                type="checkbox"
                                checked={newMember.equipmentAssignments?.includes(eq.id) || false}
                                onChange={(e) => {
                                  const currentAssignments = newMember.equipmentAssignments || [];
                                  if (e.target.checked) {
                                    const newAssignments = [...currentAssignments, eq.id];
                                    // Auto-check "All Equipment" if all individual equipment is selected
                                    const allEquipmentIds = equipment.map(eq => eq.id);
                                    const allSelected = allEquipmentIds.every(id => newAssignments.includes(id));
                                    if (allSelected && !newAssignments.includes("All Equipment")) {
                                      newAssignments.push("All Equipment");
                                    }
                                    setNewMember({
                                      ...newMember,
                                      equipmentAssignments: newAssignments
                                    });
                                  } else {
                                    const newAssignments = currentAssignments.filter(item => item !== eq.id);
                                    // Auto-uncheck "All Equipment" if any individual equipment is deselected
                                    if (newAssignments.includes("All Equipment")) {
                                      newAssignments.splice(newAssignments.indexOf("All Equipment"), 1);
                                    }
                                    setNewMember({
                                      ...newMember,
                                      equipmentAssignments: newAssignments
                                    });
                                  }
                                }}
                                className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500 focus:ring-2 transition-all duration-200 flex-shrink-0"
                              />
                              <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{equipmentDisplayName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Role & Access Section - DISABLED */}
                    <div className="space-y-3 sm:space-y-4 opacity-60">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">Role & Access Level (Read Only)</h4>
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-2">Current Role</label>
                        <div className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed">
                          {newMember.role || 'No role assigned'}
                        </div>
                        
                        {/* Role Description with Data Access */}
                        {newMember.role && (
                          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-[10px] sm:text-xs text-gray-600 font-medium mb-2 sm:mb-3">Current Data Access for Role:</p>
                            <div className="text-[10px] sm:text-xs text-gray-600 space-y-1 sm:space-y-2">
                              {newMember.role === 'Project Manager' && (
                                <div className="space-y-1">
                                  <div>• Full Project Access</div>
                                  <div>• Can Manage All Equipment</div>
                                  <div>• Can Approve Documentation</div>
                                  <div>• Can Manage Team Members</div>
                                  <div>• Access to All Tabs</div>
                                </div>
                              )}
                              {newMember.role === 'Documentation Manager' && (
                                <div className="space-y-1">
                                  <div>• Full Documentation Management Access</div>
                                  <div>• Can Edit Documentation</div>
                                  <div>• Access to Documentation Birdview Tab</div>
                                  <div>• Access to Documentation Logs in Project Chronology</div>
                                </div>
                              )}
                              {newMember.role === 'Editor' && (
                                <div className="space-y-1">
                                  <div>• Can See Assigned Equipment Only</div>
                                  <div>• Can Add Progress Images</div>
                                  <div>• Can Add Progress Entries</div>
                                  <div>• Cannot Edit Existing Data</div>
                                  <div>• Access to Documentation & Other Tabs (except Settings & Project Details)</div>
                                </div>
                              )}
                              {newMember.role === 'Viewer' && (
                                <div className="space-y-1">
                                  <div>• Read-Only Access</div>
                                  <div>• Can View Assigned Equipment</div>
                                  <div>• Can View Progress & VDCR</div>
                                  <div>• No Edit Permissions</div>
                                  <div>• No Access to Settings</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Disabled Notice */}
                        <div className="mt-3 p-2.5 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <p className="text-[10px] sm:text-xs text-yellow-700 font-medium">Role & Access Level cannot be modified. Contact administrator to change user roles.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                      <button
                        onClick={updateTeamMember}
                        className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium shadow-sm hover:shadow-md"
                      >
                        Edit Team Member
                      </button>
                      <button
                        onClick={() => {
                          setShowEditMember(false);
                          setSelectedMember(null);
                          setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                        }}
                        className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Document Preview Modal */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  Document Preview
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                  {previewModal.documentName}
                </p>
              </div>
              <button
                onClick={() => setPreviewModal({ isOpen: false, documentUrl: '', documentName: '' })}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-3 sm:p-6 overflow-hidden">
              <div 
                className="w-full h-full border border-gray-200 rounded-lg overflow-hidden"
                onWheel={(e) => {
                  // Horizontal scroll navigation for PDF pages
                  if (e.deltaX > 0) {
                    // Scroll right - could trigger next page if needed
                    // // console.log('Scroll right detected');
                  } else if (e.deltaX < 0) {
                    // Scroll left - could trigger previous page if needed  
                    // // console.log('Scroll left detected');
                  }
                }}
                onKeyDown={(e) => {
                  // Keyboard navigation
                  if (e.key === 'ArrowRight') {
                    // // console.log('Right arrow - next page');
                  } else if (e.key === 'ArrowLeft') {
                    // // console.log('Left arrow - previous page');
                  }
                }}
                tabIndex={0}
              >
                <iframe
                  src={previewModal.documentUrl}
                  className="w-full h-full"
                  style={{ minHeight: '300px' }}
                  title="Document Preview"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
              <button
                onClick={() => window.open(previewModal.documentUrl, '_blank')}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors border border-blue-200 hover:border-blue-300 text-xs sm:text-sm font-medium"
              >
                Open in New Tab
              </button>
              <button
                onClick={() => setPreviewModal({ isOpen: false, documentUrl: '', documentName: '' })}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-xs sm:text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ClientViewModal
        projectId={projectId}
        projectName={projectName}
        equipment={equipment?.map((e: any) => ({ id: e.id, name: e.name, tag_number: e.tag_number ?? e.tagNumber })) ?? []}
        open={clientViewModalOpen}
        onClose={() => setClientViewModalOpen(false)}
      />
    </div>
  );
};

export default UnifiedProjectView;



