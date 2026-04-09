import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Upload, Download, Check, ChevronDown, ChevronRight, FileText, Image, Loader2, Pencil, Trash2 } from "lucide-react";
import { fastAPI } from "@/lib/api";
import { parseChecklistExcel } from "@/utils/parseChecklistExcel";
import { useToast } from "@/hooks/use-toast";

export interface ProductionChecklistModalProps {
  equipmentId: string;
  equipmentTag?: string;
  equipmentName?: string;
  projectId: string;
  isStandalone: boolean;
  tasks: any[];
  currentUserId: string | null;
  currentUserDisplayName: string | null;
  onClose: () => void;
  /** Pass `prefetchedTasks` after create/update/merge/delete to avoid an extra checklist GET. */
  onRefresh: (prefetchedTasks?: any[]) => Promise<void>;
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(iso);
  }
}

const DEPARTMENT_STRIP_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-violet-600",
  "bg-teal-600",
  "bg-rose-600",
  "bg-sky-600",
  "bg-slate-600",
];

function getDepartmentStripClass(department: string): string {
  if (!department) return DEPARTMENT_STRIP_COLORS[0];
  let n = 0;
  for (let i = 0; i < department.length; i++) n = (n * 31 + department.charCodeAt(i)) >>> 0;
  return DEPARTMENT_STRIP_COLORS[n % DEPARTMENT_STRIP_COLORS.length];
}

/** Open a URL in a new tab; data URLs are converted to blob URLs so they open reliably. */
function openDocumentUrl(url: string) {
  if (!url) return;
  if (url.startsWith("data:")) {
    try {
      fetch(url)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank", "noopener,noreferrer");
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        })
        .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function ProductionChecklistModal({
  equipmentId,
  equipmentTag,
  equipmentName,
  projectId,
  isStandalone,
  tasks,
  currentUserId,
  currentUserDisplayName,
  onClose,
  onRefresh,
}: ProductionChecklistModalProps) {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<string[]>([]);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [departmentFilter, setDepartmentFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addDetail, setAddDetail] = useState("");
  const [addDepartment, setAddDepartment] = useState("");
  const [addNewDepartmentInput, setAddNewDepartmentInput] = useState("");
  const [addAssignedTo, setAddAssignedTo] = useState("");
  const [refDocFile, setRefDocFile] = useState<File | null>(null);
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [expandedOpenId, setExpandedOpenId] = useState<string | null>(null);
  const [expandedClosedId, setExpandedClosedId] = useState<string | null>(null);
  const [completionDetails, setCompletionDetails] = useState<Record<string, { imageUrls: string[]; reportRows: { report_url: string; file_name: string | null }[] }>>({});
  const completionLoadInFlight = useRef<Set<string>>(new Set());

  // Mark-complete (checklist only; not QAP)
  const [markCompleteTask, setMarkCompleteTask] = useState<any | null>(null);
  const [markCompleteCompletedOn, setMarkCompleteCompletedOn] = useState(new Date().toISOString().slice(0, 10));
  const [markCompleteCompletedBySelectValue, setMarkCompleteCompletedBySelectValue] = useState("");
  const [markCompleteNotes, setMarkCompleteNotes] = useState("");
  const [markCompleteDepartment, setMarkCompleteDepartment] = useState("");
  const [markCompleteImageFiles, setMarkCompleteImageFiles] = useState<File[]>([]);
  const [markCompleteReportFiles, setMarkCompleteReportFiles] = useState<File[]>([]);
  const [markCompleteSubmitting, setMarkCompleteSubmitting] = useState(false);
  const [firmMembers, setFirmMembers] = useState<{ id?: string; email?: string; name?: string; full_name?: string }[]>([]);
  const [firmMembersLoading, setFirmMembersLoading] = useState(false);

  // Fetch firm team members when mark-complete modal opens (for "Completed by" dropdown)
  const fetchFirmMembers = useCallback(async () => {
    try {
      setFirmMembersLoading(true);
      const userData = JSON.parse(localStorage.getItem("userData") || "{}");
      const firmId = userData.firm_id;
      if (!firmId) {
        setFirmMembers([]);
        return;
      }
      const members = await fastAPI.getAllFirmTeamMembers(firmId);
      setFirmMembers(members || []);
    } catch {
      setFirmMembers([]);
    } finally {
      setFirmMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (markCompleteTask) {
      fetchFirmMembers();
    }
  }, [markCompleteTask, fetchFirmMembers]);

  useEffect(() => {
    if (showAddTask && firmMembers.length === 0) {
      fetchFirmMembers();
    }
  }, [showAddTask, firmMembers.length, fetchFirmMembers]);

  const loadDepartments = useCallback(async () => {
    if (isStandalone) {
      setDepartments([]);
      return;
    }
    try {
      const list = await fastAPI.getChecklistDepartments(projectId);
      setDepartments(list);
    } catch {
      setDepartments([]);
    }
  }, [projectId, isStandalone]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const openTasks = tasks.filter((t: any) => !t.completion);
  const closedTasks = tasks.filter((t: any) => !!t.completion);

  const filterAndSearch = useCallback(
    (list: any[]) => {
      let out = list;
      if (departmentFilter && departmentFilter !== "All") {
        out = out.filter((t: any) => (t.department || "").trim() === departmentFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        out = out.filter((t: any) => {
          const title = (t.task_title || "").toLowerCase();
          const detail = (t.task_detail || "").toLowerCase();
          const dept = (t.department || "").toLowerCase();
          const created = formatDateOnly(t.created_at).toLowerCase();
          const completed = t.completion ? formatDateOnly(t.completion.completed_on).toLowerCase() : "";
          return title.includes(q) || detail.includes(q) || dept.includes(q) || created.includes(q) || completed.includes(q);
        });
      }
      return out;
    },
    [departmentFilter, searchQuery]
  );

  const filteredOpen = filterAndSearch(openTasks);
  const filteredClosed = filterAndSearch(closedTasks);

  const MAX_REF_FILE_SIZE_MB = 5;

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });

  const openEditTask = useCallback((t: any) => {
    setEditingTask(t);
    setAddTitle(t.task_title || "");
    setAddDetail(t.task_detail || "");
    const dept = (t.department || "").trim();
    if (dept && !departments.includes(dept)) {
      setAddDepartment("__new__");
      setAddNewDepartmentInput(dept);
    } else {
      setAddDepartment(dept || "");
      setAddNewDepartmentInput("");
    }
    setAddAssignedTo(t.assigned_to || "");
    setRefDocFile(null);
    setRefImageFile(null);
    setShowAddTask(true);
    setExpandedOpenId(null);
  }, [departments]);

  const closeAddTaskForm = useCallback(() => {
    setShowAddTask(false);
    setEditingTask(null);
    setAddTitle("");
    setAddDetail("");
    setAddDepartment("");
    setAddNewDepartmentInput("");
    setAddAssignedTo("");
    setRefDocFile(null);
    setRefImageFile(null);
  }, []);

  const handleAddTask = useCallback(async () => {
    const title = (addTitle || "").trim();
    if (!title) {
      toast({ title: "Required", description: "Enter task title.", variant: "destructive" });
      return;
    }
    const department = addDepartment === "__new__" ? (addNewDepartmentInput || "").trim() : (addDepartment || "").trim();
    const assignedTo = (addAssignedTo || "").trim();
    setAdding(true);
    try {
      let refDocUrl: string | null = editingTask?.reference_document_url ?? null;
      let refDocName: string | null = editingTask?.reference_document_name ?? null;
      let refImageUrl: string | null = editingTask?.reference_image_url ?? null;
      const maxBytes = MAX_REF_FILE_SIZE_MB * 1024 * 1024;
      if (refDocFile) {
        if (refDocFile.size > maxBytes) {
          toast({ title: "File too large", description: `Reference doc must be under ${MAX_REF_FILE_SIZE_MB} MB.`, variant: "destructive" });
          setAdding(false);
          return;
        }
        refDocUrl = await fileToDataUrl(refDocFile);
        refDocName = refDocFile.name || null;
      }
      if (refImageFile) {
        if (refImageFile.size > maxBytes) {
          toast({ title: "File too large", description: `Reference image must be under ${MAX_REF_FILE_SIZE_MB} MB.`, variant: "destructive" });
          setAdding(false);
          return;
        }
        refImageUrl = await fileToDataUrl(refImageFile);
      }
      if (editingTask) {
        const payload = {
          task_title: title,
          task_detail: (addDetail || "").trim() || null,
          department: department || null,
          assigned_to: assignedTo || null,
          reference_document_url: refDocUrl,
          reference_document_name: refDocName,
          reference_image_url: refImageUrl,
          sort_order: editingTask.sort_order ?? 0,
          created_by: editingTask.created_by ?? currentUserId ?? null,
        };
        if (isStandalone) {
          await fastAPI.updateStandaloneEquipmentProductionChecklistTask(editingTask.id, payload);
        } else {
          await fastAPI.updateEquipmentProductionChecklistTask(editingTask.id, payload);
        }
        const listAfterEdit = isStandalone
          ? await fastAPI.getStandaloneEquipmentProductionChecklistTasks(equipmentId)
          : await fastAPI.getEquipmentProductionChecklistTasks(equipmentId);
        await onRefresh(listAfterEdit);
        closeAddTaskForm();
        toast({ title: "Success", description: "Task updated." });
      } else {
        const sortOrder = tasks.length;
        if (isStandalone) {
          await fastAPI.createStandaloneEquipmentProductionChecklistTask(equipmentId, {
            task_title: title,
            task_detail: (addDetail || "").trim() || null,
            department: department || null,
            assigned_to: assignedTo || null,
            reference_document_url: refDocUrl,
            reference_document_name: refDocName,
            reference_image_url: refImageUrl,
            sort_order: sortOrder,
            created_by: currentUserId || null,
          });
        } else {
          await fastAPI.createEquipmentProductionChecklistTask(equipmentId, {
            task_title: title,
            task_detail: (addDetail || "").trim() || null,
            department: department || null,
            assigned_to: assignedTo || null,
            reference_document_url: refDocUrl,
            reference_document_name: refDocName,
            reference_image_url: refImageUrl,
            sort_order: sortOrder,
            created_by: currentUserId || null,
          });
        }
        const listAfterCreate = isStandalone
          ? await fastAPI.getStandaloneEquipmentProductionChecklistTasks(equipmentId)
          : await fastAPI.getEquipmentProductionChecklistTasks(equipmentId);
        await onRefresh(listAfterCreate);
        closeAddTaskForm();
        toast({ title: "Success", description: "Task added." });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const description =
        status === 404
          ? "Checklist tables are missing. Please run the Production & Pre-Dispatch Checklist migration (20250313100000_production_checklist_tables.sql) in Supabase."
          : err?.message || (editingTask ? "Failed to update task." : "Failed to add task.");
      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }, [addTitle, addDetail, addDepartment, addNewDepartmentInput, refDocFile, refImageFile, editingTask, tasks, equipmentId, isStandalone, currentUserId, onRefresh, toast, closeAddTaskForm]);

  const handleBulkUpload = useCallback(
    async (file: File) => {
      setBulkUploading(true);
      try {
        const XLSX = await import("xlsx-js-style").then((m: any) => m.default);
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const { rows: parsedRows } = parseChecklistExcel(rows, departments);
        if (parsedRows.length === 0) {
          toast({ title: "No rows", description: "No valid rows (Task Title required).", variant: "destructive" });
          return;
        }
        const existing = tasks.map((t: any) => ({
          id: t.id,
          task_title: t.task_title,
          task_detail: t.task_detail ?? null,
          department: t.department ?? null,
          assigned_to: t.assigned_to ?? null,
          reference_document_url: t.reference_document_url ?? null,
          reference_document_name: t.reference_document_name ?? null,
          reference_image_url: t.reference_image_url ?? null,
          sort_order: t.sort_order ?? 0,
          created_by: t.created_by ?? null,
        }));
        const startOrder = existing.length;
        const newTasks = parsedRows.map((r, i) => ({
          id: `new-${Date.now()}-${i}`,
          task_title: r.task_title,
          task_detail: r.task_detail || null,
          department: r.department || null,
          assigned_to: r.assigned_to || null,
          reference_document_url: null,
          reference_document_name: null,
          reference_image_url: null,
          sort_order: startOrder + i,
          created_by: currentUserId || null,
        }));
        const payload = [...existing, ...newTasks];
        const listAfterBulk = isStandalone
          ? await fastAPI.updateStandaloneEquipmentProductionChecklistTasksMerge(equipmentId, payload)
          : await fastAPI.updateEquipmentProductionChecklistTasksMerge(equipmentId, payload);
        await onRefresh(listAfterBulk);
        toast({ title: "Success", description: `${newTasks.length} task(s) added.` });
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Failed to upload.", variant: "destructive" });
      } finally {
        setBulkUploading(false);
      }
    },
    [tasks, departments, equipmentId, isStandalone, currentUserId, onRefresh, toast]
  );

  const downloadSampleTemplate = useCallback(async () => {
    try {
      const XLSX = await import("xlsx-js-style").then((m: any) => m.default);
      const today = new Date().toISOString().slice(0, 10);
      const rows = [
        ["Task Title", "Task Detail", "Department", "Assigned To (team member name)"],
        ["Example task", "Optional description", departments[0] || "Department", currentUserDisplayName || "Gaurav Singh"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Checklist");
      XLSX.writeFile(wb, "Production_Checklist_Bulk_Template.xlsx");
      toast({ title: "Downloaded", description: "Production_Checklist_Bulk_Template.xlsx" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to download.", variant: "destructive" });
    }
  }, [departments, currentUserDisplayName, toast]);

  const loadCompletionDetails = useCallback(
    async (completionId: string) => {
      if (completionDetails[completionId]) return;
      if (completionLoadInFlight.current.has(completionId)) return;
      completionLoadInFlight.current.add(completionId);
      try {
        const [imageUrls, reportRows] = await Promise.all([
          fastAPI.getEquipmentProductionChecklistCompletionImageUrls(completionId, isStandalone),
          fastAPI.getEquipmentProductionChecklistCompletionReports(completionId, isStandalone).then((rows) =>
            rows.map((r: any) => ({ report_url: r.report_url || "", file_name: r.file_name ?? null }))
          ),
        ]);
        setCompletionDetails((prev) => ({ ...prev, [completionId]: { imageUrls, reportRows } }));
      } catch {
        setCompletionDetails((prev) => ({ ...prev, [completionId]: { imageUrls: [], reportRows: [] } }));
      } finally {
        completionLoadInFlight.current.delete(completionId);
      }
    },
    [isStandalone, completionDetails]
  );

  const toggleClosedExpand = useCallback(
    (taskId: string, completionId: string) => {
      if (expandedClosedId === taskId) {
        setExpandedClosedId(null);
        return;
      }
      setExpandedClosedId(taskId);
      loadCompletionDetails(completionId);
    },
    [expandedClosedId, loadCompletionDetails]
  );

  const openMarkComplete = (task: any) => {
    setMarkCompleteTask(task);
    setMarkCompleteCompletedOn(new Date().toISOString().slice(0, 10));
    setMarkCompleteCompletedBySelectValue("");
    setMarkCompleteNotes("");
    setMarkCompleteDepartment("");
    setMarkCompleteImageFiles([]);
    setMarkCompleteReportFiles([]);
  };

  const handleDeleteTask = useCallback(
    async (task: any) => {
      if (!task?.id) return;
      const ok = window.confirm("Delete this task? This cannot be undone.");
      if (!ok) return;
      try {
        if (isStandalone) {
          await fastAPI.deleteStandaloneEquipmentProductionChecklistTask(task.id);
        } else {
          await fastAPI.deleteEquipmentProductionChecklistTask(task.id);
        }
        const listAfterDelete = isStandalone
          ? await fastAPI.getStandaloneEquipmentProductionChecklistTasks(equipmentId)
          : await fastAPI.getEquipmentProductionChecklistTasks(equipmentId);
        await onRefresh(listAfterDelete);
        toast({ title: "Deleted", description: "Task deleted." });
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Failed to delete task.", variant: "destructive" });
      }
    },
    [isStandalone, equipmentId, onRefresh, toast]
  );

  const submitMarkComplete = useCallback(async () => {
    if (!markCompleteTask) return;
    setMarkCompleteSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const file of markCompleteImageFiles) {
        const url = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        imageUrls.push(url);
      }
      const reportUrls: string[] = [];
      const reportNames: (string | null)[] = [];
      for (const file of markCompleteReportFiles) {
        const url = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        reportUrls.push(url);
        reportNames.push(file.name || null);
      }
      const dept = (markCompleteDepartment && markCompleteDepartment !== "__new__" ? markCompleteDepartment.trim() : null) || null;
      const completedByMember = markCompleteCompletedBySelectValue
        ? firmMembers.find((m) => m.id === markCompleteCompletedBySelectValue || m.email === markCompleteCompletedBySelectValue)
        : null;
      const completedByUserId = completedByMember?.id ?? currentUserId ?? null;
      const completedByDisplayName = completedByMember
        ? (completedByMember.name || completedByMember.full_name || completedByMember.email)
        : (currentUserDisplayName || null);
      await fastAPI.createEquipmentProductionChecklistTaskCompletion(
        markCompleteTask.id,
        {
          completed_on: markCompleteCompletedOn,
          completed_by_user_id: completedByUserId,
          completed_by_display_name: completedByDisplayName,
          notes: markCompleteNotes.trim() || null,
          department: dept,
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          inspection_report_urls: reportUrls.length > 0 ? reportUrls : undefined,
          inspection_report_names: reportNames.length > 0 ? reportNames : undefined,
          updated_by: currentUserId || null,
        },
        isStandalone
      );
      const listAfterComplete = isStandalone
        ? await fastAPI.getStandaloneEquipmentProductionChecklistTasks(equipmentId)
        : await fastAPI.getEquipmentProductionChecklistTasks(equipmentId);
      await onRefresh(listAfterComplete);
      setMarkCompleteTask(null);
      toast({ title: "Success", description: "Task marked complete." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save.", variant: "destructive" });
    } finally {
      setMarkCompleteSubmitting(false);
    }
  }, [markCompleteTask, markCompleteCompletedOn, markCompleteCompletedBySelectValue, markCompleteNotes, markCompleteDepartment, markCompleteImageFiles, markCompleteReportFiles, firmMembers, currentUserId, currentUserDisplayName, isStandalone, equipmentId, onRefresh, toast]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 gap-2">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Production & Pre-Dispatch Checklist</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {equipmentName || equipmentTag || equipmentId.slice(0, 8)} {equipmentTag && `(${equipmentTag})`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "closed")} className="flex flex-col flex-1 min-h-0">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50/80 space-y-3 sm:space-y-4">
            {/* Row 1: Filters + actions */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger id="checklist-dept-filter" className="h-9 w-full sm:w-[160px] shrink-0 bg-white border-gray-200">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="checklist-search"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 flex-1 min-w-0 sm:min-w-[140px] sm:max-w-[240px] bg-white border-gray-200"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0 sm:border-l border-gray-200 sm:pl-3 w-full sm:w-auto flex-wrap">
                {tab === "open" && (
                  <Button
                    size="sm"
                    onClick={() => { setEditingTask(null); setShowAddTask(true); }}
                    className="h-9 bg-[#2B62FF] hover:bg-[#244FDB] text-white shadow-sm text-xs sm:text-sm"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add task
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={downloadSampleTemplate} className="h-9 bg-white border-gray-200 text-xs sm:text-sm">
                  <Download className="w-4 h-4 mr-1" />
                  Sample template
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={bulkUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBulkUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" className="h-9 bg-white border-gray-200 text-xs sm:text-sm" asChild>
                    <span>
                      {bulkUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                      Bulk upload
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            {/* Row 2: Open / Closed slider — full width end-to-end */}
            <div className="flex w-full">
              <nav
                className="relative flex w-full overflow-hidden rounded-full bg-gray-100/90 p-1"
                aria-label="Checklist status"
              >
                <div
                  className={`absolute top-0.5 bottom-0.5 rounded-full shadow-sm transition-[left,width,background-color] duration-300 ease-out ${
                    tab === "open" ? "bg-[#2B62FF]" : "bg-emerald-500"
                  }`}
                  style={{
                    left: tab === "open" ? "2px" : "calc(50% + 2px)",
                    width: "calc(50% - 4px)",
                  }}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setTab("open")}
                  className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === "open" ? "text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Open ({openTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("closed")}
                  className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === "closed" ? "text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Closed ({closedTasks.length})
                </button>
              </nav>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 min-h-0">
            {showAddTask && (
              <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
                <h4 className="font-medium text-gray-900">{editingTask ? "Edit task" : "New task"}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Task title</Label>
                    <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Title" className="mt-1" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Task detail (optional)</Label>
                    <Textarea value={addDetail} onChange={(e) => setAddDetail(e.target.value)} placeholder="Detail" rows={2} className="mt-1" />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Select value={addDepartment === "__new__" ? "__new__" : addDepartment || "_none_"} onValueChange={(v) => setAddDepartment(v === "_none_" ? "" : v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select or add new" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none_">—</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value="__new__">+ Add new department</SelectItem>
                      </SelectContent>
                    </Select>
                    {addDepartment === "__new__" && (
                      <Input value={addNewDepartmentInput} onChange={(e) => setAddNewDepartmentInput(e.target.value)} placeholder="New department name" className="mt-2" />
                    )}
                  </div>
                  <div>
                    <Label>Assigned to (optional)</Label>
                    <Select value={addAssignedTo || "_none_"} onValueChange={(v) => setAddAssignedTo(v === "_none_" ? "" : v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none_">—</SelectItem>
                        {firmMembers.map((member) => (
                          <SelectItem key={member.id || member.email} value={member.name || member.full_name || member.email || ""}>
                            {member.name || member.full_name || member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reference doc / image (optional)</Label>
                    {editingTask && (editingTask.reference_document_url || editingTask.reference_image_url) && (
                      <p className="text-xs text-gray-500 mt-0.5 mb-1">Current ref attached. Pick new file below to replace.</p>
                    )}
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <label className="text-xs text-gray-600 flex items-center gap-1 cursor-pointer">
                        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setRefDocFile(e.target.files?.[0] || null)} />
                        <FileText className="w-4 h-4" /> {editingTask ? "Replace doc" : "Doc"} {refDocFile?.name && `: ${refDocFile.name}`}
                      </label>
                      <label className="text-xs text-gray-600 flex items-center gap-1 cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setRefImageFile(e.target.files?.[0] || null)} />
                        <Image className="w-4 h-4" /> {editingTask ? "Replace image" : "Image"} {refImageFile?.name && `: ${refImageFile.name}`}
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleAddTask} disabled={adding}>
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {editingTask ? "Update task" : "Save task"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={closeAddTaskForm}>Cancel</Button>
                </div>
              </div>
            )}

            <div className={showAddTask ? "relative opacity-40 pointer-events-none transition-opacity" : "relative transition-opacity"}>
            <TabsContent value="open" className="mt-0 space-y-2">
              {filteredOpen.length === 0 ? (
                <p className="text-sm text-gray-500 py-6">No open tasks.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredOpen.map((t: any) => {
                    const hasRefs = !!(t.reference_image_url || t.reference_document_url);
                    const isExpanded = expandedOpenId === t.id;
                    return (
                      <li key={t.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className={`min-w-0 flex-1 ${hasRefs ? "cursor-pointer" : ""}`}
                            onClick={hasRefs ? () => setExpandedOpenId(isExpanded ? null : t.id) : undefined}
                          >
                            <div className="flex items-center gap-2">
                              {hasRefs && (isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />)}
                              <div className="min-w-0">
                                {t.department && (
                                  <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium text-white mb-1.5 ${getDepartmentStripClass(t.department)}`}>
                                    {t.department}
                                  </span>
                                )}
                                <p className="font-medium text-gray-900">{t.task_title || "—"}</p>
                                {t.task_detail && <p className="text-sm text-gray-600 mt-0.5">{t.task_detail}</p>}
                                <p className="text-xs text-gray-500 mt-1">
                                  Created by: {t.created_by_user?.full_name || t.created_by_user?.email || "—"}
                                  {t.assigned_to && ` · Assigned to: ${t.assigned_to}`}
                                  {t.created_at && ` · ${formatDateOnly(t.created_at)}`}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <div className="flex items-center gap-1 self-end">
                              <button
                                type="button"
                                onClick={() => openEditTask(t)}
                                className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                title="Edit task"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(t)}
                                className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete task"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <Button size="sm" onClick={() => openMarkComplete(t)}>
                              <Check className="w-4 h-4 mr-1" />
                              Mark complete
                            </Button>
                          </div>
                        </div>
                        {isExpanded && hasRefs && (
                          <div className="mt-3 pl-6 border-l-2 border-gray-100 space-y-3">
                            {t.reference_image_url && (
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Reference image</p>
                                <button
                                  type="button"
                                  onClick={() => openDocumentUrl(t.reference_image_url)}
                                  className="block text-left"
                                >
                                  <img src={t.reference_image_url} alt="" className="max-h-48 w-auto rounded border object-contain" />
                                </button>
                              </div>
                            )}
                            {t.reference_document_url && (
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Reference document</p>
                                <button
                                  type="button"
                                  onClick={() => openDocumentUrl(t.reference_document_url)}
                                  className="text-sm text-blue-600 hover:underline text-left"
                                >
                                  {t.reference_document_name || "View document"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="closed" className="mt-0 space-y-2">
              {filteredClosed.length === 0 ? (
                <p className="text-sm text-gray-500 py-6">No closed tasks.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredClosed.map((t: any) => {
                    const comp = t.completion;
                    const compId = comp?.id;
                    const isExpanded = expandedClosedId === t.id;
                    return (
                      <li key={t.id} className="py-3">
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => compId && toggleClosedExpand(t.id, compId)}
                        >
                          {compId ? isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" /> : null}
                          <div className="min-w-0 flex-1">
                            {t.department && (
                              <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium text-white mb-1.5 ${getDepartmentStripClass(t.department)}`}>
                                {t.department}
                              </span>
                            )}
                            <p className="font-medium text-gray-900">{t.task_title || "—"}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Created {formatDateOnly(t.created_at)}
                              {t.created_by_user && ` · Created by ${t.created_by_user.full_name || t.created_by_user.email}`}
                              {t.assigned_to && ` · Assigned to ${t.assigned_to}`}
                              {comp?.completed_on && ` · Completed ${formatDateOnly(comp.completed_on)}`}
                              {comp?.completed_by_display_name && ` · By ${comp.completed_by_display_name}`}
                            </p>
                          </div>
                        </div>
                        {isExpanded && compId && (
                          <div className="mt-3 pl-6 border-l-2 border-gray-100 space-y-3">
                            {comp.notes && (
                              <p className="text-sm text-gray-700"><span className="font-medium">Remarks:</span> {comp.notes}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Reference</p>
                                {t.reference_image_url && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-600 mb-1">Image</p>
                                    <button
                                      type="button"
                                      onClick={() => openDocumentUrl(t.reference_image_url)}
                                      className="block text-left"
                                    >
                                      <img src={t.reference_image_url} alt="" className="h-20 w-auto rounded border object-cover" />
                                    </button>
                                  </div>
                                )}
                                {t.reference_document_url && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-600 mb-1">Document</p>
                                    <button
                                      type="button"
                                      onClick={() => openDocumentUrl(t.reference_document_url)}
                                      className="text-sm text-blue-600 hover:underline text-left"
                                    >
                                      {t.reference_document_name || "View document"}
                                    </button>
                                  </div>
                                )}
                                {!t.reference_image_url && !t.reference_document_url && (
                                  <p className="text-xs text-gray-500">No reference attachments.</p>
                                )}
                              </div>

                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Completion</p>
                                {(() => {
                                  const details = completionDetails[compId];
                                  if (!details) {
                                    loadCompletionDetails(compId);
                                    return <p className="text-xs text-gray-500">Loading…</p>;
                                  }
                                  return (
                                    <>
                                      {details.imageUrls.length > 0 && (
                                        <div>
                                          <p className="text-xs font-medium text-gray-600 mb-1">Images</p>
                                          <div className="flex flex-wrap gap-2">
                                            {details.imageUrls.map((url, i) => (
                                              <button
                                                key={i}
                                                type="button"
                                                onClick={() => openDocumentUrl(url)}
                                                className="block text-left"
                                              >
                                                <img src={url} alt="" className="h-20 w-auto rounded border object-cover" />
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {details.reportRows.length > 0 && (
                                        <div>
                                          <p className="text-xs font-medium text-gray-600 mb-1">Documents</p>
                                          <ul className="text-sm space-y-1">
                                            {details.reportRows.map((r, i) => (
                                              <li key={i}>
                                                <button
                                                  type="button"
                                                  onClick={() => openDocumentUrl(r.report_url || "")}
                                                  className="text-blue-600 hover:underline text-left"
                                                >
                                                  {r.file_name || `Document ${i + 1}`}
                                                </button>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {details.imageUrls.length === 0 && details.reportRows.length === 0 && (
                                        <p className="text-xs text-gray-500">No completion attachments.</p>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
            </div>
          </div>
        </Tabs>

        {/* Mark complete modal (checklist only; not QAP) */}
        {markCompleteTask && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-6">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Mark task complete</h3>
              <p className="mt-1 text-sm text-gray-600">{markCompleteTask.task_title}</p>
              <div className="mt-5 space-y-4">
                <div>
                  <Label className="text-gray-700">Completed on</Label>
                  <Input type="date" value={markCompleteCompletedOn} onChange={(e) => setMarkCompleteCompletedOn(e.target.value)} className="mt-1.5 border-gray-300 bg-white" />
                </div>
                <div>
                  <Label className="text-gray-700">Completed by</Label>
                  <Select
                    value={markCompleteCompletedBySelectValue || ""}
                    onValueChange={setMarkCompleteCompletedBySelectValue}
                    disabled={firmMembersLoading}
                  >
                    <SelectTrigger className="mt-1.5 border-gray-300 bg-white">
                      <SelectValue placeholder={firmMembersLoading ? "Loading..." : "Select team member..."} />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {firmMembers.map((member) => (
                        <SelectItem key={member.id || member.email} value={member.id || member.email || ""}>
                          {member.name || member.full_name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700">Department (optional)</Label>
                  <Select value={markCompleteDepartment || "_none_"} onValueChange={(v) => setMarkCompleteDepartment(v === "_none_" ? "" : v)}>
                    <SelectTrigger className="mt-1.5 border-gray-300 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">—</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700">Remarks (optional)</Label>
                  <Textarea value={markCompleteNotes} onChange={(e) => setMarkCompleteNotes(e.target.value)} placeholder="Remarks" rows={2} className="mt-1.5 border-gray-300 bg-white" />
                </div>
                <div>
                  <Label className="text-gray-700">Image / document (optional)</Label>
                  <div className="mt-1.5 flex gap-2 flex-wrap">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100">
                      <input type="file" accept="image/*" className="hidden" multiple onChange={(e) => setMarkCompleteImageFiles(Array.from(e.target.files || []))} />
                      <Image className="h-4 w-4" /> Image(s)
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100">
                      <input type="file" accept=".pdf" className="hidden" multiple onChange={(e) => setMarkCompleteReportFiles(Array.from(e.target.files || []))} />
                      <FileText className="h-4 w-4" /> Doc(s)
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={submitMarkComplete} disabled={markCompleteSubmitting} className="bg-[#2B62FF] hover:bg-[#244FDB]">
                    {markCompleteSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setMarkCompleteTask(null)} className="border-gray-300">Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
