import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminDailyCrewMission,
  listAdminDailyCrewMissions,
  saveAdminDailyCrewMissionDraft,
  setAdminDailyCrewMissionStatus,
  type AdminDailyCrewMissionSummary,
} from "@/lib/api/daily-crew-builder-admin.functions";
import { listCharacters, type CharacterRow } from "@/lib/api/market.functions";
import {
  addCharacterToPool,
  autoFillPerfectCrew,
  createNewDailyCrewMissionEditor,
  editorFromMissionDetail,
  editorSnapshot,
  ensureScoreMatrix,
  getDailyCrewStatusActions,
  isEditorReadOnly,
  moveJob,
  movePoolEntry,
  readOnlyReason,
  removeCharacterFromPool,
  setPerfectSolutionCharacter,
  setPoolDisplayOrder,
  slugFromTitle,
  tagsFromCommaInput,
  toMissionSavePayload,
  updateJob,
  updatePoolEntry,
  updateScore,
  validateDailyCrewMissionEditor,
  validationIssueCount,
  type DailyCrewEditorJob,
  type DailyCrewMissionEditor,
  type DailyCrewMissionStatus,
  type DailyCrewStatusAction,
} from "@/lib/daily-crew-builder/admin-editor";
import type { DailyCrewRole } from "@/lib/daily-crew-builder/scoring";

const dailyCrewAdminMissionsQO = {
  queryKey: ["admin", "daily-crew", "missions"],
  queryFn: () => listAdminDailyCrewMissions(),
} as const;

const dailyCrewAdminCharactersQO = {
  queryKey: ["characters"],
  queryFn: () => listCharacters(),
} as const;

type StatusFilter = "all" | DailyCrewMissionStatus;
type SaveMissionMutationVariables = {
  editor: DailyCrewMissionEditor;
  targetMissionId: string | null;
  submittedSnapshot: string;
  operationKey: number;
};
type StatusMissionMutationVariables = {
  missionId: string;
  action: DailyCrewStatusAction;
  operationKey: number;
};

const STATUS_FILTERS: StatusFilter[] = ["all", "draft", "scheduled", "published", "archived"];
const ROLE_OPTIONS: DailyCrewRole[] = ["captain", "fighter", "navigator", "strategist", "support"];
const REVEAL_POLICIES = ["immediate", "next_day", "manual"] as const;

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "not set";
  return new Date(value).toLocaleString();
}

function statusTone(status: DailyCrewMissionStatus) {
  switch (status) {
    case "draft":
      return "text-muted-foreground";
    case "scheduled":
      return "text-warn";
    case "published":
      return "text-bull";
    case "archived":
      return "text-bear";
  }
}

function characterSearchHaystack(character: CharacterRow) {
  return `${character.name} ${character.slug} ${character.crew ?? ""}`.toLowerCase();
}

function missionSearchHaystack(mission: AdminDailyCrewMissionSummary) {
  return `${mission.title} ${mission.slug}`.toLowerCase();
}

export function DailyCrewMissionStudio() {
  const queryClient = useQueryClient();
  const { data: missions } = useSuspenseQuery(dailyCrewAdminMissionsQO);
  const { data: characters } = useSuspenseQuery(dailyCrewAdminCharactersQO);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [missionSearch, setMissionSearch] = useState("");
  const [characterSearch, setCharacterSearch] = useState("");
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<DailyCrewMissionEditor | null>(null);
  const [baselineEditor, setBaselineEditor] = useState<DailyCrewMissionEditor | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);
  const selectedMissionIdRef = useRef<string | null>(selectedMissionId);
  const editorSnapshotRef = useRef("");
  const activeEditorOperationRef = useRef(0);

  const currentEditorSnapshot = editor ? editorSnapshot(editor) : "";
  const dirty = editor ? currentEditorSnapshot !== baselineSnapshot : false;
  const validation = useMemo(
    () => (editor ? validateDailyCrewMissionEditor(editor) : null),
    [editor],
  );
  const readOnly = editor ? isEditorReadOnly(editor) : false;
  const readOnlyMessage = editor ? readOnlyReason(editor) : null;
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const selectedPool = useMemo(
    () => editor?.pool.filter((entry) => entry.characterId) ?? [],
    [editor?.pool],
  );
  const selectedCharacterIds = useMemo(
    () => new Set(selectedPool.map((entry) => entry.characterId)),
    [selectedPool],
  );
  const filteredMissions = useMemo(() => {
    const q = missionSearch.trim().toLowerCase();
    return missions.filter((mission) => {
      const statusMatches = statusFilter === "all" || mission.status === statusFilter;
      const searchMatches = !q || missionSearchHaystack(mission).includes(q);
      return statusMatches && searchMatches;
    });
  }, [missionSearch, missions, statusFilter]);
  const filteredCharacters = useMemo(() => {
    const q = characterSearch.trim().slice(0, 80).toLowerCase();
    const rows = q
      ? characters.filter((character) => characterSearchHaystack(character).includes(q))
      : characters;
    return rows.slice(0, 80);
  }, [characterSearch, characters]);

  useEffect(() => {
    selectedMissionIdRef.current = selectedMissionId;
  }, [selectedMissionId]);

  useEffect(() => {
    editorSnapshotRef.current = currentEditorSnapshot;
  }, [currentEditorSnapshot]);

  function advanceEditorOperation() {
    activeEditorOperationRef.current += 1;
    return activeEditorOperationRef.current;
  }

  function setEditorBaseline(nextEditor: DailyCrewMissionEditor, nextSlugTouched: boolean) {
    setEditor(nextEditor);
    setBaselineEditor(nextEditor);
    setBaselineSnapshot(editorSnapshot(nextEditor));
    setSlugTouched(nextSlugTouched);
  }

  const detailQ = useQuery({
    queryKey: ["admin", "daily-crew", "mission", selectedMissionId],
    queryFn: () =>
      getAdminDailyCrewMission({
        data: { missionId: selectedMissionId ?? "" },
      }),
    enabled: Boolean(selectedMissionId),
    refetchOnWindowFocus: false,
  });

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
    if (!selectedMissionId || !detailQ.isSuccess || !detailQ.data) return;
    if (detailQ.data.id !== selectedMissionId) return;
    if (dirty && editor?.missionId === selectedMissionId) return;
    const nextEditor = editorFromMissionDetail(detailQ.data);
    advanceEditorOperation();
    setEditorBaseline(nextEditor, true);
  }, [detailQ.data, detailQ.isSuccess, dirty, editor?.missionId, selectedMissionId]);

  const saveMutation = useMutation({
    mutationFn: async (variables: SaveMissionMutationVariables) =>
      saveAdminDailyCrewMissionDraft({ data: toMissionSavePayload(variables.editor) }),
    onSuccess: async (result, variables) => {
      toast.success(
        variables.targetMissionId ? "Daily Crew draft saved." : "Daily Crew mission created.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "missions"] });
      const detail = await getAdminDailyCrewMission({ data: { missionId: result.missionId } });
      queryClient.setQueryData(["admin", "daily-crew", "mission", result.missionId], detail);
      const nextEditor = editorFromMissionDetail(detail);
      const stillActiveExistingMission =
        variables.targetMissionId != null &&
        selectedMissionIdRef.current === variables.targetMissionId &&
        activeEditorOperationRef.current === variables.operationKey;
      const stillActiveNewMission =
        variables.targetMissionId == null &&
        selectedMissionIdRef.current == null &&
        editorSnapshotRef.current === variables.submittedSnapshot &&
        activeEditorOperationRef.current === variables.operationKey;
      if (!stillActiveExistingMission && !stillActiveNewMission) return;
      setSelectedMissionId(result.missionId);
      advanceEditorOperation();
      setEditorBaseline(nextEditor, true);
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not save Daily Crew mission."));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ missionId, action }: StatusMissionMutationVariables) =>
      setAdminDailyCrewMissionStatus({
        data: {
          missionId,
          targetStatus: action.targetStatus,
        },
      }),
    onSuccess: async (result, variables) => {
      const labels: Record<DailyCrewStatusAction["action"], string> = {
        schedule: "Mission scheduled.",
        archive: "Mission archived.",
        return_to_draft: "Mission returned to draft.",
        restore_to_draft: "Mission restored to draft.",
      };
      toast.success(labels[variables.action.action]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "daily-crew", "missions"] });
      const detail = await getAdminDailyCrewMission({ data: { missionId: result.missionId } });
      queryClient.setQueryData(["admin", "daily-crew", "mission", result.missionId], detail);
      const nextEditor = editorFromMissionDetail(detail);
      if (
        selectedMissionIdRef.current !== variables.missionId ||
        activeEditorOperationRef.current !== variables.operationKey
      ) {
        return;
      }
      setSelectedMissionId(result.missionId);
      advanceEditorOperation();
      setEditorBaseline(nextEditor, true);
    },
    onError: (error) => {
      toast.error(messageFromError(error, "Could not update mission status."));
    },
  });
  const mutationBusy = saveMutation.isPending || statusMutation.isPending;

  function confirmDiscard(message = "Discard unsaved Daily Crew Mission Studio changes?") {
    return !dirty || window.confirm(message);
  }

  function selectMission(missionId: string) {
    if (mutationBusy) return;
    if (missionId === selectedMissionId) return;
    if (!confirmDiscard("Discard unsaved changes and load another mission?")) return;
    advanceEditorOperation();
    setSelectedMissionId(missionId);
    setEditor(null);
    setBaselineEditor(null);
    setBaselineSnapshot("");
    setSlugTouched(true);
  }

  function newMission() {
    if (mutationBusy) return;
    if (!confirmDiscard("Discard unsaved changes and start a new mission?")) return;
    const nextEditor = createNewDailyCrewMissionEditor(missions);
    advanceEditorOperation();
    setSelectedMissionId(null);
    setEditorBaseline(nextEditor, false);
  }

  function resetUnsavedChanges() {
    if (mutationBusy) return;
    if (!editor || !confirmDiscard("Reset this editor to the last loaded or saved state?")) return;
    if (baselineEditor) {
      advanceEditorOperation();
      setEditor(baselineEditor);
      setBaselineSnapshot(editorSnapshot(baselineEditor));
      setSlugTouched(Boolean(baselineEditor.missionId));
      return;
    }
  }

  function updateEditor(updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) {
    if (mutationBusy) return;
    setEditor((current) => (current ? updater(current) : current));
  }

  function updateTitle(title: string) {
    updateEditor((current) => ({
      ...current,
      title,
      slug: !current.missionId && !slugTouched ? slugFromTitle(title) : current.slug,
    }));
  }

  function addCharacter(character: CharacterRow) {
    updateEditor((current) =>
      addCharacterToPool(current, {
        id: character.id,
        slug: character.slug,
        name: character.name,
        crew: character.crew,
      }),
    );
  }

  function changeJobRole(job: DailyCrewEditorJob, role: DailyCrewRole) {
    if (mutationBusy) return;
    if (role === job.role) return;
    if (
      editor?.jobs.some(
        (otherJob) => otherJob.displayOrder !== job.displayOrder && otherJob.role === role,
      )
    ) {
      toast.error("That role lane is already assigned to another job.");
      return;
    }
    const hasPopulatedScoreData =
      editor?.scores.some(
        (score) =>
          score.role === job.role && (score.score > 0 || score.explanation.trim().length > 0),
      ) ?? false;
    const hasPerfectSelection =
      editor?.perfectSolution.some(
        (solution) => solution.role === job.role && solution.characterId,
      ) ?? false;
    if (
      (hasPopulatedScoreData || hasPerfectSelection) &&
      !window.confirm(
        "Changing this job role clears score explanations and perfect-crew selections for the old role. Continue?",
      )
    ) {
      return;
    }
    updateEditor((current) => updateJob(current, job.displayOrder, { role }));
  }

  function saveDraft() {
    if (!editor || mutationBusy) return;
    if (readOnly) {
      toast.error(readOnlyMessage ?? "This mission is read-only.");
      return;
    }
    if (!validation?.ok) {
      toast.error("Mission is not ready to save. Review the readiness panel.");
      return;
    }
    saveMutation.mutate({
      editor,
      targetMissionId: editor.missionId,
      submittedSnapshot: currentEditorSnapshot,
      operationKey: activeEditorOperationRef.current,
    });
  }

  function runStatusAction(action: DailyCrewStatusAction) {
    if (mutationBusy) return;
    if (!editor?.missionId) {
      toast.error("Save the mission before changing status.");
      return;
    }
    if (!action.allowed) {
      toast.error(action.reason ?? "This status action is not available.");
      return;
    }
    if (!window.confirm(action.confirmMessage)) return;
    statusMutation.mutate({
      missionId: editor.missionId,
      action,
      operationKey: activeEditorOperationRef.current,
    });
  }

  const actions = editor ? getDailyCrewStatusActions(editor, { dirty }) : [];
  const editorDisabled = readOnly || mutationBusy;
  const canSave = Boolean(editor && !readOnly && validation?.ok && !mutationBusy);

  return (
    <div className="space-y-4">
      <section className="terminal-panel">
        <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
          <span>Daily Crew Mission Studio</span>
          <span className="text-muted-foreground">Admin-only authoring data</span>
        </div>
        <div className="space-y-3 p-4 text-xs text-muted-foreground">
          <p>
            Create, inspect, and schedule Daily Crew Builder missions through the protected
            authoring backend. Hidden score matrices and perfect crews stay inside this protected
            admin route.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={newMission}
              disabled={mutationBusy}
              className="bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              New Mission
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
        <MissionList
          missions={filteredMissions}
          selectedMissionId={selectedMissionId}
          statusFilter={statusFilter}
          search={missionSearch}
          loading={false}
          error={null}
          disabled={mutationBusy}
          onStatusFilter={setStatusFilter}
          onSearch={setMissionSearch}
          onSelect={selectMission}
        />

        <section className="space-y-4">
          {!editor && !selectedMissionId && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Select a mission to inspect hidden authoring data, or create a new simplified
              9-character / 3-job mission.
            </div>
          )}
          {selectedMissionId && detailQ.isLoading && (
            <div className="terminal-panel p-6 text-sm text-muted-foreground">
              Loading protected mission detail...
            </div>
          )}
          {selectedMissionId && detailQ.isError && (
            <div role="alert" className="terminal-panel p-6 text-sm text-bear">
              {messageFromError(detailQ.error, "Could not load Daily Crew mission detail.")}
            </div>
          )}
          {editor && (
            <>
              <ReadinessPanel validation={validation} ready={validation?.ok ?? false} />
              <EditorActions
                editor={editor}
                dirty={dirty}
                canSave={canSave}
                saving={saveMutation.isPending}
                mutationBusy={mutationBusy}
                statusActions={actions}
                onSave={saveDraft}
                onStatusAction={runStatusAction}
              />
              {readOnlyMessage && (
                <div className="border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                  {readOnlyMessage}
                </div>
              )}
              <MetadataEditor
                editor={editor}
                disabled={editorDisabled}
                onUpdate={updateEditor}
                onTitle={updateTitle}
                onSlugTouched={() => setSlugTouched(true)}
              />
              <PoolEditor
                editor={editor}
                characters={filteredCharacters}
                characterById={characterById}
                selectedCharacterIds={selectedCharacterIds}
                characterSearch={characterSearch}
                disabled={editorDisabled}
                onCharacterSearch={setCharacterSearch}
                onAddCharacter={addCharacter}
                onUpdate={updateEditor}
              />
              <JobsEditor
                editor={editor}
                disabled={editorDisabled}
                onUpdate={updateEditor}
                onRoleChange={changeJobRole}
              />
              <ScoreMatrixEditor
                editor={editor}
                characterById={characterById}
                disabled={editorDisabled}
                onUpdate={updateEditor}
              />
              <PerfectCrewEditor
                editor={editor}
                characterById={characterById}
                disabled={editorDisabled}
                onUpdate={updateEditor}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MissionList({
  missions,
  selectedMissionId,
  statusFilter,
  search,
  loading,
  error,
  disabled,
  onStatusFilter,
  onSearch,
  onSelect,
}: {
  missions: AdminDailyCrewMissionSummary[];
  selectedMissionId: string | null;
  statusFilter: StatusFilter;
  search: string;
  loading: boolean;
  error: Error | null;
  disabled: boolean;
  onStatusFilter: (status: StatusFilter) => void;
  onSearch: (value: string) => void;
  onSelect: (missionId: string) => void;
}) {
  return (
    <section className="terminal-panel self-start">
      <div className="terminal-header flex items-center justify-between">
        <span>Mission List</span>
        <span className="text-muted-foreground">{missions.length} shown</span>
      </div>
      <div className="space-y-3 border-b border-border p-3">
        <select
          value={statusFilter}
          disabled={disabled}
          onChange={(event) => onStatusFilter(event.target.value as StatusFilter)}
          className="w-full border border-border bg-input px-2 py-2 text-xs disabled:opacity-50"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "all statuses" : status}
            </option>
          ))}
        </select>
        <input
          value={search}
          disabled={disabled}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search title or slug"
          className="w-full border border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary disabled:opacity-50"
        />
      </div>
      {loading && <div className="p-4 text-xs text-muted-foreground">Loading missions...</div>}
      {error && <div className="p-4 text-xs text-bear">{error.message}</div>}
      {!loading && !error && missions.length === 0 && (
        <div className="p-4 text-xs text-muted-foreground">
          No missions match the current filters.
        </div>
      )}
      <div className="max-h-[680px] overflow-y-auto">
        {missions.map((mission) => (
          <button
            key={mission.id}
            type="button"
            onClick={() => onSelect(mission.id)}
            disabled={disabled}
            className={`block w-full border-b border-border p-3 text-left text-xs last:border-b-0 hover:bg-card/70 ${
              selectedMissionId === mission.id ? "bg-primary/10" : ""
            } disabled:opacity-50`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-foreground">{mission.title}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-accent">
                  {mission.slug}
                </div>
              </div>
              <span className={`uppercase ${statusTone(mission.status)}`}>{mission.status}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <span>{mission.missionDate} UTC</span>
              <span>
                {mission.poolCount}/{mission.jobCount} format
              </span>
              <span>{mission.scoreCount} scores</span>
              <span>{mission.submissionCount} submissions</span>
              <span className={mission.ready ? "text-bull" : "text-warn"}>
                {mission.ready ? "Ready" : "Not Ready"}
              </span>
              <span>Updated {formatDateTime(mission.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReadinessPanel({
  validation,
  ready,
}: {
  validation: ReturnType<typeof validateDailyCrewMissionEditor> | null;
  ready: boolean;
}) {
  const issueCount = validation ? validationIssueCount(validation) : 0;
  const groups = [
    ["Mission details", validation?.groups.missionDetails ?? []],
    ["Character pool", validation?.groups.characterPool ?? []],
    ["Jobs", validation?.groups.jobs ?? []],
    ["Score matrix", validation?.groups.scoreMatrix ?? []],
    ["Perfect crew", validation?.groups.perfectCrew ?? []],
  ] as const;

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Readiness</span>
        <span className={ready ? "text-bull" : "text-warn"}>
          {ready ? "Ready to save" : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {groups.map(([label, issues]) => (
          <div key={label} className="border border-border bg-card/40 p-3 text-xs">
            <div className={issues.length === 0 ? "text-bull" : "text-warn"}>{label}</div>
            {issues.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No issues.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function EditorActions({
  editor,
  dirty,
  canSave,
  saving,
  mutationBusy,
  statusActions,
  onSave,
  onStatusAction,
}: {
  editor: DailyCrewMissionEditor;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  mutationBusy: boolean;
  statusActions: DailyCrewStatusAction[];
  onSave: () => void;
  onStatusAction: (action: DailyCrewStatusAction) => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header flex flex-wrap items-center justify-between gap-2">
        <span>{editor.missionId ? editor.title || editor.slug : "New Mission Draft"}</span>
        <span className="text-muted-foreground">
          {dirty ? "Unsaved changes" : "No unsaved changes"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || mutationBusy}
          className="bg-primary px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Complete Draft"}
        </button>
        {statusActions.map((action) => (
          <button
            key={action.action}
            type="button"
            onClick={() => onStatusAction(action)}
            disabled={!action.allowed || mutationBusy}
            title={action.reason ?? undefined}
            className="border border-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="border-t border-border p-4 text-xs text-muted-foreground">
        The backend accepts only a fully configured atomic draft. Scheduling and status changes use
        the protected status RPC; manual publishing and mission deletion are not available here.
      </p>
    </section>
  );
}

function MetadataEditor({
  editor,
  disabled,
  onUpdate,
  onTitle,
  onSlugTouched,
}: {
  editor: DailyCrewMissionEditor;
  disabled: boolean;
  onUpdate: (updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) => void;
  onTitle: (title: string) => void;
  onSlugTouched: () => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header">Mission Details</div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <Field label="UTC mission date">
          <input
            type="date"
            value={editor.missionDate}
            disabled={disabled}
            onChange={(event) =>
              onUpdate((current) => ({ ...current, missionDate: event.target.value }))
            }
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </Field>
        <Field label="Slug">
          <input
            value={editor.slug}
            disabled={disabled || Boolean(editor.missionId)}
            onChange={(event) => {
              onSlugTouched();
              onUpdate((current) => ({
                ...current,
                slug: normalizeSlugInput(event.target.value),
              }));
            }}
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </Field>
        <Field label="Title">
          <input
            value={editor.title}
            disabled={disabled}
            maxLength={120}
            onChange={(event) => onTitle(event.target.value)}
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </Field>
        <Field label="Mission tags, comma-separated">
          <input
            value={editor.missionTags.join(", ")}
            disabled={disabled}
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                missionTags: tagsFromCommaInput(event.target.value),
              }))
            }
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </Field>
        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Brief</span>
          <textarea
            value={editor.brief}
            disabled={disabled}
            maxLength={2000}
            rows={4}
            onChange={(event) => onUpdate((current) => ({ ...current, brief: event.target.value }))}
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <Field label="Reveal policy">
          <select
            value={editor.revealPolicy}
            disabled={disabled}
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                revealPolicy: event.target.value as DailyCrewMissionEditor["revealPolicy"],
              }))
            }
            className="mt-1 w-full border border-border bg-input px-2 py-2 text-sm disabled:opacity-50"
          >
            {REVEAL_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reveal timestamp, optional ISO with offset">
          <input
            value={editor.revealAt ?? ""}
            disabled={disabled}
            placeholder="2026-07-15T00:00:00Z"
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                revealAt: event.target.value.trim() || null,
              }))
            }
            className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </Field>
      </div>
    </section>
  );
}

function PoolEditor({
  editor,
  characters,
  characterById,
  selectedCharacterIds,
  characterSearch,
  disabled,
  onCharacterSearch,
  onAddCharacter,
  onUpdate,
}: {
  editor: DailyCrewMissionEditor;
  characters: CharacterRow[];
  characterById: Map<string, CharacterRow>;
  selectedCharacterIds: Set<string>;
  characterSearch: string;
  disabled: boolean;
  onCharacterSearch: (value: string) => void;
  onAddCharacter: (character: CharacterRow) => void;
  onUpdate: (updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) => void;
}) {
  const selectedCount = editor.pool.filter((entry) => entry.characterId).length;

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Character Pool</span>
        <span className={selectedCount === editor.poolSize ? "text-bull" : "text-warn"}>
          {selectedCount} / {editor.poolSize} characters selected
        </span>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <input
            value={characterSearch}
            disabled={disabled}
            onChange={(event) => onCharacterSearch(event.target.value)}
            placeholder="Search name, slug, crew"
            className="w-full border border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary disabled:opacity-50"
          />
          <div className="max-h-[360px] overflow-y-auto border border-border">
            {characters.map((character) => {
              const duplicate = selectedCharacterIds.has(character.id);
              const full = selectedCount >= editor.poolSize;
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => onAddCharacter(character)}
                  disabled={disabled || duplicate || full}
                  className="block w-full border-b border-border p-2 text-left text-xs last:border-b-0 hover:bg-card/70 disabled:opacity-40"
                >
                  <div className="font-bold text-foreground">{character.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {character.slug} - {character.crew ?? "No crew"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left">Order</th>
                <th className="px-2 py-2 text-left">Character</th>
                <th className="px-2 py-2 text-left">Straw Hat</th>
                <th className="px-2 py-2 text-left">Visible tags</th>
                <th className="px-2 py-2 text-right">Move</th>
                <th className="px-2 py-2 text-right">Remove</th>
              </tr>
            </thead>
            <tbody>
              {editor.pool.map((entry) => {
                const character = characterById.get(entry.characterId);
                return (
                  <tr key={entry.displayOrder} className="border-b border-border/40">
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={1}
                        max={editor.pool.length}
                        value={entry.displayOrder}
                        disabled={disabled}
                        onChange={(event) =>
                          onUpdate((current) =>
                            setPoolDisplayOrder(
                              current,
                              entry.displayOrder,
                              Number(event.target.value),
                            ),
                          )
                        }
                        className="w-16 border border-border bg-input px-2 py-1 tabular disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-2">
                      {character ? (
                        <div>
                          <div className="font-bold text-foreground">{character.name}</div>
                          <div className="text-[10px] text-muted-foreground">{character.slug}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Empty slot</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={entry.isStrawHat}
                        disabled={disabled || !entry.characterId}
                        onChange={(event) =>
                          onUpdate((current) =>
                            updatePoolEntry(current, entry.displayOrder, {
                              isStrawHat: event.target.checked,
                            }),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={entry.visibleTags.join(", ")}
                        disabled={disabled || !entry.characterId}
                        onChange={(event) =>
                          onUpdate((current) =>
                            updatePoolEntry(current, entry.displayOrder, {
                              visibleTags: tagsFromCommaInput(event.target.value),
                            }),
                          )
                        }
                        className="w-full border border-border bg-input px-2 py-1 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={disabled || entry.displayOrder === 1}
                        onClick={() =>
                          onUpdate((current) => movePoolEntry(current, entry.displayOrder, -1))
                        }
                        className="mr-1 text-muted-foreground hover:text-primary disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={disabled || entry.displayOrder === editor.pool.length}
                        onClick={() =>
                          onUpdate((current) => movePoolEntry(current, entry.displayOrder, 1))
                        }
                        className="text-muted-foreground hover:text-primary disabled:opacity-40"
                      >
                        Down
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={disabled || !entry.characterId}
                        onClick={() =>
                          onUpdate((current) => removeCharacterFromPool(current, entry.characterId))
                        }
                        className="text-muted-foreground hover:text-bear disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function JobsEditor({
  editor,
  disabled,
  onUpdate,
  onRoleChange,
}: {
  editor: DailyCrewMissionEditor;
  disabled: boolean;
  onUpdate: (updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) => void;
  onRoleChange: (job: DailyCrewEditorJob, role: DailyCrewRole) => void;
}) {
  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Jobs</span>
        <span className="text-muted-foreground">
          {editor.jobs.reduce((sum, job) => sum + job.maxPoints, 0)} / 90 points
        </span>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left">Order</th>
              <th className="px-2 py-2 text-left">Role lane</th>
              <th className="px-2 py-2 text-left">Subtype key</th>
              <th className="px-2 py-2 text-left">Subtype label</th>
              <th className="px-2 py-2 text-left">Display label</th>
              <th className="px-2 py-2 text-left">Max</th>
              <th className="px-2 py-2 text-right">Move</th>
            </tr>
          </thead>
          <tbody>
            {editor.jobs.map((job) => {
              const occupiedRoles = new Set(
                editor.jobs
                  .filter((otherJob) => otherJob.displayOrder !== job.displayOrder)
                  .map((otherJob) => otherJob.role),
              );
              return (
                <tr key={job.displayOrder} className="border-b border-border/40">
                  <td className="px-2 py-2 tabular">{job.displayOrder}</td>
                  <td className="px-2 py-2">
                    <select
                      value={job.role}
                      disabled={disabled}
                      onChange={(event) => onRoleChange(job, event.target.value as DailyCrewRole)}
                      className="border border-border bg-input px-2 py-1 disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option
                          key={role}
                          value={role}
                          disabled={role !== job.role && occupiedRoles.has(role)}
                        >
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={job.subtypeKey}
                      disabled={disabled}
                      onChange={(event) =>
                        onUpdate((current) =>
                          updateJob(current, job.displayOrder, {
                            subtypeKey: event.target.value.trim().toLowerCase(),
                          }),
                        )
                      }
                      className="w-full border border-border bg-input px-2 py-1 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={job.subtypeLabel ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        onUpdate((current) =>
                          updateJob(current, job.displayOrder, {
                            subtypeLabel: event.target.value || null,
                          }),
                        )
                      }
                      className="w-full border border-border bg-input px-2 py-1 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={job.displayLabel}
                      disabled={disabled}
                      onChange={(event) =>
                        onUpdate((current) =>
                          updateJob(current, job.displayOrder, {
                            displayLabel: event.target.value,
                          }),
                        )
                      }
                      className="w-full border border-border bg-input px-2 py-1 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={job.maxPoints}
                      disabled={disabled}
                      onChange={(event) =>
                        onUpdate((current) =>
                          updateJob(current, job.displayOrder, {
                            maxPoints: Number(event.target.value),
                          }),
                        )
                      }
                      className="w-20 border border-border bg-input px-2 py-1 tabular disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={disabled || job.displayOrder === 1}
                      onClick={() => onUpdate((current) => moveJob(current, job.displayOrder, -1))}
                      className="mr-1 text-muted-foreground hover:text-primary disabled:opacity-40"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={disabled || job.displayOrder === editor.jobs.length}
                      onClick={() => onUpdate((current) => moveJob(current, job.displayOrder, 1))}
                      className="text-muted-foreground hover:text-primary disabled:opacity-40"
                    >
                      Down
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoreMatrixEditor({
  editor,
  characterById,
  disabled,
  onUpdate,
}: {
  editor: DailyCrewMissionEditor;
  characterById: Map<string, CharacterRow>;
  disabled: boolean;
  onUpdate: (updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) => void;
}) {
  const pool = editor.pool.filter((entry) => entry.characterId);

  return (
    <section className="terminal-panel">
      <div className="terminal-header">Score Matrix - Admin-only Hidden Data</div>
      <div className="overflow-x-auto border-b border-border p-4">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left">Character</th>
              {editor.jobs.map((job) => (
                <th key={job.role} className="px-2 py-2 text-right">
                  {job.displayLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pool.map((entry) => (
              <tr key={entry.characterId} className="border-b border-border/40">
                <td className="px-2 py-2">{characterById.get(entry.characterId)?.name}</td>
                {editor.jobs.map((job) => {
                  const score = editor.scores.find(
                    (row) => row.characterId === entry.characterId && row.role === job.role,
                  );
                  return (
                    <td key={job.role} className="px-2 py-2 text-right tabular">
                      {score?.score ?? 0} / {job.maxPoints}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-4">
        {editor.jobs.map((job) => {
          const rows = pool.map((entry) => ({
            entry,
            character: characterById.get(entry.characterId),
            score: editor.scores.find(
              (row) => row.characterId === entry.characterId && row.role === job.role,
            ),
          }));
          const complete = rows.filter((row) => row.score?.explanation.trim()).length;
          const maxCandidates = rows.filter((row) => row.score?.score === job.maxPoints).length;
          return (
            <details key={job.role} open className="border border-border bg-card/40">
              <summary className="cursor-pointer p-3 text-xs font-bold uppercase tracking-widest text-foreground">
                {job.displayLabel} - max {job.maxPoints} - {complete}/{pool.length} explained -{" "}
                {maxCandidates} max candidates
              </summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[780px] text-xs">
                  <tbody>
                    {rows.map(({ entry, character, score }) => (
                      <tr key={entry.characterId} className="border-b border-border/40">
                        <td className="w-56 px-3 py-2 align-top">
                          <div className="font-bold text-foreground">{character?.name}</div>
                          <div className="text-[10px] text-muted-foreground">{character?.slug}</div>
                        </td>
                        <td className="w-28 px-3 py-2 align-top">
                          <input
                            type="number"
                            min={0}
                            max={job.maxPoints}
                            value={score?.score ?? 0}
                            disabled={disabled}
                            onChange={(event) =>
                              onUpdate((current) =>
                                updateScore(current, entry.characterId, job.role, {
                                  score: Number(event.target.value),
                                }),
                              )
                            }
                            className="w-20 border border-border bg-input px-2 py-1 tabular disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            value={score?.explanation ?? ""}
                            disabled={disabled}
                            rows={2}
                            onChange={(event) =>
                              onUpdate((current) =>
                                updateScore(current, entry.characterId, job.role, {
                                  explanation: event.target.value,
                                }),
                              )
                            }
                            className="w-full border border-border bg-input px-2 py-1 disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function PerfectCrewEditor({
  editor,
  characterById,
  disabled,
  onUpdate,
}: {
  editor: DailyCrewMissionEditor;
  characterById: Map<string, CharacterRow>;
  disabled: boolean;
  onUpdate: (updater: (current: DailyCrewMissionEditor) => DailyCrewMissionEditor) => void;
}) {
  const selectedPerfectCharacters = new Set(
    editor.perfectSolution.map((solution) => solution.characterId).filter(Boolean),
  );
  const perfectStrawHats = editor.perfectSolution.filter((solution) =>
    editor.pool.some((entry) => entry.characterId === solution.characterId && entry.isStrawHat),
  ).length;

  function autoFill() {
    onUpdate((current) => {
      const result = autoFillPerfectCrew(current);
      if (!result.ok) {
        toast.error(result.message);
        return current;
      }
      toast.success("Perfect crew auto-filled.");
      return result.editor;
    });
  }

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Perfect Crew - Admin-only Hidden Data</span>
        <span className={perfectStrawHats <= 3 ? "text-bull" : "text-bear"}>
          {perfectStrawHats} / 3 Straw Hats
        </span>
      </div>
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={autoFill}
          disabled={disabled}
          className="border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
        >
          Auto-fill Perfect Crew
        </button>
        <div className="grid gap-3 md:grid-cols-3">
          {editor.jobs.map((job) => {
            const solution = editor.perfectSolution.find((entry) => entry.role === job.role);
            const candidates = editor.scores
              .filter((score) => score.role === job.role && score.score === job.maxPoints)
              .filter((score) =>
                editor.pool.some((entry) => entry.characterId === score.characterId),
              );
            return (
              <label key={job.role} className="block border border-border bg-card/40 p-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {job.displayLabel}
                </span>
                <select
                  value={solution?.characterId ?? ""}
                  disabled={disabled || candidates.length === 0}
                  onChange={(event) =>
                    onUpdate((current) =>
                      setPerfectSolutionCharacter(current, job.role, event.target.value),
                    )
                  }
                  className="mt-2 w-full border border-border bg-input px-2 py-2 text-xs disabled:opacity-50"
                >
                  <option value="">Choose max-score character</option>
                  {candidates.map((candidate) => {
                    const usedElsewhere =
                      selectedPerfectCharacters.has(candidate.characterId) &&
                      solution?.characterId !== candidate.characterId;
                    return (
                      <option
                        key={candidate.characterId}
                        value={candidate.characterId}
                        disabled={usedElsewhere}
                      >
                        {characterById.get(candidate.characterId)?.name ?? candidate.characterId}
                      </option>
                    );
                  })}
                </select>
                {candidates.length === 0 && (
                  <p className="mt-2 text-[10px] text-warn">
                    No max-score candidates for this job yet.
                  </p>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </section>
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
