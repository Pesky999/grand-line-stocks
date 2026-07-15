/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminDailyCrewRotationPlanDetail,
  AdminDailyCrewTemplateSummary,
} from "@/lib/api/daily-crew-builder-admin.functions";
import {
  clearRotationAssignments,
  countAssignedRotationSlots,
  countUniqueRotationTemplates,
  createBlankRotationEditor,
  fillEmptyRotationSlots,
  findAssignedRotationTemplateWarnings,
  getRotationUtcDateLabels,
  isDailyCrewRotationTargetStatus,
  isCurrentOrFutureUtcDate,
  isRotationPreviewSnapshotCurrent,
  rotationEditorFromDetail,
  rotationEditorSnapshot,
  rotationEditorToSavePayload,
} from "./rotation-editor.ts";

const readyAlpha = templateSummary({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "alpha-template",
  title: "Alpha Template",
  isActive: true,
  ready: true,
});
const readyBeta = templateSummary({
  id: "00000000-0000-4000-8000-000000000002",
  slug: "beta-template",
  title: "Beta Template",
  isActive: true,
  ready: true,
});
const inactiveTemplate = templateSummary({
  id: "00000000-0000-4000-8000-000000000003",
  slug: "inactive-template",
  title: "Inactive Template",
  isActive: false,
  ready: true,
});
const unreadyTemplate = templateSummary({
  id: "00000000-0000-4000-8000-000000000004",
  slug: "unready-template",
  title: "Unready Template",
  isActive: true,
  ready: false,
});

test("blank rotation editor always contains slots 1-30", () => {
  const editor = createBlankRotationEditor();

  assert.equal(editor.planId, null);
  assert.equal(editor.name, "");
  assert.equal(editor.revision, null);
  assert.deepEqual(
    editor.slots.map((slot) => slot.slotNumber),
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
  assert.equal(countAssignedRotationSlots(editor), 0);
  assert.equal(countUniqueRotationTemplates(editor), 0);
});

test("backend detail converts into exactly 30 local slots", () => {
  const editor = rotationEditorFromDetail(rotationPlanDetail());

  assert.equal(editor.planId, "10000000-0000-4000-8000-000000000001");
  assert.equal(editor.name, "Grand Line Month");
  assert.equal(editor.revision, 7);
  assert.equal(editor.slots.length, 30);
  assert.equal(editor.slots[0].templateId, readyAlpha.id);
  assert.equal(editor.slots[4].templateId, readyBeta.id);
  assert.equal(editor.slots[1].templateId, null);
});

test("empty assignments are omitted while repeated templates remain allowed", () => {
  const editor = rotationEditorFromDetail(rotationPlanDetail());
  const payload = rotationEditorToSavePayload({
    ...editor,
    slots: editor.slots.map((slot) =>
      slot.slotNumber === 12 ? { ...slot, templateId: readyAlpha.id } : slot,
    ),
  });

  assert.equal(payload.planId, editor.planId);
  assert.equal(payload.name, "Grand Line Month");
  assert.deepEqual(payload.slots, [
    { slotNumber: 1, templateId: readyAlpha.id },
    { slotNumber: 5, templateId: readyBeta.id },
    { slotNumber: 12, templateId: readyAlpha.id },
  ]);
  assert.equal(countAssignedRotationSlots({ ...editor, slots: payloadToLocal(payload.slots) }), 3);
  assert.equal(
    countUniqueRotationTemplates({ ...editor, slots: payloadToLocal(payload.slots) }),
    2,
  );
});

test("assigned template warnings identify inactive and unready templates", () => {
  const editor = createBlankRotationEditor();
  editor.slots[0] = { slotNumber: 1, templateId: inactiveTemplate.id };
  editor.slots[1] = { slotNumber: 2, templateId: unreadyTemplate.id };
  editor.slots[2] = { slotNumber: 3, templateId: readyAlpha.id };

  assert.deepEqual(
    findAssignedRotationTemplateWarnings(editor, [readyAlpha, inactiveTemplate, unreadyTemplate]),
    [
      {
        slotNumber: 1,
        templateId: inactiveTemplate.id,
        title: "Inactive Template",
        inactive: true,
        unready: false,
      },
      {
        slotNumber: 2,
        templateId: unreadyTemplate.id,
        title: "Unready Template",
        inactive: false,
        unready: true,
      },
    ],
  );
});

test("Fill Empty Slots is deterministic and preserves existing assignments", () => {
  const editor = createBlankRotationEditor();
  editor.name = "Draft rotation";
  editor.slots[1] = { slotNumber: 2, templateId: readyBeta.id };
  const sameSlugLaterId = templateSummary({
    id: "00000000-0000-4000-8000-000000000006",
    slug: "gamma-template",
    title: "Gamma Template",
    isActive: true,
    ready: true,
  });
  const sameSlugEarlierId = templateSummary({
    id: "00000000-0000-4000-8000-000000000005",
    slug: "gamma-template",
    title: "Gamma Template",
    isActive: true,
    ready: true,
  });

  const filled = fillEmptyRotationSlots(editor, [
    unreadyTemplate,
    readyBeta,
    inactiveTemplate,
    readyAlpha,
  ]);

  assert.equal(filled.slots[1].templateId, readyBeta.id);
  assert.equal(filled.slots[0].templateId, readyAlpha.id);
  assert.equal(filled.slots[2].templateId, readyBeta.id);
  assert.equal(filled.slots[3].templateId, readyAlpha.id);
  assert.equal(countAssignedRotationSlots(filled), 30);
  assert.equal(countUniqueRotationTemplates(filled), 2);

  const tieFilled = fillEmptyRotationSlots(createBlankRotationEditor(), [
    sameSlugLaterId,
    sameSlugEarlierId,
  ]);
  assert.equal(tieFilled.slots[0].templateId, sameSlugEarlierId.id);
  assert.equal(tieFilled.slots[1].templateId, sameSlugLaterId.id);
});

test("Clear All preserves name and plan identity", () => {
  const editor = rotationEditorFromDetail(rotationPlanDetail());
  const cleared = clearRotationAssignments(editor);

  assert.equal(cleared.planId, editor.planId);
  assert.equal(cleared.name, editor.name);
  assert.equal(cleared.revision, editor.revision);
  assert.equal(countAssignedRotationSlots(cleared), 0);
});

test("UTC date labels do not drift across month, year, or leap boundaries", () => {
  assert.deepEqual(getRotationUtcDateLabels("2026-01-30", 4), [
    "2026-01-30",
    "2026-01-31",
    "2026-02-01",
    "2026-02-02",
  ]);
  assert.deepEqual(getRotationUtcDateLabels("2026-12-30", 4), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
  assert.deepEqual(getRotationUtcDateLabels("2028-02-28", 3), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  assert.deepEqual(getRotationUtcDateLabels("2026-03-07", 4), [
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
  ]);
  assert.deepEqual(getRotationUtcDateLabels("not-a-date", 3), []);
  assert.deepEqual(getRotationUtcDateLabels("2026-02-30", 3), []);
  assert.deepEqual(getRotationUtcDateLabels("2027-02-29", 3), []);
});

test("current-or-future UTC validation compares YYYY-MM-DD values", () => {
  const now = new Date("2026-07-15T23:59:59.000Z");

  assert.equal(isCurrentOrFutureUtcDate("2026-07-15", now), true);
  assert.equal(isCurrentOrFutureUtcDate("2026-07-16", now), true);
  assert.equal(isCurrentOrFutureUtcDate("2026-07-14", now), false);
  assert.equal(isCurrentOrFutureUtcDate("07/15/2026", now), false);
  assert.equal(isCurrentOrFutureUtcDate("2026-02-30", now), false);
});

test("target status guard allows only draft or scheduled", () => {
  assert.equal(isDailyCrewRotationTargetStatus("draft"), true);
  assert.equal(isDailyCrewRotationTargetStatus("scheduled"), true);
  assert.equal(isDailyCrewRotationTargetStatus("published"), false);
  assert.equal(isDailyCrewRotationTargetStatus("archived"), false);
});

test("snapshots and preview snapshot comparisons are deterministic", () => {
  const editor = rotationEditorFromDetail(rotationPlanDetail());
  const snapshot = rotationEditorSnapshot(editor);
  const previewSnapshot = {
    planId: editor.planId ?? "",
    planRevision: editor.revision ?? 0,
    editorSnapshot: snapshot,
    startDate: "2026-07-15",
    targetStatus: "draft" as const,
  };

  assert.equal(snapshot, rotationEditorSnapshot(rotationEditorFromDetail(rotationPlanDetail())));
  assert.equal(isRotationPreviewSnapshotCurrent(previewSnapshot, previewSnapshot), true);
  assert.equal(
    isRotationPreviewSnapshotCurrent(previewSnapshot, {
      ...previewSnapshot,
      targetStatus: "scheduled",
    }),
    false,
  );
});

function rotationPlanDetail(): AdminDailyCrewRotationPlanDetail {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Grand Line Month",
    revision: 7,
    slotCount: 2,
    uniqueTemplateCount: 2,
    ready: false,
    generatedMissionCount: 0,
    mostRecentGeneratedMissionDate: null,
    createdAt: "2026-07-15T00:00:00+00:00",
    updatedAt: "2026-07-15T00:00:00+00:00",
    slots: [
      {
        slotNumber: 1,
        templateId: readyAlpha.id,
        templateTitle: readyAlpha.title,
        templateSlug: readyAlpha.slug,
        templateRevision: readyAlpha.revision,
        templateActive: readyAlpha.isActive,
        templateReady: readyAlpha.ready,
        poolCount: readyAlpha.poolCount,
        jobCount: readyAlpha.jobCount,
        scoreCount: readyAlpha.scoreCount,
      },
      {
        slotNumber: 5,
        templateId: readyBeta.id,
        templateTitle: readyBeta.title,
        templateSlug: readyBeta.slug,
        templateRevision: readyBeta.revision,
        templateActive: readyBeta.isActive,
        templateReady: readyBeta.ready,
        poolCount: readyBeta.poolCount,
        jobCount: readyBeta.jobCount,
        scoreCount: readyBeta.scoreCount,
      },
    ],
  };
}

function templateSummary(
  patch: Pick<AdminDailyCrewTemplateSummary, "id" | "slug" | "title" | "isActive" | "ready">,
): AdminDailyCrewTemplateSummary {
  return {
    ...patch,
    revision: 2,
    revealPolicy: "immediate",
    poolCount: 9,
    jobCount: 3,
    scoreCount: 27,
    instanceCount: 0,
    mostRecentMissionDate: null,
    createdAt: "2026-07-15T00:00:00+00:00",
    updatedAt: "2026-07-15T00:00:00+00:00",
  };
}

function payloadToLocal(slots: { slotNumber: number; templateId: string }[]) {
  const bySlot = new Map(slots.map((slot) => [slot.slotNumber, slot.templateId]));
  return Array.from({ length: 30 }, (_, index) => ({
    slotNumber: index + 1,
    templateId: bySlot.get(index + 1) ?? null,
  }));
}
