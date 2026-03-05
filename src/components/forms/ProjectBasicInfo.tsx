import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface ProjectBasicInfoProps {
  formData: any;
  onInputChange: (field: string, value: any) => void;
  onNext: () => void;
  existingOptions: {
    clients: string[];
    managers: string[];
    locations: string[];
    industries: string[];
  };
  isEditMode: boolean;
}

// Handle input changes for basic project information
const handleInputChange = (field: string, value: any, onInputChange: (field: string, value: any) => void) => {
  onInputChange(field, value);
};

// Handle adding new entries to dropdown options
const handleAddNewEntry = (field: string, value: string, onInputChange: (field: string, value: any) => void, existingOptions: any) => {
  if (value.trim()) {
    const currentOptions = existingOptions[field] || [];
    const updatedOptions = [...currentOptions, value.trim()];
    onInputChange(field, updatedOptions);
  }
};

const ProjectBasicInfo: React.FC<ProjectBasicInfoProps> = ({
  formData,
  onInputChange,
  onNext,
  existingOptions,
  isEditMode
}) => {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Basic Project Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Title */}
          <div className="space-y-2">
            <Label htmlFor="projectTitle">Project Title *</Label>
            <Input
              id="projectTitle"
              value={formData.projectTitle}
              onChange={(e) => handleInputChange('projectTitle', e.target.value, onInputChange)}
              placeholder="Enter project title"
              className="w-full"
            />
          </div>

          {/* Client Name */}
          <div className="space-y-2">
            <Label htmlFor="clientName">Client Name *</Label>
            <div className="flex gap-2">
              <Select
                value={formData.clientName}
                onValueChange={(value) => handleInputChange('clientName', value, onInputChange)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select or enter client name" />
                </SelectTrigger>
                <SelectContent>
                  {existingOptions.clients.map((client, index) => (
                    <SelectItem key={index} value={client}>
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Add new client"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value;
                    handleAddNewEntry('clients', value, onInputChange, existingOptions);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-32"
              />
            </div>
          </div>

          {/* Plant Location */}
          <div className="space-y-2">
            <Label htmlFor="plantLocation">Plant Location *</Label>
            <div className="flex gap-2">
              <Select
                value={formData.plantLocation}
                onValueChange={(value) => handleInputChange('plantLocation', value, onInputChange)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select or enter plant location" />
                </SelectTrigger>
                <SelectContent>
                  {existingOptions.locations.map((location, index) => (
                    <SelectItem key={index} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Add new location"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value;
                    handleAddNewEntry('locations', value, onInputChange, existingOptions);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-32"
              />
            </div>
          </div>

          {/* PO Number */}
          <div className="space-y-2">
            <Label htmlFor="poNumber">PO Number *</Label>
            <Input
              id="poNumber"
              value={formData.poNumber}
              onChange={(e) => handleInputChange('poNumber', e.target.value, onInputChange)}
              placeholder="Enter PO number"
              className="w-full"
            />
          </div>

          {/* Sales Order Date */}
          <div className="space-y-2">
            <Label htmlFor="salesOrderDate">Sales Order Date *</Label>
            <Input
              id="salesOrderDate"
              type="date"
              value={formData.salesOrderDate}
              onChange={(e) => handleInputChange('salesOrderDate', e.target.value, onInputChange)}
              className="w-full"
            />
          </div>

          {/* Completion Date */}
          <div className="space-y-2">
            <Label htmlFor="completionDate">Completion Date *</Label>
            <Input
              id="completionDate"
              type="date"
              value={formData.completionDate}
              onChange={(e) => handleInputChange('completionDate', e.target.value, onInputChange)}
              className="w-full"
            />
          </div>

          {/* Client Industry */}
          <div className="space-y-2">
            <Label htmlFor="clientIndustry">Client Industry *</Label>
            <div className="flex gap-2">
              <Select
                value={formData.clientIndustry}
                onValueChange={(value) => handleInputChange('clientIndustry', value, onInputChange)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select or enter client industry" />
                </SelectTrigger>
                <SelectContent>
                  {existingOptions.industries.map((industry, index) => (
                    <SelectItem key={index} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Add new industry"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value;
                    handleAddNewEntry('industries', value, onInputChange, existingOptions);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-32"
              />
            </div>
          </div>

          {/* Project Manager */}
          <div className="space-y-2">
            <Label htmlFor="projectManager">Project Manager *</Label>
            <div className="flex gap-2">
              <Select
                value={formData.projectManager}
                onValueChange={(value) => handleInputChange('projectManager', value, onInputChange)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select or enter project manager" />
                </SelectTrigger>
                <SelectContent>
                  {existingOptions.managers.map((manager, index) => (
                    <SelectItem key={index} value={manager}>
                      {manager}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Add new manager"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value;
                    handleAddNewEntry('managers', value, onInputChange, existingOptions);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-32"
              />
            </div>
          </div>

          {/* Consultant */}
          <div className="space-y-2">
            <Label htmlFor="consultant">Consultant</Label>
            <Input
              id="consultant"
              value={formData.consultant}
              onChange={(e) => handleInputChange('consultant', e.target.value, onInputChange)}
              placeholder="Enter consultant name"
              className="w-full"
            />
          </div>

          {/* TPI Agency */}
          <div className="space-y-2">
            <Label htmlFor="tpiAgency">TPI Agency</Label>
            <Input
              id="tpiAgency"
              value={formData.tpiAgency}
              onChange={(e) => handleInputChange('tpiAgency', e.target.value, onInputChange)}
              placeholder="Enter TPI agency name"
              className="w-full"
            />
          </div>

          {/* Client Focal Point */}
          <div className="space-y-2">
            <Label htmlFor="clientFocalPoint">Client Focal Point</Label>
            <Input
              id="clientFocalPoint"
              value={formData.clientFocalPoint}
              onChange={(e) => handleInputChange('clientFocalPoint', e.target.value, onInputChange)}
              placeholder="Enter client focal point"
              className="w-full"
            />
          </div>

          {/* Documentation Manager */}
          <div className="space-y-2">
            <Label htmlFor="vdcrManager">Documentation Manager</Label>
            <Input
              id="vdcrManager"
              value={formData.vdcrManager}
              onChange={(e) => handleInputChange('vdcrManager', e.target.value, onInputChange)}
              placeholder="Enter VDCR manager name"
              className="w-full"
            />
          </div>

          {/* Scope Description */}
          <div className="space-y-2">
            <Label htmlFor="scopeDescription">Scope Description</Label>
            <Textarea
              id="scopeDescription"
              value={formData.scopeDescription}
              onChange={(e) => handleInputChange('scopeDescription', e.target.value, onInputChange)}
              placeholder="Enter project scope description"
              className="w-full min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-end">
        <Button onClick={onNext} className="bg-blue-600 hover:bg-blue-700">
          Next: Services & Scope
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default ProjectBasicInfo;

