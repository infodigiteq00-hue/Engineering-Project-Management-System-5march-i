import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { X, Save, FileText, CheckCircle, Pencil } from "lucide-react";
import { designSystem } from "@/lib/design-system";

interface AddEquipmentFormProps {
  onClose: () => void;
  onSubmit: (equipmentData: EquipmentFormData) => void;
  projectId?: string;
}

interface EquipmentFormData {
  // Basic Equipment Info
  name: string;
  type: string;
  tagNumber: string;
  projectId: string;
  
  // Technical Specifications
  capacity: string;
  pressure: string;
  temperature: string;
  material: string;
  dimensions: string;
  weight: string;
  
  // Manufacturing Details
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  manufacturingDate: string;
  countryOfOrigin: string;
  
  // Quality & Standards
  standards: string[];
  certifications: string[];
  inspectionRequired: boolean;
  testingRequired: boolean;
  
  // Project Details
  priority: 'low' | 'medium' | 'high';
  status: 'design' | 'manufacturing' | 'testing' | 'ready' | 'installed';
  expectedDelivery: string;
  
  // Additional Info
  description: string;
  specialRequirements: string;
  notes: string;
}

const AddEquipmentForm = ({ onClose, onSubmit, projectId }: AddEquipmentFormProps) => {
  const [formData, setFormData] = useState<EquipmentFormData>({
    name: '',
    type: '',
    tagNumber: '',
    projectId: projectId || '',
    capacity: '',
    pressure: '',
    temperature: '',
    material: '',
    dimensions: '',
    weight: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    manufacturingDate: '',
    countryOfOrigin: '',
    standards: [],
    certifications: [],
    inspectionRequired: true,
    testingRequired: true,
    priority: 'medium',
    status: 'design',
    expectedDelivery: '',
    description: '',
    specialRequirements: '',
    notes: ''
  });

  const [newStandard, setNewStandard] = useState('');
  const [newCertification, setNewCertification] = useState('');
  const [editingStandard, setEditingStandard] = useState<{ index: number; value: string } | null>(null);
  const [editingCertification, setEditingCertification] = useState<{ index: number; value: string } | null>(null);

  const handleInputChange = (field: keyof EquipmentFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addStandard = () => {
    if (newStandard.trim()) {
      setFormData(prev => ({
        ...prev,
        standards: [...prev.standards, newStandard.trim()]
      }));
      setNewStandard('');
    }
  };

  const removeStandard = (index: number) => {
    setFormData(prev => ({
      ...prev,
      standards: prev.standards.filter((_, i) => i !== index)
    }));
  };

  const addCertification = () => {
    if (newCertification.trim()) {
      setFormData(prev => ({
        ...prev,
        certifications: [...prev.certifications, newCertification.trim()]
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index: number) => {
    setFormData(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index)
    }));
  };

  const startEditingStandard = (index: number, value: string) => {
    setEditingStandard({ index, value });
  };

  const saveEditedStandard = () => {
    if (editingStandard && editingStandard.value.trim()) {
      setFormData(prev => ({
        ...prev,
        standards: prev.standards.map((standard, i) => 
          i === editingStandard.index ? editingStandard.value.trim() : standard
        )
      }));
      setEditingStandard(null);
    }
  };

  const cancelEditingStandard = () => {
    setEditingStandard(null);
  };

  const startEditingCertification = (index: number, value: string) => {
    setEditingCertification({ index, value });
  };

  const saveEditedCertification = () => {
    if (editingCertification && editingCertification.value.trim()) {
      setFormData(prev => ({
        ...prev,
        certifications: prev.certifications.map((cert, i) => 
          i === editingCertification.index ? editingCertification.value.trim() : cert
        )
      }));
      setEditingCertification(null);
    }
  };

  const cancelEditingCertification = () => {
    setEditingCertification(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className={designSystem.components.sectionTitle}>Add New Equipment</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Equipment Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Equipment Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter equipment name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Equipment Type *</Label>
                <Select onValueChange={(value) => handleInputChange('type', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select equipment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                    <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                    <SelectItem value="Storage Tank">Storage Tank</SelectItem>
                    <SelectItem value="Reactor">Reactor</SelectItem>
                    <SelectItem value="Pump">Pump</SelectItem>
                    <SelectItem value="Compressor">Compressor</SelectItem>
                    <SelectItem value="Valve">Valve</SelectItem>
                    <SelectItem value="Filter">Filter</SelectItem>
                    <SelectItem value="Separator">Separator</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagNumber">Tag Number *</Label>
                <Input
                  id="tagNumber"
                  value={formData.tagNumber}
                  onChange={(e) => handleInputChange('tagNumber', e.target.value)}
                  placeholder="Enter tag number"
                  required
                />
              </div>
            </div>

            {/* Technical Specifications */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Technical Specifications</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    value={formData.capacity}
                    onChange={(e) => handleInputChange('capacity', e.target.value)}
                    placeholder="e.g., 1000L, 500kW"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pressure">Pressure</Label>
                  <Input
                    id="pressure"
                    value={formData.pressure}
                    onChange={(e) => handleInputChange('pressure', e.target.value)}
                    placeholder="e.g., 10 bar, 150 psi"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    value={formData.temperature}
                    onChange={(e) => handleInputChange('temperature', e.target.value)}
                    placeholder="e.g., 200°C, 400°F"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Input
                    id="material"
                    value={formData.material}
                    onChange={(e) => handleInputChange('material', e.target.value)}
                    placeholder="e.g., SS316L, Carbon Steel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dimensions">Dimensions</Label>
                  <Input
                    id="dimensions"
                    value={formData.dimensions}
                    onChange={(e) => handleInputChange('dimensions', e.target.value)}
                    placeholder="e.g., 2m x 1.5m x 3m"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight</Label>
                  <Input
                    id="weight"
                    value={formData.weight}
                    onChange={(e) => handleInputChange('weight', e.target.value)}
                    placeholder="e.g., 5000 kg"
                  />
                </div>
              </div>
            </div>

            {/* Manufacturing Details */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Manufacturing Details</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={formData.manufacturer}
                    onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                    placeholder="Enter manufacturer name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="modelNumber">Model Number</Label>
                  <Input
                    id="modelNumber"
                    value={formData.modelNumber}
                    onChange={(e) => handleInputChange('modelNumber', e.target.value)}
                    placeholder="Enter model number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => handleInputChange('serialNumber', e.target.value)}
                    placeholder="Enter serial number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manufacturingDate">Manufacturing Date</Label>
                  <Input
                    id="manufacturingDate"
                    type="date"
                    value={formData.manufacturingDate}
                    onChange={(e) => handleInputChange('manufacturingDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="countryOfOrigin">Country of Origin</Label>
                  <Input
                    id="countryOfOrigin"
                    value={formData.countryOfOrigin}
                    onChange={(e) => handleInputChange('countryOfOrigin', e.target.value)}
                    placeholder="Enter country"
                  />
                </div>
              </div>
            </div>

            {/* Standards & Certifications */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Standards & Certifications</Label>
              
              {/* Standards */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newStandard}
                    onChange={(e) => setNewStandard(e.target.value)}
                    placeholder="Add standard (e.g., ASME, API, ISO)"
                    className="flex-1"
                  />
                  <Button type="button" onClick={addStandard} variant="outline">
                    Add Standard
                  </Button>
                </div>
                
                {formData.standards.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.standards.map((standard, index) => (
                      <div key={index} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        {editingStandard?.index === index ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingStandard.value}
                              onChange={(e) => setEditingStandard({ index, value: e.target.value })}
                              className="h-6 text-xs border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                              autoFocus
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={saveEditedStandard}
                              className="h-4 w-4 p-0 text-green-600 hover:text-green-800"
                              title="Save"
                            >
                              <CheckCircle size={10} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingStandard}
                              className="h-4 w-4 p-0 text-gray-600 hover:text-gray-800"
                              title="Cancel"
                            >
                              <X size={10} />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm">{standard}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditingStandard(index, standard)}
                              className="h-4 w-4 p-0 text-blue-600 hover:text-blue-800"
                              title="Edit"
                            >
                              <Pencil size={10} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeStandard(index)}
                              className="h-4 w-4 p-0 text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <X size={10} />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certifications */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newCertification}
                    onChange={(e) => setNewCertification(e.target.value)}
                    placeholder="Add certification (e.g., CE, UL, CSA)"
                    className="flex-1"
                  />
                  <Button type="button" onClick={addCertification} variant="outline">
                    Add Certification
                  </Button>
                </div>
                
                {formData.certifications.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.certifications.map((cert, index) => (
                      <div key={index} className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full">
                        {editingCertification?.index === index ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingCertification.value}
                              onChange={(e) => setEditingCertification({ index, value: e.target.value })}
                              className="h-6 text-xs border-green-300 focus:border-green-500 focus:ring-green-500"
                              autoFocus
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={saveEditedCertification}
                              className="h-4 w-4 p-0 text-green-600 hover:text-green-800"
                              title="Save"
                            >
                              <CheckCircle size={10} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingCertification}
                              className="h-4 w-4 p-0 text-gray-600 hover:text-gray-800"
                              title="Cancel"
                            >
                              <X size={10} />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm">{cert}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditingCertification(index, cert)}
                              className="h-4 w-4 p-0 text-blue-600 hover:text-blue-800"
                              title="Edit"
                              >
                              <Pencil size={10} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCertification(index)}
                              className="h-4 w-4 p-0 text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <X size={10} />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality Requirements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="inspectionRequired"
                    checked={formData.inspectionRequired}
                    onChange={(e) => handleInputChange('inspectionRequired', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="inspectionRequired">Inspection Required</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="testingRequired"
                    checked={formData.testingRequired}
                    onChange={(e) => handleInputChange('testingRequired', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="testingRequired">Testing Required</Label>
                </div>
              </div>
            </div>

            {/* Project Details */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Project Details</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select onValueChange={(value: 'low' | 'medium' | 'high') => handleInputChange('priority', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select onValueChange={(value: 'design' | 'manufacturing' | 'testing' | 'ready' | 'installed') => handleInputChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="installed">Installed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expectedDelivery">Expected Delivery</Label>
                  <Input
                    id="expectedDelivery"
                    type="date"
                    value={formData.expectedDelivery}
                    onChange={(e) => handleInputChange('expectedDelivery', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Equipment Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Enter detailed equipment description"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialRequirements">Special Requirements</Label>
                <Textarea
                  id="specialRequirements"
                  value={formData.specialRequirements}
                  onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
                  placeholder="Enter any special requirements"
                  rows={4}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Enter any additional notes or comments"
                rows={3}
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                <Save size={16} className="mr-2" />
                Create Equipment
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default AddEquipmentForm;
