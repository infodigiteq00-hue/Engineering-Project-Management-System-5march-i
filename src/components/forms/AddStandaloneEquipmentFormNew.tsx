import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { X, Upload, Users, FileText, Settings, Building2, Plus, CheckCircle, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { designSystem } from "@/lib/design-system";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { fastAPI } from "@/lib/api";

interface AddStandaloneEquipmentFormNewProps {
  onClose: () => void;
  onSubmit: (equipmentData: any) => void;
  /** When set, form opens in edit mode with this equipment's data pre-filled */
  editData?: any;
  isEditMode?: boolean;
}

interface StandaloneEquipmentFormData {
  // Equipment Information (Step 1)
  equipmentType: string;
  tagNumber: string;
  jobNumber: string;
  manufacturingSerial: string;
  size: string;
  material: string;
  designCode: string;
  equipmentDocuments: File[];
  
  // Basic Information (Step 2)
  clientName: string;
  plantLocation: string;
  poNumber: string;
  salesOrderDate: string;
  completionDate: string;
  clientIndustry: string;
  equipmentManager: string;
  consultant: string;
  tpiAgency: string;
  clientFocalPoint: string;
  
  // Scope & Documents (Step 3)
  servicesIncluded: {
    design: boolean;
    manufacturing: boolean;
    testing: boolean;
    documentation: boolean;
    installationSupport: boolean;
    commissioning: boolean;
  };
  scopeDescription: string;
  unpricedPOFile: File[] | null;
  designInputsPID: File[] | null;
  clientReferenceDoc: File[] | null;
  otherDocuments: File[] | null;
  kickoffMeetingNotes: string;
  specialProductionNotes: string;
}

const getCustomField = (eq: any, name: string): string => {
  if (!eq?.custom_fields || !Array.isArray(eq.custom_fields)) return '';
  const f = eq.custom_fields.find((x: any) => x.name === name);
  return (f?.value ?? '').trim();
};

const AddStandaloneEquipmentFormNew = ({ onClose, onSubmit, editData, isEditMode }: AddStandaloneEquipmentFormNewProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [createdEquipment, setCreatedEquipment] = useState<any>(null);

  const [formData, setFormData] = useState<StandaloneEquipmentFormData>({
    // Step 1: Equipment Information
    equipmentType: '',
    tagNumber: '',
    jobNumber: '',
    manufacturingSerial: '',
    size: '',
    material: '',
    designCode: '',
    equipmentDocuments: [],
    
    // Step 2: Basic Information
    clientName: '',
    plantLocation: '',
    poNumber: '',
    salesOrderDate: '',
    completionDate: '',
    clientIndustry: '',
    equipmentManager: '',
    consultant: '',
    tpiAgency: '',
    clientFocalPoint: '',
    
    // Step 3: Scope & Documents
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

  // Pre-fill form when in edit mode (support both camelCase from transform and snake_case from raw API)
  useEffect(() => {
    if (!isEditMode || !editData) return;
    const eq = editData;
    const get = (camel: string, snake: string, customName?: string): string => {
      const v = (eq as any)[camel] ?? (eq as any)[snake] ?? (customName ? getCustomField(eq, customName) : '');
      return (v != null && v !== undefined) ? String(v).trim() : '';
    };
    const getDate = (camel: string, snake: string, customName?: string): string => {
      const v = (eq as any)[camel] ?? (eq as any)[snake] ?? (customName ? getCustomField(eq, customName) : '');
      if (!v) return '';
      const s = String(v).split('T')[0];
      return s || '';
    };
    const servicesIncluded = (eq.servicesIncluded && typeof eq.servicesIncluded === 'object')
      ? {
          design: !!eq.servicesIncluded.design,
          manufacturing: !!eq.servicesIncluded.manufacturing,
          testing: !!eq.servicesIncluded.testing,
          documentation: !!eq.servicesIncluded.documentation,
          installationSupport: !!eq.servicesIncluded.installationSupport,
          commissioning: !!eq.servicesIncluded.commissioning
        }
      : (eq.services_included && typeof eq.services_included === 'object')
      ? {
          design: !!(eq as any).services_included.design,
          manufacturing: !!(eq as any).services_included.manufacturing,
          testing: !!(eq as any).services_included.testing,
          documentation: !!(eq as any).services_included.documentation,
          installationSupport: !!(eq as any).services_included.installation_support,
          commissioning: !!(eq as any).services_included.commissioning
        }
      : { design: false, manufacturing: false, testing: false, documentation: false, installationSupport: false, commissioning: false };
    const clientName = get('clientName', 'client_name', 'Client Name');
    const plantLocation = get('plantLocation', 'plant_location', 'Plant Location');
    const clientIndustry = get('clientIndustry', 'client_industry', 'Client Industry');
    const consultant = get('consultant', 'consultant', 'Consultant');
    const tpiAgency = get('tpiAgency', 'tpi_agency', 'TPI Agency');
    const equipmentManager = get('equipmentManager', 'equipment_manager', 'Equipment Manager');
    setFormData({
      equipmentType: eq.type || (eq as any).type || '',
      tagNumber: eq.tagNumber ?? (eq as any).tag_number ?? '',
      jobNumber: eq.jobNumber ?? (eq as any).job_number ?? '',
      manufacturingSerial: eq.manufacturingSerial ?? (eq as any).manufacturing_serial ?? '',
      size: eq.size ?? (eq as any).size ?? '',
      material: eq.material ?? (eq as any).material ?? '',
      designCode: eq.designCode ?? (eq as any).design_code ?? '',
      equipmentDocuments: [],
      clientName,
      plantLocation,
      poNumber: get('poNumber', 'po_number', 'PO Number'),
      salesOrderDate: getDate('salesOrderDate', 'sales_order_date', 'Sales Order Date'),
      completionDate: getDate('completionDate', 'completion_date', 'Completion Date'),
      clientIndustry,
      equipmentManager,
      consultant,
      tpiAgency,
      clientFocalPoint: get('clientFocalPoint', 'client_focal_point', 'Client Focal Point'),
      servicesIncluded,
      scopeDescription: get('scopeDescription', 'scope_description', 'Scope Description'),
      unpricedPOFile: null,
      designInputsPID: null,
      clientReferenceDoc: null,
      otherDocuments: null,
      kickoffMeetingNotes: get('kickoffMeetingNotes', 'kickoff_meeting_notes', 'Kickoff Meeting Notes'),
      specialProductionNotes: get('specialProductionNotes', 'special_production_notes', 'Special Production Notes')
    });
    // Ensure dropdown options include current values so they display in edit mode
    setDynamicOptions(prev => {
      const ensureOption = (key: keyof typeof prev, value: string) => {
        if (!value) return prev[key];
        const list = prev[key] || [];
        return list.includes(value) ? list : [value, ...list];
      };
      return {
        ...prev,
        clientName: ensureOption('clientName', clientName),
        plantLocation: ensureOption('plantLocation', plantLocation),
        clientIndustry: ensureOption('clientIndustry', clientIndustry),
        consultant: ensureOption('consultant', consultant),
        tpiAgency: ensureOption('tpiAgency', tpiAgency),
        equipmentManager: ensureOption('equipmentManager', equipmentManager),
      };
    });
    const eqType = eq.type || 'Equipment';
    setEquipmentDetails({
      [eqType]: [{
        id: eq.id,
        tagNumber: eq.tagNumber || '',
        jobNumber: eq.jobNumber || '',
        manufacturingSerial: eq.manufacturingSerial || '',
        size: eq.size || '',
        material: eq.material || '',
        designCode: eq.designCode || '',
        documents: []
      }]
    });
  }, [isEditMode, editData?.id]);

  // Custom equipment type state
  const [customEquipmentTypes, setCustomEquipmentTypes] = useState<string[]>([]);
  const [newEquipmentType, setNewEquipmentType] = useState('');
  const [showAddEquipmentType, setShowAddEquipmentType] = useState(false);

  // Equipment Details - stores arrays of equipment for each type (same as AddProjectForm)
  const [equipmentDetails, setEquipmentDetails] = useState<Record<string, Array<{
    id: string;
    tagNumber: string;
    jobNumber: string;
    manufacturingSerial: string;
    size: string;
    material: string;
    designCode: string;
    documents: File[];
  }>>>({});

  // Dynamic options for dropdowns
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({
    clientName: [],
    clientIndustry: [],
    equipmentManager: [],
    consultant: [],
    tpiAgency: [],
    plantLocation: []
  });

  // Accordion states
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    clientName: '',
    clientIndustry: '',
    equipmentManager: '',
    consultant: '',
    tpiAgency: '',
    plantLocation: ''
  });

  // Editing states
  const [editingEntries, setEditingEntries] = useState<Record<string, { index: number; value: string }>>({});
  const [newEntries, setNewEntries] = useState<Record<string, string>>({});
  const [showAddNew, setShowAddNew] = useState<Record<string, boolean>>({});
  
  // Store Equipment Manager contact details (name -> {email, phone})
  const [equipmentManagerContacts, setEquipmentManagerContacts] = useState<Record<string, { email: string; phone: string }>>({});
  
  // Store project managers for Equipment Manager field
  const [projectManagers, setProjectManagers] = useState<Array<{ name: string; email: string; phone: string }>>([]);

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
          // Filter by role - Equipment Manager can be project_manager role
          const equipmentManagers = allTeamMembers
            .filter((member: any) => member.role === 'project_manager')
            .map((member: any) => member.name)
            .filter(Boolean);

          // Update dropdowns with role-filtered team members
          setDynamicOptions(prev => ({
            ...prev,
            equipmentManager: [...new Set([...prev.equipmentManager, ...equipmentManagers])]
          }));

          // Store contact details for equipment managers
          const emContacts: Record<string, { email: string; phone: string }> = {};

          allTeamMembers.forEach((member: any) => {
            if (member.name && member.email && member.role === 'project_manager') {
              emContacts[member.name] = {
                email: member.email,
                phone: member.phone || ''
              };
            }
          });

          // Merge with existing contacts (don't overwrite, just add new ones)
          setEquipmentManagerContacts(prev => ({ ...prev, ...emContacts }));
        }
      } catch (error) {
        console.error('❌ Error fetching firm team members:', error);
      }
    };

    fetchFirmTeamMembers();
  }, []);

  // Fetch existing standalone equipment to populate suggestions
  useEffect(() => {
    const fetchExistingStandaloneEquipment = async () => {
      try {
        // Get current user's firm_id
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const firmId = userData.firm_id;
        
        if (!firmId) {
          console.warn('⚠️ No firm_id found, cannot fetch suggestions');
          return;
        }

        // Fetch standalone equipment from Supabase
        const existingEquipment = await fastAPI.getStandaloneEquipment();
        
        // console.log('📋 Fetched existing equipment:', {
        //   exists: !!existingEquipment,
        //   isArray: Array.isArray(existingEquipment),
        //   length: existingEquipment?.length || 0,
        //   sample: existingEquipment?.[0]
        // });
        
        if (existingEquipment && Array.isArray(existingEquipment) && existingEquipment.length > 0) {
          
          // Extract unique values from existing standalone equipment
          const uniqueClients = [...new Set(existingEquipment.map((eq: any) => eq.client_name).filter(Boolean))];
          const uniqueLocations = [...new Set(existingEquipment.map((eq: any) => eq.plant_location).filter(Boolean))];
          const uniqueIndustries = [...new Set(existingEquipment.map((eq: any) => eq.client_industry).filter(Boolean))];
          const uniqueConsultants = [...new Set(existingEquipment.map((eq: any) => eq.consultant).filter(Boolean))];
          const uniqueTpiAgencies = [...new Set(existingEquipment.map((eq: any) => eq.tpi_agency).filter(Boolean))];
          
          // Extract equipment managers from equipment_manager field in standalone_equipment table
          const uniqueEquipmentManagersFromEquipment = [...new Set(existingEquipment.map((eq: any) => eq.equipment_manager).filter(Boolean))];
          // console.log('📋 Equipment managers from equipment_manager field:', {
          //   count: uniqueEquipmentManagersFromEquipment.length,
          //   managers: uniqueEquipmentManagersFromEquipment,
          //   sampleEquipment: existingEquipment.slice(0, 3).map((eq: any) => ({ id: eq.id, equipment_manager: eq.equipment_manager }))
          // });
          
          // Standard industry options (always available)
          const standardIndustries = ['Petrochemical', 'Steel', 'Refinery', 'Marine', 'Power', 'Pharmaceutical', 'Chemical', 'Oil & Gas'];
          
          // When in edit mode, prepend current equipment values so they are never dropped from options
          const ensureEditInList = (list: string[], camelKey: string): string[] => {
            if (!isEditMode || !editData) return list;
            const snakeKey = camelKey.replace(/([A-Z])/g, (m) => '_' + m.toLowerCase());
            const v = (editData as any)[camelKey] ?? (editData as any)[snakeKey];
            const s = v != null ? String(v).trim() : '';
            if (!s) return list;
            return list.includes(s) ? list : [s, ...list];
          };
          // Update dynamic options with existing data
          // Set equipmentManager immediately with data from equipment_manager field
          setDynamicOptions(prev => ({
            ...prev,
            clientName: ensureEditInList(uniqueClients, 'clientName'),
            plantLocation: ensureEditInList(uniqueLocations, 'plantLocation'),
            clientIndustry: ensureEditInList([...new Set([...standardIndustries, ...uniqueIndustries])], 'clientIndustry'),
            consultant: ensureEditInList(uniqueConsultants, 'consultant'),
            tpiAgency: ensureEditInList(uniqueTpiAgencies, 'tpiAgency'),
            equipmentManager: ensureEditInList(uniqueEquipmentManagersFromEquipment, 'equipmentManager')
          }));
          
          // console.log('✅ Set initial equipmentManager options from equipment_manager field:', uniqueEquipmentManagersFromEquipment.length);
          
          // Fetch equipment managers from multiple sources (will update state with combined results)
          // console.log('🔍 Starting to fetch equipment managers from multiple sources...');
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const supabase = createClient(supabaseUrl, supabaseKey);
            // console.log('✅ Supabase client created');
            
            // Source 1: Fetch team positions where position_name is 'Equipment Manager'
            let equipmentManagersFromTeamPositions: string[] = [];
            try {
              // console.log('🔍 Querying standalone_equipment_team_positions for Equipment Managers...');
              
              // Use REST API directly instead of Supabase client to avoid potential issues
              const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
              const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
              
              const teamPositionsResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/standalone_equipment_team_positions?position_name=eq.Equipment Manager&select=person_name,email,phone`,
                {
                  method: 'GET',
                  headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  }
                }
              );
              
              if (!teamPositionsResponse.ok) {
                const errorText = await teamPositionsResponse.text();
                console.error('❌ Error fetching equipment managers from team_positions:', teamPositionsResponse.status, errorText);
              } else {
                const teamPositions = await teamPositionsResponse.json();
                // console.log('📋 Team positions query result:', {
                //   dataLength: teamPositions?.length || 0,
                //   data: teamPositions
                // });
                
                equipmentManagersFromTeamPositions = teamPositions && Array.isArray(teamPositions) && teamPositions.length > 0 
                  ? [...new Set(teamPositions.map((tp: any) => tp.person_name).filter(Boolean))]
                  : [];
                // console.log('✅ Found equipment managers from team_positions:', equipmentManagersFromTeamPositions.length, equipmentManagersFromTeamPositions);
              }
            } catch (teamPosError) {
              console.error('❌ Error in team_positions query:', teamPosError);
            }
            
            // Source 2: Fetch project managers from users table (users with role 'project_manager' in the same firm)
            let equipmentManagersFromUsers: string[] = [];
            try {
              // console.log('🔍 Querying users table for project managers, firm_id:', firmId);
              
              // Use REST API directly instead of Supabase client
              const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
              const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
              
              const usersResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/users?firm_id=eq.${firmId}&role=eq.project_manager&is_active=eq.true&select=full_name,email,phone`,
                {
                  method: 'GET',
                  headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  }
                }
              );
              
              if (!usersResponse.ok) {
                const errorText = await usersResponse.text();
                console.error('❌ Error fetching project managers from users:', usersResponse.status, errorText);
              } else {
                const projectManagersData = await usersResponse.json();
                // console.log('📋 Users query result:', {
                //   dataLength: projectManagersData?.length || 0,
                //   data: projectManagersData
                // });
                
                equipmentManagersFromUsers = projectManagersData && Array.isArray(projectManagersData) && projectManagersData.length > 0
                  ? [...new Set(projectManagersData.map((user: any) => user.full_name).filter(Boolean))]
                  : [];
                // console.log('✅ Found project managers from users:', equipmentManagersFromUsers.length, equipmentManagersFromUsers);
                
                // Also store these as projectManagers for contact details
                const managersList: Array<{ name: string; email: string; phone: string }> = [];
                if (projectManagersData && Array.isArray(projectManagersData)) {
                  projectManagersData.forEach((user: any) => {
                    if (user.full_name) {
                      managersList.push({
                        name: user.full_name,
                        email: user.email || '',
                        phone: user.phone || ''
                      });
                    }
                  });
                }
                setProjectManagers(managersList);
              }
            } catch (usersError) {
              console.error('❌ Error in users query:', usersError);
            }
            
            // Combine all sources: equipment_manager field, team_positions, and users table
            const allEquipmentManagers = [...new Set([
              ...uniqueEquipmentManagersFromEquipment,
              ...equipmentManagersFromTeamPositions,
              ...equipmentManagersFromUsers
            ])];
            
            // console.log('📊 Total unique equipment managers found:', allEquipmentManagers.length);
            // console.log('📊 Equipment managers list:', allEquipmentManagers);
            // console.log('📊 Sources breakdown:', {
            //   fromEquipment: uniqueEquipmentManagersFromEquipment.length,
            //   fromTeamPositions: equipmentManagersFromTeamPositions.length,
            //   fromUsers: equipmentManagersFromUsers.length,
            //   total: allEquipmentManagers.length
            // });
            
            // Update dynamic options with combined equipment managers
            setDynamicOptions(prev => {
              const updated = {
                ...prev,
                equipmentManager: allEquipmentManagers
              };
              // console.log('📊 Setting dynamicOptions.equipmentManager:', allEquipmentManagers);
              // console.log('📊 Updated dynamicOptions state:', updated);
              return updated;
            });
            
            // Store contact details for equipment managers from team_positions
            const managerContacts: Record<string, { email: string; phone: string }> = {};
            
            // Add contacts from team_positions
            try {
              const { data: teamPositions } = await supabase
                .from('standalone_equipment_team_positions')
                .select('person_name, email, phone')
                .eq('position_name', 'Equipment Manager');
              
              if (teamPositions && teamPositions.length > 0) {
                teamPositions.forEach((tp: any) => {
                  if (tp.person_name && tp.email) {
                    managerContacts[tp.person_name] = {
                      email: tp.email || '',
                      phone: tp.phone || ''
                    };
                  }
                });
              }
            } catch (contactError) {
              console.error('❌ Error fetching contact details:', contactError);
            }
            
            // Add contacts from users table (project managers)
            try {
              const { data: projectManagersData } = await supabase
                .from('users')
                .select('full_name, email, phone')
                .eq('firm_id', firmId)
                .eq('role', 'project_manager')
                .eq('is_active', true);
              
              if (projectManagersData && projectManagersData.length > 0) {
                projectManagersData.forEach((user: any) => {
                  if (user.full_name) {
                    // Only add if not already present (team_positions takes priority)
                    if (!managerContacts[user.full_name]) {
                      managerContacts[user.full_name] = {
                        email: user.email || '',
                        phone: user.phone || ''
                      };
                    }
                  }
                });
              }
            } catch (contactError) {
              console.error('❌ Error fetching user contact details:', contactError);
            }
            
            setEquipmentManagerContacts(managerContacts);
          } catch (error) {
            console.error('❌ Error fetching equipment managers:', error);
            // Even if team_positions fetch fails, still use equipment_manager field values
            setDynamicOptions(prev => ({
              ...prev,
              equipmentManager: uniqueEquipmentManagersFromEquipment
            }));
          }
        } else {
          // console.log('📋 No existing equipment found, fetching project managers from users table');
          // No existing equipment, but still try to fetch project managers from users table
          try {
            if (firmId) {
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
              const supabase = createClient(supabaseUrl, supabaseKey);
              
              // console.log('📋 Fetching project managers for firm_id:', firmId);
              const { data: projectManagersData, error: usersError } = await supabase
                .from('users')
                .select('full_name, email, phone')
                .eq('firm_id', firmId)
                .eq('role', 'project_manager')
                .eq('is_active', true);
              
              // console.log('📋 Project managers query result:', {
              //   error: usersError,
              //   data: projectManagersData,
              //   count: projectManagersData?.length || 0
              // });
              
              if (!usersError && projectManagersData && projectManagersData.length > 0) {
                const equipmentManagersFromUsers = [...new Set(projectManagersData.map((user: any) => user.full_name).filter(Boolean))];
                
                // console.log('📊 Setting equipment managers from users (no equipment case):', equipmentManagersFromUsers);
                
                setDynamicOptions(prev => {
                  const updated = {
                    ...prev,
                    equipmentManager: equipmentManagersFromUsers
                  };
                  // console.log('📊 Updated dynamicOptions (no equipment case):', updated);
                  return updated;
                });
                
                const managersList: Array<{ name: string; email: string; phone: string }> = [];
                const managerContacts: Record<string, { email: string; phone: string }> = {};
                
                projectManagersData.forEach((user: any) => {
                  if (user.full_name) {
                    managersList.push({
                      name: user.full_name,
                      email: user.email || '',
                      phone: user.phone || ''
                    });
                    managerContacts[user.full_name] = {
                      email: user.email || '',
                      phone: user.phone || ''
                    };
                  }
                });
                
                setProjectManagers(managersList);
                setEquipmentManagerContacts(managerContacts);
              } else {
                console.warn('⚠️ No project managers found in users table');
                // Even if no project managers found, ensure equipmentManager is at least an empty array
                setDynamicOptions(prev => ({
                  ...prev,
                  equipmentManager: prev.equipmentManager || []
                }));
              }
            } else {
              console.warn('⚠️ No firm_id available to fetch project managers');
            }
          } catch (error) {
            console.error('❌ Error fetching project managers when no equipment exists:', error);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching existing standalone equipment:', error);
      }
    };

    fetchExistingStandaloneEquipment();
  }, []);

  // Debug: Monitor dynamicOptions changes
  useEffect(() => {
    // console.log('🔍 dynamicOptions state changed:', dynamicOptions);
    // console.log('🔍 equipmentManager options:', dynamicOptions.equipmentManager);
  }, [dynamicOptions]);

  const handleInputChange = (field: keyof StandaloneEquipmentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleServiceChange = (service: keyof StandaloneEquipmentFormData['servicesIncluded'], checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      servicesIncluded: { ...prev.servicesIncluded, [service]: checked }
    }));
  };

  const handleFileUpload = (field: keyof StandaloneEquipmentFormData, files: File | File[] | null) => {
    setFormData(prev => ({ ...prev, [field]: files }));
  };

  const toggleAccordion = (field: string) => {
    setExpandedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const addCustomEquipmentType = () => {
    if (newEquipmentType.trim()) {
      setCustomEquipmentTypes(prev => [...prev, newEquipmentType.trim()]);
      setNewEquipmentType('');
      setShowAddEquipmentType(false);
    }
  };

  const handleEquipmentQuantityChange = (equipmentType: string, quantity: number) => {
    if (quantity > 0) {
      setEquipmentDetails(prev => {
        const existingEquipment = prev[equipmentType] || [];
        const existingCount = existingEquipment.length;
        
        // Create new equipment entries
        const details = Array.from({ length: quantity }, (_, index) => {
          // If we're increasing quantity, keep existing entries and add new ones
          if (index < existingCount) {
            return existingEquipment[index];
          }
          // Add new entries
          return {
            id: `${equipmentType}-${index + 1}`, // Temporary ID for new equipment
            tagNumber: '',
            jobNumber: '',
            manufacturingSerial: '',
            size: '',
            material: '',
            designCode: '',
            documents: []
          };
        });
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
    
    if (isSubmitting) return;
    
    // 🔧 FIX: Validate that equipmentDetails exists and has at least one equipment
    if (!equipmentDetails || Object.keys(equipmentDetails).length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one equipment unit in Step 1 before submitting.',
        variant: 'destructive'
      });
      return;
    }
    
    // 🔧 FIX: Validate that at least one equipment unit has required fields
    let hasValidEquipment = false;
    for (const [equipmentType, units] of Object.entries(equipmentDetails)) {
      if (Array.isArray(units) && units.length > 0) {
        for (const unit of units) {
          if (unit.tagNumber && unit.tagNumber.trim() && unit.jobNumber && unit.jobNumber.trim() && unit.manufacturingSerial && unit.manufacturingSerial.trim()) {
            hasValidEquipment = true;
            break;
          }
        }
        if (hasValidEquipment) break;
      }
    }
    
    if (!hasValidEquipment) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in Tag Number, Job Number, and Equipment Title for at least one equipment unit.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare data with equipmentDetails (multiple units support)
      const submitData: any = {
        ...formData,
        equipmentDetails, // Include all equipment units
        equipmentManagerContacts // Include contact details for email invitation
      };
      if (isEditMode && editData?.id) {
        submitData.isEditMode = true;
        submitData.equipmentId = editData.id;
      }
      
      // Call the onSubmit handler passed from parent component
      // The parent (EquipmentGrid) will handle the API call (create or update)
      await onSubmit(submitData);
      
      // If onSubmit succeeds, show success screen and close form after a delay
      setShowSuccessScreen(true);
      setIsSubmitting(false); // Reset submitting state so button shows correctly
      setCreatedEquipment({ 
        type: formData.equipmentType || Object.keys(equipmentDetails)[0] || 'Equipment',
        tag_number: equipmentDetails[Object.keys(equipmentDetails)[0]]?.[0]?.tagNumber || formData.tagNumber || ''
      });
      
      // Close form after showing success for 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Error submitting form:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to submit form. Please try again.',
        variant: 'destructive'
      });
      setIsSubmitting(false);
    }
  };

  const getStepProgress = () => {
    return (currentStep / totalSteps) * 100;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return "Equipment Information";
      case 2: return "Basic Information & Team";
      case 3: return "Scope & Documents";
      default: return "";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return "Configure equipment details and specifications";
      case 2: return "Set up client information and team assignments";
      case 3: return "Define scope, upload documents, and add notes";
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
    const options = dynamicOptions[field] || [];
    const filteredOptions = options.filter(option => 
      option.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Debug logging for Equipment Manager field
    if (field === 'equipmentManager') {
      // console.log('🔧 Equipment Manager Field Render:', {
      //   field,
      //   options,
      //   optionsLength: options.length,
      //   filteredOptions,
      //   filteredLength: filteredOptions.length,
      //   dynamicOptions: dynamicOptions[field],
      //   allDynamicOptions: dynamicOptions
      // });
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
                    
                    return (
                      <div key={`${option}-${index}`} className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 hover:bg-gray-100 transition-colors">
                        {isEditing ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 flex-1 bg-blue-50 border border-blue-300 rounded-lg p-2">
                            <input
                              type="text"
                              value={editingEntries[field]?.value || ''}
                              onChange={(e) => {
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
                                // Save logic will be added later
                                setEditingEntries(prev => {
                                  const newEntries = { ...prev };
                                  delete newEntries[field];
                                  return newEntries;
                                });
                              }}
                              className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                            >
                              <CheckCircle size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntries(prev => {
                                  const newEntries = { ...prev };
                                  delete newEntries[field];
                                  return newEntries;
                                });
                              }}
                              className="flex-1 sm:flex-initial bg-gray-500 hover:bg-gray-600 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors"
                            >
                              <X size={12} className="sm:w-[14px] sm:h-[14px] inline mr-1" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                onChange(option);
                                
                                // If this is Equipment Manager field, fetch/store contact details
                                if (field === 'equipmentManager') {
                                  // First check if in projectManagers
                                  const selectedManager = projectManagers.find(pm => pm.name === option);
                                  if (selectedManager) {
                                    setEquipmentManagerContacts(prev => ({
                                      ...prev,
                                      [option]: {
                                        email: selectedManager.email || '',
                                        phone: selectedManager.phone || '',
                                        role: 'project_manager'
                                      }
                                    }));
                                  } else {
                                    // 🔧 FIX: If not in projectManagers, fetch from database (non-blocking)
                                    try {
                                      const fetchTimeout = new Promise((_, reject) => 
                                        setTimeout(() => reject(new Error('Fetch timeout')), 3000) // 3 second timeout
                                      );
                                      
                                      const fetchContactDetails = async () => {
                                        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                        const firmId = userData.firm_id;
                                        
                                        if (firmId) {
                                          // Try to fetch from users table
                                          const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
                                          const existingMember = allMembers.find((m: any) => 
                                            (m.name?.toLowerCase() === option.toLowerCase()) ||
                                            (m.full_name?.toLowerCase() === option.toLowerCase())
                                          );
                                          
                                          if (existingMember) {
                                            setEquipmentManagerContacts(prev => ({
                                              ...prev,
                                              [option]: {
                                                email: existingMember.email || '',
                                                phone: existingMember.phone || '',
                                                role: existingMember.role || existingMember.access_level || 'project_manager'
                                              }
                                            }));
                                            return;
                                          }
                                          
                                          // Also check standalone_equipment_team_positions
                                          try {
                                            const { createClient } = await import('@supabase/supabase-js');
                                            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                                            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                                            const supabase = createClient(supabaseUrl, supabaseKey);
                                            
                                            const { data: teamPosData } = await supabase
                                              .from('standalone_equipment_team_positions')
                                              .select('email, phone, role')
                                              .eq('person_name', option)
                                              .eq('position_name', 'Equipment Manager')
                                              .limit(1)
                                              .maybeSingle();
                                            
                                            if (teamPosData) {
                                              setEquipmentManagerContacts(prev => ({
                                                ...prev,
                                                [option]: {
                                                  email: teamPosData.email || '',
                                                  phone: teamPosData.phone || '',
                                                  role: 'project_manager' // Equipment Manager maps to project_manager
                                                }
                                              }));
                                            }
                                          } catch (dbError) {
                                            console.error('Error fetching from team_positions (non-fatal):', dbError);
                                            // Continue without blocking
                                          }
                                        }
                                      };
                                      
                                      // Run fetch in background, don't block UI
                                      Promise.race([fetchContactDetails(), fetchTimeout]).catch((error) => {
                                        if (error.message !== 'Fetch timeout') {
                                          console.error('Error fetching contact details (non-fatal):', error);
                                        }
                                        // Continue without blocking - form will work even if fetch fails
                                      });
                                    } catch (error) {
                                      console.error('Error in contact details fetch (non-fatal):', error);
                                      // Continue without blocking
                                    }
                                  }
                                }
                                
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
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingEntries(prev => ({ ...prev, [field]: { index: originalIndex, value: option } }));
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
                                onClick={() => {
                                  // Delete logic will be added later
                                  const newOptions = options.filter((_, i) => i !== originalIndex);
                                  setDynamicOptions(prev => ({ ...prev, [field]: newOptions }));
                                }}
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
                  onClick={() => setShowAddNew(prev => ({ ...prev, [field]: !prev[field] }))}
                  className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Add New {label}
                </Button>
              </div>
              
              {/* Add New Form */}
              {showAddNew[field] && (
                <div className="border-t border-gray-200 p-2 sm:p-4 bg-white">
                  {field === 'equipmentManager' ? (
                    // Special form for Equipment Manager with name, email, and phone
                    <div className="space-y-2 sm:space-y-3">
                      <Input
                        value={newEntries[field] || ''}
                        onChange={(e) => setNewEntries(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder="Enter project manager name"
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
                          onClick={() => {
                            const name = newEntries[field]?.trim();
                            const email = newEntries[`${field}_email`]?.trim() || '';
                            const phone = newEntries[`${field}_phone`]?.trim() || '';
                            
                            if (name) {
                              // Store the name in the visible options (for display)
                              setDynamicOptions(prev => ({
                                ...prev,
                                [field]: [...(prev[field] || []), name]
                              }));
                              
                              // Store contact details for future use with role as project_manager (default for Equipment Manager)
                              setEquipmentManagerContacts(prev => ({
                                ...prev,
                                [name]: { email, phone, role: 'project_manager' }
                              }));
                              
                              // Update the form data with just the name
                              handleInputChange('equipmentManager' as keyof StandaloneEquipmentFormData, name);
                              
                              // Close the form and clear all fields
                              setShowAddNew(prev => ({ ...prev, [field]: false }));
                              setNewEntries(prev => ({ 
                                ...prev, 
                                [field]: '',
                                [`${field}_email`]: '',
                                [`${field}_phone`]: ''
                              }));
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 flex-1 text-xs sm:text-sm h-8 sm:h-9"
                          disabled={!newEntries[field]?.trim() ||
                                   (newEntries[`${field}_email`] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEntries[`${field}_email`])) ||
                                   (newEntries[`${field}_phone`] && !/^[0-9]{10}$/.test(newEntries[`${field}_phone`]))}
                        >
                          Add Equipment Manager
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowAddNew(prev => ({ ...prev, [field]: false }));
                            setNewEntries(prev => ({ 
                              ...prev, 
                              [field]: '',
                              [`${field}_email`]: '',
                              [`${field}_phone`]: ''
                            }));
                          }}
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
                        onClick={() => {
                          if (newEntries[field]?.trim()) {
                            setDynamicOptions(prev => ({ 
                              ...prev, 
                              [field]: [...(prev[field] || []), newEntries[field]!] 
                            }));
                            setNewEntries(prev => {
                              const newEntriesCopy = { ...prev };
                              delete newEntriesCopy[field];
                              return newEntriesCopy;
                            });
                            setShowAddNew(prev => ({ ...prev, [field]: false }));
                          }
                        }}
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
      {/* Equipment Information */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Equipment Information</h4>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
          <p className="text-xs sm:text-sm text-blue-800">
            <strong>Note:</strong> Fields marked with * are required. Other details can be filled later.
          </p>
        </div>

        {/* Equipment Type Selection */}
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                <div className="flex items-center space-x-2 sm:space-x-3">
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
                  <Label htmlFor={equipmentType} className="text-xs sm:text-sm font-medium text-gray-700 cursor-pointer">
                    {equipmentType === 'Distillation Column' ? 'Column' : equipmentType}
                  </Label>
          </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Label className="text-xs sm:text-sm text-gray-600">Quantity:</Label>
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
                              value={equipment.tagNumber || ''}
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
                              value={equipment.jobNumber || ''}
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
                              value={equipment.manufacturingSerial || ''}
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
                          {equipment.documents && equipment.documents.length > 0 && (
                <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-gray-600">
                              {equipment.documents.length} file(s) selected
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
                    onClick={() => {
                      addCustomEquipmentType();
                      setShowAddEquipmentType(false);
                    }}
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

          {/* Total Equipment Count */}
          <div className="text-center p-3 sm:p-4 bg-blue-100 rounded-lg">
            <p className="text-blue-800 font-bold text-sm sm:text-base">
              Total Equipment: {Object.values(equipmentDetails).reduce((total, equipmentArray) => total + equipmentArray.length, 0)} units
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className={`space-y-6 transition-all duration-300 ${isAnimating ? 'opacity-0 transform translate-x-4' : 'opacity-100 transform translate-x-0'}`}>
      {/* Project Information */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
          <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
          <h4 className="text-base sm:text-lg font-semibold text-gray-800">Basic Information</h4>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
          <p className="text-xs sm:text-sm text-blue-800">
            <strong>Note:</strong> Fields marked with * are required. Other details can be filled later.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
            'equipmentManager',
            'Equipment Manager *',
            'Select Equipment Manager',
            formData.equipmentManager,
            (value) => handleInputChange('equipmentManager', value)
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

  const renderStep3 = () => (
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
              <div key={service} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all duration-200 cursor-pointer" onClick={() => handleServiceChange(service as keyof StandaloneEquipmentFormData['servicesIncluded'], !checked)}>
                <input
                  type="checkbox"
                  id={service}
                  checked={checked}
                  onChange={(e) => handleServiceChange(service as keyof StandaloneEquipmentFormData['servicesIncluded'], e.target.checked)}
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
            placeholder="Detailed description of the scope of services included"
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
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-9 sm:h-10"
            />
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
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
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10"
            />
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
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
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10"
            />
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
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
              className="text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 h-8 sm:h-10"
            />
            <p className="text-xs text-gray-500">You can select multiple files at once</p>
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
              placeholder="Key discussion points from kick-off meeting"
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
      <div className="mx-auto w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center mb-6">
        <CheckCircle size={48} className="text-white" />
      </div>
      
      <h2 className="text-3xl font-bold text-gray-800 mb-4">
        {isEditMode ? '✅ Equipment Updated Successfully!' : '🎉 Equipment Created Successfully!'}
      </h2>
      
      <p className="text-lg text-gray-600 mb-6">
        {isEditMode
          ? <>Equipment "<span className="font-semibold text-blue-600">{formData.equipmentType}</span>" has been updated.</>
          : <>Your new equipment "<span className="font-semibold text-blue-600">{createdEquipment?.type || formData.equipmentType}</span>" has been added to the dashboard.</>}
      </p>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 max-w-md mx-auto">
        <h3 className="font-semibold text-blue-800 mb-3">Equipment Summary</h3>
        <div className="space-y-2 text-sm text-blue-700">
          <div className="flex justify-between">
            <span>Tag Number:</span>
            <span className="font-medium">{createdEquipment?.tag_number || formData.tagNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="font-medium capitalize">{createdEquipment?.status || 'Active'}</span>
          </div>
        </div>
      </div>
      
      <div className="flex justify-center space-x-4">
        <Button
          onClick={() => {
            onClose();
          }}
          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          <CheckCircle size={20} className="mr-2" />
          Done
        </Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-2 sm:p-4">
      <Card className="w-full max-w-5xl max-h-[95vh] overflow-y-auto bg-white shadow-2xl">
        <div className="p-3 sm:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg sm:text-xl md:text-2xl font-bold text-gray-800 ${designSystem.components.sectionTitle ? '' : ''}`}>
                {isEditMode ? 'Edit Equipment' : 'Add Standalone Equipment'}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="hover:bg-gray-100 p-1 sm:p-2">
              <X size={18} className="sm:w-5 sm:h-5" />
            </Button>
          </div>

          {/* Progress Section */}
          {renderProgressBar()}

          {showSuccessScreen ? (
            renderSuccessScreen()
          ) : (
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
                      className="flex-1 sm:flex-initial px-4 sm:px-6 py-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      disabled={isAnimating || isSubmitting}
                    >
                      {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Equipment')}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AddStandaloneEquipmentFormNew;

