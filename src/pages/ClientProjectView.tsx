import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fastAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, FileText, BarChart3, Calendar, ClipboardList, AlertCircle } from "lucide-react";

interface ClientViewPayload {
  settings: Record<string, boolean>;
  project: {
    id: string;
    name: string;
    client?: string;
    location?: string;
    deadline?: string;
    created_at?: string;
    status?: string;
  };
  project_panel: {
    metrics: {
      doc_progress_pct?: number;
      manufacturing_progress_pct?: number;
      inspection_tpi_pct?: number;
      doc_code1?: number;
      doc_code2?: number;
      doc_code3?: number;
      doc_code4?: number;
      doc_total?: number;
    };
    days_since_start: number | null;
  };
  equipment: Array<{
    id: string;
    name?: string;
    tag_number?: string;
    job_number?: string;
    manufacturing_serial?: string;
    progress?: number;
    progress_phase?: string;
    po_cdd?: string;
    updated_at?: string;
    status?: string;
  }>;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

const ClientProjectView = () => {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<ClientViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid link");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fastAPI
      .getClientViewPayload(token)
      .then((data) => {
        if (cancelled) return;
        if (data) setPayload(data as ClientViewPayload);
        else setError("This link is invalid or has expired.");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load project view.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
            <AlertCircle className="h-12 w-12 text-amber-500" />
            <p className="text-gray-700">{error ?? "This link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { settings, project, project_panel, equipment } = payload;
  const metrics = project_panel?.metrics ?? {};
  const showProjectPanel = settings.show_project_panel !== false;
  const showProgressBar = settings.show_progress_bar !== false;
  const docPct = Number(metrics.doc_progress_pct ?? metrics.docProgressPct) ?? 0;
  const mfgPct = Number(metrics.manufacturing_progress_pct ?? metrics.manufacturingProgressPct) ?? 0;
  const inspPct = Number(metrics.inspection_tpi_pct ?? metrics.inspectionTpiPct) ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {(project.client || project.location) && (
            <p className="text-sm text-gray-600 mt-1">
              {[project.client, project.location].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Project panel */}
        {showProjectPanel && (
          <Card className="rounded-xl border border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Project overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project_panel.days_since_start != null && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>{project_panel.days_since_start} days since project start</span>
                </div>
              )}
              {project.deadline && (
                <div className="text-sm text-gray-600">
                  Target deadline: <span className="font-medium text-gray-800">{formatDate(project.deadline)}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-100 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Documentation</span>
                  </div>
                  <div className="text-xl font-semibold text-gray-900">{Math.round(docPct)}%</div>
                  {(settings.show_doc_code_1 || settings.show_doc_code_2 || settings.show_doc_code_3 || settings.show_doc_code_4) && (
                    <div className="mt-1 text-xs text-gray-500">
                      Code 1–4 status in documentation panel
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Manufacturing</span>
                  </div>
                  <div className="text-xl font-semibold text-gray-900">{Math.round(mfgPct)}%</div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <ClipboardList className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">Inspection / TPI</span>
                  </div>
                  <div className="text-xl font-semibold text-gray-900">{Math.round(inspPct)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Equipment list */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building className="h-5 w-5" />
            Equipment ({equipment.length})
          </h2>
          {equipment.length === 0 ? (
            <Card className="rounded-xl border border-gray-200">
              <CardContent className="py-8 text-center text-gray-500">
                No equipment shared in this view.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {equipment.map((eq) => (
                <Card key={eq.id} className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{eq.name || eq.tag_number || "Equipment"}</p>
                        {(eq.tag_number || eq.job_number) && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            {[eq.tag_number, eq.job_number].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {eq.progress_phase && (
                          <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                            {eq.progress_phase}
                          </span>
                        )}
                        {eq.po_cdd && (
                          <p className="text-xs text-gray-500 mt-1">PO CDD: {formatDate(eq.po_cdd)}</p>
                        )}
                      </div>
                      {showProgressBar && eq.progress != null && (
                        <div className="min-w-[120px] text-right">
                          <div className="text-sm font-semibold text-gray-700">{eq.progress}%</div>
                          <Progress value={eq.progress} className="h-2 mt-1" />
                        </div>
                      )}
                    </div>
                    {/* Placeholder for QAP visuals / full QAP when enabled in settings (future) */}
                    {(settings.show_qap_visuals_only || settings.show_full_qap) && (
                      <p className="text-xs text-gray-400 mt-3 italic">Progress visuals can be shown here when configured.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientProjectView;
