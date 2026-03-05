import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface AddTechnicalSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSection: (sectionName: string) => void;
}

const AddTechnicalSectionModal: React.FC<AddTechnicalSectionModalProps> = ({
  isOpen,
  onClose,
  onAddSection
}) => {
  const [sectionName, setSectionName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sectionName.trim()) {
      onAddSection(sectionName.trim());
      setSectionName('');
      onClose();
    }
  };

  const handleCancel = () => {
    setSectionName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Add New Technical Section
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sectionName">Section Name</Label>
            <Input
              id="sectionName"
              placeholder="e.g., Heat Exchanger, Pump, Motor"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              This will create a new technical section with placeholder specifications that can be customized later.
            </p>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="text-gray-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!sectionName.trim()}
            >
              Add Section
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTechnicalSectionModal;

