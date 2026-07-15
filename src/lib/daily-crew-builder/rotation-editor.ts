import type {
  AdminDailyCrewRotationPlanDetail,
  AdminDailyCrewTemplateSummary,
} from "@/lib/api/daily-crew-builder-admin.functions";

export type DailyCrewRotationTargetStatus = "draft" | "scheduled";

export type DailyCrewRotationEditorSlot = {
  slotNumber: number;
  templateId: string | null;
};

export type DailyCrewRotationEditor = {
  planId: string | null;
  name: string;
  revision: number | null;
  slots: DailyCrewRotationEditorSlot[];
};

export type DailyCrewRotationSavePayload = {
  planId: string | null;
  name: string;
  slots: { slotNumber: number; templateId: string }[];
};

export type DailyCrewRotationTemplateWarning = {
  slotNumber: number;
  templateId: string;
  title: string;
  inactive: boolean;
  unready: boolean;
};

export type DailyCrewRotationPreviewSnapshot = {
  planId: string;
  planRevision: number;
  editorSnapshot: string;
  startDate: string;
  targetStatus: DailyCrewRotationTargetStatus;
};

const SLOT_COUNT = 30;
const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDailyCrewRotationTargetStatus(
  value: string,
): value is DailyCrewRotationTargetStatus {
  return value === "draft" || value === "scheduled";
}

export function createBlankRotationEditor(): DailyCrewRotationEditor {
  return {
    planId: null,
    name: "",
    revision: null,
    slots: createEmptySlots(),
  };
}

export function rotationEditorFromDetail(
  detail: AdminDailyCrewRotationPlanDetail,
): DailyCrewRotationEditor {
  const assigned = new Map(detail.slots.map((slot) => [slot.slotNumber, slot.templateId]));

  return {
    planId: detail.id,
    name: detail.name,
    revision: detail.revision,
    slots: createEmptySlots().map((slot) => ({
      ...slot,
      templateId: assigned.get(slot.slotNumber) ?? null,
    })),
  };
}

export function rotationEditorToSavePayload(
  editor: DailyCrewRotationEditor,
): DailyCrewRotationSavePayload {
  return {
    planId: editor.planId,
    name: editor.name.trim(),
    slots: editor.slots
      .filter((slot): slot is { slotNumber: number; templateId: string } =>
        Boolean(slot.templateId),
      )
      .map((slot) => ({
        slotNumber: slot.slotNumber,
        templateId: slot.templateId,
      })),
  };
}

export function rotationEditorSnapshot(editor: DailyCrewRotationEditor): string {
  return JSON.stringify({
    planId: editor.planId,
    name: editor.name,
    revision: editor.revision,
    slots: editor.slots.map((slot) => ({
      slotNumber: slot.slotNumber,
      templateId: slot.templateId,
    })),
  });
}

export function countAssignedRotationSlots(editor: DailyCrewRotationEditor): number {
  return editor.slots.filter((slot) => slot.templateId).length;
}

export function countUniqueRotationTemplates(editor: DailyCrewRotationEditor): number {
  return new Set(editor.slots.map((slot) => slot.templateId).filter(Boolean)).size;
}

export function findAssignedRotationTemplateWarnings(
  editor: DailyCrewRotationEditor,
  templates: AdminDailyCrewTemplateSummary[],
): DailyCrewRotationTemplateWarning[] {
  const templateById = new Map(templates.map((template) => [template.id, template]));

  return editor.slots.flatMap((slot) => {
    if (!slot.templateId) return [];
    const template = templateById.get(slot.templateId);
    if (!template) {
      return [
        {
          slotNumber: slot.slotNumber,
          templateId: slot.templateId,
          title: "Unknown template",
          inactive: true,
          unready: true,
        },
      ];
    }
    if (template.isActive && template.ready) return [];
    return [
      {
        slotNumber: slot.slotNumber,
        templateId: slot.templateId,
        title: template.title,
        inactive: !template.isActive,
        unready: !template.ready,
      },
    ];
  });
}

export function fillEmptyRotationSlots(
  editor: DailyCrewRotationEditor,
  templates: AdminDailyCrewTemplateSummary[],
): DailyCrewRotationEditor {
  const fillTemplates = templates
    .filter((template) => template.isActive && template.ready)
    .slice()
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id),
    );

  if (fillTemplates.length === 0) return editor;

  let fillIndex = 0;
  return {
    ...editor,
    slots: editor.slots.map((slot) => {
      if (slot.templateId) return slot;
      const template = fillTemplates[fillIndex % fillTemplates.length];
      fillIndex += 1;
      return {
        ...slot,
        templateId: template.id,
      };
    }),
  };
}

export function clearRotationAssignments(editor: DailyCrewRotationEditor): DailyCrewRotationEditor {
  return {
    ...editor,
    slots: editor.slots.map((slot) => ({ ...slot, templateId: null })),
  };
}

export function getRotationUtcDateLabels(startDate: string, days = SLOT_COUNT): string[] {
  const start = parseUtcDateMs(startDate);
  if (start === null) return [];

  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

export function isCurrentOrFutureUtcDate(value: string, now = new Date()): boolean {
  if (parseUtcDateMs(value) === null) return false;
  return value >= now.toISOString().slice(0, 10);
}

export function isRotationPreviewSnapshotCurrent(
  snapshot: DailyCrewRotationPreviewSnapshot | null,
  current: DailyCrewRotationPreviewSnapshot,
): boolean {
  return (
    snapshot?.planId === current.planId &&
    snapshot.planRevision === current.planRevision &&
    snapshot.editorSnapshot === current.editorSnapshot &&
    snapshot.startDate === current.startDate &&
    snapshot.targetStatus === current.targetStatus
  );
}

function createEmptySlots(): DailyCrewRotationEditorSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => ({
    slotNumber: index + 1,
    templateId: null,
  }));
}

function parseUtcDateMs(value: string): number | null {
  if (!UTC_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date.getTime();
}
