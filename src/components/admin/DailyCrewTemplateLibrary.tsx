import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createAdminDailyCrewMissionFromTemplate,
  getAdminDailyCrewTemplate,
  listAdminDailyCrewMissions,
  listAdminDailyCrewTemplates,
  saveAdminDailyCrewTemplate,
  type AdminDailyCrewTemplateDetail,
  type AdminDailyCrewTemplateSummary,
} from "@/lib/api/daily-crew-builder-admin.functions";
import { listCharacters, type CharacterRow } from "@/lib/api/market.functions";
import {
  DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE,
  importTemplateJsonToDraft,
  type DailyCrewTemplateDraft,
  type DailyCrewTemplateImportResult,
} from "@/lib/daily-crew-builder/template-import";

const dailyCrewAdminMissionsQO = {
  queryKey: ["admin", "daily-crew", "missions"],
  queryFn: () => listAdminDailyCrewMissions(),
} as const;

const dailyCrewAdminTemplatesQO = {
  queryKey: ["admin", "daily-crew", "templates"],
  queryFn: () => listAdminDailyCrewTemplates(),
} as const;

const dailyCrewAdminCharactersQO = {
  queryKey: ["characters"],
  queryFn: () => listCharacters(),
} as const;

type TemplateFilter = "all" | "active" | "inactive";
type ImportMode = "new" | "replace";
type PendingTemplateImport = {
  mode: ImportMode;
  draft: DailyCrewTemplateDraft;
  summary: Extract<DailyCrewTemplateImportResult, { ok: true }>["summary"];
  replacementRevision: number | null;
  validatedJsonText: string;
};
type SaveTemplateMutationVariables = {
  draft: DailyCrewTemplateDraft;
  submittedSnapshot: string;
  operationKey: number;
  source: "new" | "replace" | "toggle";
};
type CreateMissionMutationVariables = {
  templateId: string;
  templateTitle: string;
  missionDate: string;
  operationKey: number;
};

const TEMPLATE_FILTERS: TemplateFilter[] = ["all", "active", "inactive"];
const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  return value ?? "Never used";
}

function templateSearchHaystack(template: AdminDailyCrewTemplateSummary) {
  return `${template.title} ${template.slug}`.toLowerCase();
}

function templateDraftSnapshot(draft: DailyCrewTemplateDraft | null) {
  return draft ? JSON.stringify(draft) : "";
}

function templateDetailToDraft(
  detail: AdminDailyCrewTemplateDetail,
  isActive = detail.isActive,
): DailyCrewTemplateDraft {
  return {
    templateId: detail.id,
    slug: detail.slug,
    title: detail.title,
    brief: detail.brief,
    missionTags: detail.missionTags,
    revealPolicy: detail.revealPolicy,
    isActive,
    pool: detail.pool.map((entry) => ({ ...entry })),
    jobs: detail.jobs.map((job) => ({ ...job })),
    scores: detail.scores.map((score) => ({ ...score })),
    perfectSolution: detail.perfectSolution.map((solution) => ({ ...solution })),
  };
}

function isCurrentOrFutureUtcDate(value: string) {
  return UTC_DATE_RE.test(value) && value >= todayUtcDate();
}

export function DailyCrewTemplateLibrary({
  onOpenMissionStudio,
}: {
  onOpenMissionStudio: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: templates } = useSuspenseQuery(dailyCrewAdminTemplatesQO);
  const { data: characters } = useSuspenseQuery(dailyCrewAdminCharactersQO);
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<DailyCrewTemplateImportResult | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingTemplateImport | null>(null);
  const [draftMissionDate, setDraftMissionDate] = useState(todayUtcDate());
  const [lastCreatedMission, setLastCreatedMission] = useState<{
    title: string;
    slug: string;
    missionDate: string;
    status: string;
    sourceTemplateRevision: number;
  } | null>(null);
  const selectedTemplateIdRef = useRef<string | null>(selectedTemplateId);
  const activeTemplateOperationRef = useRef(0);
  const pendingDraftSnapshotRef = useRef("");

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((template) => {
      const filterMatches =
        filter === "all" ||
        (filter === "active" && template.isActive) ||
        (filter === "inactive" && !template.isActive);
      const searchMatches = !q || templateSearchHaystack(template).includes(q);
      return filterMatches && searchMatches;
    });
  }, [filter, search, templates]);

  const detailQ = useQuery({
    queryKey: ["admin", "daily-crew", "template", selectedTemplateId],
    queryFn: () =>
      getAdminDailyCrewTemplate({
        data: { templateId: selectedTemplateId ?? "" },
      }),
    enabled: Boolean(selectedTemplateId),
    refetchOnWindowFocus: false,
  });

  const selectedDetail =
    detailQ.isSuccess && detailQ.data?.id === selectedTemplateId ? detailQ.data : null;

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  useEffect(() => {
    pendingDraftSnapshotRef.current = templateDraftSnapshot(pendingImport?.draft ?? null);
  }, [pendingImport]);

  const saveMutation = useMutation({
    mutationFn: async ({ draft }: SaveTemplateMutationVariables) =>
      saveAdminDailyCrewTemplate({ data: draft }),
    onSuccess: async (result, variables) => {
      const labels: Record<SaveTemplateMutationVariables["source"], string> = {
        new: "Template saved.",
        replace: "Template updated.",
        toggle: result.isActive ? "Template activated." : "Template deactivated.",
      };
      toast.success(labels[variables.source]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "templates"] });
      const detail = await getAdminDailyCrewTemplate({ data: { templateId: result.templateId } });
      queryClient.setQueryData(["admin", "daily-crew", "template", result.templateId], detail);

      const stillActiveDraft =
        variables.source === "toggle" ||
        pendingDraftSnapshotRef.current === variables.submittedSnapshot;
      if (activeTemplateOperationRef.current !== variables.operationKey || !stillActiveDraft) {
        return;
      }
      setSelectedTemplateId(result.templateId);
      setPendingImport(null);
      setImportResult(null);
      setImportText("");
      setImportOpen(false);
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not save Daily Crew template."));
    },
  });

  const createMissionMutation = useMutation({
    mutationFn: async ({ templateId, missionDate }: CreateMissionMutationVariables) =>
      createAdminDailyCrewMissionFromTemplate({ data: { templateId, missionDate } }),
    onSuccess: async (result, variables) => {
      toast.success("Dated draft mission created.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "missions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "templates"] }),
        queryClient.invalidateQueries({
          queryKey: ["admin", "daily-crew", "template", variables.templateId],
        }),
      ]);
      if (activeTemplateOperationRef.current !== variables.operationKey) return;
      setLastCreatedMission({
        title: variables.templateTitle,
        slug: result.slug,
        missionDate: result.missionDate,
        status: result.status,
        sourceTemplateRevision: result.sourceTemplateRevision,
      });
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not create dated Daily Crew draft."));
    },
  });

  const mutationBusy = saveMutation.isPending || createMissionMutation.isPending;
  const pendingImportMatchesText = Boolean(
    pendingImport && importText === pendingImport.validatedJsonText,
  );
  const pendingImportStale = Boolean(pendingImport && !pendingImportMatchesText);

  function advanceTemplateOperation() {
    activeTemplateOperationRef.current += 1;
    return activeTemplateOperationRef.current;
  }

  function confirmDiscardPending(message: string) {
    return !pendingImport || window.confirm(message);
  }

  function clearPendingImport() {
    setPendingImport(null);
    setImportResult(null);
  }

  function selectTemplate(templateId: string) {
    if (mutationBusy) return;
    if (templateId === selectedTemplateId) return;
    if (!confirmDiscardPending("Discard the pending imported template draft and select another?")) {
      return;
    }
    advanceTemplateOperation();
    setSelectedTemplateId(templateId);
    setPendingImport(null);
    setImportResult(null);
    setImportOpen(false);
    setLastCreatedMission(null);
  }

  function clearSelection() {
    if (mutationBusy) return;
    if (
      !confirmDiscardPending("Discard the pending imported template draft and clear selection?")
    ) {
      return;
    }
    advanceTemplateOperation();
    setSelectedTemplateId(null);
    setPendingImport(null);
    setImportResult(null);
    setLastCreatedMission(null);
  }

  function openImport(mode: ImportMode) {
    if (mutationBusy) return;
    if (!confirmDiscardPending("Replace the pending imported template draft?")) return;
    if (mode === "replace" && !selectedDetail) {
      toast.error("Select and load a template before replacing it.");
      return;
    }
    setImportMode(mode);
    setImportOpen(true);
    setImportText("");
    setImportResult(null);
    setPendingImport(null);
  }

  function insertImportExample() {
    if (mutationBusy) return;
    setImportText(DAILY_CREW_TEMPLATE_IMPORT_EXAMPLE);
    setImportResult(null);
  }

  function clearImportPanel() {
    if (mutationBusy) return;
    setImportText("");
    setImportResult(null);
    setPendingImport(null);
  }

  function updateImportText(value: string) {
    setImportText(value);
    setImportResult(null);
  }

  function validateImportText() {
    if (mutationBusy) return;

    const replacementDetail = importMode === "replace" ? selectedDetail : null;
    if (importMode === "replace" && !replacementDetail) {
      toast.error("Select and load a template before replacing it.");
      return;
    }

    const result = importTemplateJsonToDraft(importText, characters, {
      templateId: replacementDetail?.id ?? null,
      isActive: replacementDetail?.isActive ?? true,
    });
    if (!result.ok) {
      setImportResult(result);
      toast.error("Template JSON validation failed. Review the import errors.");
      return;
    }
    if (
      pendingImport &&
      importText !== pendingImport.validatedJsonText &&
      !window.confirm("Replace the pending imported template draft?")
    ) {
      return;
    }

    setImportResult(result);
    if (importMode === "new") {
      advanceTemplateOperation();
      setSelectedTemplateId(null);
    }

    setPendingImport({
      mode: importMode,
      draft: result.draft,
      summary: result.summary,
      replacementRevision: replacementDetail ? replacementDetail.revision + 1 : null,
      validatedJsonText: importText,
    });
    toast.success("Template JSON validated. Review the preview before saving.");
  }

  function savePendingImport() {
    if (!pendingImport || mutationBusy) return;
    if (importText !== pendingImport.validatedJsonText) {
      toast.error("The JSON has changed since validation. Validate it again before saving.");
      return;
    }
    const isReplacement = pendingImport.mode === "replace";
    const confirmMessage = isReplacement
      ? `Update ${pendingImport.draft.title}? This creates revision ${
          pendingImport.replacementRevision ?? "next"
        } and does not modify existing missions.`
      : `Save ${pendingImport.draft.title} as a reusable Daily Crew template?`;
    if (!window.confirm(confirmMessage)) return;
    saveMutation.mutate({
      draft: pendingImport.draft,
      submittedSnapshot: templateDraftSnapshot(pendingImport.draft),
      operationKey: advanceTemplateOperation(),
      source: isReplacement ? "replace" : "new",
    });
  }

  function toggleActiveState(nextIsActive: boolean) {
    if (mutationBusy || !selectedDetail) return;
    if (!selectedDetail.ready) {
      toast.error("Only ready templates can be activated or deactivated.");
      return;
    }
    if (
      !confirmDiscardPending(
        "Discard the pending imported template draft before changing active state?",
      )
    ) {
      return;
    }
    const verb = nextIsActive ? "activate" : "deactivate";
    if (
      !window.confirm(
        `${verb[0].toUpperCase()}${verb.slice(
          1,
        )} ${selectedDetail.title}? This resubmits the complete template and creates revision ${
          selectedDetail.revision + 1
        }. Existing dated missions remain unchanged.`,
      )
    ) {
      return;
    }
    clearPendingImport();
    saveMutation.mutate({
      draft: templateDetailToDraft(selectedDetail, nextIsActive),
      submittedSnapshot: "",
      operationKey: advanceTemplateOperation(),
      source: "toggle",
    });
  }

  function createDatedDraft() {
    if (mutationBusy || !selectedDetail) return;
    if (!selectedDetail.isActive) {
      toast.error("Only active templates can create dated drafts.");
      return;
    }
    if (!selectedDetail.ready) {
      toast.error("Only ready templates can create dated drafts.");
      return;
    }
    if (!isCurrentOrFutureUtcDate(draftMissionDate)) {
      toast.error("Enter a current or future UTC date in YYYY-MM-DD format.");
      return;
    }
    if (
      !confirmDiscardPending(
        "Discard the pending imported template draft before creating a dated mission?",
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Create a draft mission for ${draftMissionDate} from ${selectedDetail.title}? This will not schedule or publish it.`,
      )
    ) {
      return;
    }
    clearPendingImport();
    createMissionMutation.mutate({
      templateId: selectedDetail.id,
      templateTitle: selectedDetail.title,
      missionDate: draftMissionDate,
      operationKey: advanceTemplateOperation(),
    });
  }

  const canSaveImport = Boolean(pendingImportMatchesText && !mutationBusy);
  const canToggle = Boolean(selectedDetail?.ready && !mutationBusy);
  const canCreateDraft = Boolean(
    selectedDetail?.isActive &&
    selectedDetail.ready &&
    isCurrentOrFutureUtcDate(draftMissionDate) &&
    !mutationBusy,
  );

  return (
    <div className="space-y-4">
      <section className="terminal-panel">
        <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
          <span>Daily Crew Template Library</span>
          <span className="text-muted-foreground">Protected reusable mission templates</span>
        </div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          <p>
            Import reusable Daily Crew mission templates from the same strict Mission JSON format,
            then instantiate dated draft missions when you need them. This phase does not schedule,
            publish, submit crews, or award rewards.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openImport("new")}
              disabled={mutationBusy}
              className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Import New Template JSON
            </button>
            <button
              type="button"
              onClick={() => openImport("replace")}
              disabled={!selectedDetail || mutationBusy}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Replace Template from JSON
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={!selectedTemplateId || mutationBusy}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Clear Selection
            </button>
          </div>
        </div>
      </section>

      {importOpen && (
        <TemplateImportPanel
          mode={importMode}
          jsonText={importText}
          result={importResult}
          pendingImport={pendingImport}
          pendingImportStale={pendingImportStale}
          disabled={mutationBusy}
          canSave={canSaveImport}
          onJsonText={updateImportText}
          onValidate={validateImportText}
          onClear={clearImportPanel}
          onInsertExample={insertImportExample}
          onSave={savePendingImport}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <TemplateList
          templates={filteredTemplates}
          selectedTemplateId={selectedTemplateId}
          filter={filter}
          search={search}
          disabled={mutationBusy}
          onFilter={setFilter}
          onSearch={setSearch}
          onSelect={selectTemplate}
        />

        <section className="space-y-4">
          {!selectedTemplateId && !pendingImport && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Select a reusable template, or import Mission JSON to create a new date-neutral
              template draft.
            </div>
          )}
          {selectedTemplateId && detailQ.isLoading && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Loading protected template detail...
            </div>
          )}
          {selectedTemplateId && detailQ.isError && (
            <div role="alert" className="terminal-panel p-6 text-sm text-bear">
              {messageFromError(detailQ.error, "Could not load Daily Crew template detail.")}
            </div>
          )}
          {selectedDetail && (
            <TemplateDetail
              detail={selectedDetail}
              characterById={characterById}
              draftMissionDate={draftMissionDate}
              mutationBusy={mutationBusy}
              canToggle={canToggle}
              canCreateDraft={canCreateDraft}
              lastCreatedMission={lastCreatedMission}
              onDraftMissionDate={setDraftMissionDate}
              onActivate={() => toggleActiveState(true)}
              onDeactivate={() => toggleActiveState(false)}
              onCreateDatedDraft={createDatedDraft}
              onOpenMissionStudio={onOpenMissionStudio}
            />
          )}
          {pendingImport && (
            <PendingImportPreview
              pendingImport={pendingImport}
              characterById={characterById}
              pendingImportStale={pendingImportStale}
              canSave={canSaveImport}
              onSave={savePendingImport}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function TemplateList({
  templates,
  selectedTemplateId,
  filter,
  search,
  disabled,
  onFilter,
  onSearch,
  onSelect,
}: {
  templates: AdminDailyCrewTemplateSummary[];
  selectedTemplateId: string | null;
  filter: TemplateFilter;
  search: string;
  disabled: boolean;
  onFilter: (filter: TemplateFilter) => void;
  onSearch: (value: string) => void;
  onSelect: (templateId: string) => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Templates</span>
        <span className="text-muted-foreground">{templates.length} shown</span>
      </div>
      <div className="space-y-3 border-b border-border p-4">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search title or slug"
          className="w-full border border-border bg-input px-3 py-2 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onFilter(item)}
              className={`border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                filter === item
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[680px] overflow-y-auto">
        {templates.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No templates match the filters.</div>
        ) : (
          templates.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(template.id)}
              className={`block w-full border-b border-border/50 p-4 text-left text-xs hover:bg-muted/40 disabled:opacity-50 ${
                selectedTemplateId === template.id ? "bg-muted/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-foreground">{template.title}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{template.slug}</div>
                </div>
                <StatusPill tone={template.isActive ? "bull" : "muted"}>
                  {template.isActive ? "Active" : "Inactive"}
                </StatusPill>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Metric label="Revision" value={`r${template.revision}`} />
                <Metric label="Format" value={`${template.poolCount}/${template.jobCount}`} />
                <Metric label="Scores" value={String(template.scoreCount)} />
                <Metric label="Ready" value={template.ready ? "Ready" : "Not ready"} />
                <Metric label="Instances" value={String(template.instanceCount)} />
                <Metric label="Recent date" value={formatDate(template.mostRecentMissionDate)} />
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function TemplateDetail({
  detail,
  characterById,
  draftMissionDate,
  mutationBusy,
  canToggle,
  canCreateDraft,
  lastCreatedMission,
  onDraftMissionDate,
  onActivate,
  onDeactivate,
  onCreateDatedDraft,
  onOpenMissionStudio,
}: {
  detail: AdminDailyCrewTemplateDetail;
  characterById: Map<string, CharacterRow>;
  draftMissionDate: string;
  mutationBusy: boolean;
  canToggle: boolean;
  canCreateDraft: boolean;
  lastCreatedMission: {
    title: string;
    slug: string;
    missionDate: string;
    status: string;
    sourceTemplateRevision: number;
  } | null;
  onDraftMissionDate: (value: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onCreateDatedDraft: () => void;
  onOpenMissionStudio: () => void;
}) {
  return (
    <>
      <section className="terminal-panel">
        <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
          <span>{detail.title}</span>
          <span className={detail.ready ? "text-bull" : "text-bear"}>
            {detail.ready ? "Ready" : "Not ready"}
          </span>
        </div>
        <div className="space-y-4 p-4 text-xs">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Slug" value={detail.slug} />
            <Metric label="Revision" value={`r${detail.revision}`} />
            <Metric label="Active state" value={detail.isActive ? "Active" : "Inactive"} />
            <Metric label="Reveal policy" value={detail.revealPolicy} />
            <Metric label="Format" value={`${detail.poolCount}/${detail.jobCount}`} />
            <Metric label="Score rows" value={String(detail.scoreCount)} />
            <Metric label="Instances" value={String(detail.instanceCount)} />
            <Metric label="Most recent date" value={formatDate(detail.mostRecentMissionDate)} />
            <Metric label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Mission tags
            </div>
            <div className="mt-1 text-foreground">
              {detail.missionTags.length ? detail.missionTags.join(", ") : "none"}
            </div>
          </div>
          <p className="text-muted-foreground">{detail.brief}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onActivate}
              disabled={detail.isActive || !canToggle}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Activate Template
            </button>
            <button
              type="button"
              onClick={onDeactivate}
              disabled={!detail.isActive || !canToggle}
              className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Deactivate Template
            </button>
          </div>
        </div>
      </section>

      <section className="terminal-panel">
        <div className="terminal-header">Create Dated Draft</div>
        <div className="space-y-3 p-4 text-xs">
          <p className="text-muted-foreground">
            Create a fresh draft mission from this template. The new mission is not scheduled or
            published automatically.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                UTC mission date
              </span>
              <input
                type="date"
                value={draftMissionDate}
                min={todayUtcDate()}
                onChange={(event) => onDraftMissionDate(event.target.value)}
                className="mt-1 border border-border bg-input px-3 py-2 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={onCreateDatedDraft}
              disabled={!canCreateDraft}
              className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Create Dated Draft
            </button>
          </div>
          {mutationBusy && (
            <p className="text-muted-foreground">Template operation in progress...</p>
          )}
          {lastCreatedMission && (
            <div className="border border-border bg-card/40 p-3">
              <div className="font-bold text-foreground">Draft created</div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <Metric label="Title" value={lastCreatedMission.title} />
                <Metric label="Slug" value={lastCreatedMission.slug} />
                <Metric label="Date" value={lastCreatedMission.missionDate} />
                <Metric label="Status" value={lastCreatedMission.status} />
                <Metric
                  label="Template revision"
                  value={`r${lastCreatedMission.sourceTemplateRevision}`}
                />
              </div>
              <button
                type="button"
                onClick={onOpenMissionStudio}
                className="mt-3 border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary"
              >
                Open Mission Studio
              </button>
            </div>
          )}
        </div>
      </section>

      <TemplateContentDetail detail={detail} characterById={characterById} />
    </>
  );
}

function TemplateContentDetail({
  detail,
  characterById,
}: {
  detail: AdminDailyCrewTemplateDetail;
  characterById: Map<string, CharacterRow>;
}) {
  const perfectByRole = new Map(detail.perfectSolution.map((entry) => [entry.role, entry]));
  return (
    <section className="terminal-panel">
      <div className="terminal-header">Protected Template Detail</div>
      <div className="space-y-4 p-4 text-xs">
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Character pool
          </h3>
          <div className="grid gap-2 md:grid-cols-3">
            {detail.pool.map((entry) => {
              const character = characterById.get(entry.characterId);
              return (
                <div key={entry.characterId} className="border border-border bg-card/40 p-3">
                  <div className="font-bold text-foreground">
                    {entry.displayOrder}. {character?.name ?? entry.characterId}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {character?.slug ?? "unknown slug"}
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {entry.visibleTags.length ? entry.visibleTags.join(", ") : "no visible tags"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Jobs and perfect crew
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left">Order</th>
                  <th className="px-2 py-2 text-left">Display label</th>
                  <th className="px-2 py-2 text-left">Role lane</th>
                  <th className="px-2 py-2 text-right">Max</th>
                  <th className="px-2 py-2 text-left">Perfect crew</th>
                </tr>
              </thead>
              <tbody>
                {detail.jobs.map((job) => {
                  const perfect = perfectByRole.get(job.role);
                  const character = perfect ? characterById.get(perfect.characterId) : null;
                  return (
                    <tr key={job.role} className="border-b border-border/40">
                      <td className="px-2 py-2 tabular">{job.displayOrder}</td>
                      <td className="px-2 py-2 font-bold text-foreground">{job.displayLabel}</td>
                      <td className="px-2 py-2 text-muted-foreground">{job.role}</td>
                      <td className="px-2 py-2 text-right tabular">{job.maxPoints}</td>
                      <td className="px-2 py-2">{character?.name ?? perfect?.characterId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border border-border bg-card/40 p-3 text-muted-foreground">
          Hidden score matrix summarized: {detail.scoreCount} score rows. Full score explanations
          are retained in the protected backend and resubmitted only through the approved template
          save API.
        </div>
      </div>
    </section>
  );
}

function TemplateImportPanel({
  mode,
  jsonText,
  result,
  pendingImport,
  pendingImportStale,
  disabled,
  canSave,
  onJsonText,
  onValidate,
  onClear,
  onInsertExample,
  onSave,
}: {
  mode: ImportMode;
  jsonText: string;
  result: DailyCrewTemplateImportResult | null;
  pendingImport: PendingTemplateImport | null;
  pendingImportStale: boolean;
  disabled: boolean;
  canSave: boolean;
  onJsonText: (value: string) => void;
  onValidate: () => void;
  onClear: () => void;
  onInsertExample: () => void;
  onSave: () => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
        <span>{mode === "new" ? "Import New Template JSON" : "Replace Template from JSON"}</span>
        <span className="text-muted-foreground">Validation does not save anything</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Mission date is used only to validate the JSON format and will not be stored in the
          template.
        </p>
        <textarea
          value={jsonText}
          rows={12}
          disabled={disabled}
          onChange={(event) => onJsonText(event.target.value)}
          className="w-full border border-border bg-input p-3 font-mono text-xs disabled:opacity-50"
          placeholder="Paste one complete Mission JSON object"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onValidate}
            disabled={disabled || jsonText.trim().length === 0}
            className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Validate and Preview
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onInsertExample}
            disabled={disabled}
            className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Insert Example
          </button>
          {pendingImport && (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="border border-bull px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-bull hover:bg-bull/10 disabled:opacity-40"
            >
              {pendingImport.mode === "new" ? "Save as Template" : "Update Template"}
            </button>
          )}
        </div>
        {result && !result.ok && <ImportErrors errors={result.errors} />}
        {pendingImportStale && (
          <p className="text-xs font-bold text-bear">
            JSON changed after validation. Validate again before saving.
          </p>
        )}
        {pendingImport && (
          <div className="border border-border bg-card/40 p-3 text-xs">
            <div className="font-bold text-foreground">Valid template preview</div>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <Metric label="Title" value={pendingImport.summary.title} />
              <Metric label="Format" value={pendingImport.summary.format} />
              <Metric label="Characters" value={String(pendingImport.summary.poolCount)} />
              <Metric label="Perfect crew" value={String(pendingImport.summary.perfectCrewCount)} />
              <Metric label="Source date" value={pendingImport.summary.sourceMissionDate} />
              <Metric label="Stored date" value="none" />
              <Metric
                label="Active state"
                value={pendingImport.draft.isActive ? "Active" : "Inactive"}
              />
              <Metric
                label="Next revision"
                value={
                  pendingImport.replacementRevision ? `r${pendingImport.replacementRevision}` : "r1"
                }
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PendingImportPreview({
  pendingImport,
  characterById,
  pendingImportStale,
  canSave,
  onSave,
}: {
  pendingImport: PendingTemplateImport;
  characterById: Map<string, CharacterRow>;
  pendingImportStale: boolean;
  canSave: boolean;
  onSave: () => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header">
        {pendingImport.mode === "new" ? "Unsaved New Template" : "Unsaved Replacement Template"}
      </div>
      <div className="space-y-3 p-4 text-xs">
        <div className="grid gap-2 md:grid-cols-4">
          <Metric label="Title" value={pendingImport.draft.title} />
          <Metric label="Slug" value={pendingImport.draft.slug} />
          <Metric
            label="Format"
            value={`${pendingImport.draft.pool.length}/${pendingImport.draft.jobs.length}`}
          />
          <Metric
            label="Active state"
            value={pendingImport.draft.isActive ? "Active" : "Inactive"}
          />
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Perfect crew preview
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {pendingImport.draft.perfectSolution.map((solution) => {
              const job = pendingImport.draft.jobs.find((entry) => entry.role === solution.role);
              const character = characterById.get(solution.characterId);
              return (
                <div key={solution.role} className="border border-border bg-card/40 p-3">
                  <div className="font-bold text-foreground">
                    {job?.displayLabel ?? solution.role}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {character?.name ?? solution.characterId}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {pendingImportStale && (
          <p className="font-bold text-bear">
            JSON changed after validation. Validate again before saving.
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {pendingImport.mode === "new" ? "Save as Template" : "Update Template"}
        </button>
      </div>
    </section>
  );
}

function ImportErrors({
  errors,
}: {
  errors: Extract<DailyCrewTemplateImportResult, { ok: false }>["errors"];
}) {
  return (
    <div role="alert" className="space-y-2 border border-bear bg-bear/10 p-3 text-xs">
      <div className="font-bold text-bear">Template JSON validation errors</div>
      {Object.entries(errors).map(([group, messages]) =>
        messages.length ? (
          <div key={group}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {group}
            </div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-bear">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
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

function StatusPill({ tone, children }: { tone: "bull" | "muted"; children: ReactNode }) {
  return (
    <span
      className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
        tone === "bull" ? "border-bull text-bull" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}
