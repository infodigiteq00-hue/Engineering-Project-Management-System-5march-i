import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { fastAPI } from "@/lib/api";
import { Link2, Copy, Trash2, Plus, Loader2, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ClientViewModalProps {
  projectId: string;
  projectName: string;
  equipment: Array<{ id: string; name?: string; tag_number?: string }>;
  open: boolean;
  onClose: () => void;
}

type ViewSettings = {
  label: string;
  equipment_ids: string[] | null;
  show_full_qap: boolean;
  show_qap_visuals_only: boolean;
  show_progress_bar: boolean;
  show_doc_code_1: boolean;
  show_doc_code_2: boolean;
  show_doc_code_3: boolean;
  show_doc_code_4: boolean;
  show_inspection_reports: boolean;
  show_audit_internal_docs: boolean;
  show_pre_production_checklist: boolean;
  show_project_panel: boolean;
};

const defaultSettings: ViewSettings = {
  label: "",
  equipment_ids: null,
  show_full_qap: false,
  show_qap_visuals_only: true,
  show_progress_bar: true,
  show_doc_code_1: true,
  show_doc_code_2: true,
  show_doc_code_3: true,
  show_doc_code_4: true,
  show_inspection_reports: false,
  show_audit_internal_docs: false,
  show_pre_production_checklist: false,
  show_project_panel: true,
};

function getViewUrl(token: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/view/${token}`;
}

export function ClientViewModal({
  projectId,
  projectName,
  equipment,
  open,
  onClose,
}: ClientViewModalProps) {
  const { toast } = useToast();
  const [views, setViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ViewSettings>(defaultSettings);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  useEffect(() => {
    if (open && projectId) {
      setMode("list");
      setCreatedToken(null);
      setLoading(true);
      fastAPI.getClientViewsForProject(projectId).then((list) => {
        setViews(list);
        setLoading(false);
      });
    }
  }, [open, projectId]);

  const copyLink = (token: string) => {
    const url = getViewUrl(token);
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied to clipboard", description: url }),
      () => toast({ title: "Could not copy", variant: "destructive" })
    );
  };

  const startCreate = () => {
    setSettings(defaultSettings);
    setCreatedToken(null);
    setMode("create");
  };

  const handleCreate = async () => {
    setCreating(true);
    const created = await fastAPI.createClientView(projectId, {
      label: settings.label || undefined,
      equipment_ids: settings.equipment_ids && settings.equipment_ids.length > 0 ? settings.equipment_ids : undefined,
      show_full_qap: settings.show_full_qap,
      show_qap_visuals_only: settings.show_qap_visuals_only,
      show_progress_bar: settings.show_progress_bar,
      show_doc_code_1: settings.show_doc_code_1,
      show_doc_code_2: settings.show_doc_code_2,
      show_doc_code_3: settings.show_doc_code_3,
      show_doc_code_4: settings.show_doc_code_4,
      show_inspection_reports: settings.show_inspection_reports,
      show_audit_internal_docs: settings.show_audit_internal_docs,
      show_pre_production_checklist: settings.show_pre_production_checklist,
      show_project_panel: settings.show_project_panel,
    });
    setCreating(false);
    if (created?.token) {
      setCreatedToken(created.token);
      setViews((prev) => [created, ...prev]);
      toast({ title: "Client view link created" });
    } else {
      toast({ title: "Failed to create link", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this client view link? Anyone with the link will no longer be able to access it.")) return;
    const ok = await fastAPI.deleteClientView(id);
    if (ok) {
      setViews((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Link removed" });
    } else {
      toast({ title: "Failed to remove link", variant: "destructive" });
    }
  };

  const backToList = () => {
    setMode("list");
    setEditingId(null);
    setCreatedToken(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share with client
          </DialogTitle>
        </DialogHeader>

        {mode === "list" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Create a shareable link so your client can see selected project and equipment info. You choose what to show.
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <Button onClick={startCreate} className="w-full" type="button">
                  <Plus className="h-4 w-4 mr-2" />
                  Create new client view link
                </Button>
                {views.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Existing links</Label>
                    {views.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{v.label || "Client view"}</p>
                          <p className="text-xs text-gray-500 truncate">{getViewUrl(v.token)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(v.token)}
                            className="h-8 w-8"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(v.id)}
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(mode === "create" || mode === "edit") && (
          <div className="space-y-6">
            {createdToken ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                <p className="text-sm font-medium text-green-800">Link created</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={getViewUrl(createdToken)} className="font-mono text-xs" />
                  <Button size="sm" onClick={() => copyLink(createdToken)}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={backToList}>
                  Back to links
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-gray-500">Label (optional)</Label>
                  <Input
                    value={settings.label}
                    onChange={(e) => setSettings((s) => ({ ...s, label: e.target.value }))}
                    placeholder="e.g. Client ABC"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Equipments to show</Label>
                  <Select
                    value={settings.equipment_ids === null ? "all" : "selected"}
                    onValueChange={(v) =>
                      setSettings((s) => ({
                        ...s,
                        equipment_ids: v === "all" ? null : [],
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All equipments</SelectItem>
                      <SelectItem value="selected">Select specific (below)</SelectItem>
                    </SelectContent>
                  </Select>
                  {settings.equipment_ids !== null && (
                    <div className="mt-2 max-h-32 overflow-y-auto space-y-1 border rounded p-2">
                      {equipment.map((eq) => (
                        <label key={eq.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={(settings.equipment_ids || []).includes(eq.id)}
                            onCheckedChange={(checked) => {
                              const ids = settings.equipment_ids || [];
                              setSettings((s) => ({
                                ...s,
                                equipment_ids: checked
                                  ? [...ids, eq.id]
                                  : ids.filter((id) => id !== eq.id),
                              }));
                            }}
                          />
                          {eq.name || eq.tag_number || eq.id.slice(0, 8)}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-medium text-gray-700">What to show</Label>
                  <div className="grid gap-2">
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Project panel (overview, doc/mfg %, days)</span>
                      <Switch
                        checked={settings.show_project_panel}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_project_panel: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Progress bar & percentage</span>
                      <Switch
                        checked={settings.show_progress_bar}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_progress_bar: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">QAP: full status</span>
                      <Switch
                        checked={settings.show_full_qap}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_full_qap: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">QAP: latest visuals only</span>
                      <Switch
                        checked={settings.show_qap_visuals_only}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_qap_visuals_only: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Documentation (Code 1)</span>
                      <Switch
                        checked={settings.show_doc_code_1}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_doc_code_1: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Documentation (Code 2)</span>
                      <Switch
                        checked={settings.show_doc_code_2}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_doc_code_2: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Documentation (Code 3)</span>
                      <Switch
                        checked={settings.show_doc_code_3}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_doc_code_3: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm">Documentation (Code 4)</span>
                      <Switch
                        checked={settings.show_doc_code_4}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_doc_code_4: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between text-gray-500">
                      <span className="text-sm">Inspection reports</span>
                      <Switch
                        checked={settings.show_inspection_reports}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_inspection_reports: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between text-gray-500">
                      <span className="text-sm">Audit & internal docs</span>
                      <Switch
                        checked={settings.show_audit_internal_docs}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_audit_internal_docs: c }))}
                      />
                    </label>
                    <label className="flex items-center justify-between text-gray-500">
                      <span className="text-sm">Pre-production checklist</span>
                      <Switch
                        checked={settings.show_pre_production_checklist}
                        onCheckedChange={(c) => setSettings((s) => ({ ...s, show_pre_production_checklist: c }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={backToList} type="button">
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={creating} type="button">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create link
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
