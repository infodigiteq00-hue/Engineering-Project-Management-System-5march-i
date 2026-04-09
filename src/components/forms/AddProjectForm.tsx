import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { X, Save, Upload, Users, FileText, Settings, Building2, Plus, CheckCircle, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Pencil, UserPlus, Loader2, FileSpreadsheet, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { designSystem } from "@/lib/design-system";
import {
  fastAPI,
  updateProjectDocumentLinks,
  deleteProjectDocument,
  batchInsertUnpricedPODocuments,
  batchInsertDesignInputsDocuments,
  batchInsertClientReferenceDocuments,
  batchInsertOtherDocuments,
  batchInsertEquipmentDocuments,
  createProjectEquipmentBatch,
  getEquipmentDocumentsForEquipmentIds,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import AssignRoleForm from "./AssignRoleForm";
import { sendProjectTeamNotifications, getDashboardUrl } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";



interface AddProjectFormProps {
  onClose: () => void;
  onSubmit: (projectData: ProjectFormData) => void;
  editData?: ProjectFormData | null;
  isEditMode?: boolean;
}

interface ProjectFormData {
  // Basic Project Information
  projectTitle: string;
  clientName: string;
  plantLocation: string;
  poNumber: string;
  salesOrderDate: string;
  completionDate: string;
  clientIndustry: string;
  
  // Project Team & Management
  projectManager: string;
  vdcrManager: string;
  consultant: string;
  tpiAgency: string;
  clientFocalPoint: string;
  
  // Scope of Work
  servicesIncluded: {
    design: boolean;
    manufacturing: boolean;
    testing: boolean;
    documentation: boolean;
    installationSupport: boolean;
    commissioning: boolean;
  };
  scopeDescription: string;
  
  // Document Uploads (all support multiple files per category)
  unpricedPOFile: File[] | null;
  designInputsPID: File[] | null;
  clientReferenceDoc: File[] | null;
  otherDocuments: File[] | null;
  
  // Additional Information
  kickoffMeetingNotes: string;
  specialProductionNotes: string;
  
  // Equipment Details - will be populated from equipmentDetails state
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AddProjectForm = ({ onClose, onSubmit, editData, isEditMode }: AddProjectFormProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>(() => {
    if (isEditMode && editData) {
      // For edit mode, merge the editData with default values
    return {
        projectTitle: editData.projectTitle || '',
        clientName: editData.clientName || '',
        plantLocation: editData.plantLocation || '',
        poNumber: editData.poNumber || '',
        salesOrderDate: editData.salesOrderDate || '',
        completionDate: editData.completionDate || '',
        clientIndustry: editData.clientIndustry || '',
        projectManager: editData.projectManager || '',
        vdcrManager: editData.vdcrManager || '',
        consultant: editData.consultant || '',
        tpiAgency: editData.tpiAgency || '',
        clientFocalPoint: editData.clientFocalPoint || '',
        servicesIncluded: editData.servicesIncluded || {
          design: false,
          manufacturing: false,
          testing: false,
          documentation: false,
          installationSupport: false,
          commissioning: false
        },
        scopeDescription: editData.scopeDescription || '',
        unpricedPOFile: null, // File objects can't be restored
        designInputsPID: null,
        clientReferenceDoc: null,
        otherDocuments: null,
        kickoffMeetingNotes: editData.kickoffMeetingNotes || '',
        specialProductionNotes: editData.specialProductionNotes || ''
      };
    }
    
    const initialData = {
      projectTitle: '',
      clientName: '',
      plantLocation: '',
      poNumber: '',
      salesOrderDate: '',
      completionDate: '',
      clientIndustry: '',
      projectManager: '',
      vdcrManager: '',
      consultant: '',
      tpiAgency: '',
      clientFocalPoint: '',
      servicesIncluded: {
        design: false,
        manufacturing: false,
        testing: false,
        documentation: false,
        installationSupport: false,
        commissioning: false
      },
      scopeDescription: '',
      unpricedPOFile: null,
      designInputsPID: null,
      clientReferenceDoc: null,
      otherDocuments: null,
      kickoffMeetingNotes: '',
      specialProductionNotes: ''
    };
    
    return initialData;
  });

  // Sync formData with editData when editData changes (e.g., after project is updated and form is reopened)
  useEffect(() => {
    if (isEditMode && editData) {
      setFormData({
        projectTitle: editData.projectTitle || '',
        clientName: editData.clientName || '',
        plantLocation: editData.plantLocation || '',
        poNumber: editData.poNumber || '',
        salesOrderDate: editData.salesOrderDate || '',
        completionDate: editData.completionDate || '',
        clientIndustry: editData.clientIndustry || '',
        projectManager: editData.projectManager || '',
        vdcrManager: editData.vdcrManager || '',
        consultant: editData.consultant || '',
        tpiAgency: editData.tpiAgency || '',
        clientFocalPoint: editData.clientFocalPoint || '',
        servicesIncluded: editData.servicesIncluded || {
          design: false,
          manufacturing: false,
          testing: false,
          documentation: false,
          installationSupport: false,
          commissioning: false
        },
        scopeDescription: editData.scopeDescription || '',
        unpricedPOFile: null, // File objects can't be restored
        designInputsPID: null,
        clientReferenceDoc: null,
        otherDocuments: null,
        kickoffMeetingNotes: editData.kickoffMeetingNotes || '',
        specialProductionNotes: editData.specialProductionNotes || ''
      });
    }
  }, [isEditMode, editData?.projectTitle, editData?.clientIndustry, editData?.consultant, editData?.tpiAgency, editData?.vdcrManager, editData?.projectManager, editData?.clientName, editData?.plantLocation, editData?.poNumber]); // Sync when editData changes

  // Sync existingDocuments with editData when editData changes (for document preloading in edit mode)
  useEffect(() => {
    if (isEditMode && editData) {
      const rawUnpriced = (editData as any).unpricedPODocuments || [];
      const rawDesign = (editData as any).designInputsDocuments || [];
      const rawClient = (editData as any).clientReferenceDocuments || [];
      const rawOther = (editData as any).otherDocumentsLinks || [];
      
      console.log('📄 Loading documents in edit mode:', {
        unpricedPODocuments: rawUnpriced,
        designInputsDocuments: rawDesign,
        clientReferenceDocuments: rawClient,
        otherDocumentsLinks: rawOther
      });
      
      const normalized = {
        unpricedPODocuments: normalizeDocuments(rawUnpriced),
        designInputsDocuments: normalizeDocuments(rawDesign),
        clientReferenceDocuments: normalizeDocuments(rawClient),
        otherDocuments: normalizeDocuments(rawOther)
      };
      
      console.log('📄 Normalized documents:', normalized);
      
      setExistingDocuments(normalized);
    } else if (!isEditMode) {
      // Clear documents when not in edit mode
      setExistingDocuments({
        unpricedPODocuments: [],
        designInputsDocuments: [],
        clientReferenceDocuments: [],
        otherDocuments: []
      });
    }
  }, [isEditMode, editData]);

  // Load contact details for current project's managers when in edit mode
  useEffect(() => {
    const loadProjectManagerContacts = async () => {
      if (isEditMode && editData && (editData as any).id) {
        try {
          const projectId = (editData as any).id;
          const projectManagerName = editData.projectManager;
          const vdcrManagerName = editData.vdcrManager;
          
          console.log('📞 Loading contact details for project:', projectId);
          console.log('📞 Project Manager:', projectManagerName, 'VDCR Manager:', vdcrManagerName);
          
          // Fetch project members for this specific project
          // @ts-ignore - Supabase type inference issue
          const { data: projectMembers, error } = await supabase
            .from('project_members')
            .select('name, email, phone, role')
            .eq('project_id', projectId)
            .in('role', ['project_manager', 'vdcr_manager'])
            .eq('status', 'active');
          
          if (error) {
            console.error('❌ Error fetching project members for contact details:', error);
          } else if (projectMembers && projectMembers.length > 0) {
            console.log('📞 Found project members:', projectMembers);
            
            // Update contact details for Project Manager
            if (projectManagerName) {
              // @ts-ignore - Supabase type inference issue
              const pmMember = projectMembers.find((m: any) => 
                m.role === 'project_manager' && m.name === projectManagerName
              );
              
              if (pmMember) {
                // @ts-ignore - Supabase type inference issue
                console.log('📞 Updating Project Manager contact:', pmMember.name, pmMember.email, pmMember.phone);
                setProjectManagerContacts(prev => ({
                  ...prev,
                  // @ts-ignore - Supabase type inference issue
                  [pmMember.name]: {
                    // @ts-ignore - Supabase type inference issue
                    email: pmMember.email || '',
                    // @ts-ignore - Supabase type inference issue
                    phone: pmMember.phone || ''
                  }
                }));
              }
            }
            
            // Update contact details for VDCR Manager
            if (vdcrManagerName) {
              // @ts-ignore - Supabase type inference issue
              const vdcrMember = projectMembers.find((m: any) => 
                m.role === 'vdcr_manager' && m.name === vdcrManagerName
              );
              
              if (vdcrMember) {
                // @ts-ignore - Supabase type inference issue
                console.log('📞 Updating VDCR Manager contact:', vdcrMember.name, vdcrMember.email, vdcrMember.phone);
                setVdcrManagerContacts(prev => ({
                  ...prev,
                  // @ts-ignore - Supabase type inference issue
                  [vdcrMember.name]: {
                    // @ts-ignore - Supabase type inference issue
                    email: vdcrMember.email || '',
                    // @ts-ignore - Supabase type inference issue
                    phone: vdcrMember.phone || ''
                  }
                }));
              }
            }
          } else {
            console.log('📞 No project members found for this project');
          }
        } catch (error) {
          console.error('❌ Error loading project manager contacts:', error);
        }
      }
    };
    
    loadProjectManagerContacts();
  }, [isEditMode, editData, editData?.projectManager, editData?.vdcrManager]);

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [isAnimating, setIsAnimating] = useState(false);

  // Load existing equipment documents in edit mode AND extract custom equipment types
  useEffect(() => {
    const loadExistingEquipmentDocuments = async () => {
      if (isEditMode && editData && (editData as any).equipment) {
        try {
          const equipmentData = (editData as any).equipment;
          const documentsMap: Record<string, any[]> = {};
          
          // Standard equipment types that should NOT be added to customEquipmentTypes
          const standardEquipmentTypes = [
            'Heat Exchanger',
            'Pressure Vessel',
            'Reactor',
            'Storage Tank',
            'Distillation Column'
          ];
          
          // Extract custom equipment types from existing equipment
          const customTypes: string[] = [];
          Object.keys(equipmentData).forEach(equipmentType => {
            // Only add if it's not a standard type and not already in customTypes
            if (!standardEquipmentTypes.includes(equipmentType) && 
                !customTypes.includes(equipmentType) &&
                equipmentData[equipmentType] && 
                equipmentData[equipmentType].length > 0) {
              customTypes.push(equipmentType);
            }
          });
          
          // Set custom equipment types
          if (customTypes.length > 0) {
            // console.log('🔧 Found custom equipment types in edit mode:', customTypes);
            setCustomEquipmentType(customTypes);
          }
          
          // Load documents for all equipment in one batched API (same data as N × getDocumentsByEquipment)
          const allEquipmentIds: string[] = [];
          for (const equipmentType in equipmentData) {
            const equipmentList = equipmentData[equipmentType];
            for (const equipment of equipmentList) {
              if (equipment?.id) allEquipmentIds.push(equipment.id);
            }
          }
          try {
            const batchMap = await getEquipmentDocumentsForEquipmentIds(allEquipmentIds);
            for (const equipmentType in equipmentData) {
              const equipmentList = equipmentData[equipmentType];
              for (const equipment of equipmentList) {
                if (equipment?.id) {
                  const arr = batchMap[equipment.id];
                  documentsMap[equipment.id] = Array.isArray(arr) ? arr : [];
                }
              }
            }
          } catch (error) {
            console.error('❌ Batched equipment documents load failed:', error);
            for (const id of allEquipmentIds) {
              documentsMap[id] = [];
            }
          }

          setExistingEquipmentDocuments(documentsMap);
        } catch (error) {
          console.error('❌ Error loading existing equipment documents:', error);
        }
      }
    };

    loadExistingEquipmentDocuments();
  }, [isEditMode, editData]);

  // Reset accordion states when form is opened for new project
  useEffect(() => {
    if (!isEditMode) {
      setExpandedFields({});
      setShowAddNew({});
      setNewEntries({});
      setEditingEntries({});
    }
  }, [isEditMode]);
  
  // Accordion states for Step 1 - Reset when not in edit mode
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>(() => {
    // Reset accordion state for new projects, keep for edit mode
    return isEditMode ? {} : {};
  });
  const [showAddNew, setShowAddNew] = useState<Record<string, boolean>>(() => {
    // Reset add new state for new projects
    return isEditMode ? {} : {};
  });
  const [newEntries, setNewEntries] = useState<Record<string, string>>(() => {
    // Reset new entries for new projects
    return isEditMode ? {} : {};
  });
  const [editingEntries, setEditingEntries] = useState<Record<string, { index: number; value: string } | null>>(() => {
    // Reset editing entries for new projects
    return isEditMode ? {} : {};
  });
  const [forceRender, setForceRender] = useState(0);
  
  // Force re-render when editingEntries changes
  useEffect(() => {
    console.log('🔧 EditingEntries changed:', editingEntries);
  }, [editingEntries]);
  
  // Special state for Project Manager edit form
  const [editingProjectManager, setEditingProjectManager] = useState<{
    index: number;
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  
  // Special state for VDCR Manager edit form
  const [editingVdcrManager, setEditingVdcrManager] = useState<{
    index: number;
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  
  // Store Project Manager contact details (name -> {email, phone})
  const [projectManagerContacts, setProjectManagerContacts] = useState<Record<string, { email: string; phone: string }>>({});
  
  // Store VDCR Manager contact details (name -> {email, phone})
  const [vdcrManagerContacts, setVdcrManagerContacts] = useState<Record<string, { email: string; phone: string }>>({});
  
  // Store dynamic options for each field - completely dynamic from existing projects
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({
    clientName: [],
    clientIndustry: [],
    projectManager: [],
    vdcrManager: [],
    consultant: [],
    tpiAgency: [],
    plantLocation: []
  });

  // Search queries for each field
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    clientName: '',
    clientIndustry: '',
    projectManager: '',
    vdcrManager: '',
    consultant: '',
    tpiAgency: '',
    plantLocation: ''
  });

  // Fetch all firm team members for dropdowns (prefetched from entire firm portfolio)
  useEffect(() => {
    const fetchFirmTeamMembers = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const firmId = userData.firm_id;
        
        if (!firmId) {
          return;
        }

        // Fetch all team members from the firm's portfolio
        const allTeamMembers = await fastAPI.getAllFirmTeamMembers(firmId);
        
        if (allTeamMembers && Array.isArray(allTeamMembers) && allTeamMembers.length > 0) {
          // Filter by role for each dropdown
          const projectManagers = allTeamMembers
            .filter((member: any) => member.role === 'project_manager')
            .map((member: any) => member.name)
            .filter(Boolean);
          
          const vdcrManagers = allTeamMembers
            .filter((member: any) => member.role === 'vdcr_manager')
            .map((member: any) => member.name)
            .filter(Boolean);

          // Update dropdowns with role-filtered team members
          setDynamicOptions(prev => ({
            ...prev,
            projectManager: [...new Set([...prev.projectManager, ...projectManagers])],
            vdcrManager: [...new Set([...prev.vdcrManager, ...vdcrManagers])]
          }));

          // Store contact details for all team members
          const pmContacts: Record<string, { email: string; phone: string }> = {};
          const vdcrContacts: Record<string, { email: string; phone: string }> = {};

          allTeamMembers.forEach((member: any) => {
            if (member.name && member.email) {
              if (member.role === 'project_manager') {
                pmContacts[member.name] = {
                  email: member.email,
                  phone: member.phone || ''
                };
              } else if (member.role === 'vdcr_manager') {
                vdcrContacts[member.name] = {
                  email: member.email,
                  phone: member.phone || ''
                };
              }
            }
          });

          // Merge with existing contacts (don't overwrite, just add new ones)
          setProjectManagerContacts(prev => ({ ...prev, ...pmContacts }));
          setVdcrManagerContacts(prev => ({ ...prev, ...vdcrContacts }));
        }
      } catch (error) {
        console.error('❌ Error fetching firm team members:', error);
      }
    };

    fetchFirmTeamMembers();
  }, []);

  // Fetch existing projects to populate suggestions
  useEffect(() => {
    const fetchExistingProjects = async () => {
      try {
        // Get current user's firm_id
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const firmId = userData.firm_id;
        
        if (!firmId) {
          return;
        }

        // Fetch projects from Supabase
        const userRole = localStorage.getItem('userRole');
        const userId = localStorage.getItem('userId');
        const existingProjects = await fastAPI.getProjectsByFirm(firmId, userRole || undefined, userId || undefined);
        
        if (existingProjects && Array.isArray(existingProjects) && existingProjects.length > 0) {
          
          // Extract unique values from existing projects
          const uniqueClients = [...new Set(existingProjects.map((project: any) => project.client).filter(Boolean))];
          const uniqueManagers = [...new Set(existingProjects.map((project: any) => project.manager).filter(Boolean))];
          const uniqueLocations = [...new Set(existingProjects.map((project: any) => project.location).filter(Boolean))];
          const uniqueIndustries = [...new Set(existingProjects.map((project: any) => project.client_industry).filter(Boolean))];
          const uniqueVdcrManagers = [...new Set(existingProjects.map((project: any) => project.vdcr_manager).filter(Boolean))];
          const uniqueConsultants = [...new Set(existingProjects.map((project: any) => project.consultant).filter(Boolean))];
          const uniqueTpiAgencies = [...new Set(existingProjects.map((project: any) => project.tpi_agency).filter(Boolean))];
          
          // Standard industry options (always available)
          const standardIndustries = ['Petrochemical', 'Steel', 'Refinery', 'Marine', 'Power', 'Pharmaceutical', 'Chemical', 'Oil & Gas'];
          
          // Update dynamic options with existing data (merge with team members from firm portfolio)
          setDynamicOptions(prev => ({
            ...prev,
            clientName: uniqueClients,
            projectManager: [...new Set([...prev.projectManager, ...uniqueManagers])],
            plantLocation: uniqueLocations,
            clientIndustry: [...new Set([...standardIndustries, ...uniqueIndustries])],
            vdcrManager: [...new Set([...prev.vdcrManager, ...uniqueVdcrManagers])],
            consultant: uniqueConsultants,
            tpiAgency: uniqueTpiAgencies
          }));
          
          // Load contact details from database (merge with existing contacts)
          try {
            const { data: projectMembers, error } = await supabase
              .from('project_members')
              .select('name, email, phone, role')
              .in('role', ['project_manager', 'vdcr_manager'])
              .eq('status', 'active');
            
            if (error) {
              console.error('❌ Error fetching project members:', error);
            } else {
              const projectManagerContacts: Record<string, { email: string; phone: string }> = {};
              const vdcrManagerContacts: Record<string, { email: string; phone: string }> = {};
              
              projectMembers?.forEach((member: any) => {
                if (member.name && member.email) {
                  if (member.role === 'project_manager') {
                    projectManagerContacts[member.name] = { 
                      email: member.email, 
                      phone: member.phone || ''
                    };
                  } else if (member.role === 'vdcr_manager') {
                    vdcrManagerContacts[member.name] = { 
                      email: member.email, 
                      phone: member.phone || ''
                    };
                  }
                }
              });
              
              // Merge with existing contacts (don't overwrite)
              setProjectManagerContacts(prev => ({ ...prev, ...projectManagerContacts }));
              setVdcrManagerContacts(prev => ({ ...prev, ...vdcrManagerContacts }));
            }
          } catch (error) {
            console.error('❌ Error loading contact details:', error);
          }
          
        } else {
          // Set only standard industry options when no projects exist
          const standardIndustries = ['Petrochemical', 'Steel', 'Refinery', 'Marine', 'Power', 'Pharmaceutical', 'Chemical', 'Oil & Gas'];
          setDynamicOptions(prev => ({
            ...prev,
            clientIndustry: standardIndustries
          }));
        }
        
      } catch (error) {
        console.error('❌ Error fetching existing projects for suggestions:', error);
        
        // Set only standard industry options on error
        const standardIndustries = ['Petrochemical', 'Steel', 'Refinery', 'Marine', 'Power', 'Pharmaceutical', 'Chemical', 'Oil & Gas'];
        setDynamicOptions(prev => ({
          ...prev,
          clientIndustry: standardIndustries
        }));
      }
    };

    // Always fetch suggestions for both new and edit modes
    fetchExistingProjects();
  }, []);

  // Equipment state - empty for new projects, populated for edit mode
  const [equipmentDetails, setEquipmentDetails] = useState<Record<string, Array<{
    id: string;
    tagNumber: string;
    jobNumber: string;
    manufacturingSerial: string;
    size: string;
    material: string;
    designCode: string;
    documents: File[];
  }>>>(isEditMode && editData ? (editData as any).equipment || {} : {});
  
  // Helper function to normalize documents (handles both {document_name, file_url} from tables and {name, url} from JSONB)
  function normalizeDocuments(docs: any[]) {
    if (!Array.isArray(docs)) return [];
    return docs.map((doc: any) => ({
      ...doc,
      name: doc.document_name || doc.name || '',
      url: doc.file_url || doc.url || doc.document_url || ''
    }));
  }

  // Existing document links state for edit mode
  const [existingDocuments, setExistingDocuments] = useState<{
    unpricedPODocuments: any[];
    designInputsDocuments: any[];
    clientReferenceDocuments: any[];
    otherDocuments: any[];
  }>(() => {
    if (isEditMode && editData) {
      return {
        unpricedPODocuments: normalizeDocuments((editData as any).unpricedPODocuments || []),
        designInputsDocuments: normalizeDocuments((editData as any).designInputsDocuments || []),
        clientReferenceDocuments: normalizeDocuments((editData as any).clientReferenceDocuments || []),
        otherDocuments: normalizeDocuments((editData as any).otherDocumentsLinks || [])
      };
    }
    return {
      unpricedPODocuments: [],
      designInputsDocuments: [],
      clientReferenceDocuments: [],
      otherDocuments: []
    };
  });

  // Existing equipment documents state for edit mode
  const [existingEquipmentDocuments, setExistingEquipmentDocuments] = useState<Record<string, any[]>>({});
  
  // Track deleted documents (to be processed on save)
  const [deletedDocuments, setDeletedDocuments] = useState<Array<{
    documentId: string;
    documentType: 'unpriced_po_documents' | 'design_inputs_documents' | 'client_reference_documents' | 'other_documents';
  }>>([]);
  
  // Custom equipment types state
  const [customEquipmentTypes, setCustomEquipmentType] = useState<string[]>([]);
  const [showAddEquipmentType, setShowAddEquipmentType] = useState(false);
  const [newEquipmentType, setNewEquipmentType] = useState('');
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [createdProject, setCreatedProject] = useState<any>(null);
  const [showRoleAssignment, setShowRoleAssignment] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');



  const handleInputChange = (field: keyof ProjectFormData, value: string | File | File[] | null | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSmartDocumentUpload = async (file: File | null) => {
    if (!file) return;

    try {
      
      // Show loading state
      toast({
        title: "Processing Document",
        description: "Please wait while we extract data!",
        variant: "default"
      });
      
      // Extract text from document based on file type
      let extractedText = '';
      
      
      // Check file extension first (more reliable than MIME type)
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        extractedText = await extractTextFromExcel(file);
      } else if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
        extractedText = await extractTextFromWord(file);
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        extractedText = await extractTextFromPDF(file);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        extractedText = await file.text();
      } else if (file.type === 'text/plain') {
        extractedText = await file.text();
      } else if (file.type === 'application/pdf') {
        extractedText = await extractTextFromPDF(file);
      } else if (file.type.includes('word') || file.type.includes('document')) {
        extractedText = await extractTextFromWord(file);
      } else if (file.type.includes('sheet') || file.type.includes('excel')) {
        extractedText = await extractTextFromExcel(file);
      } else {
        toast({
          title: "Unsupported File Type",
          description: "Please upload PDF, Word, Excel, or text files.",
          variant: "destructive"
        });
        return;
      }
      
      
      // Parse extracted text and auto-fill form
      const parsedData = parseDocumentText(extractedText);
      
      // Auto-fill form fields
      setFormData(prev => {
        const newData = {
          ...prev,
          ...parsedData
        };
        // console.log('📄 New form data:', newData);
        return newData;
      });
      
      // Show what was filled
      const filledFields = Object.keys(parsedData).filter(key => parsedData[key as keyof typeof parsedData]);
      // console.log('📄 Filled fields:', filledFields);
      
      if (filledFields.length > 0) {
        toast({
          title: "Document Processed",
          description: `Form fields have been auto-filled: ${filledFields.join(', ')}. Please review and complete remaining fields.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Document Processed",
          description: "No fields could be auto-filled. Please fill the form manually.",
          variant: "default"
        });
      }
      
    } catch (error) {
      console.error('❌ Error processing document:', error);
      toast({
        title: "Error",
        description: "Error processing document. Please try again or fill the form manually.",
        variant: "destructive"
      });
    }
  };

  // Document text extraction functions using CDN
  const extractTextFromPDF = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Load PDF.js from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = async () => {
        try {
          // @ts-ignore
          const pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          
          resolve(fullText);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js'));
      document.head.appendChild(script);
    });
  };

  const extractTextFromWord = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Load mammoth.js from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = async () => {
        try {
          // @ts-ignore
          const mammoth = window.mammoth;
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error('Failed to load mammoth.js'));
      document.head.appendChild(script);
    });
  };

  const extractTextFromExcel = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Check if XLSX is already loaded
      // @ts-ignore
      if (window.XLSX) {
        processExcelFile(file).then(resolve).catch(reject);
        return;
      }
      
      // Load xlsx from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = async () => {
        try {
          await processExcelFile(file);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error('Failed to load xlsx library'));
      document.head.appendChild(script);
      
      async function processExcelFile(file: File): Promise<string> {
        let fullText = '';
        try {
          // @ts-ignore
          const XLSX = window.XLSX;
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          
          // console.log('📊 Excel workbook loaded:', workbook.SheetNames);
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            // console.log('📊 Processing sheet:', sheetName);
            
            // Try different methods to extract data
            try {
              // Method 1: Convert to JSON with headers
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
              // console.log('📊 Sheet data (JSON):', jsonData);
              
              // Process headers and data separately
              if (jsonData.length >= 2) {
                const headers = jsonData[0];
                const dataRow = jsonData[1];
                
                // console.log('📊 Headers:', headers);
                // console.log('📊 Data row:', dataRow);
                
                // Create structured text with field: value format
                headers.forEach((header: any, index: number) => {
                  if (header && dataRow[index]) {
                    const fieldName = header.toString().trim();
                    const fieldValue = dataRow[index].toString().trim();
                    if (fieldName && fieldValue) {
                      fullText += `${fieldName}: ${fieldValue}\n`;
                    }
                  }
                });
              } else {
                // Fallback to original method
                jsonData.forEach((row: any, index: number) => {
                  if (Array.isArray(row)) {
                    const rowText = row.filter(cell => cell && cell.toString().trim()).join(' ');
                    if (rowText.trim()) {
                      fullText += rowText + '\n';
                    }
                  }
                });
              }
            } catch (jsonError) {
              // console.warn('📊 JSON conversion failed, trying CSV:', jsonError);
              
              // Method 2: Convert to CSV
              try {
                const csvData = XLSX.utils.sheet_to_csv(worksheet);
                fullText += csvData + '\n';
              } catch (csvError) {
                console.warn('📊 CSV conversion failed:', csvError);
                
                // Method 3: Direct cell reading
                const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
                for (let row = range.s.r; row <= range.e.r; row++) {
                  for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    const cell = worksheet[cellAddress];
                    if (cell && cell.v) {
                      fullText += cell.v.toString() + ' ';
                    }
                  }
                  fullText += '\n';
                }
              }
            }
          });
          
          // If no data extracted, provide sample data for testing
          if (!fullText.trim()) {
            // console.log('📊 No data extracted, providing sample data');
            fullText = `Project: Petrochemical Plant Expansion
Client: Reliance Industries Ltd
Location: Jamnagar, Gujarat
PO Number: PO-2025-001
Manager: Rajesh Kumar
Deadline: 2025-06-30
Scope: Design and manufacturing of pressure vessels and heat exchangers
Services: Design, Manufacturing, Testing, Documentation
Industry: Petrochemical`;
          }
          
          // console.log('📊 Final extracted text:', fullText);
          resolve(fullText);
        } catch (error) {
          console.error('📊 Excel processing error:', error);
          // Provide fallback data for testing
          const fallbackText = `Project: Petrochemical Plant Expansion
Client: Reliance Industries Ltd
Location: Jamnagar, Gujarat
PO Number: PO-2025-001
Manager: Rajesh Kumar
Deadline: 2025-06-30
Scope: Design and manufacturing of pressure vessels and heat exchangers
Services: Design, Manufacturing, Testing, Documentation
Industry: Petrochemical`;
          // console.log('📊 Using fallback data:', fallbackText);
          resolve(fallbackText);
        }
        return fullText;
      }
    });
  };

  // Intelligent text parsing function
  const parseDocumentText = (text: string): Partial<ProjectFormData> => {
    const parsedData: Partial<ProjectFormData> = {};
    
    // Convert text to lowercase for case-insensitive matching
    const lowerText = text.toLowerCase();
    
    // Extract project title - multiple patterns
    const projectTitlePatterns = [
      /(?:project title[:\s]*)([^\n\r]+)/i,
      /(?:project[:\s]*|title[:\s]*|project name[:\s]*)([^\n\r]+)/i,
      /(?:name[:\s]*)([^\n\r]*project[^\n\r]*)/i,
      /(?:project[:\s]*)([^\n\r]*expansion[^\n\r]*)/i,
      /(?:project[:\s]*)([^\n\r]*upgrade[^\n\r]*)/i,
      /(?:project[:\s]*)([^\n\r]*facility[^\n\r]*)/i
    ];
    
    for (const pattern of projectTitlePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.projectTitle = match[1].trim();
        break;
      }
    }
    
    // Extract client name - multiple patterns
    const clientPatterns = [
      /(?:client name[:\s]*)([^\n\r]+)/i,
      /(?:client[:\s]*|customer[:\s]*|company[:\s]*|organization[:\s]*)([^\n\r]+)/i,
      /(?:for[:\s]*)([^\n\r]*ltd[^\n\r]*)/i,
      /(?:for[:\s]*)([^\n\r]*industries[^\n\r]*)/i,
      /(?:for[:\s]*)([^\n\r]*corporation[^\n\r]*)/i
    ];
    
    for (const pattern of clientPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.clientName = match[1].trim();
        break;
      }
    }
    
    // Extract location - multiple patterns
    const locationPatterns = [
      /(?:plant location[:\s]*)([^\n\r]+)/i,
      /(?:location[:\s]*|plant[:\s]*|site[:\s]*|address[:\s]*)([^\n\r]+)/i,
      /(?:at[:\s]*)([^\n\r]*gujarat[^\n\r]*)/i,
      /(?:at[:\s]*)([^\n\r]*maharashtra[^\n\r]*)/i,
      /(?:at[:\s]*)([^\n\r]*haryana[^\n\r]*)/i,
      /(?:at[:\s]*)([^\n\r]*telangana[^\n\r]*)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.plantLocation = match[1].trim();
        break;
      }
    }
    
    // Extract PO number - multiple patterns
    const poPatterns = [
      /(?:po number[:\s]*)([^\n\r]+)/i,
      /(?:po[:\s]*|purchase order[:\s]*|order[:\s]*)([^\n\r]+)/i,
      /(?:order no[:\s]*|order number[:\s]*)([^\n\r]+)/i,
      /(po-\d{4}-\d{3,4})/i,
      /(order-\d{4}-\d{3,4})/i
    ];
    
    for (const pattern of poPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.poNumber = match[1].trim();
        break;
      }
    }
    
    // Extract manager - multiple patterns
    const managerPatterns = [
      /(?:project manager[:\s]*)([^\n\r]+)/i,
      /(?:manager[:\s]*|pm[:\s]*)([^\n\r]+)/i,
      /(?:responsible[:\s]*)([^\n\r]*manager[^\n\r]*)/i,
      /(?:contact[:\s]*)([^\n\r]*manager[^\n\r]*)/i
    ];
    
    for (const pattern of managerPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.projectManager = match[1].trim();
        break;
      }
    }
    
    // Extract deadline/completion date - multiple patterns
    const datePatterns = [
      /(?:deadline[:\s]*|completion[:\s]*|due[:\s]*|delivery[:\s]*)([^\n\r]+)/i,
      /(?:by[:\s]*)(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(?:by[:\s]*)(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
      /(?:target[:\s]*)([^\n\r]*date[^\n\r]*)/i
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        const dateStr = match[1].trim();
        // Try to parse date
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          parsedData.completionDate = date.toISOString().split('T')[0];
          break;
        }
      }
    }
    
    // Extract scope of work - multiple patterns
    const scopePatterns = [
      /(?:scope[:\s]*|description[:\s]*|work[:\s]*|scope of work[:\s]*)([^\n\r]+)/i,
      /(?:includes[:\s]*)([^\n\r]+)/i,
      /(?:involves[:\s]*)([^\n\r]+)/i,
      /(?:consists[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of scopePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 10) {
        parsedData.scopeDescription = match[1].trim();
        break;
      }
    }
    
    // Extract industry - enhanced patterns
    if (lowerText.includes('petrochemical') || lowerText.includes('chemical') || lowerText.includes('refinery')) {
      parsedData.clientIndustry = 'Petrochemical';
    } else if (lowerText.includes('pharmaceutical') || lowerText.includes('pharma') || lowerText.includes('drug')) {
      parsedData.clientIndustry = 'Pharmaceutical';
    } else if (lowerText.includes('oil') || lowerText.includes('gas') || lowerText.includes('ongc')) {
      parsedData.clientIndustry = 'Oil & Gas';
    } else if (lowerText.includes('power') || lowerText.includes('energy') || lowerText.includes('electricity')) {
      parsedData.clientIndustry = 'Power & Energy';
    } else if (lowerText.includes('steel') || lowerText.includes('metal') || lowerText.includes('iron')) {
      parsedData.clientIndustry = 'Steel & Metal';
    } else if (lowerText.includes('cement') || lowerText.includes('construction')) {
      parsedData.clientIndustry = 'Construction';
    }
    
    // Extract services included based on keywords - enhanced
    const services: any = {
      design: lowerText.includes('design') || lowerText.includes('engineering') || lowerText.includes('drawing') || lowerText.includes('cad'),
      manufacturing: lowerText.includes('manufacturing') || lowerText.includes('fabrication') || lowerText.includes('production') || lowerText.includes('assembly'),
      testing: lowerText.includes('testing') || lowerText.includes('inspection') || lowerText.includes('quality') || lowerText.includes('ndt'),
      documentation: lowerText.includes('documentation') || lowerText.includes('certification') || lowerText.includes('manual') || lowerText.includes('report'),
      installationSupport: lowerText.includes('installation') || lowerText.includes('erection') || lowerText.includes('commissioning') || lowerText.includes('startup'),
      commissioning: lowerText.includes('commissioning') || lowerText.includes('startup') || lowerText.includes('handover') || lowerText.includes('acceptance')
    };
    
    parsedData.servicesIncluded = services;
    
    // Extract additional fields
    // Sales Order Date
    const salesOrderPatterns = [
      /(?:sales order date[:\s]*)([^\n\r]+)/i,
      /(?:sales order[:\s]*|so[:\s]*|order date[:\s]*)([^\n\r]+)/i,
      /(?:received[:\s]*)([^\n\r]*date[^\n\r]*)/i
    ];
    
    for (const pattern of salesOrderPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        const dateStr = match[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          parsedData.salesOrderDate = date.toISOString().split('T')[0];
          break;
        }
      }
    }
    
    // Completion Date
    const completionDatePatterns = [
      /(?:completion date[:\s]*)([^\n\r]+)/i,
      /(?:deadline[:\s]*|completion[:\s]*|due[:\s]*|delivery[:\s]*)([^\n\r]+)/i,
      /(?:by[:\s]*)(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(?:by[:\s]*)(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
      /(?:target[:\s]*)([^\n\r]*date[^\n\r]*)/i
    ];
    
    for (const pattern of completionDatePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        const dateStr = match[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          parsedData.completionDate = date.toISOString().split('T')[0];
          break;
        }
      }
    }
    
    // VDCR Manager
    const vdcrPatterns = [
      /(?:vdcr manager[:\s]*)([^\n\r]+)/i,
      /(?:vdcr[:\s]*|quality[:\s]*|inspection[:\s]*)([^\n\r]*manager[^\n\r]*)/i,
      /(?:quality[:\s]*)([^\n\r]*lead[^\n\r]*)/i
    ];
    
    for (const pattern of vdcrPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.vdcrManager = match[1].trim();
        break;
      }
    }
    
    // Consultant
    const consultantPatterns = [
      /(?:consultant[:\s]*)([^\n\r]+)/i,
      /(?:consulting[:\s]*)([^\n\r]+)/i,
      /(?:advisor[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of consultantPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.consultant = match[1].trim();
        break;
      }
    }
    
    // TPI Agency
    const tpiPatterns = [
      /(?:tpi agency[:\s]*)([^\n\r]+)/i,
      /(?:tpi[:\s]*|third party[:\s]*|inspection[:\s]*)([^\n\r]*agency[^\n\r]*)/i,
      /(?:bureau[:\s]*)([^\n\r]+)/i,
      /(?:sgs[:\s]*|tuv[:\s]*|dnv[:\s]*)/i
    ];
    
    for (const pattern of tpiPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.tpiAgency = match[1].trim();
        break;
      }
    }
    
    // Client Focal Point
    const focalPointPatterns = [
      /(?:client focal point[:\s]*)([^\n\r]+)/i,
      /(?:focal point[:\s]*|contact[:\s]*|representative[:\s]*)([^\n\r]+)/i,
      /(?:client[:\s]*)([^\n\r]*contact[^\n\r]*)/i
    ];
    
    for (const pattern of focalPointPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.clientFocalPoint = match[1].trim();
        break;
      }
    }
    
    // Total Value
    const totalValuePatterns = [
      /(?:total value[:\s]*)([^\n\r]+)/i,
      /(?:value[:\s]*|amount[:\s]*|cost[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of totalValuePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        // Store in a custom field or notes
        if (!parsedData.kickoffMeetingNotes) {
          parsedData.kickoffMeetingNotes = `Total Value: ${match[1].trim()}`;
        } else {
          parsedData.kickoffMeetingNotes += `\nTotal Value: ${match[1].trim()}`;
        }
        break;
      }
    }
    
    // Payment Terms
    const paymentTermsPatterns = [
      /(?:payment terms[:\s]*)([^\n\r]+)/i,
      /(?:terms[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of paymentTermsPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        if (!parsedData.kickoffMeetingNotes) {
          parsedData.kickoffMeetingNotes = `Payment Terms: ${match[1].trim()}`;
        } else {
          parsedData.kickoffMeetingNotes += `\nPayment Terms: ${match[1].trim()}`;
        }
        break;
      }
    }
    
    // Payment Milestones
    const paymentMilestonesPatterns = [
      /(?:payment milestones[:\s]*)([^\n\r]+)/i,
      /(?:milestones[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of paymentMilestonesPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        if (!parsedData.kickoffMeetingNotes) {
          parsedData.kickoffMeetingNotes = `Payment Milestones: ${match[1].trim()}`;
        } else {
          parsedData.kickoffMeetingNotes += `\nPayment Milestones: ${match[1].trim()}`;
        }
        break;
      }
    }
    
    // Kickoff Notes
    const kickoffNotesPatterns = [
      /(?:kickoff notes[:\s]*)([^\n\r]+)/i,
      /(?:kickoff[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of kickoffNotesPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        if (!parsedData.kickoffMeetingNotes) {
          parsedData.kickoffMeetingNotes = match[1].trim();
        } else {
          parsedData.kickoffMeetingNotes += `\n${match[1].trim()}`;
        }
        break;
      }
    }
    
    // Production Notes
    const productionNotesPatterns = [
      /(?:production notes[:\s]*)([^\n\r]+)/i,
      /(?:production[:\s]*)([^\n\r]+)/i
    ];
    
    for (const pattern of productionNotesPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 3) {
        parsedData.specialProductionNotes = match[1].trim();
        break;
      }
    }
    
    // Equipment counts
    const equipmentCounts = {
      'Heat Exchanger': 0,
      'Pressure Vessel': 0,
      'Reactor': 0,
      'Storage Tank': 0,
      'Distillation Column': 0
    };
    
    // Extract equipment counts
    Object.keys(equipmentCounts).forEach(equipmentType => {
      const pattern = new RegExp(`(?:${equipmentType.toLowerCase()}[:\s]*)(\\d+)`, 'i');
      const match = text.match(pattern);
      if (match) {
        equipmentCounts[equipmentType as keyof typeof equipmentCounts] = parseInt(match[1]) || 0;
      }
    });
    
    // Store equipment counts in notes
    const equipmentNotes = Object.entries(equipmentCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    
    if (equipmentNotes) {
      if (!parsedData.kickoffMeetingNotes) {
        parsedData.kickoffMeetingNotes = `Equipment: ${equipmentNotes}`;
      } else {
        parsedData.kickoffMeetingNotes += `\nEquipment: ${equipmentNotes}`;
      }
    }
    
    return parsedData;
  };

  const handleServiceChange = (service: keyof ProjectFormData['servicesIncluded'], checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      servicesIncluded: {
        ...prev.servicesIncluded,
        [service]: checked
      }
    }));
  };

  // Handle document deletion in edit mode (only updates local state, actual deletion happens on save)
  const handleDeleteDocument = (documentId: string, documentType: 'unpricedPODocuments' | 'designInputsDocuments' | 'clientReferenceDocuments' | 'otherDocuments', index: number) => {
    if (!isEditMode || !editData) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this document?');
    if (!confirmed) {
      return;
    }

    // Map frontend document type to backend document type
    const typeMap: Record<string, 'unpriced_po_documents' | 'design_inputs_documents' | 'client_reference_documents' | 'other_documents'> = {
      'unpricedPODocuments': 'unpriced_po_documents',
      'designInputsDocuments': 'design_inputs_documents',
      'clientReferenceDocuments': 'client_reference_documents',
      'otherDocuments': 'other_documents'
    };

    const backendType = typeMap[documentType];
    if (!backendType) {
      console.error('Invalid document type');
      return;
    }

    // Get the document to track its ID
    const docsArray = existingDocuments[documentType as keyof typeof existingDocuments];
    const docToDelete = Array.isArray(docsArray) ? docsArray[index] : null;
    
    if (docToDelete) {
      // Track deletion (will be processed on save)
      setDeletedDocuments(prev => [...prev, {
        documentId: docToDelete.id || docToDelete.document_name || documentId,
        documentType: backendType
      }]);
    }

    // Update local state - remove the document from the array by ID
    setExistingDocuments(prev => {
      const updated = { ...prev };
      const docsArray = prev[documentType as keyof typeof prev];
      if (Array.isArray(docsArray)) {
        (updated as any)[documentType] = docsArray.filter((doc: any, i: number) => {
          // Filter by ID, document_name, or index as fallback
          return doc.id !== documentId && doc.document_name !== documentId && i !== index;
        });
      }
      return updated;
    });

    toast({
      title: 'Document marked for deletion',
      description: 'Document will be deleted when you save the project',
      variant: 'default'
    });
  };

  const handleFileUpload = (field: keyof ProjectFormData, file: File | File[] | null) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const toggleAccordion = (field: string) => {
    setExpandedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const showAddNewForm = (field: string) => {
    setShowAddNew(prev => ({ ...prev, [field]: true }));
    setNewEntries(prev => ({ ...prev, [field]: '' }));
  };

  const addNewEntry = (field: string) => {
    if (newEntries[field]?.trim()) {
      if (field === 'projectManager' || field === 'vdcrManager') {
        // Special handling for Project Manager and VDCR Manager with contact details
        const email = newEntries[`${field}_email`]?.trim() || '';
        const phone = newEntries[`${field}_phone`]?.trim() || '';
        const name = newEntries[field].trim();
        
        // Store the name in the visible options (for display)
        setDynamicOptions(prev => ({
          ...prev,
          [field]: [...(prev[field] || []), name]
        }));
        
        // Store contact details for future editing
        if (field === 'projectManager') {
          setProjectManagerContacts(prev => ({
            ...prev,
            [name]: { email, phone }
          }));
        } else if (field === 'vdcrManager') {
          setVdcrManagerContacts(prev => ({
            ...prev,
            [name]: { email, phone }
          }));
        }
        
        // Update the form data with just the name
        handleInputChange(field as keyof ProjectFormData, name);
        
        // Close the form and clear all fields
        setShowAddNew(prev => ({ ...prev, [field]: false }));
        setNewEntries(prev => ({ 
          ...prev, 
          [field]: '',
          [`${field}_email`]: '',
          [`${field}_phone`]: ''
        }));
      } else {
        // Standard handling for other fields
        // Add to dynamic options
        setDynamicOptions(prev => ({
          ...prev,
          [field]: [...(prev[field] || []), newEntries[field].trim()]
        }));
        
        // Update the form data with the new value
        handleInputChange(field as keyof ProjectFormData, newEntries[field].trim());
        
        // Close the form
        setShowAddNew(prev => ({ ...prev, [field]: false }));
        setNewEntries(prev => ({ ...prev, [field]: '' }));
      }
    }
  };

  const startEditingEntry = async (field: string, index: number, value: string) => {
    console.log('🔧 Starting edit for field:', field, 'index:', index, 'value:', value);
    console.log('🔧 Current contacts state - PM:', projectManagerContacts, 'VDCR:', vdcrManagerContacts);
    
    if (field === 'projectManager') {
      // Get contact details from stored contacts immediately
      let contact = projectManagerContacts[value] || { email: '', phone: '' };
      
      // If contact details are missing and we're in edit mode, try to fetch them
      if ((!contact.email && !contact.phone) && isEditMode && editData && (editData as any).id) {
        console.log('🔧 Contact details missing, fetching from database...');
        try {
          const projectId = (editData as any).id;
          // @ts-ignore - Supabase type inference issue
          const { data: members, error } = await supabase
            .from('project_members')
            .select('name, email, phone, role')
            .eq('project_id', projectId)
            .eq('role', 'project_manager')
            .eq('name', value)
            .eq('status', 'active')
            .limit(1);
          
          if (!error && members && members.length > 0) {
            const member = members[0];
            contact = {
              email: member.email || '',
              phone: member.phone || ''
            };
            console.log('🔧 Fetched contact details:', contact);
            // Update state for future use
            setProjectManagerContacts(prev => ({
              ...prev,
              [value]: contact
            }));
          }
        } catch (error) {
          console.error('❌ Error fetching contact details:', error);
        }
      }
      
      // Set editing state with contact details
      const newEditingState = {
        index,
        name: value,
        email: contact.email || '',
        phone: contact.phone || ''
      };
      
      console.log('🔧 Setting editing state for Project Manager:', newEditingState);
      setEditingProjectManager(newEditingState);
      setForceRender(prev => prev + 1);
    } else if (field === 'vdcrManager') {
      // Get contact details from stored contacts immediately
      let contact = vdcrManagerContacts[value] || { email: '', phone: '' };
      
      // If contact details are missing and we're in edit mode, try to fetch them
      if ((!contact.email && !contact.phone) && isEditMode && editData && (editData as any).id) {
        console.log('🔧 Contact details missing, fetching from database...');
        try {
          const projectId = (editData as any).id;
          // @ts-ignore - Supabase type inference issue
          const { data: members, error } = await supabase
            .from('project_members')
            .select('name, email, phone, role')
            .eq('project_id', projectId)
            .eq('role', 'vdcr_manager')
            .eq('name', value)
            .eq('status', 'active')
            .limit(1);
          
          if (!error && members && members.length > 0) {
            const member = members[0];
            contact = {
              email: member.email || '',
              phone: member.phone || ''
            };
            console.log('🔧 Fetched contact details:', contact);
            // Update state for future use
            setVdcrManagerContacts(prev => ({
              ...prev,
              [value]: contact
            }));
          }
        } catch (error) {
          console.error('❌ Error fetching contact details:', error);
        }
      }
      
      // Set editing state with contact details
      const newEditingState = {
        index,
        name: value,
        email: contact.email || '',
        phone: contact.phone || ''
      };
      
      console.log('🔧 Setting editing state for VDCR Manager:', newEditingState);
      setEditingVdcrManager(newEditingState);
      setForceRender(prev => prev + 1);
    } else {
      // console.log('🔧 Setting editing state for field:', field, 'with value:', value);
      setEditingEntries(prev => {
        const newState = { ...prev, [field]: { index, value } };
        // console.log('🔧 New editing state:', newState);
        return newState;
      });
      
      // Force re-render
      setForceRender(prev => prev + 1);
    }
  };

  const saveEditedEntry = async (field: string) => {
    const editing = editingEntries[field];
    // console.log('💾 🎯 SAVE FUNCTION CALLED for field:', field);
    // console.log('💾 🎯 Current editingEntries state:', editingEntries);
    // console.log('💾 🎯 Editing object for field:', editing);
    // console.log('💾 🎯 Field value to save:', editing?.value);
    
    if (editing && editing.value.trim()) {
      const oldValue = dynamicOptions[field][editing.index];
      const newValue = editing.value.trim();
      
      // Update local state first
      setDynamicOptions(prev => {
        const updatedOptions = prev[field].map((option, i) => 
          i === editing.index ? newValue : option
        );
        
        // console.log('💾 Updated options for field:', field, 'new options:', updatedOptions);
        
        // If the edited value is currently selected, update the form data
        if (formData[field as keyof ProjectFormData] === oldValue) {
          // console.log('💾 Updating form data for field:', field, 'new value:', newValue);
          handleInputChange(field as keyof ProjectFormData, newValue);
        }
        
        return {
          ...prev,
          [field]: updatedOptions
        };
      });
      
      // Persist edited suggestion values only in edit mode.
      // In create mode, avoid background API traffic while user fills the form.
      if (isEditMode && editData && (editData as any).id) {
        const fieldMapping: Record<string, string> = {
          clientName: 'client',
          plantLocation: 'location',
          clientIndustry: 'client_industry',
          projectManager: 'manager',
          vdcrManager: 'vdcr_manager',
          consultant: 'consultant',
          tpiAgency: 'tpi_agency',
          clientFocalPoint: 'client_focal_point'
        };
        
        const dbField = fieldMapping[field];
        if (dbField) {
          (async () => {
            try {
              const updateData: Record<string, string> = { [dbField]: newValue };
              // @ts-ignore - Supabase type inference issue with dynamic field names
              await supabase
                .from('projects')
                .update(updateData)
                .eq(dbField, oldValue)
                .select();
            } catch (dbError: any) {
              console.error('❌ Error persisting edited suggestion:', dbError?.message || dbError);
            }
          })();
        }
      }
      
      setEditingEntries(prev => ({ ...prev, [field]: null }));
      setForceRender(prev => prev + 1);
    }
  };

  const cancelEditingEntry = (field: string) => {
    setEditingEntries(prev => ({ ...prev, [field]: null }));
    setForceRender(prev => prev + 1);
  };

  const saveProjectManagerEdit = async (e?: React.MouseEvent) => {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      console.log('💾 Save Project Manager clicked', { editingProjectManager });
      
      if (!editingProjectManager) {
        console.warn('⚠️ No Project Manager being edited');
        toast({
          title: "Error",
          description: "No Project Manager selected for editing",
          variant: "destructive",
        });
        return;
      }
      
      if (!editingProjectManager.name || !editingProjectManager.name.trim()) {
        toast({
          title: "Validation Error",
          description: "Please enter a name for the Project Manager",
          variant: "destructive",
        });
        return;
      }
      
      const oldName = dynamicOptions.projectManager[editingProjectManager.index] || editingProjectManager.name;
      const newName = editingProjectManager.name.trim();
      // Capture email and phone before clearing editingProjectManager
      const savedEmail = editingProjectManager.email || '';
      const savedPhone = editingProjectManager.phone || '';
      
      console.log('💾 Saving Project Manager - old name:', oldName, 'new name:', newName, 'email:', savedEmail, 'phone:', savedPhone);
      
      setDynamicOptions(prev => {
        const updatedOptions = prev.projectManager.map((option, i) => 
          i === editingProjectManager.index ? newName : option
        );
        
        // If the edited value is currently selected, update the form data
        if (formData.projectManager === oldName) {
          handleInputChange('projectManager', newName);
        }
        
        return {
          ...prev,
          projectManager: updatedOptions
        };
      });
      
      // Update stored contact details FIRST (so they're saved even if DB fails)
      setProjectManagerContacts(prev => {
        const newContacts = { ...prev };
        // Remove old name entry and add new name entry
        if (oldName !== newName) {
          delete newContacts[oldName];
        }
        newContacts[newName] = {
          email: savedEmail,
          phone: savedPhone
        };
        console.log('✅ Contact details updated in state:', newContacts[newName]);
        return newContacts;
      });
      
      // Close edit mode and accordion IMMEDIATELY (don't wait for DB)
      setEditingProjectManager(null);
      setExpandedFields(prev => ({ ...prev, projectManager: false }));
      setForceRender(prev => prev + 1);
      
      // Save to database in background (non-blocking)
      (async () => {
        try {
          console.log('💾 Starting database update for Project Manager...');
          console.log('💾 isEditMode:', isEditMode);
          console.log('💾 editData:', editData);
          
          // Get project ID if in edit mode
          const projectId = isEditMode && editData ? (editData as any).id : null;
          console.log('💾 projectId:', projectId);
          console.log('💾 Saving - oldName:', oldName, 'newName:', newName, 'email:', savedEmail, 'phone:', savedPhone);
          
          if (projectId) {
            // Update specific project in edit mode
            const updateData: Record<string, string> = { manager: newName };
            // @ts-ignore - Supabase type inference issue
            const { data, error } = await supabase
              .from('projects')
              .update(updateData)
              .eq('id', projectId)
              .select();
            
            if (error) {
              console.error('❌ Database update failed:', error);
              toast({
                title: "Warning",
                description: `Project Manager saved locally, but database update failed: ${error.message}`,
                variant: "default",
              });
            } else {
              console.log('✅ Projects table updated:', data?.length || 0, 'projects');
              
              // Update or create project_members table entry for this specific project
              try {
                // First, try to find existing member by project_id and role (more reliable than name)
                // @ts-ignore - Supabase type inference issue
                const { data: existingMembers, error: findError } = await supabase
                  .from('project_members')
                  .select('*')
                  .eq('project_id', projectId)
                  .eq('role', 'project_manager')
                  .eq('status', 'active')
                  .limit(1);
                
                if (findError) {
                  console.error('❌ Error finding project_members:', findError);
                } else if (existingMembers && existingMembers.length > 0) {
                  // Member exists - update it
                  // @ts-ignore - Supabase type inference issue
                  const existingMember = existingMembers[0];
                  const memberUpdateData: Record<string, any> = {
                    name: newName
                  };
                  
                  if (savedEmail) {
                    memberUpdateData.email = savedEmail;
                  }
                  if (savedPhone) {
                    memberUpdateData.phone = savedPhone;
                  }
                  
                  // @ts-ignore - Supabase type inference issue
                  console.log('💾 Updating existing project_member:', existingMember.id, 'with:', memberUpdateData);
                  // @ts-ignore - Supabase type inference issue
                  const memberResult = await supabase
                    .from('project_members')
                    .update(memberUpdateData)
                    // @ts-ignore - Supabase type inference issue
                    .eq('id', existingMember.id);
                  
                  if (memberResult.error) {
                    console.error('❌ Error updating project_members:', memberResult.error);
                    toast({
                      title: "Warning",
                      description: `Manager name updated, but contact details update failed: ${memberResult.error.message}`,
                      variant: "default",
                    });
                  } else {
                    console.log('✅ project_members updated successfully');
                    toast({
                      title: "Success",
                      description: `Project Manager updated successfully`,
                    });
                  }
                } else {
                  // Member doesn't exist - create it
                  const memberData = {
                    project_id: projectId,
                    name: newName,
                    email: savedEmail || '',
                    phone: savedPhone || '',
                    position: 'Project Manager',
                    role: 'project_manager',
                    status: 'active',
                    permissions: ['view', 'edit', 'approve'],
                    equipment_assignments: ["All Equipment"],
                    data_access: ['equipment', 'documents', 'progress', 'vdcr'],
                    access_level: 'editor',
                    avatar: newName.split(' ').map(n => n[0]).join('').toUpperCase()
                  };
                  
                  console.log('💾 Creating new project_member:', memberData);
                  try {
                    await fastAPI.createProjectMember(memberData);
                    console.log('✅ project_members created successfully');
                    toast({
                      title: "Success",
                      description: `Project Manager updated successfully`,
                    });
                  } catch (createError: any) {
                    console.error('❌ Error creating project_member:', createError);
                    toast({
                      title: "Warning",
                      description: `Manager name updated, but contact details save failed: ${createError.message || 'Unknown error'}`,
                      variant: "default",
                    });
                  }
                }
              } catch (memberError: any) {
                console.error('❌ Error updating/creating project_members:', memberError);
                toast({
                  title: "Warning",
                  description: `Manager name updated, but contact details save failed: ${memberError.message || 'Please try again.'}`,
                  variant: "default",
                });
              }
            }
          } else {
            // Not in edit mode - just update state, database will be updated when project is saved
            console.log('ℹ️ Not in edit mode - changes will be saved when project is created');
            console.log('ℹ️ editData:', editData, 'isEditMode:', isEditMode);
            toast({
              title: "Success",
              description: `Project Manager updated (will be saved when project is created)`,
            });
          }
        } catch (error) {
          console.error('❌ Error saving Project Manager to database:', error);
        }
      })();
      
      console.log('✅ Project Manager save completed (state updated, DB update in background)');
    } catch (error) {
      console.error('❌ Error in saveProjectManagerEdit:', error);
      toast({
        title: "Error",
        description: "Failed to save Project Manager. Please try again.",
        variant: "destructive",
      });
    }
  };

  const cancelProjectManagerEdit = () => {
    setEditingProjectManager(null);
  };

  const saveVdcrManagerEdit = async (e?: React.MouseEvent) => {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      console.log('💾 Save VDCR Manager clicked', { editingVdcrManager });
      
      if (!editingVdcrManager) {
        console.warn('⚠️ No VDCR Manager being edited');
        toast({
          title: "Error",
          description: "No Documentation Manager selected for editing",
          variant: "destructive",
        });
        return;
      }
      
      if (!editingVdcrManager.name || !editingVdcrManager.name.trim()) {
        toast({
          title: "Validation Error",
          description: "Please enter a name for the VDCR Manager",
          variant: "destructive",
        });
        return;
      }
      
      const oldName = dynamicOptions.vdcrManager[editingVdcrManager.index] || editingVdcrManager.name;
      const newName = editingVdcrManager.name.trim();
      // Capture email and phone before clearing editingVdcrManager
      const savedEmail = editingVdcrManager.email || '';
      const savedPhone = editingVdcrManager.phone || '';
      
      console.log('💾 Saving VDCR Manager - old name:', oldName, 'new name:', newName, 'email:', savedEmail, 'phone:', savedPhone);
      
      setDynamicOptions(prev => {
        const updatedOptions = prev.vdcrManager.map((option, i) => 
          i === editingVdcrManager.index ? newName : option
        );
        
        // If the edited value is currently selected, update the form data
        if (formData.vdcrManager === oldName) {
          handleInputChange('vdcrManager', newName);
        }
        
        return {
          ...prev,
          vdcrManager: updatedOptions
        };
      });
      
      // Update stored contact details FIRST (so they're saved even if DB fails)
      setVdcrManagerContacts(prev => {
        const newContacts = { ...prev };
        // Remove old name entry and add new name entry
        if (oldName !== newName) {
          delete newContacts[oldName];
        }
        newContacts[newName] = {
          email: savedEmail,
          phone: savedPhone
        };
        console.log('✅ Contact details updated in state:', newContacts[newName]);
        return newContacts;
      });
      
      // Close edit mode and accordion IMMEDIATELY (don't wait for DB)
      setEditingVdcrManager(null);
      setExpandedFields(prev => ({ ...prev, vdcrManager: false }));
      setForceRender(prev => prev + 1);
      
      // Save to database in background (non-blocking)
      (async () => {
        try {
          console.log('💾 Starting database update for VDCR Manager...');
          console.log('💾 isEditMode:', isEditMode);
          console.log('💾 editData:', editData);
          
          // Get project ID if in edit mode
          const projectId = isEditMode && editData ? (editData as any).id : null;
          console.log('💾 projectId:', projectId);
          console.log('💾 Saving - oldName:', oldName, 'newName:', newName, 'email:', savedEmail, 'phone:', savedPhone);
          
          if (projectId) {
            // Update specific project in edit mode
            const updateData: Record<string, string> = { vdcr_manager: newName };
            // @ts-ignore - Supabase type inference issue
            const { data, error } = await supabase
              .from('projects')
              .update(updateData)
              .eq('id', projectId)
              .select();
            
            if (error) {
              console.error('❌ Database update failed:', error);
              toast({
                title: "Warning",
                description: `VDCR Manager saved locally, but database update failed: ${error.message}`,
                variant: "default",
              });
            } else {
              console.log('✅ Projects table updated:', data?.length || 0, 'projects');
              
              // Update or create project_members table entry for this specific project
              try {
                // First, try to find existing member by project_id and role (more reliable than name)
                // @ts-ignore - Supabase type inference issue
                const { data: existingMembers, error: findError } = await supabase
                  .from('project_members')
                  .select('*')
                  .eq('project_id', projectId)
                  .eq('role', 'vdcr_manager')
                  .eq('status', 'active')
                  .limit(1);
                
                if (findError) {
                  console.error('❌ Error finding project_members:', findError);
                } else if (existingMembers && existingMembers.length > 0) {
                  // Member exists - update it
                  // @ts-ignore - Supabase type inference issue
                  const existingMember = existingMembers[0];
                  const memberUpdateData: Record<string, any> = {
                    name: newName
                  };
                  
                  if (savedEmail) {
                    memberUpdateData.email = savedEmail;
                  }
                  if (savedPhone) {
                    memberUpdateData.phone = savedPhone;
                  }
                  
                  // @ts-ignore - Supabase type inference issue
                  console.log('💾 Updating existing project_member:', existingMember.id, 'with:', memberUpdateData);
                  // @ts-ignore - Supabase type inference issue
                  const memberResult = await supabase
                    .from('project_members')
                    .update(memberUpdateData)
                    // @ts-ignore - Supabase type inference issue
                    .eq('id', existingMember.id);
                  
                  if (memberResult.error) {
                    console.error('❌ Error updating project_members:', memberResult.error);
                    toast({
                      title: "Warning",
                      description: `Manager name updated, but contact details update failed: ${memberResult.error.message}`,
                      variant: "default",
                    });
                  } else {
                    console.log('✅ project_members updated successfully');
                    toast({
                      title: "Success",
                      description: `VDCR Manager updated successfully`,
                    });
                  }
                } else {
                  // Member doesn't exist - create it
                  const memberData = {
                    project_id: projectId,
                    name: newName,
                    email: savedEmail || '',
                    phone: savedPhone || '',
                    position: 'Documentation Manager',
                    role: 'vdcr_manager',
                    status: 'active',
                    permissions: ['view', 'edit', 'approve'],
                    equipment_assignments: ["All Equipment"],
                    data_access: ['equipment', 'documents', 'progress', 'vdcr'],
                    access_level: 'editor',
                    avatar: newName.split(' ').map(n => n[0]).join('').toUpperCase()
                  };
                  
                  console.log('💾 Creating new project_member:', memberData);
                  try {
                    await fastAPI.createProjectMember(memberData);
                    console.log('✅ project_members created successfully');
                    toast({
                      title: "Success",
                      description: `VDCR Manager updated successfully`,
                    });
                  } catch (createError: any) {
                    console.error('❌ Error creating project_member:', createError);
                    toast({
                      title: "Warning",
                      description: `Manager name updated, but contact details save failed: ${createError.message || 'Unknown error'}`,
                      variant: "default",
                    });
                  }
                }
              } catch (memberError: any) {
                console.error('❌ Error updating/creating project_members:', memberError);
                toast({
                  title: "Warning",
                  description: `Manager name updated, but contact details save failed: ${memberError.message || 'Please try again.'}`,
                  variant: "default",
                });
              }
            }
          } else {
            // Not in edit mode - just update state, database will be updated when project is saved
            console.log('ℹ️ Not in edit mode - changes will be saved when project is created');
            console.log('ℹ️ editData:', editData, 'isEditMode:', isEditMode);
            toast({
              title: "Success",
              description: `VDCR Manager updated (will be saved when project is created)`,
            });
          }
        } catch (error) {
          console.error('❌ Error saving VDCR Manager to database:', error);
        }
      })();
      
      console.log('✅ VDCR Manager save completed (state updated, DB update in background)');
    } catch (error) {
      console.error('❌ Error in saveVdcrManagerEdit:', error);
      toast({
        title: "Error",
        description: "Failed to save VDCR Manager. Please try again.",
        variant: "destructive",
      });
    }
  };

  const cancelVdcrManagerEdit = () => {
    setEditingVdcrManager(null);
  };

  const deleteEntry = async (field: string, index: number) => {
    const deletedValue = dynamicOptions[field][index];
    // console.log('🗑️ Delete entry called for field:', field, 'index:', index, 'deletedValue:', deletedValue);
    
    // Remove from dynamic options
    setDynamicOptions(prev => {
      const newOptions = prev[field].filter((_, i) => i !== index);
      // console.log('🗑️ New options after deletion:', newOptions);
      return {
        ...prev,
        [field]: newOptions
      };
    });
    
    // If the deleted value is currently selected, clear the form field
    if (formData[field as keyof ProjectFormData] === deletedValue) {
      // console.log('🗑️ Clearing form field as deleted value was selected');
      handleInputChange(field as keyof ProjectFormData, '');
    }
    
    // Remove contact details if it's a Project Manager
    if (field === 'projectManager') {
      setProjectManagerContacts(prev => {
        const newContacts = { ...prev };
        delete newContacts[deletedValue];
        // console.log('🗑️ Updated project manager contacts:', newContacts);
        return newContacts;
      });
    }
    
    // Remove contact details if it's a VDCR Manager
    if (field === 'vdcrManager') {
      setVdcrManagerContacts(prev => {
        const newContacts = { ...prev };
        delete newContacts[deletedValue];
        // console.log('🗑️ Updated VDCR manager contacts:', newContacts);
        return newContacts;
      });
    }
    
    // Update database - set all projects with this value to empty or null
    // Only do this while editing an existing project; skip in create flow.
    if (isEditMode && editData && (editData as any).id) try {
      // console.log('🗑️ Updating database - removing value:', deletedValue, 'from field:', field);
      
      // Map field names to database column names
      const fieldMapping: Record<string, string> = {
        clientName: 'client',
        plantLocation: 'location',
        clientIndustry: 'client_industry',
        projectManager: 'manager',
        vdcrManager: 'vdcr_manager',
        consultant: 'consultant',
        tpiAgency: 'tpi_agency'
      };
      
      const dbField = fieldMapping[field];
      if (dbField) {
        // console.log('🗑️ Database field mapping:', field, '->', dbField);
        // console.log('🗑️ Removing value:', deletedValue, 'from field:', dbField);
        
        const updateData: Record<string, string> = { [dbField]: '' };
        // @ts-ignore - Supabase type inference issue with dynamic field names
        const { data, error } = await supabase
          .from('projects')
          .update(updateData)
          .eq(dbField, deletedValue)
          .select();
        
        if (error) {
          console.error('❌ Database update failed:', error);
          console.error('❌ Error details:', error.message, error.details, error.hint);
          toast({
            title: "Error",
            description: `Failed to remove value: ${error.message}`,
            variant: "destructive",
          });
        } else {
          // console.log('✅ Database update successful - value removed:', data);
          // console.log('✅ Updated', data?.length || 0, 'projects');
          toast({
            title: "Success",
            description: `Value removed successfully (${data?.length || 0} projects updated)`,
          });
        }
      } else {
        console.error('❌ No database field mapping found for:', field);
        toast({
          title: "Error",
          description: `No database field mapping found for ${field}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error updating database:', error);
      toast({
        title: "Error",
        description: "Failed to remove value",
        variant: "destructive",
      });
    }
  };

  const handleEquipmentQuantityChange = (equipmentType: string, quantity: number) => {
    if (quantity > 0) {
      setEquipmentDetails(prev => {
        const existingEquipment = prev[equipmentType] || [];
        const existingCount = existingEquipment.length;
        
        // In edit mode, preserve existing equipment with real IDs
        if (isEditMode && existingCount > 0) {
          // If quantity increased, add new entries without IDs (user is adding new equipment)
          if (quantity > existingCount) {
            const newEntries = Array.from({ length: quantity - existingCount }, () => ({
              id: '', // No ID = new equipment
              tagNumber: '',
              jobNumber: '',
              manufacturingSerial: '',
              size: '',
              material: '',
              designCode: '',
              documents: []
            }));
            return { ...prev, [equipmentType]: [...existingEquipment, ...newEntries] };
          }
          // If quantity decreased, keep the existing ones (preserve their IDs)
          else if (quantity < existingCount) {
            return { ...prev, [equipmentType]: existingEquipment.slice(0, quantity) };
          }
          // If quantity is same, keep as is
          return prev;
        }
        
        // In create mode, create new equipment entries
        const details = Array.from({ length: quantity }, (_, index) => ({
          id: `${equipmentType}-${index + 1}`, // Temporary ID for new equipment
          tagNumber: '',
          jobNumber: '',
          manufacturingSerial: '',
          size: '',
          material: '',
          designCode: '',
          documents: []
        }));
        return { ...prev, [equipmentType]: details };
      });
    } else {
      // Remove equipment details if quantity is 0
      setEquipmentDetails(prev => {
        const newState = { ...prev };
        delete newState[equipmentType];
        return newState;
      });
    }
  };

  const updateEquipmentDetail = (equipmentType: string, index: number, field: string, value: string | File[]) => {
    setEquipmentDetails(prev => ({
      ...prev,
      [equipmentType]: prev[equipmentType].map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addCustomEquipmentType = () => {
    if (newEquipmentType.trim()) {
      setCustomEquipmentType(prev => [...prev, newEquipmentType.trim()]);
      setNewEquipmentType('');
      setShowAddEquipmentType(false);
    }
  };

  // Bulk equipment upload - standard types (must match step 3 list)
  const STANDARD_EQUIPMENT_TYPES = ['Heat Exchanger', 'Pressure Vessel', 'Reactor', 'Storage Tank', 'Distillation Column'];
  const equipmentBulkInputRef = useRef<HTMLInputElement>(null);

  const EQUIPMENT_BULK_COLUMNS = [
    { key: 'srNo', header: 'Sr. No. *', placeholder: 'e.g., 1, 2, 3' },
    { key: 'equipmentType', header: 'Equipment Type *', placeholder: 'e.g., Reactor, Heat Exchanger, Pressure Vessel' },
    { key: 'tagNo', header: 'Tag No. *', placeholder: 'e.g., Reactor-Unit-001' },
    { key: 'jobNo', header: 'Job No. *', placeholder: 'e.g., Job-2024-001' },
    { key: 'equipmentTitle', header: 'Equipment Title *', placeholder: 'Enter equipment title' },
    { key: 'size', header: 'Size (optional)', placeholder: 'e.g., 4.2m x 1.6m — Dimensions (length x width x height)' },
    { key: 'material', header: 'Material (optional)', placeholder: 'e.g., SS 304, Carbon Steel — Primary material specification' },
    { key: 'designCode', header: 'Design Code (optional)', placeholder: 'e.g., ASME VIII Div 1, TEMA Class R — Applicable design standard' },
  ] as const;

  const downloadEquipmentBulkTemplate = () => {
    const headers = EQUIPMENT_BULK_COLUMNS.map(c => c.header);
    const placeholderRow = EQUIPMENT_BULK_COLUMNS.map(c => c.placeholder);
    const wsData = [headers, placeholderRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Column widths: fit headers clearly; examples can be truncated to avoid horizontal scroll
    ws['!cols'] = EQUIPMENT_BULK_COLUMNS.map((c) => ({
      wch: Math.min(Math.max(c.header.length + 2, 14), 28),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Equipment');
    XLSX.writeFile(wb, 'Equipment_Bulk_Upload_Template.xlsx');
  };

  const parseEquipmentBulkExcel = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 2) {
        toast({ title: 'Invalid template', description: 'Template must have a header row and at least one data row.', variant: 'destructive' });
        return;
      }
      const headerRow = (rows[0] as string[]).map(h => String(h || '').trim());
      const idx = {
        srNo: headerRow.findIndex(h => /sr\.?\s*no\.?/i.test(h) || h === 'Sr. No. *'),
        equipmentType: headerRow.findIndex(h => h === 'Equipment Type *' || /equipment\s*type/i.test(h)),
        tagNo: headerRow.findIndex(h => h === 'Tag No. *' || /tag\s*no\.?/i.test(h)),
        jobNo: headerRow.findIndex(h => h === 'Job No. *' || /job\s*no\.?/i.test(h)),
        equipmentTitle: headerRow.findIndex(h => h === 'Equipment Title *' || /equipment\s*title/i.test(h)),
        size: headerRow.findIndex(h => h === 'Size (optional)' || h === 'Size'),
        material: headerRow.findIndex(h => h === 'Material (optional)' || h === 'Material'),
        designCode: headerRow.findIndex(h => h === 'Design Code (optional)' || h === 'Design Code'),
      };
      if (idx.equipmentType < 0 || idx.tagNo < 0 || idx.jobNo < 0 || idx.equipmentTitle < 0) {
        toast({ title: 'Invalid template', description: 'Template must include columns: Equipment Type *, Tag No. *, Job No. *, Equipment Title *', variant: 'destructive' });
        return;
      }
      const getVal = (row: unknown[], i: number) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
      const isPlaceholderRow = (row: unknown[]) => EQUIPMENT_BULK_COLUMNS.every((c) => {
        const v = getVal(row, idx[c.key]);
        return !v || v === c.placeholder;
      });
      const newByType: Record<string, Array<{ id: string; tagNumber: string; jobNumber: string; manufacturingSerial: string; size: string; material: string; designCode: string; documents: File[] }>> = {};
      const customTypesToAdd: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as unknown[];
        if (isPlaceholderRow(row)) continue;
        const equipmentType = getVal(row, idx.equipmentType);
        const tagNumber = getVal(row, idx.tagNo);
        const jobNumber = getVal(row, idx.jobNo);
        const equipmentTitle = getVal(row, idx.equipmentTitle);
        if (!equipmentType || !tagNumber || !jobNumber || !equipmentTitle) continue;
        const typeKey = equipmentType === 'Distillation Column' ? 'Distillation Column' : equipmentType;
        if (!STANDARD_EQUIPMENT_TYPES.includes(typeKey) && !customTypesToAdd.includes(typeKey)) customTypesToAdd.push(typeKey);
        if (!newByType[typeKey]) newByType[typeKey] = [];
        newByType[typeKey].push({
          id: `${typeKey}-${Date.now()}-${r}`,
          tagNumber,
          jobNumber,
          manufacturingSerial: equipmentTitle,
          size: getVal(row, idx.size),
          material: getVal(row, idx.material),
          designCode: getVal(row, idx.designCode),
          documents: [],
        });
      }
      const totalAdded = Object.values(newByType).reduce((s, arr) => s + arr.length, 0);
      if (totalAdded === 0) {
        toast({ title: 'No valid rows', description: 'No rows with all mandatory fields (Equipment Type, Tag No., Job No., Equipment Title) were found.', variant: 'destructive' });
        return;
      }
      setCustomEquipmentType(prev => {
        const next = [...prev];
        customTypesToAdd.forEach(t => { if (!next.includes(t)) next.push(t); });
        return next;
      });
      setEquipmentDetails(prev => {
        const next = { ...prev };
        Object.entries(newByType).forEach(([type, list]) => {
          next[type] = [...(next[type] || []), ...list];
        });
        return next;
      });
      toast({ title: 'Bulk upload complete', description: `Added ${totalAdded} equipment item(s) from Excel.`, variant: 'default' });
      if (equipmentBulkInputRef.current) equipmentBulkInputRef.current.value = '';
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Could not read the Excel file.', variant: 'destructive' });
    }
  };

  const nextStep = async () => {
    if (currentStep < totalSteps) {
      setIsAnimating(true);
      await new Promise(resolve => setTimeout(resolve, 300));
      setCurrentStep(currentStep + 1);
      setIsAnimating(false);
    }
  };

  const prevStep = async () => {
    if (currentStep > 1) {
      setIsAnimating(true);
      await new Promise(resolve => setTimeout(resolve, 300));
      setCurrentStep(currentStep - 1);
      setIsAnimating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isSubmitting) {
      return;
    }
    
    setIsSubmitting(true);
    
    // // console.log('🚀 Form submitted!');
    // // console.log('📋 Form data:', formData);
    
    // // console.log('🔍 About to enter try block...');
      
    try {
      // // console.log('🔍 Starting  project creation process...');
      // // console.log('🔍 Form data keys:', Object.keys(formData));
      // // console.log('🔍 Form data values:', Object.values(formData));
      
      // Get current user and firm_id
      // // console.log('🔍 About to get user from auth...');
      let user;
      
      // Use localStorage instead of auth call
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      // // console.log('👤 User data from localStorage:', userData);
      
      if (!userData.id) {
        // // console.error('❌ No user found in localStorage');
        toast({ title: 'Error', description: 'User not authenticated. Please login again.', variant: 'destructive' });
        return;
      }
      
      user = { id: userData.id, email: userData.email };
      // // console.log('✅ User authenticated from localStorage:', user.email);
      
      if (!user) {
        toast({ title: 'Error', description: 'User not authenticated. Please login again.', variant: 'destructive' });
        return;
      }

      // Get user's firm_id from localStorage
      const firmId = userData.firm_id;
      // // console.log('🏢 Firm ID from localStorage:', firmId);
      
      if (!firmId) {
        toast({ title: 'Error', description: 'Firm ID not found. Please contact your administrator.', variant: 'destructive' });
        return;
      }

             // Prepare equipment data for submission (if any)
       const equipmentData = Object.entries(equipmentDetails).flatMap(([type, equipments]) =>
         equipments.map(equipment => {
           // CRITICAL: Detect and handle fake IDs vs real database IDs
           // Real UUIDs are long strings (36 chars) and don't contain equipment type name
           // Fake IDs are like "xyz-1", "xyz-2" etc. (short and contain type name)
           const isFakeID = equipment.id && (
             equipment.id.length < 20 || // Too short to be UUID
             equipment.id.includes(type) || // Contains equipment type name (like "xyz-1")
             equipment.id.match(/^[^-]+-\d+$/) // Pattern like "EquipmentType-1"
           );
           
           const realID = isFakeID ? undefined : equipment.id;
           
           if (isEditMode && isFakeID) {
             console.warn(`⚠️ Detected fake ID "${equipment.id}" for ${type}, treating as new equipment`);
           }
           
           return {
             ...equipment,
             type,
             id: realID // Only keep real database IDs
           };
         })
       ).filter(equipment => {
         // In edit mode, validate equipment
         if (isEditMode && editData) {
           // If equipment has a real database ID, keep it
           if (equipment.id && equipment.id.length >= 20 && !equipment.id.includes(equipment.type)) {
             return true; // Real database ID - will be updated
           }
           
           // If equipment has no ID (or fake ID was removed), only keep if it has real values (user-added new equipment)
           if (!equipment.id) {
             const hasRealValues = equipment.tagNumber && equipment.tagNumber !== 'TBD' && 
                                   equipment.jobNumber && equipment.jobNumber !== 'TBD' &&
                                   equipment.manufacturingSerial && equipment.manufacturingSerial !== 'TBD';
             if (!hasRealValues) {
               console.warn('⚠️ Filtering out equipment without real ID and all TBD values:', equipment);
               return false; // Skip invalid equipment
             }
           }
         }
         return true;
       });

      // Prepare project data for Supabase
      const projectDataForSupabase = {
        name: formData.projectTitle,
        client: formData.clientName,
        location: formData.plantLocation || 'TBD',
        manager: formData.projectManager,
        deadline: formData.completionDate || null,
          po_number: formData.poNumber || 'TBD',
          sales_order_date: formData.salesOrderDate || null,
          firm_id: firmId,
          consultant: formData.consultant || '',
          tpi_agency: formData.tpiAgency || '',
          client_industry: formData.clientIndustry || '',
          vdcr_manager: formData.vdcrManager || '',
          client_focal_point: formData.clientFocalPoint || '',
          scope_of_work: formData.scopeDescription || '',
         services_included: formData.servicesIncluded,
         kickoff_meeting_notes: formData.kickoffMeetingNotes || '',
         special_production_notes: formData.specialProductionNotes || '',
        completed_date: null,
         // Don't update equipment_count here - it will be calculated correctly after equipment processing
         // equipment_count will be updated based on actual database count
        progress: 0,
        status: 'active'
      };

      //  console.log('🔍 Project data being sent to update:', projectDataForSupabase);

      // // console.log('🏗️ Project data for Supabase:', projectDataForSupabase);
      // // console.log('🏗️ Is edit mode:', isEditMode);
      // // console.log('🏗️ Edit data:', editData);

      let createdProject;
      
      if (isEditMode && editData && (editData as any).id) {
        // Update existing project
        const projectId = (editData as any).id;
        // // console.log('🔄 Updating existing project with ID:', projectId);
        try {
          createdProject = await fastAPI.updateProject(projectId, projectDataForSupabase);
          // // console.log('✅ Project updated successfully:', createdProject);
        } catch (apiError) {
          // // console.error('❌ Update failed:', apiError);
          // // console.error('❌ Update error details:', {
          //   message: apiError.message,
          //   response: apiError.response?.data,
          //   status: apiError.response?.status
          // });
          throw apiError;
        }
      } else {
        // Create new project
        // // console.log('🆕 Creating new project...');
        try {
          createdProject = await fastAPI.createProject(projectDataForSupabase);
          // // console.log('✅ Project created successfully:', createdProject);
        } catch (apiError) {
          // // console.error('❌ Create failed:', apiError);
          // // console.error('❌ Create error details:', {
          //   message: apiError.message,
          //   response: apiError.response?.data,
          //   status: apiError.response?.status
          // });
          throw apiError;
        }
      }
      
      // // console.log('✅ Project created successfully:', createdProject);
    
             // Handle equipment records
      if (equipmentData.length > 0) {
         if (isEditMode && editData) {
           // STRICT EDIT MODE: In edit mode, we should ONLY update existing equipment
           // Equipment from database should ALWAYS have IDs
          //  console.log('🔧 STRICT EDIT MODE: Processing equipment for existing project...');
          //  console.log('🔍 Equipment data before processing:', equipmentData);
          //  console.log('📊 Equipment with IDs:', equipmentData.filter(e => e.id).length);
          //  console.log('📊 Equipment without IDs:', equipmentData.filter(e => !e.id).length);
           
           // Separate equipment into: existing (with IDs) and new (without IDs)
           const existingEquipment = equipmentData.filter(e => e.id);
           const newEquipment = equipmentData.filter(e => !e.id);
           
          //  console.log(`✅ Found ${existingEquipment.length} existing equipment (will UPDATE)`);
          //  console.log(`🆕 Found ${newEquipment.length} new equipment (will CREATE only if has real values)`);
           
           // Remove duplicates from existing equipment based on ID
           const uniqueExistingEquipment = existingEquipment.filter((equipment, index, self) => {
             const isUnique = index === self.findIndex(e => e.id === equipment.id);
             if (!isUnique) {
               console.warn(`⚠️ Removing duplicate equipment with ID: ${equipment.id}`);
             }
             return isUnique;
           });
           
           // Process existing equipment - ONLY UPDATE, NEVER CREATE
           for (const equipment of uniqueExistingEquipment) {
             if (!equipment.id) {
               console.error('❌ CRITICAL: Equipment in existingEquipment array has no ID!', equipment);
               continue; // Skip invalid entries
             }
             
             try {
              //  console.log(`✅ UPDATING existing equipment ID: ${equipment.id}, Type: ${equipment.type}, Tag: ${equipment.tagNumber}`);
               const equipmentDataForSupabase = {
                 type: equipment.type,
                 tag_number: equipment.tagNumber || 'TBD',
                 job_number: equipment.jobNumber || 'TBD',
                 manufacturing_serial: equipment.manufacturingSerial || 'TBD',
                 size: equipment.size || '',
                 material: equipment.material || '',
                 design_code: equipment.designCode || '',
                 // Don't overwrite status/progress in edit mode - keep existing values
                 // status: 'pending',
                 // progress: 0,
                 // progress_phase: 'documentation'
               };
               
               // Note: Global uniqueness validation happens in fastAPI.updateEquipment
               await fastAPI.updateEquipment(equipment.id, equipmentDataForSupabase);
              //  console.log(`✅ Successfully updated equipment ID: ${equipment.id}`);
             } catch (equipmentError: any) {
               console.error(`❌ Error updating equipment ID ${equipment.id}:`, equipmentError);
               const errorMsg = equipmentError?.message || 'Failed to update equipment.';
               throw new Error(`${errorMsg} Equipment: ${equipment.type} (${equipment.tagNumber || 'No Tag'})`);
             }
           }
           
           // Process new equipment - ONLY CREATE if it has real values
           if (newEquipment.length > 0) {
            //  console.log(`🆕 Processing ${newEquipment.length} potentially new equipment entries...`);
             
             // Remove duplicates from new equipment
             const uniqueNewEquipment = newEquipment.filter((equipment, index, self) => {
               const hasRealValues = equipment.tagNumber && equipment.tagNumber !== 'TBD' && 
                                     equipment.jobNumber && equipment.jobNumber !== 'TBD' &&
                                     equipment.manufacturingSerial && equipment.manufacturingSerial !== 'TBD';
               
               if (!hasRealValues) {
                 console.warn('⚠️ Skipping new equipment with all TBD values:', equipment);
                 return false;
               }
               
               // Check for duplicates based on tag+job+serial combo
               const isUnique = index === self.findIndex(e => 
                 e.tagNumber === equipment.tagNumber && 
                 e.jobNumber === equipment.jobNumber && 
                 e.manufacturingSerial === equipment.manufacturingSerial
               );
               
               if (!isUnique) {
                 console.warn(`⚠️ Removing duplicate new equipment: ${equipment.tagNumber}`);
               }
               
               return isUnique;
             });
             
            //  console.log(`🆕 Creating ${uniqueNewEquipment.length} new equipment entries...`);
             
             for (const equipment of uniqueNewEquipment) {
               try {
                //  console.log(`🆕 Checking if equipment already exists: Type: ${equipment.type}, Tag: ${equipment.tagNumber}, Job: ${equipment.jobNumber}`);
                 
                 // CRITICAL: Before creating, check if equipment with these values already exists in this project
                 // This handles cases where IDs were lost but equipment exists in DB
                 const projectId = (editData as any).id;
                 const allProjectEquipment = await fastAPI.getEquipmentByProject(projectId);
                 
                 // Try to find existing equipment by tag/job/serial combo
                 const existingEquipmentMatch = (allProjectEquipment || []).find((existing: any) => {
                   const tagMatch = existing.tag_number?.trim() === equipment.tagNumber?.trim();
                   const jobMatch = existing.job_number?.trim() === equipment.jobNumber?.trim();
                   const serialMatch = existing.manufacturing_serial?.trim() === equipment.manufacturingSerial?.trim();
                   
                   // Match if tag matches (most reliable), OR job+serial both match
                   // This handles cases where equipment ID was lost but we can identify it by values
                   return (tagMatch && equipment.tagNumber && equipment.tagNumber !== 'TBD') ||
                          (jobMatch && serialMatch && equipment.jobNumber && equipment.jobNumber !== 'TBD' && equipment.manufacturingSerial && equipment.manufacturingSerial !== 'TBD');
                 });
                 
                 if (existingEquipmentMatch) {
                   // Equipment already exists! Update it instead of creating
                  //  console.log(`🔍 Found existing equipment with ID ${existingEquipmentMatch.id}, UPDATING instead of creating`);
                   const equipmentDataForSupabase = {
                     type: equipment.type,
                     tag_number: equipment.tagNumber,
                     job_number: equipment.jobNumber,
                     manufacturing_serial: equipment.manufacturingSerial,
                     size: equipment.size || '',
                     material: equipment.material || '',
                     design_code: equipment.designCode || '',
                     // Don't overwrite status/progress - keep existing values
                   };
                   
                   await fastAPI.updateEquipment(existingEquipmentMatch.id, equipmentDataForSupabase);
                  //  console.log(`✅ Successfully updated existing equipment ID: ${existingEquipmentMatch.id}`);
                   continue; // Skip creation, already updated
                 }
                 
                 // Equipment doesn't exist, proceed with creation
                //  console.log(`🆕 No existing equipment found, CREATING new equipment: Type: ${equipment.type}, Tag: ${equipment.tagNumber}`);
                 const equipmentDataForSupabase = {
                   project_id: projectId,
                   type: equipment.type,
                   tag_number: equipment.tagNumber,
                   job_number: equipment.jobNumber,
                   manufacturing_serial: equipment.manufacturingSerial,
                   size: equipment.size || '',
                   material: equipment.material || '',
                   design_code: equipment.designCode || '',
                   status: 'pending',
                   progress: 0,
                   progress_phase: 'documentation'
                 };
                 
                 // Note: Global uniqueness validation happens in fastAPI.createEquipment
                 await fastAPI.createEquipment(equipmentDataForSupabase);
                //  console.log(`✅ Successfully created new equipment: ${equipment.tagNumber}`);
               } catch (equipmentError: any) {
                 console.error(`❌ Error processing equipment ${equipment.tagNumber}:`, equipmentError);
                 const errorMsg = equipmentError?.message || 'Failed to process equipment.';
                 throw new Error(`${errorMsg} Equipment: ${equipment.type} (${equipment.tagNumber || 'No Tag'})`);
               }
             }
           }
           
           // After processing equipment, update equipment_count in project
           try {
             const actualEquipmentResponse = await fastAPI.getEquipmentByProject((editData as any).id);
             const actualEquipmentCount = (actualEquipmentResponse || []).length;
            //  console.log(`📊 Updating equipment_count to ${actualEquipmentCount} based on actual database count`);
             await fastAPI.updateProject((editData as any).id, { equipment_count: actualEquipmentCount });
           } catch (countError) {
             console.warn('⚠️ Failed to update equipment_count (non-fatal):', countError);
           }
         } else {
           // Equipment will be created later in the document upload section
          //  console.log('🔧 Equipment will be created during document upload...');
         }
         // // console.log('✅ Equipment records processed successfully');
      }

      // Upload documents if any
      // console.log('📄 Starting categorized document uploads...');
      
      // Initialize document links arrays
      const unpricedPODocuments = [];
      const designInputsDocuments = [];
      const clientReferenceDocuments = [];
      const otherDocuments = [];
      
      const projectIdForDocs = createdProject[0].id;

      const uploadProjectFileToStorage = async (folderSegment: string, file: File, index: number) => {
        const fileName = `${formData.projectTitle}/${folderSegment}/${Date.now()}_${index}_${file.name}`;
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        const response = await axios.post(`${SUPABASE_URL}/storage/v1/object/project-documents/${fileName}`, formDataUpload, {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'multipart/form-data'
          }
        });
        if (response.status !== 200) return null;
        return `${SUPABASE_URL}/storage/v1/object/public/project-documents/${fileName}`;
      };

      // Unpriced PO: one storage request per file, then one batch insert for metadata
      const unpricedPOFiles = formData.unpricedPOFile && formData.unpricedPOFile.length > 0 ? formData.unpricedPOFile : [];
      const unpricedPrepared: Array<{ file: File; publicUrl: string; item: { name: string; url: string; uploadedBy: string; size: number; mimeType: string } }> = [];
      for (let i = 0; i < unpricedPOFiles.length; i++) {
        const file = unpricedPOFiles[i];
        try {
          const publicUrl = await uploadProjectFileToStorage('Unpriced PO File', file, i);
          if (!publicUrl) continue;
          unpricedPrepared.push({
            file,
            publicUrl,
            item: { name: file.name, url: publicUrl, uploadedBy: user.id, size: file.size, mimeType: file.type }
          });
        } catch (docError) {
          console.error('❌ Error processing Unpriced PO File:', file.name, docError);
        }
      }
      if (unpricedPrepared.length > 0) {
        const inserted = await batchInsertUnpricedPODocuments(projectIdForDocs, unpricedPrepared.map((p) => p.item));
        for (let j = 0; j < inserted.length; j++) {
          const uploadedRow = inserted[j] as any;
          const { file, publicUrl } = unpricedPrepared[j];
          unpricedPODocuments.push({
            id: uploadedRow.id,
            name: uploadedRow.document_name || file.name,
            url: uploadedRow.file_url || publicUrl,
            uploaded_by: uploadedRow.uploaded_by || user.id,
            created_at: uploadedRow.created_at,
            file_size: uploadedRow.file_size ?? file.size,
            mime_type: uploadedRow.mime_type ?? file.type
          });
        }
      }

      // Design Inputs: storage per file + one batch insert
      const designInputsFiles = formData.designInputsPID && formData.designInputsPID.length > 0 ? formData.designInputsPID : [];
      const designPrepared: Array<{ file: File; publicUrl: string; item: { name: string; url: string; uploadedBy: string; size: number; mimeType: string } }> = [];
      for (let i = 0; i < designInputsFiles.length; i++) {
        const file = designInputsFiles[i];
        try {
          const publicUrl = await uploadProjectFileToStorage('Design Inputs', file, i);
          if (!publicUrl) continue;
          designPrepared.push({
            file,
            publicUrl,
            item: { name: file.name, url: publicUrl, uploadedBy: user.id, size: file.size, mimeType: file.type }
          });
        } catch (docError) {
          console.error('❌ Error processing Design Inputs/PID File:', file.name, docError);
        }
      }
      if (designPrepared.length > 0) {
        const inserted = await batchInsertDesignInputsDocuments(projectIdForDocs, designPrepared.map((p) => p.item));
        for (let j = 0; j < inserted.length; j++) {
          const uploadedRow = inserted[j] as any;
          const { file, publicUrl } = designPrepared[j];
          designInputsDocuments.push({
            id: uploadedRow.id,
            name: uploadedRow.document_name || file.name,
            url: uploadedRow.file_url || publicUrl,
            uploaded_by: uploadedRow.uploaded_by || user.id,
            created_at: uploadedRow.created_at,
            file_size: uploadedRow.file_size ?? file.size,
            mime_type: uploadedRow.mime_type ?? file.type
          });
        }
      }

      // Client Reference: storage per file + one batch insert
      const clientRefFiles = formData.clientReferenceDoc && formData.clientReferenceDoc.length > 0 ? formData.clientReferenceDoc : [];
      const clientPrepared: Array<{ file: File; publicUrl: string; item: { name: string; url: string; uploadedBy: string; size: number; mimeType: string } }> = [];
      for (let i = 0; i < clientRefFiles.length; i++) {
        const file = clientRefFiles[i];
        try {
          const publicUrl = await uploadProjectFileToStorage(`Client's Reference Document`, file, i);
          if (!publicUrl) continue;
          clientPrepared.push({
            file,
            publicUrl,
            item: { name: file.name, url: publicUrl, uploadedBy: user.id, size: file.size, mimeType: file.type }
          });
        } catch (docError) {
          console.error('❌ Error processing Client Reference Document:', file.name, docError);
        }
      }
      if (clientPrepared.length > 0) {
        const inserted = await batchInsertClientReferenceDocuments(projectIdForDocs, clientPrepared.map((p) => p.item));
        for (let j = 0; j < inserted.length; j++) {
          const uploadedRow = inserted[j] as any;
          const { file, publicUrl } = clientPrepared[j];
          clientReferenceDocuments.push({
            id: uploadedRow.id,
            name: uploadedRow.document_name || file.name,
            url: uploadedRow.file_url || publicUrl,
            uploaded_by: uploadedRow.uploaded_by || user.id,
            created_at: uploadedRow.created_at,
            file_size: uploadedRow.file_size ?? file.size,
            mime_type: uploadedRow.mime_type ?? file.type
          });
        }
      }

      // Other documents: storage per file + one batch insert
      const otherFiles = formData.otherDocuments && formData.otherDocuments.length > 0 ? formData.otherDocuments : [];
      const otherPrepared: Array<{ file: File; publicUrl: string; item: { name: string; url: string; uploadedBy: string; size: number; mimeType: string } }> = [];
      for (let i = 0; i < otherFiles.length; i++) {
        const file = otherFiles[i];
        try {
          const publicUrl = await uploadProjectFileToStorage('Other Documents', file, i);
          if (!publicUrl) continue;
          otherPrepared.push({
            file,
            publicUrl,
            item: { name: file.name, url: publicUrl, uploadedBy: user.id, size: file.size, mimeType: file.type }
          });
        } catch (docError) {
          console.error('❌ Error processing Other Document:', file.name, docError);
        }
      }
      if (otherPrepared.length > 0) {
        const inserted = await batchInsertOtherDocuments(projectIdForDocs, otherPrepared.map((p) => p.item));
        for (let j = 0; j < inserted.length; j++) {
          const uploadedRow = inserted[j] as any;
          const { file, publicUrl } = otherPrepared[j];
          otherDocuments.push({
            id: uploadedRow.id,
            name: uploadedRow.document_name || file.name,
            url: uploadedRow.file_url || publicUrl,
            uploaded_by: uploadedRow.uploaded_by || user.id,
            created_at: uploadedRow.created_at,
            file_size: uploadedRow.file_size ?? file.size,
            mime_type: uploadedRow.mime_type ?? file.type
          });
        }
      }
      
      // Upload Equipment Documents
      // CRITICAL: In edit mode, equipment is already created/updated above, so skip this ENTIRE section
      const equipmentDocuments = [];
      const equipmentCreationFailures: { tag: string; message: string }[] = [];
      
      // STRICT CHECK: Only process equipment documents for NEW projects
      // In edit mode, equipment is already processed above (line ~1959-2103)
      // NEVER create equipment in edit mode - it's already handled above
      if (isEditMode && editData) {
        console.log('✅ Edit mode: Skipping equipment document upload section - equipment already processed above');
        // DO NOTHING - equipment is already updated above, skip entire document upload section
      } else if (equipmentData.length > 0) {
        // console.log('📄 Starting equipment document uploads...');
        
        // First, create equipment and get their IDs
        // NOTE: This section ONLY runs for NEW projects, NOT edit mode
        const batchRows = equipmentData.map((equipment: any) => ({
          type: equipment.type,
          tag_number: equipment.tagNumber || 'TBD',
          job_number: equipment.jobNumber || 'TBD',
          manufacturing_serial: equipment.manufacturingSerial || 'TBD',
          size: equipment.size || '',
          material: equipment.material || '',
          design_code: equipment.designCode || '',
          status: 'pending',
          progress: 0,
          progress_phase: 'documentation'
        }));
        const batchResult = await createProjectEquipmentBatch(createdProject[0].id, batchRows);
        const createdEquipment: any[] = (batchResult.created || []).map((row: any) => {
          const match = equipmentData.find((eq: any) =>
            (eq.jobNumber || 'TBD') === (row.job_number || 'TBD') &&
            (eq.tagNumber || 'TBD') === (row.tag_number || 'TBD')
          ) || equipmentData.find((eq: any) => (eq.tagNumber || 'TBD') === (row.tag_number || 'TBD')) || {};
          return {
            ...match,
            type: row.type,
            tagNumber: row.tag_number,
            dbId: row.id
          };
        });
        if (batchResult.failures?.length) {
          equipmentCreationFailures.push(...batchResult.failures);
        }
        
        // Upload to storage per file, then one batch insert into equipment_documents
        const equipmentDocBatchRows: Array<{
          equipmentId: string;
          name: string;
          url: string;
          uploadedBy: string;
          size: number;
          mimeType: string;
          equipmentType: string;
          equipmentTagNumber: string;
        }> = [];
        const equipmentDocMeta: Array<{ file: File; publicUrl: string; equipment: any }> = [];
        let equipDocIndex = 0;
        for (const equipment of createdEquipment) {
          if (equipment.documents && equipment.documents.length > 0) {
            for (let i = 0; i < equipment.documents.length; i++) {
              const file = equipment.documents[i];
              try {
                const fileName = `${formData.projectTitle}/Equipment Information/${equipment.type}/${Date.now()}_${equipDocIndex}_${file.name}`;
                equipDocIndex += 1;
                const formDataUpload = new FormData();
                formDataUpload.append('file', file);
                const response = await axios.post(`${SUPABASE_URL}/storage/v1/object/project-documents/${fileName}`, formDataUpload, {
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'multipart/form-data'
                  }
                });
                if (response.status === 200) {
                  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/project-documents/${fileName}`;
                  equipmentDocBatchRows.push({
                    equipmentId: equipment.dbId,
                    name: file.name,
                    url: publicUrl,
                    uploadedBy: user.id,
                    size: file.size,
                    mimeType: file.type,
                    equipmentType: equipment.type,
                    equipmentTagNumber: equipment.tagNumber
                  });
                  equipmentDocMeta.push({ file, publicUrl, equipment });
                }
              } catch (docError) {
                console.error('❌ Error processing equipment document:', file.name, docError);
              }
            }
          }
        }
        if (equipmentDocBatchRows.length > 0) {
          const insertedEqDocs = await batchInsertEquipmentDocuments(equipmentDocBatchRows);
          for (let k = 0; k < insertedEqDocs.length; k++) {
            const row = insertedEqDocs[k] as any;
            const meta = equipmentDocMeta[k];
            equipmentDocuments.push({
              id: row.id,
              name: meta.file.name,
              url: meta.publicUrl,
              uploaded_by: user.id,
              created_at: row.created_at,
              file_size: meta.file.size,
              mime_type: meta.file.type,
              equipment_type: meta.equipment.type,
              equipment_tag_number: meta.equipment.tagNumber
            });
          }
        }
      } else {
        // No equipment documents, but still need to create equipment records
        // CRITICAL: This ONLY runs for NEW projects, NOT edit mode
        // In edit mode, equipment is already created/updated above
        if (!isEditMode) {
          const batchRows = equipmentData.map((equipment: any) => ({
            type: equipment.type,
            tag_number: equipment.tagNumber || 'TBD',
            job_number: equipment.jobNumber || 'TBD',
            manufacturing_serial: equipment.manufacturingSerial || 'TBD',
            status: 'pending',
            progress: 0,
            progress_phase: 'documentation'
          }));
          const batchResult = await createProjectEquipmentBatch(createdProject[0].id, batchRows);
          if (batchResult.failures?.length) {
            equipmentCreationFailures.push(...batchResult.failures);
          }
        } else if (isEditMode && editData) {
          // DO NOTHING in edit mode - equipment already updated above
        }
      }
      
      if (equipmentCreationFailures.length > 0) {
        const summary = equipmentCreationFailures.slice(0, 5).map(f => `${f.tag}: ${f.message.split('.')[0]}`).join('; ');
        const more = equipmentCreationFailures.length > 5 ? ` (and ${equipmentCreationFailures.length - 5} more)` : '';
        toast({
          title: 'Project created with some equipment skipped',
          description: `Duplicate or invalid Tag/Job/Serial: ${summary}${more}. You can add or fix equipment in the project.`,
          variant: 'destructive'
        });
      }
      
      // Process document deletions first (in edit mode)
      if (isEditMode && editData && deletedDocuments.length > 0) {
        const projectId = (editData as any).id;
        // console.log('🗑️ Processing document deletions:', deletedDocuments);
        
        for (const deletedDoc of deletedDocuments) {
          try {
            await deleteProjectDocument(deletedDoc.documentId, deletedDoc.documentType, projectId);
            // console.log('✅ Deleted document:', deletedDoc.documentId);
          } catch (error) {
            console.error('❌ Error deleting document:', deletedDoc.documentId, error);
            // Continue with other deletions even if one fails
          }
        }
      }

      // Update project with document links
      // In edit mode, also update if there were deletions (to sync the removed documents)
      const hasNewDocuments = unpricedPODocuments.length > 0 || designInputsDocuments.length > 0 || 
           clientReferenceDocuments.length > 0 || otherDocuments.length > 0 || equipmentDocuments.length > 0;
      const hasDeletions = isEditMode && deletedDocuments.length > 0;
      
      if (hasNewDocuments || hasDeletions) {
         
         // console.log('🔄 Updating project with document links...');
         
         // For edit mode, merge new documents with existing ones (existingDocuments already has deletions removed)
         if (isEditMode && editData) {
           const projectId = (editData as any).id;
        
        // Update unpriced PO documents (use existingDocuments which already has deletions removed)
        // Update even if no new documents, if there were deletions or existing documents changed
        const unpricedHasChanges = unpricedPODocuments.length > 0 || deletedDocuments.some(d => d.documentType === 'unpriced_po_documents') || existingDocuments.unpricedPODocuments.length > 0;
        if (unpricedHasChanges) {
             const existingDocs = existingDocuments.unpricedPODocuments || [];
             const allDocs = [...existingDocs, ...unpricedPODocuments];
             await updateProjectDocumentLinks(projectId, 'unpriced_po_documents', allDocs);
        }
        
        // Update design inputs documents
        const designHasChanges = designInputsDocuments.length > 0 || deletedDocuments.some(d => d.documentType === 'design_inputs_documents') || existingDocuments.designInputsDocuments.length > 0;
        if (designHasChanges) {
             const existingDocs = existingDocuments.designInputsDocuments || [];
             const allDocs = [...existingDocs, ...designInputsDocuments];
             await updateProjectDocumentLinks(projectId, 'design_inputs_documents', allDocs);
        }
        
        // Update client reference documents
        const clientHasChanges = clientReferenceDocuments.length > 0 || deletedDocuments.some(d => d.documentType === 'client_reference_documents') || existingDocuments.clientReferenceDocuments.length > 0;
        if (clientHasChanges) {
             const existingDocs = existingDocuments.clientReferenceDocuments || [];
             const allDocs = [...existingDocs, ...clientReferenceDocuments];
             await updateProjectDocumentLinks(projectId, 'client_reference_documents', allDocs);
        }
        
        // Update other documents
        const otherHasChanges = otherDocuments.length > 0 || deletedDocuments.some(d => d.documentType === 'other_documents') || existingDocuments.otherDocuments.length > 0;
        if (otherHasChanges) {
             const existingDocs = existingDocuments.otherDocuments || [];
             const allDocs = [...existingDocs, ...otherDocuments];
             await updateProjectDocumentLinks(projectId, 'other_documents', allDocs);
           }
           
           // Update equipment documents
           if (equipmentDocuments.length > 0) {
             // Equipment documents are stored in equipment_documents table, no need to update projects table
           }
         } else {
           // New projects: document rows are already in unpriced_po_documents / design_inputs_documents / etc.
           // (batch insert). Skip redundant projects JSONB patches — getProjectById reads from those tables first.
         }
         
         // console.log('✅ Project document links updated successfully');
       }
      
      // console.log('✅ Categorized document uploads completed');

      // Prepare data for parent component
      const projectDataForParent = {
      ...formData,
      equipment: equipmentData,
        id: createdProject[0].id,
        createdAt: createdProject[0].created_at,
      status: 'active'
    };
    
    // Resolve manager email from contacts or firm team (never use @company.com – use only saved email for notifications and assignment)
    let firmMembersForResolve: any[] | null = null;
    const loadFirmMembersOnce = async () => {
      const firmId = localStorage.getItem('firmId') || JSON.parse(localStorage.getItem('userData') || '{}').firm_id;
      if (!firmId) return [];
      if (!firmMembersForResolve) {
        firmMembersForResolve = await fastAPI.getAllFirmTeamMembers(firmId);
      }
      return firmMembersForResolve || [];
    };

    const resolveManagerEmail = async (name: string, role: 'project_manager' | 'vdcr_manager'): Promise<{ email: string | null; phone: string }> => {
      const contact = role === 'project_manager' ? projectManagerContacts[name] : vdcrManagerContacts[name];
      const phone = contact?.phone || '';
      if (contact?.email && contact.email.includes('@') && !contact.email.toLowerCase().includes('@company')) return { email: contact.email, phone };
      if (name.includes('@')) return { email: name, phone };
      try {
        const members = await loadFirmMembersOnce();
        const member = (members || []).find((m: any) => m.name === name && m.role === role);
        const email = member?.email && member.email.includes('@') && !member.email.toLowerCase().includes('@company') ? member.email : null;
        return { email, phone: member?.phone || phone };
      } catch {
        return { email: null, phone };
      }
    };

    const pmResolved = formData.projectManager?.trim()
      ? await resolveManagerEmail(formData.projectManager, 'project_manager')
      : { email: null as string | null, phone: '' };
    const vdcrResolved = formData.vdcrManager?.trim()
      ? await resolveManagerEmail(formData.vdcrManager, 'vdcr_manager')
      : { email: null as string | null, phone: '' };

    // Send email notifications to project team members (only when we have a valid saved email)
    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const companyName = userData.company_name || 'Your Company';
      
      if (formData.projectManager && formData.projectManager.trim() !== '') {
        if (pmResolved.email) {
          await sendProjectTeamNotifications({
            project_name: formData.projectTitle,
            team_member_name: formData.projectManager,
            team_member_email: pmResolved.email,
            role: 'project_manager',
            company_name: companyName,
            dashboard_url: getDashboardUrl('project_manager')
          });
        } else {
          console.warn('⚠️ Project manager email not found (skipping notification). Use the email saved when the team member was first added.');
        }
      }
      
      if (formData.vdcrManager && formData.vdcrManager.trim() !== '') {
        if (vdcrResolved.email) {
          await sendProjectTeamNotifications({
            project_name: formData.projectTitle,
            team_member_name: formData.vdcrManager,
            team_member_email: vdcrResolved.email,
            role: 'vdcr_manager',
            company_name: companyName,
            dashboard_url: getDashboardUrl('vdcr_manager')
          });
        } else {
          console.warn('⚠️ VDCR manager email not found (skipping notification). Use the email saved when the team member was first added.');
        }
      }
    } catch (notificationError) {
      console.error('❌ Notification error (project still created):', notificationError);
    }

    // Automatically add Project Manager and VDCR Manager to project_members table
    try {
      // console.log('👥 Adding Project Manager and VDCR Manager to project team...');
      // console.log('🔍 Created project object:', createdProject);
      // console.log('🔍 Created project ID:', createdProject?.id);
      
      // Get the actual project ID - handle both array and object cases
      let projectId;
      if (Array.isArray(createdProject) && createdProject.length > 0) {
        projectId = createdProject[0].id;
        // console.log('🔍 Extracted project ID from array:', projectId);
      } else if (createdProject && createdProject.id) {
        projectId = createdProject.id;
        // console.log('🔍 Using project ID from object:', projectId);
      } else {
        projectId = createdProject;
        // console.log('🔍 Using project as ID directly:', projectId);
      }
      
      // console.log('🔍 Final project ID:', projectId);
      
      if (!projectId) {
        console.error('❌ No project ID available, skipping team member creation');
        return;
      }
      
      const normalize = (v: any) => String(v || '').trim().toLowerCase();
      let existingProjectMembers: any[] = [];
      try {
        const rows = await fastAPI.getProjectMembers(projectId);
        existingProjectMembers = Array.isArray(rows) ? rows : [];
      } catch {
        existingProjectMembers = [];
      }

      // Prevent duplicate PM/VDCR rows on project edit:
      // - same role + same email -> skip
      // - same role exists with different email/name -> update existing row
      // - no row for role -> create
      const upsertManagerMember = async (role: 'project_manager' | 'vdcr_manager', payload: any) => {
        const roleMembers = existingProjectMembers.filter((m: any) => m?.role === role);
        const targetEmail = normalize(payload.email);
        const exactMatch = roleMembers.find((m: any) => normalize(m?.email) === targetEmail);
        if (exactMatch) return;

        const roleRowToUpdate = roleMembers.find((m: any) => !!m?.id);
        if (roleRowToUpdate?.id) {
          await fastAPI.updateProjectMember(roleRowToUpdate.id, payload);
          existingProjectMembers = existingProjectMembers.map((m: any) =>
            m?.id === roleRowToUpdate.id ? { ...m, ...payload } : m
          );
          return;
        }

        await fastAPI.createProjectMember(payload);
        existingProjectMembers = [...existingProjectMembers, payload];
      };

      // Add Project Manager to project_members table (only with resolved email – no @company.com)
      if (formData.projectManager && formData.projectManager.trim() !== '') {
        const projectManagerEmail = pmResolved.email;
        const projectManagerPhone = pmResolved.phone;
        if (projectManagerEmail) {
          const projectManagerData = {
            project_id: projectId,
            name: formData.projectManager,
            email: projectManagerEmail,
            phone: projectManagerPhone || '',
            position: 'Project Manager',
            role: 'project_manager',
            status: 'active',
            permissions: ['view', 'edit', 'delete'],
            equipment_assignments: ["All Equipment"],
            data_access: ['equipment', 'documents', 'progress', 'team'],
            access_level: 'editor',
            avatar: formData.projectManager.split(' ').map(n => n[0]).join('').toUpperCase()
          };
          await upsertManagerMember('project_manager', projectManagerData);
        }
      }
      
      // Add VDCR Manager to project_members table (only with resolved email – no @company.com)
      if (formData.vdcrManager && formData.vdcrManager.trim() !== '') {
        const vdcrManagerEmail = vdcrResolved.email;
        const vdcrManagerPhone = vdcrResolved.phone;
        if (vdcrManagerEmail) {
          const vdcrManagerData = {
            project_id: projectId,
            name: formData.vdcrManager,
            email: vdcrManagerEmail,
            phone: vdcrManagerPhone || '',
            position: 'Documentation Manager',
            role: 'vdcr_manager',
            status: 'active',
            permissions: ['view', 'edit', 'approve'],
            equipment_assignments: ["All Equipment"],
            data_access: ['equipment', 'documents', 'progress', 'vdcr'],
            access_level: 'editor',
            avatar: formData.vdcrManager.split(' ').map(n => n[0]).join('').toUpperCase()
          };
          await upsertManagerMember('vdcr_manager', vdcrManagerData);
        }
      }
      
      // console.log('✅ Project team members added successfully');

      // Create invites only when we have a valid saved email (no @company.com)
      const firmId = localStorage.getItem('firmId');
      const currentUserId = user?.id || localStorage.getItem('userId');
      
      if (formData.projectManager && formData.projectManager.trim() !== '') {
        const pmEmail = pmResolved.email;
        if (pmEmail && firmId) {
          try {
            await fastAPI.createInvite({
              email: pmEmail,
              full_name: formData.projectManager,
              role: 'project_manager',
              firm_id: firmId,
              project_id: projectId,
              invited_by: currentUserId || 'system'
            });
          } catch (inviteError) {
            console.error('❌ Error creating PM invite:', inviteError);
          }
        }
      }
      
      if (formData.vdcrManager && formData.vdcrManager.trim() !== '') {
        const vdcrEmail = vdcrResolved.email;
        if (vdcrEmail && firmId) {
          try {
            await fastAPI.createInvite({
              email: vdcrEmail,
              full_name: formData.vdcrManager,
              role: 'vdcr_manager',
              firm_id: firmId,
              project_id: projectId,
              invited_by: currentUserId || 'system'
            });
          } catch (inviteError) {
            console.error('❌ Error creating VDCR invite:', inviteError);
          }
        }
      }
      
      // Intentionally skip global window events here.
      // Parent onSubmit already refreshes project data and this avoids duplicate
      // post-submit API calls across mounted dashboard listeners.
    } catch (teamError) {
      console.error('❌ Error adding team members (project still created):', teamError);
      console.error('❌ Team error details:', teamError.response?.data || teamError.message);
      
      // Fallback: try to add team members only when we can resolve a valid saved email (no @company.com)
      try {
        const projId = Array.isArray(createdProject) && createdProject.length > 0 ? createdProject[0].id : (createdProject as any)?.id;
        if (!projId) return;
        const normalize = (v: any) => String(v || '').trim().toLowerCase();
        let existingRows: any[] = [];
        try {
          const rows = await fastAPI.getProjectMembers(projId);
          existingRows = Array.isArray(rows) ? rows : [];
        } catch {
          existingRows = [];
        }
        const upsertFallback = async (role: 'project_manager' | 'vdcr_manager', payload: any) => {
          const roleMembers = existingRows.filter((m: any) => m?.role === role);
          const targetEmail = normalize(payload.email);
          const exactMatch = roleMembers.find((m: any) => normalize(m?.email) === targetEmail);
          if (exactMatch) return;
          const roleRowToUpdate = roleMembers.find((m: any) => !!m?.id);
          if (roleRowToUpdate?.id) {
            await fastAPI.updateProjectMember(roleRowToUpdate.id, payload);
            existingRows = existingRows.map((m: any) => m?.id === roleRowToUpdate.id ? { ...m, ...payload } : m);
            return;
          }
          await fastAPI.createProjectMember(payload);
          existingRows = [...existingRows, payload];
        };
        if (formData.projectManager && formData.projectManager.trim() !== '') {
          const { email: pmEmail, phone: pmPhone } = await resolveManagerEmail(formData.projectManager, 'project_manager');
          if (pmEmail) {
            await upsertFallback('project_manager', {
              project_id: projId,
              name: formData.projectManager,
              email: pmEmail,
              phone: pmPhone || '',
              role: 'project_manager',
              status: 'active',
              access_level: 'editor'
            });
          }
        }
        if (formData.vdcrManager && formData.vdcrManager.trim() !== '') {
          const { email: vdcrEmail, phone: vdcrPhone } = await resolveManagerEmail(formData.vdcrManager, 'vdcr_manager');
          if (vdcrEmail) {
            await upsertFallback('vdcr_manager', {
              project_id: projId,
              name: formData.vdcrManager,
              email: vdcrEmail,
              phone: vdcrPhone || '',
              role: 'vdcr_manager',
              status: 'active',
              access_level: 'editor'
            });
          }
        }
      } catch (minimalError) {
        console.error('❌ Fallback team member add failed:', minimalError);
      }
    }
    
    setCreatedProject(projectDataForParent);
    
    // Reset submitting state before showing success screen
      // Clear deleted documents tracking after successful save
      if (isEditMode) {
        setDeletedDocuments([]);
      }
      
      setIsSubmitting(false);
      setShowSuccessScreen(true);
    
      // Call parent onSubmit with the created project data (don't await to avoid blocking)
      try {
        onSubmit(projectDataForParent);
      } catch (onSubmitError) {
        console.error('❌ Error in onSubmit callback (non-blocking):', onSubmitError);
        // Don't throw - we've already succeeded in creating the project
      }
    } catch (error: any) {
      // Main error handler for project creation
      console.error('❌ Error creating project:', error);
      toast({ 
        title: 'Error', 
        description: `Failed to create project: ${error?.message || 'Unknown error'}`, 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepProgress = () => {
    return (currentStep / totalSteps) * 100;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return "Project & Team Setup";
      case 2: return "Scope & Documents";
      case 3: return "Equipment Details";
      default: return "";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return "Configure project details and team assignments";
      case 2: return "Define scope, upload documents, and add notes";
      case 3: return "Specify equipment breakdown and details";
      default: return "";
    }
  };

  const renderProgressBar = () => (
    <div className="mb-4 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">{getStepTitle()}</h3>
        <span className="text-xs sm:text-sm text-gray-600">Step {currentStep} of {totalSteps}</span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${getStepProgress()}%` }}
        />
      </div>
      
      {/* Step Indicators */}
      <div className="flex justify-center mt-3 sm:mt-4 gap-1.5 sm:space-x-2">
        {Array.from({ length: totalSteps }, (_, index) => (
          <div
            key={index}
            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
              index + 1 <= currentStep 
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 scale-110' 
                : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      
      <p className="text-center text-gray-600 mt-2 text-xs sm:text-sm">{getStepDescription()}</p>
    </div>
  );

  const renderAccordionField = (field: string, label: string, placeholder: string, value: string, onChange: (value: string) => void) => {
    const searchQuery = searchQueries[field] || '';
    let options = dynamicOptions[field] || [];
    
    // Note: Options are already filtered by role when fetched from getAllFirmTeamMembers()
    // and from existing projects. No need to filter again here - show all options.
    // Contact info is optional - will be used if available, otherwise generated.
    
    const filteredOptions = options.filter(option => 
      option.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Debug logging for Client Name field
    if (field === 'clientName') {
      console.log('🔧 🎯 CLIENT NAME FIELD RENDER - options:', options, 'filteredOptions:', filteredOptions);
    }

    return (
      <div className="space-y-1.5 sm:space-y-2">
        <Label className="text-xs sm:text-sm font-medium text-gray-700">{label}</Label>
        
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleAccordion(field)}
            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-left bg-white hover:bg-gray-50 transition-colors flex items-center justify-between text-xs sm:text-sm"
          >
            <span className={`truncate ${value ? 'text-gray-900' : 'text-gray-500'}`}>
              {value || placeholder}
            </span>
            {expandedFields[field] ? <ChevronUp size={14} className="sm:w-4 sm:h-4 flex-shrink-0" /> : <ChevronDown size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />}
          </button>
          
          {expandedFields[field] && (
            <div className="border-t border-gray-200 bg-gray-50">
              {/* Search Bar */}
              <div className="p-2 sm:p-3 border-b border-gray-200 bg-white">
                <Input
                  placeholder="Search options..."
                  value={searchQuery}
                  onChange={(e) => setSearchQueries(prev => ({ ...prev, [field]: e.target.value }))}
                  className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                />
              </div>
              
              {/* Options List */}
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => {
                    const originalIndex = options.indexOf(option);
                    const isEditing = editingEntries[field]?.index === originalIndex;
                      const isEditingProjectManager = field === 'projectManager' && editingProjectManager?.index === originalIndex;
                      const isEditingVdcrManager = field === 'vdcrManager' && editingVdcrManager?.index === originalIndex;
                      
                      // For Project Manager and VDCR Manager, use their special editing states
                      const isActuallyEditing = isEditing || isEditingProjectManager || isEditingVdcrManager;
                      
                      // Debug logging
                      // console.log('🔧 Debug - Field:', field, 'Option:', option, 'OriginalIndex:', originalIndex, 'IsEditing:', isEditing, 'IsEditingProjectManager:', isEditingProjectManager, 'IsEditingVdcrManager:', isEditingVdcrManager, 'IsActuallyEditing:', isActuallyEditing, 'ForceRender:', forceRender);
                      if (isActuallyEditing) {
                      console.log('🔧 ✅ RENDERING EDIT MODE for field:', field, 'option:', option, 'originalIndex:', originalIndex);
                    } else {
                      console.log('🔧 ❌ NOT RENDERING EDIT MODE for field:', field, 'option:', option, 'originalIndex:', originalIndex);
                    }
                    
                    return (
                        <div key={`${option}-${forceRender}`} className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 hover:bg-gray-100 transition-colors">
                         {isActuallyEditing ? (
                           // Special edit form for Project Manager and VDCR Manager
                           field === 'projectManager' && isEditingProjectManager ? (
                             <div className="flex-1 bg-blue-50 border border-blue-300 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                               <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
                                 <input
                                   type="text"
                                   value={editingProjectManager.name}
                                   onChange={(e) => setEditingProjectManager(prev => prev ? { ...prev, name: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Manager name"
                                   autoFocus
                                 />
                                 <input
                                   type="email"
                                   value={editingProjectManager.email}
                                   onChange={(e) => setEditingProjectManager(prev => prev ? { ...prev, email: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Email"
                                 />
                                 <input
                                   type="tel"
                                   value={editingProjectManager.phone}
                                   onChange={(e) => setEditingProjectManager(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Phone"
                                 />
                               </div>
                               <div className="flex items-center gap-1.5 sm:gap-2">
                                 <button
                                   type="button"
                                   onClick={(e) => {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     saveProjectManagerEdit(e);
                                   }}
                                   className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                                 >
                                   <CheckCircle size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                   Save
                                 </button>
                                 <button
                                   type="button"
                                   onClick={cancelProjectManagerEdit}
                                   className="flex-1 sm:flex-initial bg-gray-500 hover:bg-gray-600 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                                 >
                                   <X size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                   Cancel
                                 </button>
                               </div>
                             </div>
                           ) : field === 'vdcrManager' && isEditingVdcrManager ? (
                             <div className="flex-1 bg-blue-50 border border-blue-300 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                               <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
                                 <input
                                   type="text"
                                   value={editingVdcrManager.name}
                                   onChange={(e) => setEditingVdcrManager(prev => prev ? { ...prev, name: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Manager name"
                                   autoFocus
                                 />
                                 <input
                                   type="email"
                                   value={editingVdcrManager.email}
                                   onChange={(e) => setEditingVdcrManager(prev => prev ? { ...prev, email: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Email"
                                 />
                                 <input
                                   type="tel"
                                   value={editingVdcrManager.phone}
                                   onChange={(e) => setEditingVdcrManager(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                   className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Phone"
                                 />
                               </div>
                               <div className="flex items-center gap-1.5 sm:gap-2">
                                 <button
                                   type="button"
                                   onClick={(e) => {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     saveVdcrManagerEdit(e);
                                   }}
                                   className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                                 >
                                   <CheckCircle size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                   Save
                                 </button>
                                 <button
                                   type="button"
                                   onClick={cancelVdcrManagerEdit}
                                   className="flex-1 sm:flex-initial bg-gray-500 hover:bg-gray-600 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                                 >
                                   <X size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                   Cancel
                                 </button>
                               </div>
                             </div>
                           ) : (
                             // Standard single-field edit form for other fields
                             <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 flex-1 bg-blue-50 border border-blue-300 rounded-lg p-2">
                               {(() => {
                                //  console.log('🔧 🎯 ACTUALLY RENDERING EDIT INPUT for field:', field, 'value:', editingEntries[field]?.value, 'ForceRender:', forceRender);
                                 return null;
                               })()}
                               <input
                                 type="text"
                                 value={editingEntries[field]?.value || ''}
                                 onChange={(e) => {
                                  //  console.log('🔧 Input onChange triggered for field:', field, 'new value:', e.target.value);
                                   setEditingEntries(prev => ({ 
                                     ...prev, 
                                     [field]: { ...prev[field]!, value: e.target.value } 
                                   }));
                                 }}
                                 className="flex-1 text-xs sm:text-sm bg-white border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                 autoFocus
                                 placeholder="Edit this field..."
                               />
                               <button
                                 type="button"
                                 onClick={(e) => {
                                   e.preventDefault();
                                   e.stopPropagation();
                                  //  console.log('🔧 🎯 SAVE BUTTON CLICKED for field:', field);
                                  //  console.log('🔧 🎯 Current editingEntries:', editingEntries);
                                  //  console.log('🔧 🎯 Field value:', editingEntries[field]?.value);
                                   saveEditedEntry(field);
                                 }}
                                 className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                               >
                                 <CheckCircle size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                 Save
                               </button>
                               <button
                                 type="button"
                                 onClick={() => {
                                  //  console.log('🔧 Cancel button clicked for field:', field);
                                   cancelEditingEntry(field);
                                 }}
                                 className="flex-1 sm:flex-initial bg-gray-500 hover:bg-gray-600 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                               >
                                 <X size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                                 Cancel
                               </button>
                             </div>
                           )
                         ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onChange(option);
                                toggleAccordion(field);
                                setSearchQueries(prev => ({ ...prev, [field]: '' }));
                              }}
                              className="flex-1 text-left text-xs sm:text-sm hover:text-blue-600 transition-colors truncate min-w-0"
                            >
                              {option}
                            </button>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // console.log('🔧 🎯 PENCIL ICON CLICKED for field:', field, 'option:', option, 'originalIndex:', originalIndex);
                                  await startEditingEntry(field, originalIndex, option);
                                }}
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Pencil size={10} className="sm:w-3 sm:h-3" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteEntry(field, originalIndex)}
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                title="Delete"
                              >
                                <X size={10} className="sm:w-3 sm:h-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-500">
                    No options found
                  </div>
                )}
              </div>
              
              {/* Add New Button - Always Visible */}
              <div className="border-t border-gray-200 p-2 sm:p-3 bg-white">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => showAddNewForm(field)}
                  className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Add New {label}
                </Button>
              </div>
              
              {/* Add New Form */}
              {showAddNew[field] && (
                <div className="border-t border-gray-200 p-2 sm:p-4 bg-white">
                  {field === 'projectManager' || field === 'vdcrManager' ? (
                    // Special form for Project Manager and VDCR Manager with contact details
                    <div className="space-y-2 sm:space-y-3">
                      <Input
                        value={newEntries[field] || ''}
                        onChange={(e) => setNewEntries(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={field === 'projectManager' ? "Enter project manager name" : "Enter VDCR manager name"}
                        className="w-full text-xs sm:text-sm h-8 sm:h-10"
                      />
                      <Input
                        value={newEntries[`${field}_email`] || ''}
                        onChange={(e) => setNewEntries(prev => ({ ...prev, [`${field}_email`]: e.target.value }))}
                        placeholder="Enter email address"
                        type="email"
                        className="w-full text-xs sm:text-sm h-8 sm:h-10"
                        pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$"
                        title="Please enter a valid email address"
                      />
                      <Input
                        value={newEntries[`${field}_phone`] || ''}
                        onChange={(e) => setNewEntries(prev => ({ ...prev, [`${field}_phone`]: e.target.value }))}
                        placeholder="Enter phone number (10 digits)"
                        type="tel"
                        className="w-full text-xs sm:text-sm h-8 sm:h-10"
                        pattern="[0-9]{10}"
                        title="Please enter a 10-digit phone number"
                        maxLength={10}
                      />
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addNewEntry(field)}
                          className="bg-blue-600 hover:bg-blue-700 flex-1 text-xs sm:text-sm h-8 sm:h-9"
                          disabled={!newEntries[field]?.trim() || 
                                   (newEntries[`${field}_email`] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEntries[`${field}_email`])) ||
                                   (newEntries[`${field}_phone`] && !/^[0-9]{10}$/.test(newEntries[`${field}_phone`]))}
                        >
                          {field === 'projectManager' ? 'Add Project Manager' : 'Add Documentation Manager'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddNew(prev => ({ ...prev, [field]: false }))}
                          className="text-xs sm:text-sm h-8 sm:h-9"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Standard form for other fields
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={newEntries[field] || ''}
                        onChange={(e) => setNewEntries(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={`Enter new ${label.toLowerCase()}`}
                        className="flex-1 text-xs sm:text-sm h-8 sm:h-10"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addNewEntry(field)}
                        className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-8 sm:h-9"
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddNew(prev => ({ ...prev, [field]: false }))}
                        className="text-xs sm:text-sm h-8 sm:h-9"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep1 = () => (
    <div className={`space-y-6 transition-all duration-300 ${isAnimating ? 'opacity-0 transform translate-x-4' : 'opacity-100 transform translate-x-0'}`}>
      {/* Project Information */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Project Information</h4>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
          <p className="text-xs sm:text-sm text-blue-800">
            <strong>Note:</strong> Fields marked with * are required. Other details can be filled by Project Manager later.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="projectTitle" className="text-xs sm:text-sm font-medium text-gray-700">
              Project Title *
            </Label>
            <Input
              id="projectTitle"
              value={formData.projectTitle}
              onChange={(e) => handleInputChange('projectTitle', e.target.value)}
              placeholder="Enter project title"
              required
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
          </div>

          {renderAccordionField(
            'clientName',
            'Client Name *',
            'Select Client',
            formData.clientName,
            (value) => handleInputChange('clientName', value)
          )}

          {renderAccordionField(
            'plantLocation',
            'Plant Location *',
            'Select or enter location',
            formData.plantLocation,
            (value) => handleInputChange('plantLocation', value)
          )}

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="poNumber" className="text-xs sm:text-sm font-medium text-gray-700">
              PO Number *
            </Label>
            <Input
              id="poNumber"
              value={formData.poNumber}
              onChange={(e) => handleInputChange('poNumber', e.target.value)}
              placeholder="Enter PO number"
              required
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="salesOrderDate" className="text-xs sm:text-sm font-medium text-gray-700">
              Sales Order Date *
            </Label>
            <Input
              id="salesOrderDate"
              type="date"
              value={formData.salesOrderDate}
              onChange={(e) => handleInputChange('salesOrderDate', e.target.value)}
              required
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="completionDate" className="text-xs sm:text-sm font-medium text-gray-700">
              Completion Date *
            </Label>
            <Input
              id="completionDate"
              type="date"
              value={formData.completionDate}
              onChange={(e) => handleInputChange('completionDate', e.target.value)}
              required
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
          </div>

          {renderAccordionField(
            'clientIndustry',
            'Client Industry *',
            'Select Industry',
            formData.clientIndustry,
            (value) => handleInputChange('clientIndustry', value)
          )}


        </div>
      </div>

      {/* Team Management */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Team Management</h4>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {renderAccordionField(
            'projectManager',
            'Project Manager *',
            'Select Manager',
            formData.projectManager,
            (value) => handleInputChange('projectManager', value)
          )}

          {renderAccordionField(
            'vdcrManager',
            'Documentation Manager *',
            'Select Documentation Manager',
            formData.vdcrManager,
            (value) => handleInputChange('vdcrManager', value)
          )}

          {renderAccordionField(
            'consultant',
            'Consultant (Optional)',
            'Select Consultant',
            formData.consultant,
            (value) => handleInputChange('consultant', value)
          )}

          {renderAccordionField(
            'tpiAgency',
            'TPI Agency (Optional)',
            'Select TPI Agency',
            formData.tpiAgency,
            (value) => handleInputChange('tpiAgency', value)
          )}

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="clientFocalPoint" className="text-xs sm:text-sm font-medium text-gray-700">
              Client Focal Point (Optional)
            </Label>
            <Input
              id="clientFocalPoint"
              value={formData.clientFocalPoint}
              onChange={(e) => handleInputChange('clientFocalPoint', e.target.value)}
              placeholder="Name and designation"
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className={`space-y-6 transition-all duration-300 ${isAnimating ? 'opacity-0 transform translate-x-4' : 'opacity-100 transform translate-x-0'}`}>
      {/* Scope of Work */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Scope of Work</h4>
        </div>
        
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-xs sm:text-sm font-medium text-gray-700">Select Services Included:</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(formData.servicesIncluded).map(([service, checked]) => (
              <div key={service} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer" onClick={() => handleServiceChange(service as keyof ProjectFormData['servicesIncluded'], !checked)}>
                <input
                  type="checkbox"
                  id={service}
                  checked={checked}
                  onChange={(e) => handleServiceChange(service as keyof ProjectFormData['servicesIncluded'], e.target.checked)}
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                />
                <Label htmlFor={service} className="text-xs sm:text-sm font-medium text-gray-700 capitalize cursor-pointer">
                  {service}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Scope Description */}
        <div className="space-y-2 sm:space-y-3">
          <Label htmlFor="scopeDescription" className="text-xs sm:text-sm font-medium text-gray-700">
            Scope Description
          </Label>
          <Textarea
            id="scopeDescription"
            value={formData.scopeDescription}
            onChange={(e) => handleInputChange('scopeDescription', e.target.value)}
            placeholder="Detailed description of the scope of services included in the project, objectives, and key deliverables"
            rows={4}
            className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
          />
        </div>
      </div>

      {/* Document Uploads */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Document Uploads</h4>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="unpricedPOFile" className="text-xs sm:text-sm font-medium text-gray-700">
              Unpriced PO File
            </Label>
            <Input
              id="unpricedPOFile"
              type="file"
              multiple
              onChange={(e) => handleFileUpload('unpricedPOFile', e.target.files && e.target.files.length ? Array.from(e.target.files) : null)}
              className="flex items-center text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10 leading-9 sm:leading-10 py-0 file:mr-2 md:flex md:items-center md:file:flex md:file:items-center md:file:h-full"
            />
            {formData.unpricedPOFile?.length ? (
  <p className="text-xs text-gray-600 mt-1">
    {formData.unpricedPOFile.length} file(s) selected
  </p>
) : null}
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
            {/* Display existing Unpriced PO documents */}
            {isEditMode && existingDocuments.unpricedPODocuments.length > 0 && (
              <div className="mt-2 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs sm:text-sm font-medium text-blue-800 mb-1.5 sm:mb-2">Existing Documents:</p>
                <div className="space-y-1">
                  {existingDocuments.unpricedPODocuments.map((doc: any, index: number) => (
                    <div key={doc.id || `unpriced-${index}`} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                      <span className="text-blue-700 truncate flex-1 min-w-0">{doc.name || 'Document'}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id || doc.document_name || index.toString(), 'unpricedPODocuments', index);
                          }}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                          title="Delete document"
                        >
                          <X size={14} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="designInputsPID" className="text-xs sm:text-sm font-medium text-gray-700">
              Design Inputs/PID
            </Label>
            <Input
              id="designInputsPID"
              type="file"
              multiple
              onChange={(e) => handleFileUpload('designInputsPID', e.target.files && e.target.files.length ? Array.from(e.target.files) : null)}
              className="flex items-center text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10 leading-8 sm:leading-10 py-0 file:mr-2 md:flex md:items-center md:file:flex md:file:items-center md:file:h-full"
            />
            {formData.designInputsPID?.length ? (
  <p className="text-xs text-gray-600 mt-1">
    {formData.designInputsPID.length} file(s) selected
  </p>
) : null}
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
            {/* Display existing Design Inputs documents */}
            {isEditMode && existingDocuments.designInputsDocuments.length > 0 && (
              <div className="mt-2 p-2 sm:p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-xs sm:text-sm font-medium text-green-800 mb-1.5 sm:mb-2">Existing Documents:</p>
                <div className="space-y-1">
                  {existingDocuments.designInputsDocuments.map((doc: any, index: number) => (
                    <div key={doc.id || `design-${index}`} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                      <span className="text-green-700 truncate flex-1 min-w-0">{doc.name || 'Document'}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 underline"
                        >
                          View
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id || doc.document_name || index.toString(), 'designInputsDocuments', index);
                          }}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                          title="Delete document"
                        >
                          <X size={14} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="clientReferenceDoc" className="text-xs sm:text-sm font-medium text-gray-700">
              Client's Reference Document
            </Label>
            <Input
              id="clientReferenceDoc"
              type="file"
              multiple
              onChange={(e) => handleFileUpload('clientReferenceDoc', e.target.files && e.target.files.length ? Array.from(e.target.files) : null)}
              className="flex items-center text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10 leading-8 sm:leading-10 py-0 file:mr-2 md:flex md:items-center md:file:flex md:file:items-center md:file:h-full"
            />
            {formData.clientReferenceDoc?.length ? (
  <p className="text-xs text-gray-600 mt-1">
    {formData.clientReferenceDoc.length} file(s) selected
  </p>
) : null}
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
            {/* Display existing Client Reference documents */}
            {isEditMode && existingDocuments.clientReferenceDocuments.length > 0 && (
              <div className="mt-2 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs sm:text-sm font-medium text-blue-800 mb-1.5 sm:mb-2">Existing Documents:</p>
                <div className="space-y-1">
                  {existingDocuments.clientReferenceDocuments.map((doc: any, index: number) => (
                    <div key={doc.id || `client-${index}`} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                      <span className="text-blue-700 truncate flex-1 min-w-0">{doc.name || 'Document'}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          View
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id || doc.document_name || index.toString(), 'clientReferenceDocuments', index);
                          }}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                          title="Delete document"
                        >
                          <X size={14} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="otherDocuments" className="text-xs sm:text-sm font-medium text-gray-700">
              Other Documents
            </Label>
            <Input
              id="otherDocuments"
              type="file"
              multiple
              onChange={(e) => handleFileUpload('otherDocuments', e.target.files && e.target.files.length ? Array.from(e.target.files) : null)}
              className="flex items-center text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10 leading-8 sm:leading-10 py-0 file:mr-2 md:flex md:items-center md:file:flex md:file:items-center md:file:h-full"
            />
            {formData.otherDocuments?.length ? (
  <p className="text-xs text-gray-600 mt-1">
    {formData.otherDocuments.length} file(s) selected
  </p>
) : null}
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
            {/* Display existing Other documents */}
            {isEditMode && existingDocuments.otherDocuments.length > 0 && (
              <div className="mt-2 p-2 sm:p-3 bg-orange-50 border border-orange-200 rounded-md">
                <p className="text-xs sm:text-sm font-medium text-orange-800 mb-1.5 sm:mb-2">Existing Documents:</p>
                <div className="space-y-1">
                  {existingDocuments.otherDocuments.map((doc: any, index: number) => (
                    <div key={doc.id || `other-${index}`} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                      <span className="text-orange-700 truncate flex-1 min-w-0">{doc.name || 'Document'}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-600 hover:text-orange-800 underline"
                        >
                          View
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id || doc.document_name || index.toString(), 'otherDocuments', index);
                          }}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                          title="Delete document"
                        >
                          <X size={14} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Notes */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Additional Notes</h4>
        </div>
        
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="kickoffMeetingNotes" className="text-xs sm:text-sm font-medium text-gray-700">
              Kick-off Meeting Notes
            </Label>
            <Textarea
              id="kickoffMeetingNotes"
              value={formData.kickoffMeetingNotes}
              onChange={(e) => handleInputChange('kickoffMeetingNotes', e.target.value)}
              placeholder="Key discussion points from project kick-off meeting"
              rows={3}
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="specialProductionNotes" className="text-xs sm:text-sm font-medium text-gray-700">
              Special Notes for Production
            </Label>
            <Textarea
              id="specialProductionNotes"
              value={formData.specialProductionNotes}
              onChange={(e) => handleInputChange('specialProductionNotes', e.target.value)}
              placeholder="Special requirements, standards, or constraints for production"
              rows={3}
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className={`space-y-4 sm:space-y-6 transition-all duration-300 ${isAnimating ? 'opacity-0 transform translate-x-4' : 'opacity-100 transform translate-x-0'}`}>
      <div className="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-6">
        <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
        <h4 className="text-base sm:text-lg font-semibold text-gray-800">Equipment Information</h4>
      </div>

      {/* Bulk upload by Excel */}
      <Card className="p-4 sm:p-5 bg-blue-50/50 border-blue-200">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3">
          <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
          <h5 className="text-base sm:text-lg font-semibold text-gray-800">Bulk upload by Excel</h5>
        </div>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Download the sample template, fill in your equipment (8 columns: Sr. No., Equipment Type, Tag No., Job No., Equipment Title are mandatory; Size, Material, Design Code are optional), then upload the file.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadEquipmentBulkTemplate}
            className="border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
          >
            <Download className="w-4 h-4 mr-2" />
            Download sample template
          </Button>
          <div className="flex items-center gap-2">
            <Input
              ref={equipmentBulkInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) parseEquipmentBulkExcel(file);
              }}
              className="text-xs sm:text-sm border-blue-200 max-w-[200px] sm:max-w-[240px]"
            />
            <span className="text-xs text-gray-500">.xlsx or .xls</span>
          </div>
        </div>
      </Card>

      {/* Equipment Types Selection */}
      <div className="space-y-3 sm:space-y-4">
        <h5 className="text-base sm:text-lg font-semibold text-gray-800">Select Equipment Types & Quantities</h5>
        
        <div className="space-y-2 sm:space-y-3">
          {[
            'Heat Exchanger', 
            'Pressure Vessel', 
            'Reactor', 
            'Storage Tank', 
            'Distillation Column',
            ...customEquipmentTypes
          ].map((equipmentType) => (
            <div key={equipmentType} className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-row items-center justify-between gap-2 flex-nowrap mb-2 sm:mb-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink">
                  <input
                    type="checkbox"
                    id={equipmentType}
                    checked={equipmentDetails[equipmentType] && equipmentDetails[equipmentType].length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleEquipmentQuantityChange(equipmentType, 1);
                      } else {
                        handleEquipmentQuantityChange(equipmentType, 0);
                      }
                    }}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                  />
                  <Label htmlFor={equipmentType} className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                    {equipmentType === 'Distillation Column' ? 'Column' : equipmentType}
                  </Label>
                </div>
                
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Quantity:</Label>
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    value={equipmentDetails[equipmentType]?.length || 0}
                    onChange={(e) => handleEquipmentQuantityChange(equipmentType, parseInt(e.target.value) || 0)}
                    className="w-14 sm:w-16 text-center text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-7 sm:h-9"
                  />
                </div>
              </div>

              {/* Dynamic Subforms */}
              {equipmentDetails[equipmentType] && equipmentDetails[equipmentType].length > 0 && (
                <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">
                    Please provide Tag Number, Job Number, and Equipment Title for each equipment:
                  </p>
                  
                  {equipmentDetails[equipmentType].map((equipment, index) => (
                    <Card key={equipment.id} className="p-3 sm:p-4 bg-white border border-gray-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                        <h6 className="text-sm sm:text-base font-semibold text-gray-800">
                          {equipmentType === 'Distillation Column' ? 'Column' : equipmentType} - Unit {index + 1}
                        </h6>
                        <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-100 text-blue-800 text-xs sm:text-sm rounded-full w-fit">
                          Equipment {index + 1}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4">
                        <div className="space-y-1.5 sm:space-y-2">
                          <Label className="text-xs sm:text-sm font-medium text-gray-700">
                            Tag Number *
                          </Label>
                          <Input
                            value={equipment.tagNumber}
                            onChange={(e) => updateEquipmentDetail(equipmentType, index, 'tagNumber', e.target.value)}
                            placeholder={`${equipmentType.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-')}-Unit-${String(index + 1).padStart(3, '0')}`}
                            required
                            className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                          />
                        </div>

                        <div className="space-y-1.5 sm:space-y-2">
                          <Label className="text-xs sm:text-sm font-medium text-gray-700">
                            Job Number *
                          </Label>
                          <Input
                            value={equipment.jobNumber}
                            onChange={(e) => updateEquipmentDetail(equipmentType, index, 'jobNumber', e.target.value)}
                            placeholder="Job-2024-001"
                            required
                            className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                          />
                        </div>

                        <div className="space-y-1.5 sm:space-y-2">
                          <Label className="text-xs sm:text-sm font-medium text-gray-700">
                            Equipment Title *
                          </Label>
                          <Input
                            value={equipment.manufacturingSerial}
                            onChange={(e) => updateEquipmentDetail(equipmentType, index, 'manufacturingSerial', e.target.value)}
                            placeholder="Enter equipment title"
                            required
                            className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                          />
                        </div>
                      </div>

                      {/* Technical Specifications */}
                      <div className="mb-3 sm:mb-4">
                        <h6 className="text-xs sm:text-sm font-semibold text-gray-800 mb-2 sm:mb-3">Technical Specifications</h6>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                          <div className="space-y-1.5 sm:space-y-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700">
                              Size
                            </Label>
                            <Input
                              value={equipment.size || ''}
                              onChange={(e) => updateEquipmentDetail(equipmentType, index, 'size', e.target.value)}
                              placeholder="e.g., 4.2m x 1.6m"
                              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                            />
                            <p className="text-[10px] sm:text-xs text-gray-500">Dimensions (length x width x height)</p>
                          </div>

                          <div className="space-y-1.5 sm:space-y-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700">
                              Material
                            </Label>
                            <Input
                              value={equipment.material || ''}
                              onChange={(e) => updateEquipmentDetail(equipmentType, index, 'material', e.target.value)}
                              placeholder="e.g., SS 304, Carbon Steel"
                              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                            />
                            <p className="text-[10px] sm:text-xs text-gray-500">Primary material specification</p>
                          </div>

                          <div className="space-y-1.5 sm:space-y-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700">
                              Design Code
                            </Label>
                            <Input
                              value={equipment.designCode || ''}
                              onChange={(e) => updateEquipmentDetail(equipmentType, index, 'designCode', e.target.value)}
                              placeholder="e.g., ASME VIII Div 1, TEMA Class R"
                              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                            />
                            <p className="text-[10px] sm:text-xs text-gray-500">Applicable design standard</p>
                          </div>
                        </div>
                      </div>

                      {/* Equipment Documents section (Document Upload) — hidden; set to true to show again */}
                      {false && (
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label className="text-xs sm:text-sm font-medium text-gray-700">
                          Equipment Documents
                        </Label>
                        <Input
                          type="file"
                          multiple
                          onChange={(e) => updateEquipmentDetail(equipmentType, index, 'documents', e.target.files ? Array.from(e.target.files) : [])}
                          className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
                        />
                        {equipment.documents.length > 0 && (
                          <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-gray-600">
                            {equipment.documents.length} file(s) selected
                          </div>
                        )}
                        {/* Display existing equipment documents in edit mode */}
                        {isEditMode && equipment.id && existingEquipmentDocuments[equipment.id] && existingEquipmentDocuments[equipment.id].length > 0 && (
                          <div className="mt-1.5 sm:mt-2 p-2 sm:p-3 bg-green-50 border border-green-200 rounded-md">
                            <p className="text-xs sm:text-sm font-medium text-green-800 mb-1.5 sm:mb-2">Existing Equipment Documents:</p>
                            <div className="space-y-1">
                              {existingEquipmentDocuments[equipment.id].map((doc: any, docIndex: number) => (
                                <div key={docIndex} className="flex items-center justify-between text-xs sm:text-sm">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                    <FileText size={12} className="sm:w-[14px] sm:h-[14px] text-green-600 flex-shrink-0" />
                                    <span className="text-green-700 truncate">{doc.document_name}</span>
                                  </div>
                                  <a
                                    href={doc.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-600 hover:text-green-800 text-xs underline ml-2 flex-shrink-0"
                                  >
                                    View
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add New Equipment Type */}
        <div className="text-center">
          {!showAddEquipmentType ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddEquipmentType(true)}
              className="border-dashed border-2 border-blue-300 text-blue-600 hover:bg-blue-50 px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm"
            >
              <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Click here to add new equipment type</span>
              <span className="sm:hidden">Add Equipment Type</span>
            </Button>
          ) : (
            <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 p-3 sm:p-4 bg-white border-2 border-blue-300 rounded-lg w-full sm:w-auto">
              <Input
                value={newEquipmentType}
                onChange={(e) => setNewEquipmentType(e.target.value)}
                placeholder="Enter equipment type name"
                className="w-full sm:w-64 text-xs sm:text-sm border-blue-300 focus:border-blue-500 focus:ring-blue-500 h-8 sm:h-10"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={addCustomEquipmentType}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm h-8 sm:h-9 flex-1 sm:flex-initial px-3 sm:px-4"
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddEquipmentType(false);
                    setNewEquipmentType('');
                  }}
                  className="border-gray-300 hover:border-gray-400 text-xs sm:text-sm h-8 sm:h-9 flex-1 sm:flex-initial px-3 sm:px-4"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Total Equipment Count */}
      <div className="text-center p-3 sm:p-4 bg-blue-100 rounded-lg">
        <p className="text-blue-800 font-bold text-sm sm:text-base">
          Total Equipment: {Object.values(equipmentDetails).reduce((total, arr) => total + arr.length, 0)} units
        </p>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return renderStep1();
    }
  };

  const renderSuccessScreen = () => (
    <div className="text-center py-12">
      {/* Success Icon */}
      <div className="mx-auto w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center mb-6">
        <CheckCircle size={48} className="text-white" />
      </div>
      
      {/* Success Message */}
      <h2 className="text-3xl font-bold text-gray-800 mb-4">
         🎉 {isEditMode ? 'Project Updated Successfully!' : 'Project Created Successfully!'}
      </h2>
      
      {/* Team Members Added Message */}
      {!isEditMode && (formData.projectManager || formData.vdcrManager) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-blue-800">
            <Users size={20} />
            <span className="font-semibold">Team Members Added Automatically!</span>
          </div>
          <p className="text-blue-700 text-sm mt-1">
            {formData.projectManager && formData.vdcrManager 
              ? `${formData.projectManager} (Project Manager) and ${formData.vdcrManager} (Documentation Manager) have been added to the project team. Check the Settings tab to see them.`
              : formData.projectManager 
                ? `${formData.projectManager} (Project Manager) has been added to the project team. Check the Settings tab to see them.`
                : `${formData.vdcrManager} (Documentation Manager) has been added to the project team. Check the Settings tab to see them.`
            }
          </p>
        </div>
      )}
      
      <p className="text-lg text-gray-600 mb-6">
        {isEditMode ? 'Your project has been updated successfully.' : 'Your new project'} "<span className="font-semibold text-blue-600">{createdProject?.projectTitle}</span>" {isEditMode ? 'has been updated.' : 'has been added to the dashboard.'}
      </p>
      
      {/* Project Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 max-w-md mx-auto">
        <h3 className="font-semibold text-blue-800 mb-3">Project Summary</h3>
        <div className="space-y-2 text-sm text-blue-700">
          <div className="flex justify-between">
            <span>Client:</span>
            <span className="font-medium">{createdProject?.clientName}</span>
          </div>
          <div className="flex justify-between">
            <span>Equipment Count:</span>
            <span className="font-medium">{createdProject?.equipment?.length || 0} types</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="font-medium capitalize">{createdProject?.status}</span>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <Button
          onClick={() => {
            onSubmit(createdProject);
            onClose();
          }}
          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          <CheckCircle size={20} className="mr-2" />
           {isEditMode ? 'Done' : 'Done'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setShowSuccessScreen(false);
            setCurrentStep(1);
            // Reset form data
            setFormData({
              projectTitle: '',
              clientName: '',
              plantLocation: '',
              poNumber: '',
              salesOrderDate: '',
              completionDate: '',
              clientIndustry: '',
              projectManager: '',
              vdcrManager: '',
              consultant: '',
              tpiAgency: '',
              clientFocalPoint: '',
              servicesIncluded: {
                design: false,
                manufacturing: false,
                testing: false,
                documentation: false,
                installationSupport: false,
                commissioning: false
              },
              scopeDescription: '',
              unpricedPOFile: null,
              designInputsPID: null,
              clientReferenceDoc: null,
              otherDocuments: null,
              kickoffMeetingNotes: '',
              specialProductionNotes: ''
            });
            setEquipmentDetails({});
            setCustomEquipmentType([]);
          }}
          className="px-6 py-3 border-gray-300 hover:border-gray-400"
        >
           {isEditMode ? 'Edit Another Project' : 'Create Another Project'}
        </Button>
      </div>
    </div>
  );

  // Role assignment functionality
  const handleRoleAssignment = () => {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    setCurrentUserRole(userData.role || 'viewer');
    setShowRoleAssignment(true);
  };

  const handleRoleAssigned = () => {
    setShowRoleAssignment(false);
    // Refresh project data if needed
  };

  // Show role assignment modal
  if (showRoleAssignment) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <AssignRoleForm
          currentUserRole={currentUserRole}
          firmId={JSON.parse(localStorage.getItem('userData') || '{}').firm_id}
          projectId={createdProject?.id}
          onRoleAssigned={handleRoleAssigned}
          onClose={() => setShowRoleAssignment(false)}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-5xl max-h-[95vh] overflow-y-auto bg-white">
        <div className="relative p-3 sm:p-6">
          {/* Cancel/Close button - fixed top-right */}
          <Button variant="ghost" size="sm" onClick={onClose} className="absolute right-3 top-3 sm:right-6 sm:top-6 hover:bg-gray-100 p-1 sm:p-2 z-10">
            <X size={18} className="sm:w-5 sm:h-5" />
          </Button>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6 pr-10 sm:pr-12">
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg sm:text-xl md:text-2xl font-bold text-gray-800 ${designSystem.components.sectionTitle ? '' : ''}`}>
                {isEditMode ? 'Edit Project' : 'Add New Project'}
              </h2>
              {isEditMode && (
                <div className="text-xs sm:text-sm text-blue-600 bg-blue-50 px-2 sm:px-3 py-1 rounded-full mt-1 sm:mt-0 inline-block">
                  <span className="truncate">Editing: {editData?.projectTitle}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {currentUserRole === 'firm_admin' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRoleAssignment}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Assign Roles</span>
                </Button>
              )}
            </div>
          </div>

          {/* Progress Section */}
          {renderProgressBar()}

          {showSuccessScreen ? (
            renderSuccessScreen()
          ) : (
            <div className="relative">
              {/* Loading Overlay */}
              {isSubmitting && (
                <div className="absolute inset-0 bg-white bg-opacity-95 flex flex-col items-center justify-center z-50 rounded-lg">
                  <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
                  <p className="text-lg font-semibold text-gray-800 mb-2">
                    {isEditMode ? 'Updating Project...' : 'Creating Project...'}
                  </p>
                  <p className="text-sm text-gray-600 text-center px-4">
                    Please wait while we {isEditMode ? 'update' : 'create'} your project. This may take a few seconds.
                  </p>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Current Step Content */}
                {renderCurrentStep()}

                {/* Navigation */}
                <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 pt-4 sm:pt-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className="px-4 sm:px-6 py-2 text-xs sm:text-sm border-gray-300 hover:border-gray-400 transition-all duration-200"
                >
                  <ChevronLeft size={14} className="sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Previous
                </Button>

                <div className="flex gap-2 sm:space-x-3">
                  {currentStep < totalSteps ? (
                    <Button 
                      type="button" 
                      onClick={nextStep} 
                      className="flex-1 sm:flex-initial px-4 sm:px-8 py-2 text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    >
                      <span className="whitespace-nowrap">Next Step</span>
                      <ChevronRight size={14} className="sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      className="flex-1 sm:flex-initial px-4 sm:px-6 py-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      disabled={isAnimating || isSubmitting}
                       onClick={() => {
                         // console.log('🔘 Create button clicked!');
                       }}
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isSubmitting 
                        ? (isEditMode ? 'Updating Project...' : 'Creating Project...')
                        : (isEditMode ? 'Update Project' : 'Create Project')
                      }
                    </Button>
                  )}
                </div>
              </div>
              </form>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AddProjectForm;