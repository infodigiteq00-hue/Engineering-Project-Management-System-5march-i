import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { designSystem } from "@/lib/design-system";
import AddProjectForm from "@/components/forms/AddProjectForm";

interface ProjectFiltersProps {
  onFilterChange?: (filters: ProjectFilters) => void;
  onAddNewProject?: (projectData: any) => void;
  onApplyFilters?: (filters: ProjectFilters) => void;
  projects?: any[];
}

interface ProjectFilters {
  client: string;
  equipmentType: string;
  manager: string;
  searchQuery: string;
}

const ProjectFilters = ({ onFilterChange, onAddNewProject, onApplyFilters, projects = [] }: ProjectFiltersProps) => {
  const [showAddProjectForm, setShowAddProjectForm] = useState(false);
  
  // Debug: Log projects data
  // // console.log('🔍 ProjectFilters received projects:', projects);
  // // console.log('📊 Projects count:', projects.length);
  const [filters, setFilters] = useState<ProjectFilters>({
    client: 'All Clients',
    equipmentType: 'All Equipment',
    manager: 'All Managers',
    searchQuery: ''
  });

  const handleFilterChange = (key: keyof ProjectFilters, value: string) => {
    const newFilters = {
      ...filters,
      [key]: value
    };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
    onApplyFilters?.(newFilters);
  };

  const handleAddProject = (projectData: any) => {
    // // console.log('New Project Data:', projectData);
    // Send to parent component to add to dashboard
    onAddNewProject?.(projectData);
    setShowAddProjectForm(false);
  };

  // Extract unique values from projects for filter options
  const getUniqueClients = () => {
    if (!projects || projects.length === 0) {
      // // console.log('⚠️ No projects available for client filter');
      return [];
    }
    const clients = projects.map(p => p.client).filter(Boolean);
    // // console.log('🔍 Available clients:', clients);
    return [...new Set(clients)].sort();
  };

  const getUniqueManagers = () => {
    if (!projects || projects.length === 0) {
      // // console.log('⚠️ No projects available for manager filter');
      return [];
    }
    const managers = projects.map(p => p.manager).filter(Boolean);
    // // console.log('👥 Available managers:', managers);
    return [...new Set(managers)].sort();
  };


  const getUniqueEquipmentTypes = () => {
    if (!projects || projects.length === 0) {
      // // console.log('⚠️ No projects available for equipment filter');
      return [];
    }
    const equipmentTypes = new Set<string>();
    projects.forEach(project => {
      if (project.equipmentBreakdown) {
        Object.entries(project.equipmentBreakdown).forEach(([type, count]) => {
          if ((count as number) > 0) {
            const normalizedType = type === 'heatExchanger' ? 'Heat Exchanger' :
                                 type === 'pressureVessel' ? 'Pressure Vessel' :
                                 type === 'storageTank' ? 'Storage Tank' :
                                 type === 'reactor' ? 'Reactor' : 'Other';
            equipmentTypes.add(normalizedType);
          }
        });
      }
    });
    // // console.log('🔧 Available equipment types:', Array.from(equipmentTypes));
    return Array.from(equipmentTypes).sort();
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-semibold text-gray-800">Project Filters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Sort by Client */}
          <div className="space-y-1 sm:space-y-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">Sort by Client</label>
            <Select onValueChange={(value) => handleFilterChange('client', value)} value={filters.client}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Clients">All Clients</SelectItem>
                {getUniqueClients().length > 0 ? (
                  getUniqueClients().map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="No Projects" disabled>No projects available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment Type */}
          <div className="space-y-1 sm:space-y-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">Equipment Type</label>
            <Select onValueChange={(value) => handleFilterChange('equipmentType', value)} value={filters.equipmentType}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="All Equipment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Equipment">All Equipment</SelectItem>
                {getUniqueEquipmentTypes().length > 0 ? (
                  getUniqueEquipmentTypes().map(equipmentType => (
                    <SelectItem key={equipmentType} value={equipmentType}>{equipmentType}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="No Equipment" disabled>No equipment available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned Manager */}
          <div className="space-y-1 sm:space-y-2">
            <label className="text-xs sm:text-sm font-medium text-gray-700">Assigned Manager</label>
            <Select onValueChange={(value) => handleFilterChange('manager', value)} value={filters.manager}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="All Managers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Managers">All Managers</SelectItem>
                {getUniqueManagers().length > 0 ? (
                  getUniqueManagers().map(manager => (
                    <SelectItem key={manager} value={manager}>{manager}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="No Managers" disabled>No managers available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Search Projects - Full width on mobile, spans 2 cols on tablet+ */}
          <div className="space-y-1 sm:space-y-2 sm:col-span-2 lg:col-span-1">
            <label className="text-xs sm:text-sm font-medium text-gray-700">Search Projects</label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by project name, PO number, or client..."
                className="h-8 sm:h-9 text-xs sm:text-sm pr-8 sm:pr-10"
                value={filters.searchQuery}
                onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
              />
              <Search size={12} className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Clear Filters Button */}
        <div className="flex justify-center sm:justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => {
              const clearedFilters = {
                client: 'All Clients',
                equipmentType: 'All Equipment',
                manager: 'All Managers',
                searchQuery: ''
              };
              setFilters(clearedFilters);
              onFilterChange?.(clearedFilters);
              onApplyFilters?.(clearedFilters);
            }}
            className="text-xs sm:text-sm px-3 py-1.5 h-7 sm:h-8 text-gray-600 hover:text-gray-800"
          >
            Clear All Filters
          </Button>
        </div>
      </div>

      {/* Add Project Form Modal */}
      {showAddProjectForm && (
        <AddProjectForm
          onClose={() => setShowAddProjectForm(false)}
          onSubmit={handleAddProject}
        />
      )}
    </>
  );
};

export default ProjectFilters;
