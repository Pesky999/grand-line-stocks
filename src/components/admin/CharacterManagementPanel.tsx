import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminCreateCharacter,
  adminUpdateCharacter,
  type CharacterRow,
} from "@/lib/api/market.functions";

type Mode = "add" | "edit";

type CharacterForm = {
  name: string;
  slug: string;
  crew: string;
  role: string;
  bounty: string;
  imageUrl: string;
  description: string;
  displayOrder: string;
};

type CreatePayload = {
  slug: string;
  name: string;
  crew: string | null;
  role: string | null;
  bounty: number | null;
  image_url: string | null;
  description: string | null;
  display_order: number | null;
};

type UpdatePayload = {
  slug: string;
  name: string;
  crew: string | null;
  role: string | null;
  bounty: number | null;
  image_url: string | null;
  description: string | null;
  display_order: number | null;
};

type ConfirmState =
  | { type: "create"; payload: CreatePayload; rows: Array<[string, string]> }
  | { type: "update"; payload: UpdatePayload; rows: Array<[string, string]> }
  | { type: "discard"; slug: string; rows: Array<[string, string]> };

const emptyAddForm: CharacterForm = {
  name: "",
  slug: "",
  crew: "",
  role: "",
  bounty: "",
  imageUrl: "",
  description: "",
  displayOrder: "",
};

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/-+/g, "-");
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function formatNullable(value: string | number | null | undefined) {
  return value == null || value === "" ? "NULL" : String(value);
}

function characterToForm(character: CharacterRow): CharacterForm {
  return {
    name: character.name,
    slug: character.slug,
    crew: character.crew ?? "",
    role: character.role ?? "",
    bounty: character.bounty == null ? "" : String(character.bounty),
    imageUrl: character.image_url ?? "",
    description: character.description ?? "",
    displayOrder: character.display_order == null ? "" : String(character.display_order),
  };
}

function formsEqual(a: CharacterForm, b: CharacterForm) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseNullableInteger(value: string, label: string, positiveOnly = false) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${label} must be a whole number.`);
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is too large.`);
  if (positiveOnly && parsed < 1) throw new Error(`${label} must be positive.`);
  return parsed;
}

function validateUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > 1000) throw new Error("Image URL must be 1,000 characters or fewer.");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Image URL must use http or https.");
    }
    return trimmed;
  } catch {
    throw new Error("Image URL must be a valid http or https URL.");
  }
}

function assertLength(value: string, label: string, max: number, required = false) {
  const trimmed = value.trim();
  if (required && trimmed.length === 0) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return trimmed;
}

function changedRows(before: CharacterForm, after: CharacterForm) {
  const labels: Array<[keyof CharacterForm, string]> = [
    ["name", "Display name"],
    ["crew", "Crew or affiliation"],
    ["role", "Role"],
    ["bounty", "Bounty"],
    ["imageUrl", "Image URL"],
    ["description", "Description"],
    ["displayOrder", "Display order"],
  ];
  return labels
    .filter(([key]) => before[key] !== after[key])
    .map(
      ([key, label]) =>
        [label, `${formatNullable(before[key])} -> ${formatNullable(after[key])}`] as [
          string,
          string,
        ],
    );
}

function toCreatePayload(form: CharacterForm, existingSlugs: Set<string>): CreatePayload {
  const slug = normalizeSlug(form.slug);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug)) {
    throw new Error(
      "Slug must be 1-60 characters and use lowercase letters, numbers, and hyphens.",
    );
  }
  if (existingSlugs.has(slug)) throw new Error("Character slug already exists.");
  return {
    slug,
    name: assertLength(form.name, "Display name", 120, true),
    crew: textOrNull(assertLength(form.crew, "Crew or affiliation", 120)),
    role: textOrNull(assertLength(form.role, "Role", 120)),
    bounty: parseNullableInteger(form.bounty, "Bounty"),
    image_url: validateUrl(form.imageUrl),
    description: textOrNull(assertLength(form.description, "Description", 2000)),
    display_order: parseNullableInteger(form.displayOrder, "Display order", true),
  };
}

function toUpdatePayload(form: CharacterForm): UpdatePayload {
  return {
    slug: form.slug,
    name: assertLength(form.name, "Display name", 120, true),
    crew: textOrNull(assertLength(form.crew, "Crew or affiliation", 120)),
    role: textOrNull(assertLength(form.role, "Role", 120)),
    bounty: parseNullableInteger(form.bounty, "Bounty"),
    image_url: validateUrl(form.imageUrl),
    description: textOrNull(assertLength(form.description, "Description", 2000)),
    display_order: parseNullableInteger(form.displayOrder, "Display order", true),
  };
}

export function CharacterManagementPanel({ characters }: { characters: CharacterRow[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("add");
  const [search, setSearch] = useState("");
  const [addForm, setAddForm] = useState<CharacterForm>(emptyAddForm);
  const [selectedSlug, setSelectedSlug] = useState(characters[0]?.slug ?? "");
  const selectedCharacter =
    characters.find((character) => character.slug === selectedSlug) ?? characters[0];
  const [editForm, setEditForm] = useState<CharacterForm>(() =>
    selectedCharacter ? characterToForm(selectedCharacter) : emptyAddForm,
  );
  const [savedEditForm, setSavedEditForm] = useState(editForm);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [creationNotice, setCreationNotice] = useState<string | null>(null);

  const existingSlugs = useMemo(
    () => new Set(characters.map((character) => character.slug)),
    [characters],
  );
  const editDirty = !formsEqual(editForm, savedEditForm);
  const filteredCharacters = useMemo(() => {
    const q = search.trim().slice(0, 80).toLowerCase();
    const rows = q
      ? characters.filter((character) => {
          const haystack =
            `${character.name} ${character.slug} ${character.crew ?? ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : characters;
    return rows.slice(0, 80);
  }, [characters, search]);

  function selectCharacter(slug: string) {
    const character = characters.find((row) => row.slug === slug);
    if (!character) return;
    const nextForm = characterToForm(character);
    setSelectedSlug(slug);
    setEditForm(nextForm);
    setSavedEditForm(nextForm);
  }

  function requestSelectCharacter(slug: string) {
    if (slug === selectedSlug) return;
    if (editDirty) {
      setConfirm({
        type: "discard",
        slug,
        rows: [["Unsaved edits", "Discard changes and load another character"]],
      });
      return;
    }
    selectCharacter(slug);
  }

  function prepareCreate() {
    try {
      const payload = toCreatePayload(addForm, existingSlugs);
      setConfirm({
        type: "create",
        payload,
        rows: [
          ["Name", payload.name],
          ["Slug", payload.slug.toUpperCase()],
          ["Display order", formatNullable(payload.display_order)],
        ],
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not prepare character.");
    }
  }

  function prepareUpdate() {
    if (!editDirty) return;
    try {
      const payload = toUpdatePayload(editForm);
      setConfirm({ type: "update", payload, rows: changedRows(savedEditForm, editForm) });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not prepare character update.");
    }
  }

  async function refreshCharacterQueries(slug?: string) {
    await queryClient.invalidateQueries({ queryKey: ["characters"] });
    await queryClient.invalidateQueries({ queryKey: ["market", "page"] });
    if (slug) await queryClient.invalidateQueries({ queryKey: ["character", slug] });
    await router.invalidate();
  }

  async function runConfirmedAction() {
    if (!confirm || saving) return;
    if (confirm.type === "discard") {
      selectCharacter(confirm.slug);
      setConfirm(null);
      return;
    }

    setSaving(true);
    try {
      if (confirm.type === "create") {
        const created = await adminCreateCharacter({ data: confirm.payload });
        toast.success(
          "Character created. Complete the official valuation in Market Pricing Preview.",
        );
        setAddForm(emptyAddForm);
        setMode("edit");
        setSelectedSlug(created.slug);
        setCreationNotice(created.name);
        const nextForm = characterToForm(created);
        setEditForm(nextForm);
        setSavedEditForm(nextForm);
        await refreshCharacterQueries(created.slug);
      } else {
        const updated = await adminUpdateCharacter({ data: confirm.payload });
        toast.success(`Saved ${updated.name}`);
        setCreationNotice(null);
        const nextForm = characterToForm(updated);
        setEditForm(nextForm);
        setSavedEditForm(nextForm);
        await refreshCharacterQueries(updated.slug);
      }
      setConfirm(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Character management action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="terminal-panel">
      <div className="terminal-header flex items-center justify-between">
        <span>Character Management</span>
        <span className="text-muted-foreground">{characters.length} records</span>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-widest">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={`border border-border px-3 py-2 ${mode === "add" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
          >
            Add Character
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`border border-border px-3 py-2 ${mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}
          >
            Edit Character
          </button>
        </div>

        {mode === "add" ? (
          <CharacterFormFields
            form={addForm}
            setForm={setAddForm}
            mode="add"
            disabled={saving}
            onSubmit={prepareCreate}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              {creationNotice && (
                <div className="border border-accent bg-accent/10 p-3 text-xs text-foreground">
                  <div className="font-bold text-accent">{creationNotice} created</div>
                  <p className="mt-1 text-muted-foreground">
                    Complete the official valuation in{" "}
                    <Link to="/pricing-admin" className="text-accent underline">
                      Market Pricing Preview
                    </Link>
                    .
                  </p>
                </div>
              )}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value.slice(0, 80))}
                placeholder="Search name, symbol, crew..."
                maxLength={80}
                className="w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
              />
              <div className="max-h-[420px] overflow-y-auto border border-border">
                {filteredCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => requestSelectCharacter(character.slug)}
                    className={`block w-full border-b border-border px-3 py-2 text-left text-xs last:border-b-0 hover:bg-card/80 ${character.slug === selectedSlug ? "bg-card text-primary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground">{character.name}</span>
                      <span className="text-accent">{character.slug.toUpperCase()}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{character.crew ?? "Independent"}</span>
                      <span>{character.role ?? "No role"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {selectedCharacter && (
                <div className="grid gap-2 border border-border bg-card/30 p-3 text-[10px] uppercase tracking-widest text-muted-foreground md:grid-cols-2">
                  <ReadOnly label="Database ID" value={selectedCharacter.id} />
                  <ReadOnly label="Slug" value={selectedCharacter.slug} />
                  <ReadOnly
                    label="Created"
                    value={new Date(selectedCharacter.created_at).toLocaleString()}
                  />
                  <ReadOnly
                    label="Updated"
                    value={new Date(selectedCharacter.updated_at).toLocaleString()}
                  />
                </div>
              )}
              <CharacterFormFields
                form={editForm}
                setForm={setEditForm}
                mode="edit"
                disabled={saving}
                onSubmit={prepareUpdate}
                canSubmit={editDirty}
              />
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => !open && !saving && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === "create"
                ? "Create character?"
                : confirm?.type === "update"
                  ? "Save character changes?"
                  : "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === "update"
                ? "Review the changed fields before saving."
                : confirm?.type === "create"
                  ? "Review the metadata before creating the character."
                  : "Your current edit form has unsaved changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="space-y-2 text-xs">
            {(confirm?.rows ?? []).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-border pb-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void runConfirmedAction();
              }}
            >
              {saving ? "Working..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div>{label}</div>
      <div className="mt-1 break-all text-foreground normal-case tracking-normal">{value}</div>
    </div>
  );
}

function CharacterFormFields({
  form,
  setForm,
  mode,
  disabled,
  onSubmit,
  canSubmit = true,
}: {
  form: CharacterForm;
  setForm: Dispatch<SetStateAction<CharacterForm>>;
  mode: Mode;
  disabled: boolean;
  onSubmit: () => void;
  canSubmit?: boolean;
}) {
  const update = (patch: Partial<CharacterForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="grid gap-3 md:grid-cols-2"
    >
      <Field label="Display name">
        <input
          required
          maxLength={120}
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
        />
      </Field>
      <Field label="Slug / market symbol">
        <input
          required
          readOnly={mode === "edit"}
          maxLength={60}
          value={form.slug}
          onChange={(event) => update({ slug: normalizeSlug(event.target.value) })}
          className={`mt-1 w-full border border-border px-3 py-2 text-sm outline-none ${mode === "edit" ? "bg-card/60 text-muted-foreground" : "bg-input focus:border-primary"}`}
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          Symbol:{" "}
          <span className="text-accent">
            {form.slug ? normalizeSlug(form.slug).toUpperCase() : "—"}
          </span>
        </div>
      </Field>
      <Field label="Crew or affiliation">
        <input
          maxLength={120}
          value={form.crew}
          onChange={(event) => update({ crew: event.target.value })}
          className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
        />
      </Field>
      <Field label="Role">
        <input
          maxLength={120}
          value={form.role}
          onChange={(event) => update({ role: event.target.value })}
          className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
        />
      </Field>
      <Field label="Bounty">
        <input
          inputMode="numeric"
          value={form.bounty}
          onChange={(event) => update({ bounty: event.target.value })}
          className="mt-1 w-full border border-border bg-input px-3 py-2 tabular focus:border-primary outline-none"
        />
      </Field>
      <Field label="Display order">
        <input
          inputMode="numeric"
          value={form.displayOrder}
          onChange={(event) => update({ displayOrder: event.target.value })}
          className="mt-1 w-full border border-border bg-input px-3 py-2 tabular focus:border-primary outline-none"
        />
      </Field>
      <label className="md:col-span-2 block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Image URL
        </span>
        <input
          maxLength={1000}
          value={form.imageUrl}
          onChange={(event) => update({ imageUrl: event.target.value })}
          placeholder="https://..."
          className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
        />
      </label>
      <label className="md:col-span-2 block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Description
        </span>
        <textarea
          maxLength={2000}
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          rows={4}
          className="mt-1 w-full border border-border bg-input px-3 py-2 text-sm focus:border-primary outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || !canSubmit}
        className="md:col-span-2 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {mode === "add" ? "Create Character" : "Save Changes"}
      </button>
    </form>
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
