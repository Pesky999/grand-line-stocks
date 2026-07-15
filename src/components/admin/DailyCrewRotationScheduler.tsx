import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  generateAdminDailyCrewRotation,
  getAdminDailyCrewRotationPlan,
  listAdminDailyCrewRotationPlans,
  listAdminDailyCrewTemplates,
  previewAdminDailyCrewRotation,
  saveAdminDailyCrewRotationPlan,
  type AdminDailyCrewGeneratedMission,
  type AdminDailyCrewRotationGenerationResult,
  type AdminDailyCrewRotationPlanSummary,
  type AdminDailyCrewRotationPreviewResult,
  type AdminDailyCrewRotationPreviewSlot,
  type AdminDailyCrewTemplateSummary,
} from "@/lib/api/daily-crew-builder-admin.functions";
import {
  clearRotationAssignments,
  countAssignedRotationSlots,
  countUniqueRotationTemplates,
  createBlankRotationEditor,
  fillEmptyRotationSlots,
  findAssignedRotationTemplateWarnings,
  isDailyCrewRotationTargetStatus,
  getRotationUtcDateLabels,
  isCurrentOrFutureUtcDate,
  isRotationPreviewSnapshotCurrent,
  rotationEditorFromDetail,
  rotationEditorSnapshot,
  rotationEditorToSavePayload,
  type DailyCrewRotationEditor,
  type DailyCrewRotationPreviewSnapshot,
  type DailyCrewRotationTargetStatus,
} from "@/lib/daily-crew-builder/rotation-editor";

const dailyCrewAdminTemplatesQO = {
  queryKey: ["admin", "daily-crew", "templates"],
  queryFn: () => listAdminDailyCrewTemplates(),
} as const;

const dailyCrewAdminRotationPlansQO = {
  queryKey: ["admin", "daily-crew", "rotation-plans"],
  queryFn: () => listAdminDailyCrewRotationPlans(),
} as const;

type SaveRotationMutationVariables = {
  editor: DailyCrewRotationEditor;
  targetPlanId: string | null;
  submittedSnapshot: string;
  operationKey: number;
};

type PreviewRotationMutationVariables = {
  snapshot: DailyCrewRotationPreviewSnapshot;
  operationKey: number;
};

type GenerateRotationMutationVariables = {
  snapshot: DailyCrewRotationPreviewSnapshot;
  planName: string;
  previewEndDate: string;
  operationKey: number;
};

const TARGET_STATUSES: DailyCrewRotationTargetStatus[] = ["draft", "scheduled"];

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string | null | undefined) {
  return value ?? "Never generated";
}

function templateSearchHaystack(template: AdminDailyCrewTemplateSummary) {
  return `${template.title} ${template.slug}`.toLowerCase();
}

function planSearchHaystack(plan: AdminDailyCrewRotationPlanSummary) {
  return plan.name.toLowerCase();
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function blockingReasonLabel(reason: string) {
  switch (reason) {
    case "incomplete_plan":
      return "Plan does not contain all 30 assignments";
    case "missing_slot":
      return "No template assigned";
    case "inactive_template":
      return "Template is inactive";
    case "unready_template":
      return "Template is not ready";
    case "date_conflict":
      return "A mission already exists on this date";
    case "slug_conflict":
      return "Generated mission slug already exists";
    case "generated_slug_too_long":
      return "Generated mission slug is too long";
    default:
      return `Unknown blocker: ${reason}`;
  }
}

export function DailyCrewRotationScheduler({
  onOpenMissionStudio,
}: {
  onOpenMissionStudio: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: plans } = useSuspenseQuery(dailyCrewAdminRotationPlansQO);
  const { data: templates } = useSuspenseQuery(dailyCrewAdminTemplatesQO);
  const [planSearch, setPlanSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [editor, setEditor] = useState<DailyCrewRotationEditor | null>(null);
  const [baselineEditor, setBaselineEditor] = useState<DailyCrewRotationEditor | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState("");
  const [startDate, setStartDate] = useState(todayUtcDate());
  const [targetStatus, setTargetStatus] = useState<DailyCrewRotationTargetStatus>("draft");
  const [previewResult, setPreviewResult] = useState<AdminDailyCrewRotationPreviewResult | null>(
    null,
  );
  const [previewSnapshot, setPreviewSnapshot] = useState<DailyCrewRotationPreviewSnapshot | null>(
    null,
  );
  const [generationResult, setGenerationResult] =
    useState<AdminDailyCrewRotationGenerationResult | null>(null);
  const selectedPlanIdRef = useRef<string | null>(selectedPlanId);
  const editorSnapshotRef = useRef("");
  const activeOperationRef = useRef(0);

  const currentEditorSnapshot = editor ? rotationEditorSnapshot(editor) : "";
  const dirty = editor ? currentEditorSnapshot !== baselineSnapshot : false;
  const assignedCount = editor ? countAssignedRotationSlots(editor) : 0;
  const uniqueTemplateCount = editor ? countUniqueRotationTemplates(editor) : 0;
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );
  const readyFillTemplates = useMemo(
    () => templates.filter((template) => template.isActive && template.ready),
    [templates],
  );
  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    return q ? plans.filter((plan) => planSearchHaystack(plan).includes(q)) : plans;
  }, [planSearch, plans]);
  const dateLabels = useMemo(() => getRotationUtcDateLabels(startDate, 30), [startDate]);
  const assignedWarnings = useMemo(
    () => (editor ? findAssignedRotationTemplateWarnings(editor, templates) : []),
    [editor, templates],
  );
  const currentPreviewSnapshot = useMemo<DailyCrewRotationPreviewSnapshot | null>(() => {
    if (!editor?.planId || !editor.revision) return null;
    return {
      planId: editor.planId,
      planRevision: editor.revision,
      editorSnapshot: currentEditorSnapshot,
      startDate,
      targetStatus,
    };
  }, [currentEditorSnapshot, editor?.planId, editor?.revision, startDate, targetStatus]);
  const previewCurrent = Boolean(
    currentPreviewSnapshot &&
    isRotationPreviewSnapshotCurrent(previewSnapshot, currentPreviewSnapshot),
  );
  const startDateValid = isCurrentOrFutureUtcDate(startDate);

  const detailQ = useQuery({
    queryKey: ["admin", "daily-crew", "rotation-plan", selectedPlanId],
    queryFn: () =>
      getAdminDailyCrewRotationPlan({
        data: { planId: selectedPlanId ?? "" },
      }),
    enabled: Boolean(selectedPlanId),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    selectedPlanIdRef.current = selectedPlanId;
  }, [selectedPlanId]);

  useEffect(() => {
    editorSnapshotRef.current = currentEditorSnapshot;
  }, [currentEditorSnapshot]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!selectedPlanId || !detailQ.isSuccess || !detailQ.data) return;
    if (detailQ.data.id !== selectedPlanId) return;
    if (dirty && editor?.planId === selectedPlanId) return;
    const nextEditor = rotationEditorFromDetail(detailQ.data);
    const nextEditorSnapshot = rotationEditorSnapshot(nextEditor);
    if (
      editor?.planId === selectedPlanId &&
      !dirty &&
      currentEditorSnapshot === nextEditorSnapshot &&
      baselineSnapshot === nextEditorSnapshot
    ) {
      return;
    }
    advanceOperation();
    setEditorBaseline(nextEditor);
    clearPreviewState();
  }, [
    baselineSnapshot,
    currentEditorSnapshot,
    detailQ.data,
    detailQ.isSuccess,
    dirty,
    editor?.planId,
    selectedPlanId,
  ]);

  function advanceOperation() {
    activeOperationRef.current += 1;
    return activeOperationRef.current;
  }

  function clearPreviewState() {
    setPreviewResult(null);
    setPreviewSnapshot(null);
    setGenerationResult(null);
  }

  function setEditorBaseline(nextEditor: DailyCrewRotationEditor) {
    setEditor(nextEditor);
    setBaselineEditor(nextEditor);
    setBaselineSnapshot(rotationEditorSnapshot(nextEditor));
  }

  function updateEditor(updater: (current: DailyCrewRotationEditor) => DailyCrewRotationEditor) {
    if (mutationBusy) return;
    advanceOperation();
    clearPreviewState();
    setEditor((current) => (current ? updater(current) : current));
  }

  function confirmDiscard(message: string) {
    return !dirty || window.confirm(message);
  }

  function selectPlan(planId: string) {
    if (mutationBusy) return;
    if (planId === selectedPlanId) return;
    if (!confirmDiscard("Discard unsaved rotation-plan changes and load another plan?")) return;
    advanceOperation();
    clearPreviewState();
    setSelectedPlanId(planId);
    setEditor(null);
    setBaselineEditor(null);
    setBaselineSnapshot("");
  }

  function clearSelection() {
    if (mutationBusy) return;
    if (!selectedPlanId && !editor) return;
    if (!confirmDiscard("Discard unsaved rotation-plan changes and clear selection?")) return;
    advanceOperation();
    clearPreviewState();
    setSelectedPlanId(null);
    setEditor(null);
    setBaselineEditor(null);
    setBaselineSnapshot("");
  }

  function createNewPlan() {
    if (mutationBusy) return;
    if (!confirmDiscard("Discard unsaved rotation-plan changes and create a new plan?")) return;
    const nextEditor = createBlankRotationEditor();
    advanceOperation();
    clearPreviewState();
    setSelectedPlanId(null);
    setEditorBaseline(nextEditor);
  }

  function resetUnsavedChanges() {
    if (mutationBusy) return;
    if (!editor) return;
    if (!confirmDiscard("Reset this rotation plan to the last loaded or saved state?")) return;
    advanceOperation();
    clearPreviewState();
    if (baselineEditor) {
      setEditor(baselineEditor);
      setBaselineSnapshot(rotationEditorSnapshot(baselineEditor));
      return;
    }
    setEditorBaseline(createBlankRotationEditor());
  }

  function updateStartDate(value: string) {
    if (mutationBusy) return;
    advanceOperation();
    clearPreviewState();
    setStartDate(value);
  }

  function updateTargetStatus(value: string) {
    if (mutationBusy || !isDailyCrewRotationTargetStatus(value)) return;
    advanceOperation();
    clearPreviewState();
    setTargetStatus(value);
  }

  function fillEmptySlots() {
    if (!editor || mutationBusy || readyFillTemplates.length === 0) return;
    const nextEditor = fillEmptyRotationSlots(editor, templates);
    if (rotationEditorSnapshot(nextEditor) === currentEditorSnapshot) return;
    updateEditor(() => nextEditor);
    toast.success("Empty rotation slots filled locally. Save the plan when ready.");
  }

  function clearAssignments() {
    if (!editor || mutationBusy) return;
    if (!window.confirm("Clear all 30 template assignments from this rotation plan?")) return;
    updateEditor(clearRotationAssignments);
    toast.success("Rotation assignments cleared locally.");
  }

  const saveMutation = useMutation({
    mutationFn: async ({ editor: submittedEditor }: SaveRotationMutationVariables) =>
      saveAdminDailyCrewRotationPlan({ data: rotationEditorToSavePayload(submittedEditor) }),
    onSuccess: async (result, variables) => {
      toast.success(variables.targetPlanId ? "Rotation plan saved." : "Rotation plan created.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "rotation-plans"] });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "daily-crew", "rotation-plan", result.planId],
      });
      const detail = await getAdminDailyCrewRotationPlan({ data: { planId: result.planId } });
      queryClient.setQueryData(["admin", "daily-crew", "rotation-plan", result.planId], detail);
      const nextEditor = rotationEditorFromDetail(detail);
      const stillActive =
        activeOperationRef.current === variables.operationKey &&
        selectedPlanIdRef.current === variables.targetPlanId &&
        editorSnapshotRef.current === variables.submittedSnapshot;
      if (!stillActive) return;
      setSelectedPlanId(result.planId);
      advanceOperation();
      setEditorBaseline(nextEditor);
      clearPreviewState();
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not save Daily Crew rotation plan."));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async ({ snapshot }: PreviewRotationMutationVariables) =>
      previewAdminDailyCrewRotation({
        data: {
          planId: snapshot.planId,
          startDate: snapshot.startDate,
          targetStatus: snapshot.targetStatus,
        },
      }),
    onSuccess: (result, variables) => {
      if (
        activeOperationRef.current !== variables.operationKey ||
        selectedPlanIdRef.current !== variables.snapshot.planId ||
        !isRotationPreviewSnapshotCurrent(previewSnapshotFromCurrent(), variables.snapshot)
      ) {
        return;
      }
      setPreviewResult(result);
      setPreviewSnapshot(variables.snapshot);
      setGenerationResult(null);
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not preview Daily Crew rotation."));
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ snapshot }: GenerateRotationMutationVariables) =>
      generateAdminDailyCrewRotation({
        data: {
          planId: snapshot.planId,
          startDate: snapshot.startDate,
          targetStatus: snapshot.targetStatus,
        },
      }),
    onSuccess: async (result, variables) => {
      toast.success("Daily Crew rotation generated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "missions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "templates"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "rotation-plans"] }),
        queryClient.invalidateQueries({
          queryKey: ["admin", "daily-crew", "rotation-plan", variables.snapshot.planId],
        }),
      ]);
      if (
        activeOperationRef.current !== variables.operationKey ||
        selectedPlanIdRef.current !== variables.snapshot.planId ||
        !isRotationPreviewSnapshotCurrent(previewSnapshotFromCurrent(), variables.snapshot)
      ) {
        return;
      }
      setGenerationResult(result);
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not generate Daily Crew rotation."));
    },
  });

  const mutationBusy =
    saveMutation.isPending || previewMutation.isPending || generateMutation.isPending;
  const canSave = Boolean(editor && editor.name.trim().length > 0 && !mutationBusy);
  const canPreview = Boolean(
    editor?.planId && !dirty && startDateValid && currentPreviewSnapshot && !mutationBusy,
  );
  const canGenerate = Boolean(
    editor?.planId &&
    !dirty &&
    previewResult?.readyToGenerate &&
    previewCurrent &&
    currentPreviewSnapshot &&
    !mutationBusy,
  );

  function previewSnapshotFromCurrent() {
    return currentPreviewSnapshot;
  }

  function savePlan() {
    if (!editor || mutationBusy) return;
    if (editor.name.trim().length === 0) {
      toast.error("Enter a rotation plan name before saving.");
      return;
    }
    const submittedSnapshot = currentEditorSnapshot;
    saveMutation.mutate({
      editor,
      targetPlanId: editor.planId,
      submittedSnapshot,
      operationKey: activeOperationRef.current,
    });
  }

  function previewRotation() {
    if (!currentPreviewSnapshot || !canPreview) return;
    previewMutation.mutate({
      snapshot: currentPreviewSnapshot,
      operationKey: activeOperationRef.current,
    });
  }

  function generateRotation() {
    if (!currentPreviewSnapshot || !previewResult) {
      toast.error("Preview the saved rotation plan before generating missions.");
      return;
    }
    if (!previewCurrent) {
      toast.error("Preview is stale. Preview again before generating missions.");
      return;
    }
    if (!canGenerate) {
      toast.error("Preview must be ready before generating missions.");
      return;
    }
    const message =
      targetStatus === "scheduled"
        ? `Create and schedule 30 missions from ${previewResult.startDate} through ${previewResult.endDate}? Scheduled missions will become active through the existing UTC lifecycle. The operation is atomic.`
        : `Create 30 draft missions from ${previewResult.startDate} through ${previewResult.endDate}? The operation is atomic: either all 30 missions are created or none are.`;
    if (!window.confirm(message)) return;
    generateMutation.mutate({
      snapshot: currentPreviewSnapshot,
      planName: previewResult.planName,
      previewEndDate: previewResult.endDate,
      operationKey: activeOperationRef.current,
    });
  }

  const previewBySlot = useMemo(() => {
    return new Map((previewResult?.slots ?? []).map((slot) => [slot.slotNumber, slot]));
  }, [previewResult]);

  return (
    <div className="space-y-4">
      <section className="terminal-panel">
        <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
          <span>Daily Crew Rotation Scheduler</span>
          <span className="text-muted-foreground">Protected 30-day mission planning</span>
        </div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          <p>
            Build reusable 30-day rotation plans from saved templates, preview dated missions, and
            generate the complete set atomically as drafts or scheduled missions. This page never
            creates missions until you explicitly generate from a matching preview.
          </p>
          <p>Preview performs no save or generation.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createNewPlan}
              disabled={mutationBusy}
              className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              New Rotation Plan
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={mutationBusy || (!selectedPlanId && !editor)}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Clear Selection
            </button>
            {editor && (
              <button
                type="button"
                onClick={resetUnsavedChanges}
                disabled={!dirty || mutationBusy}
                className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
              >
                Reset Unsaved Changes
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <RotationPlanList
          plans={filteredPlans}
          selectedPlanId={selectedPlanId}
          search={planSearch}
          disabled={mutationBusy}
          onSearch={setPlanSearch}
          onSelect={selectPlan}
        />

        <section className="space-y-4">
          {!editor && !selectedPlanId && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Select a rotation plan, or create a new one to assemble 30 template assignments.
            </div>
          )}
          {selectedPlanId && detailQ.isLoading && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Loading protected rotation plan detail...
            </div>
          )}
          {selectedPlanId && detailQ.isError && (
            <div role="alert" className="terminal-panel p-6 text-sm text-bear">
              {messageFromError(detailQ.error, "Could not load Daily Crew rotation plan.")}
            </div>
          )}
          {editor && (
            <>
              <RotationPlanEditor
                editor={editor}
                templates={templates}
                templateById={templateById}
                assignedCount={assignedCount}
                uniqueTemplateCount={uniqueTemplateCount}
                savedReady={detailQ.data?.id === editor.planId ? detailQ.data.ready : false}
                dirty={dirty}
                mutationBusy={mutationBusy}
                canSave={canSave}
                readyFillAvailable={readyFillTemplates.length > 0}
                assignedWarnings={assignedWarnings}
                dateLabels={dateLabels}
                previewBySlot={previewBySlot}
                previewCurrent={previewCurrent}
                onUpdate={updateEditor}
                onSave={savePlan}
                onFillEmpty={fillEmptySlots}
                onClearAssignments={clearAssignments}
              />
              <RotationGenerationPanel
                startDate={startDate}
                targetStatus={targetStatus}
                startDateValid={startDateValid}
                dirty={dirty}
                canPreview={canPreview}
                canGenerate={canGenerate}
                previewing={previewMutation.isPending}
                generating={generateMutation.isPending}
                mutationBusy={mutationBusy}
                previewResult={previewResult}
                previewCurrent={previewCurrent}
                generationResult={generationResult}
                onStartDate={updateStartDate}
                onTargetStatus={updateTargetStatus}
                onPreview={previewRotation}
                onGenerate={generateRotation}
                onPreviewAgain={() => setGenerationResult(null)}
                onOpenMissionStudio={onOpenMissionStudio}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function RotationPlanList({
  plans,
  selectedPlanId,
  search,
  disabled,
  onSearch,
  onSelect,
}: {
  plans: AdminDailyCrewRotationPlanSummary[];
  selectedPlanId: string | null;
  search: string;
  disabled: boolean;
  onSearch: (value: string) => void;
  onSelect: (planId: string) => void;
}) {
  return (
    <section className="terminal-panel h-fit">
      <div className="terminal-header flex items-center justify-between">
        <span>Rotation Plans</span>
        <span className="text-muted-foreground">{plans.length} shown</span>
      </div>
      <div className="border-b border-border p-3">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          disabled={disabled}
          placeholder="Search plans"
          className="w-full border border-border bg-input px-3 py-2 text-xs"
        />
      </div>
      <div className="max-h-[760px] overflow-y-auto">
        {plans.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No rotation plans match.</div>
        ) : (
          plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(plan.id)}
              className={`block w-full border-b border-border/50 p-4 text-left text-xs hover:bg-muted/40 disabled:opacity-50 ${
                selectedPlanId === plan.id ? "bg-muted/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-foreground">{plan.name}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">r{plan.revision}</div>
                </div>
                <StatusPill tone={plan.ready ? "bull" : "bear"}>
                  {plan.ready ? "Ready" : "Not ready"}
                </StatusPill>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Metric label="Assigned" value={`${plan.slotCount}/30`} />
                <Metric label="Unique templates" value={String(plan.uniqueTemplateCount)} />
                <Metric label="Generated" value={String(plan.generatedMissionCount)} />
                <Metric
                  label="Recent date"
                  value={formatDate(plan.mostRecentGeneratedMissionDate)}
                />
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function RotationPlanEditor({
  editor,
  templates,
  templateById,
  assignedCount,
  uniqueTemplateCount,
  savedReady,
  dirty,
  mutationBusy,
  canSave,
  readyFillAvailable,
  assignedWarnings,
  dateLabels,
  previewBySlot,
  previewCurrent,
  onUpdate,
  onSave,
  onFillEmpty,
  onClearAssignments,
}: {
  editor: DailyCrewRotationEditor;
  templates: AdminDailyCrewTemplateSummary[];
  templateById: Map<string, AdminDailyCrewTemplateSummary>;
  assignedCount: number;
  uniqueTemplateCount: number;
  savedReady: boolean;
  dirty: boolean;
  mutationBusy: boolean;
  canSave: boolean;
  readyFillAvailable: boolean;
  assignedWarnings: ReturnType<typeof findAssignedRotationTemplateWarnings>;
  dateLabels: string[];
  previewBySlot: Map<number, AdminDailyCrewRotationPreviewSlot>;
  previewCurrent: boolean;
  onUpdate: (updater: (current: DailyCrewRotationEditor) => DailyCrewRotationEditor) => void;
  onSave: () => void;
  onFillEmpty: () => void;
  onClearAssignments: () => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
        <span>Plan Editor</span>
        <span className={dirty ? "text-warn" : "text-bull"}>
          {dirty ? "Unsaved changes" : "Clean"}
        </span>
      </div>
      <div className="space-y-4 p-4 text-xs">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(4,140px)]">
          <Field label="Plan name">
            <input
              value={editor.name}
              disabled={mutationBusy}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="mt-1 w-full border border-border bg-input px-3 py-2 text-xs"
              placeholder="30-day East Blue rotation"
            />
          </Field>
          <Metric label="Saved revision" value={editor.revision ? `r${editor.revision}` : "new"} />
          <Metric label="Assigned" value={`${assignedCount}/30`} />
          <Metric label="Unique templates" value={String(uniqueTemplateCount)} />
          <Metric label="Backend ready" value={savedReady ? "Ready" : "Not ready"} />
        </div>

        {assignedWarnings.length > 0 && (
          <div className="border border-warn bg-warn/10 p-3 text-warn">
            <div className="font-bold">Generation blockers in assigned templates</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {assignedWarnings.map((warning) => (
                <li key={`${warning.slotNumber}-${warning.templateId}`}>
                  Day {warning.slotNumber}: {warning.title}
                  {warning.inactive ? " is inactive" : ""}
                  {warning.inactive && warning.unready ? " and" : ""}
                  {warning.unready ? " is not ready" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Save Rotation Plan
          </button>
          <button
            type="button"
            onClick={onFillEmpty}
            disabled={!readyFillAvailable || mutationBusy}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Fill Empty Slots
          </button>
          <button
            type="button"
            onClick={onClearAssignments}
            disabled={assignedCount === 0 || mutationBusy}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Clear All Assignments
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {editor.slots.map((slot) => {
            const template = slot.templateId ? templateById.get(slot.templateId) : null;
            const preview = previewCurrent ? previewBySlot.get(slot.slotNumber) : null;
            const missionDate = dateLabels[slot.slotNumber - 1] ?? "";
            return (
              <SlotCard
                key={slot.slotNumber}
                slot={slot}
                template={template}
                templates={templates}
                missionDate={missionDate}
                preview={preview}
                disabled={mutationBusy}
                onTemplate={(templateId) =>
                  onUpdate((current) => ({
                    ...current,
                    slots: current.slots.map((currentSlot) =>
                      currentSlot.slotNumber === slot.slotNumber
                        ? { ...currentSlot, templateId }
                        : currentSlot,
                    ),
                  }))
                }
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SlotCard({
  slot,
  template,
  templates,
  missionDate,
  preview,
  disabled,
  onTemplate,
}: {
  slot: { slotNumber: number; templateId: string | null };
  template: AdminDailyCrewTemplateSummary | null | undefined;
  templates: AdminDailyCrewTemplateSummary[];
  missionDate: string;
  preview: AdminDailyCrewRotationPreviewSlot | null | undefined;
  disabled: boolean;
  onTemplate: (templateId: string | null) => void;
}) {
  const blocked = Boolean(preview?.blockingReasons.length);

  return (
    <div className={`border bg-card/40 p-3 ${blocked ? "border-bear" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-foreground">Day {slot.slotNumber}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {missionDate || "Enter start date"}
          </div>
        </div>
        {preview && (
          <StatusPill tone={blocked ? "bear" : "bull"}>{blocked ? "Blocked" : "Ready"}</StatusPill>
        )}
      </div>

      <select
        value={slot.templateId ?? ""}
        disabled={disabled}
        onChange={(event) => onTemplate(event.target.value || null)}
        className="mt-3 w-full border border-border bg-input px-2 py-2 text-xs"
      >
        <option value="">No template assigned</option>
        {slot.templateId && !template && (
          <option value={slot.templateId}>
            Unknown template ({slot.templateId}) - inactive / not ready
          </option>
        )}
        {templates.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title} ({option.slug}) - {option.isActive ? "active" : "inactive"} /{" "}
            {option.ready ? "ready" : "not ready"} - {option.poolCount}/{option.jobCount} - r
            {option.revision}
          </option>
        ))}
      </select>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Metric label="Template" value={template?.title ?? "none"} />
        <Metric label="Revision" value={template ? `r${template.revision}` : "none"} />
        <Metric
          label="Active"
          value={template ? (template.isActive ? "Active" : "Inactive") : "none"}
        />
        <Metric
          label="Ready"
          value={template ? (template.ready ? "Ready" : "Not ready") : "none"}
        />
      </div>

      {preview && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-[10px]">
          <Metric label="Generated slug" value={preview.generatedSlug ?? "none"} />
          <div className="grid grid-cols-2 gap-2 uppercase tracking-widest text-muted-foreground">
            <Metric label="Date conflict" value={preview.dateConflict ? "Yes" : "No"} />
            <Metric label="Slug conflict" value={preview.slugConflict ? "Yes" : "No"} />
          </div>
          {preview.blockingReasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-bear">
              {preview.blockingReasons.map((reason) => (
                <li key={reason}>{blockingReasonLabel(reason)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RotationGenerationPanel({
  startDate,
  targetStatus,
  startDateValid,
  dirty,
  canPreview,
  canGenerate,
  previewing,
  generating,
  previewResult,
  previewCurrent,
  generationResult,
  mutationBusy,
  onStartDate,
  onTargetStatus,
  onPreview,
  onGenerate,
  onPreviewAgain,
  onOpenMissionStudio,
}: {
  startDate: string;
  targetStatus: DailyCrewRotationTargetStatus;
  startDateValid: boolean;
  dirty: boolean;
  canPreview: boolean;
  canGenerate: boolean;
  previewing: boolean;
  generating: boolean;
  previewResult: AdminDailyCrewRotationPreviewResult | null;
  previewCurrent: boolean;
  generationResult: AdminDailyCrewRotationGenerationResult | null;
  mutationBusy: boolean;
  onStartDate: (value: string) => void;
  onTargetStatus: (value: string) => void;
  onPreview: () => void;
  onGenerate: () => void;
  onPreviewAgain: () => void;
  onOpenMissionStudio: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="terminal-panel">
        <div className="terminal-header">Generation Settings and Preview</div>
        <div className="space-y-3 p-4 text-xs">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="UTC start date">
              <input
                type="date"
                value={startDate}
                min={todayUtcDate()}
                disabled={mutationBusy}
                onChange={(event) => onStartDate(event.target.value)}
                className="mt-1 border border-border bg-input px-3 py-2 text-xs"
              />
            </Field>
            <Field label="Target status">
              <select
                value={targetStatus}
                disabled={mutationBusy}
                onChange={(event) => onTargetStatus(event.target.value)}
                className="mt-1 border border-border bg-input px-3 py-2 text-xs"
              >
                {TARGET_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status === "draft" ? "Draft" : "Scheduled"}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              onClick={onPreview}
              disabled={!canPreview}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              {previewing ? "Previewing..." : "Preview 30 Days"}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {generating ? "Generating..." : "Generate 30 Missions"}
            </button>
          </div>
          {!startDateValid && (
            <p className="font-bold text-bear">Enter a current or future UTC date.</p>
          )}
          {dirty && (
            <p className="font-bold text-warn">
              Save the rotation plan before previewing or generating.
            </p>
          )}
          {previewResult && !previewCurrent && (
            <p className="font-bold text-warn">
              Preview is stale. Preview again before generating missions.
            </p>
          )}
        </div>
      </div>

      {previewResult && (
        <RotationPreviewPanel result={previewResult} previewCurrent={previewCurrent} />
      )}

      {generationResult && (
        <RotationGenerationResultPanel
          result={generationResult}
          onPreviewAgain={onPreviewAgain}
          onOpenMissionStudio={onOpenMissionStudio}
        />
      )}
    </section>
  );
}

function RotationPreviewPanel({
  result,
  previewCurrent,
}: {
  result: AdminDailyCrewRotationPreviewResult;
  previewCurrent: boolean;
}) {
  const slots = result.slots.slice().sort((a, b) => a.slotNumber - b.slotNumber);

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
        <span>30-Day Preview</span>
        <span className={result.readyToGenerate && previewCurrent ? "text-bull" : "text-bear"}>
          {previewCurrent ? (result.readyToGenerate ? "Ready to generate" : "Blocked") : "Stale"}
        </span>
      </div>
      <div className="space-y-4 p-4 text-xs">
        <div className="grid gap-2 md:grid-cols-4">
          <Metric label="Plan" value={result.planName} />
          <Metric label="Revision" value={`r${result.planRevision}`} />
          <Metric label="Start" value={result.startDate} />
          <Metric label="End" value={result.endDate} />
          <Metric label="Target" value={result.targetStatus} />
          <Metric label="Assigned" value={`${result.slotCount}/30`} />
          <Metric label="Unique templates" value={String(result.uniqueTemplateCount)} />
          <Metric label="Plan ready" value={result.planReady ? "Ready" : "Not ready"} />
          <Metric label="Conflict count" value={String(result.conflictCount)} />
          <Metric label="Ready" value={result.readyToGenerate && previewCurrent ? "Yes" : "No"} />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {slots.map((slot) => (
            <PreviewSlotCard key={slot.slotNumber} slot={slot} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewSlotCard({ slot }: { slot: AdminDailyCrewRotationPreviewSlot }) {
  const blocked = slot.blockingReasons.length > 0;

  return (
    <div className={`border bg-card/40 p-3 ${blocked ? "border-bear" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-foreground">Slot {slot.slotNumber}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {slot.missionDate}
          </div>
        </div>
        <StatusPill tone={blocked ? "bear" : "bull"}>{blocked ? "Blocked" : "Clear"}</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Metric label="Template" value={slot.templateTitle ?? "none"} />
        <Metric
          label="Revision"
          value={slot.templateRevision ? `r${slot.templateRevision}` : "none"}
        />
        <Metric label="Slug" value={slot.generatedSlug ?? "none"} />
        <Metric
          label="Active"
          value={
            slot.templateActive === null ? "none" : slot.templateActive ? "Active" : "Inactive"
          }
        />
        <Metric label="Ready" value={slot.templateReady ? "Ready" : "Not ready"} />
        <Metric label="Date conflict" value={slot.dateConflict ? "Yes" : "No"} />
        <Metric label="Slug conflict" value={slot.slugConflict ? "Yes" : "No"} />
      </div>
      {slot.blockingReasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[10px] text-bear">
          {slot.blockingReasons.map((reason) => (
            <li key={reason}>{blockingReasonLabel(reason)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RotationGenerationResultPanel({
  result,
  onPreviewAgain,
  onOpenMissionStudio,
}: {
  result: AdminDailyCrewRotationGenerationResult;
  onPreviewAgain: () => void;
  onOpenMissionStudio: () => void;
}) {
  const missions = result.missions.slice().sort((a, b) => a.slotNumber - b.slotNumber);

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
        <span>Generation Result</span>
        <span className="text-bull">{result.createdCount} missions created</span>
      </div>
      <div className="space-y-4 p-4 text-xs">
        <div className="grid gap-2 md:grid-cols-4">
          <Metric label="Plan" value={result.planName} />
          <Metric label="Plan revision" value={`r${result.planRevision}`} />
          <Metric label="Date range" value={`${result.startDate} - ${result.endDate}`} />
          <Metric label="Target status" value={result.targetStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenMissionStudio}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
          >
            Open Mission Studio
          </button>
          <button
            type="button"
            onClick={onPreviewAgain}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
          >
            Preview Again
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left">Slot</th>
                <th className="px-2 py-2 text-left">Mission date</th>
                <th className="px-2 py-2 text-left">Slug</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Template revision</th>
                <th className="px-2 py-2 text-left">Rotation revision</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <GeneratedMissionRow key={mission.missionId} mission={mission} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function GeneratedMissionRow({ mission }: { mission: AdminDailyCrewGeneratedMission }) {
  return (
    <tr className="border-b border-border/40">
      <td className="px-2 py-2 tabular">{mission.slotNumber}</td>
      <td className="px-2 py-2 tabular">{mission.missionDate}</td>
      <td className="px-2 py-2">{mission.slug}</td>
      <td className="px-2 py-2">{mission.status}</td>
      <td className="px-2 py-2 tabular">r{mission.sourceTemplateRevision}</td>
      <td className="px-2 py-2 tabular">r{mission.sourceRotationPlanRevision}</td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "bull" | "bear" | "muted"; children: ReactNode }) {
  return (
    <span
      className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
        tone === "bull"
          ? "border-bull text-bull"
          : tone === "bear"
            ? "border-bear text-bear"
            : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}
