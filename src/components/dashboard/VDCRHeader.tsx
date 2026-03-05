import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, FileText, Download, Plus, Eye } from "lucide-react";

interface VDCRHeaderProps {
  onBack: () => void;
  onExportVDCR: () => void;
  onAddNewRecord: () => void;
  onViewAllDocuments: () => void;
  projectName: string;
}

// Header component for VDCR view with navigation and action buttons
const VDCRHeader: React.FC<VDCRHeaderProps> = ({
  onBack,
  onExportVDCR,
  onAddNewRecord,
  onViewAllDocuments,
  projectName
}) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Projects
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{projectName}</h1>
          <p className="text-sm text-gray-600">Documentation</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onViewAllDocuments}
          className="flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          View All Documents
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportVDCR}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export Documents
        </Button>
        <Button
          size="sm"
          onClick={onAddNewRecord}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add New Record
        </Button>
      </div>
    </div>
  );
};

export default VDCRHeader;
