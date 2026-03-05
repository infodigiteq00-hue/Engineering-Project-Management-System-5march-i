import React, { useState, useCallback, useEffect } from 'react';
import EquipmentGrid from '@/components/dashboard/EquipmentGrid';
import { Skeleton } from '@/components/ui/skeleton';

interface StandaloneEquipmentTabProps {
  standaloneEquipment: any[];
  standaloneEquipmentLoading: boolean;
  onSummaryChange?: (summary: {
    total: number;
    active: number;
    dispatched: number;
    completed: number;
  }) => void;
  /** Open dossier report wizard for an equipment (additive feature) */
  onOpenDossierReport?: (params: { projectId: string; equipmentId: string; projectName: string; equipment: any }) => void;
}

const StandaloneEquipmentTab: React.FC<StandaloneEquipmentTabProps> = ({
  standaloneEquipment,
  standaloneEquipmentLoading,
  onSummaryChange,
  onOpenDossierReport,
}) => {
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    active: number;
    dispatched: number;
    completed: number;
  }>({
    total: standaloneEquipment.length,
    // Active = Total - Dispatched (progress_phase !== 'dispatched')
    active: standaloneEquipment.filter((eq: any) => eq.progress_phase !== 'dispatched').length,
    dispatched: standaloneEquipment.filter((eq: any) => eq.progress_phase === 'dispatched').length,
    completed: standaloneEquipment.filter((eq: any) => eq.status === 'completed').length,
  });

  const handleSummaryChange = useCallback((next: {
    total: number;
    active: number;
    dispatched: number;
    completed: number;
  }) => {
    setSummary(next);
    if (onSummaryChange) {
      onSummaryChange(next);
    }
  }, [onSummaryChange]);

  // Sync summary with incoming standaloneEquipment prop (initial load or refetch)
  useEffect(() => {
    const total = standaloneEquipment.length;
    const completed = standaloneEquipment.filter((eq: any) => eq.status === 'completed').length;
    const dispatched = standaloneEquipment.filter((eq: any) => eq.progress_phase === 'dispatched').length;
    // Active = Total - Dispatched (progress_phase !== 'dispatched')
    const active = standaloneEquipment.filter((eq: any) => eq.progress_phase !== 'dispatched').length;

    handleSummaryChange({
      total,
      active,
      dispatched,
      completed,
    });
  }, [standaloneEquipment, handleSummaryChange]);

  return (
    <div className="mt-8">
      {/* Equipment Summary Section - Hide when viewing details */}
      {!isViewingDetails && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-green-500 via-green-600 to-green-700 rounded-xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium uppercase tracking-wide">Total Standalone Equipment</p>
                  <p className="text-4xl font-bold text-white mt-2">{summary.total}</p>
                  <p className="text-green-200 text-sm mt-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Individual equipment orders
                  </p>
                </div>
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium uppercase tracking-wide">Active Equipment</p>
                  <p className="text-4xl font-bold text-white mt-2">
                    {summary.active}
                  </p>
                  <p className="text-emerald-200 text-sm mt-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Currently in production
                  </p>
                </div>
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Grid */}
      {standaloneEquipmentLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <EquipmentGrid
          equipment={standaloneEquipment}
          projectName="Standalone Equipment"
          projectId="standalone"
          onBack={undefined}
          onViewDetails={undefined}
          onViewVDCR={undefined}
          onUserAdded={undefined}
          onActivityUpdate={undefined}
          onViewingDetailsChange={setIsViewingDetails}
          onSummaryChange={handleSummaryChange}
          onOpenDossierReport={onOpenDossierReport}
        />
      )}
    </div>
  );
};

export default StandaloneEquipmentTab;
