import { ValidationError } from "./errors.js";
import type { Subject } from "./models.js";

const SUBJECT_PREFIX = "subject";
const DEFAULT_MAX_SLUG_LENGTH = 48;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;

export interface SubjectIdOptions {
  maxLength?: number;
}

export interface SubjectForDivisionOptions extends SubjectIdOptions {
  role?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export function slugifySubject(value: string, options: SubjectIdOptions = {}): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_SLUG_LENGTH;
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new ValidationError("maxLength must be a positive integer");
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replace(NON_SLUG_CHARS, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return slug || "subject";
}

export function isCanonicalSubjectId(subjectId: string | null | undefined): boolean {
  const parts = (subjectId ?? "").split(":", 3);
  const [prefix, divisionId, slug] = parts;
  return parts.length === 3 && prefix === SUBJECT_PREFIX && !!divisionId && !!slug;
}

export function subjectIdForDivision(
  divisionId: string,
  displayNameOrSlug: string,
  options: SubjectIdOptions = {},
): string {
  const division = divisionId.trim();
  if (!division) {
    throw new ValidationError("divisionId is required");
  }
  if (division.includes(":")) {
    throw new ValidationError("divisionId must not contain ':'");
  }
  if (typeof displayNameOrSlug !== "string" || displayNameOrSlug.trim().length === 0) {
    throw new ValidationError("displayNameOrSlug is required");
  }
  return `${SUBJECT_PREFIX}:${division}:${slugifySubject(displayNameOrSlug, options)}`;
}

export function subjectForDivision(
  divisionId: string,
  displayNameOrSlug: string,
  options: SubjectForDivisionOptions = {},
): Subject {
  const { role, kind, metadata, ...idOptions } = options;
  return {
    subject_id: subjectIdForDivision(divisionId, displayNameOrSlug, idOptions),
    role: role ?? "other",
    kind: kind ?? "other",
    ...(metadata ? { metadata } : {}),
  };
}
