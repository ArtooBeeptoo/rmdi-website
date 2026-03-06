import { randomUUID } from 'node:crypto';

export const TOOTH_NUMBERS = Array.from({ length: 32 }, (_, i) => i + 1);

export type LabDeliveryOption = 'self' | 'partner' | 'custom';

export interface IntakePayload {
  doctorName: string;
  practiceName: string;
  email: string;
  phone?: string;
  toothNumbers: number[];
  implantSystem: string;
  dateNeeded: string;
  reviewDatetime: string;
  labDeliveryOption: LabDeliveryOption;
  partnerLab?: string;
  labName?: string;
  labEmail?: string;
  notes?: string;
  disclaimerConfirmed: boolean;
}

const IMPLANT_SYSTEMS = new Set(['Nobel Biocare', 'Straumann', 'Zimmer Biomet', 'BioHorizons', 'Dentsply Sirona', 'Neodent', 'Other']);
const PARTNER_LABS = new Set(['newcraft', 'bioaesthetic']);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeToothNumbers(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const values = input
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 32);
  return [...new Set(values)].sort((a, b) => a - b);
}

export function validateIntakePayload(input: unknown): { valid: boolean; errors: string[]; data?: IntakePayload } {
  const source = input as Record<string, unknown>;
  const doctorName = sanitizeText(source?.doctorName);
  const practiceName = sanitizeText(source?.practiceName);
  const email = sanitizeText(source?.email).toLowerCase();
  const phone = sanitizeText(source?.phone);
  const toothNumbers = normalizeToothNumbers(source?.toothNumbers);
  const implantSystem = sanitizeText(source?.implantSystem);
  const dateNeeded = sanitizeText(source?.dateNeeded);
  const reviewDatetime = sanitizeText(source?.reviewDatetime);
  const labDeliveryOption = sanitizeText(source?.labDeliveryOption) as LabDeliveryOption;
  const partnerLab = sanitizeText(source?.partnerLab);
  const labName = sanitizeText(source?.labName);
  const labEmail = sanitizeText(source?.labEmail).toLowerCase();
  const notes = sanitizeText(source?.notes);
  const disclaimerConfirmed = Boolean(source?.disclaimerConfirmed);

  const errors: string[] = [];

  if (doctorName.length < 2) errors.push('Doctor name must be at least 2 characters.');
  if (practiceName.length < 2) errors.push('Practice name must be at least 2 characters.');
  if (!emailRegex.test(email)) errors.push('A valid email is required.');
  if (toothNumbers.length === 0) errors.push('At least one tooth number is required.');
  if (!IMPLANT_SYSTEMS.has(implantSystem)) errors.push('Implant system is invalid.');

  const neededDate = new Date(`${dateNeeded}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(neededDate.getTime()) || neededDate <= today) {
    errors.push('Date needed must be a future date.');
  }

  const reviewDate = new Date(reviewDatetime);
  if (Number.isNaN(reviewDate.getTime())) {
    errors.push('Preferred review slot is required.');
  }

  if (!['self', 'partner', 'custom'].includes(labDeliveryOption)) {
    errors.push('Lab delivery option is invalid.');
  }

  if (labDeliveryOption === 'partner' && !PARTNER_LABS.has(partnerLab)) {
    errors.push('Partner lab selection is required.');
  }

  if (labDeliveryOption === 'custom') {
    if (labName.length < 2) errors.push('Custom lab name is required.');
    if (!emailRegex.test(labEmail)) errors.push('Custom lab email is invalid.');
  }

  if (notes.length > 1000) errors.push('Notes must be 1000 characters or less.');
  if (!disclaimerConfirmed) errors.push('Disclaimer must be acknowledged.');

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors,
    data: {
      doctorName,
      practiceName,
      email,
      phone,
      toothNumbers,
      implantSystem,
      dateNeeded,
      reviewDatetime,
      labDeliveryOption,
      partnerLab: partnerLab || undefined,
      labName: labName || undefined,
      labEmail: labEmail || undefined,
      notes: notes || undefined,
      disclaimerConfirmed,
    },
  };
}

export function createUploadToken(): string {
  return randomUUID();
}

export function formatYYMMDD(date = new Date()): string {
  const y = date.getFullYear().toString().slice(-2);
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getLastName(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return 'DOCTOR';
  const parts = cleaned.split(/\s+/);
  const last = parts[parts.length - 1]?.replace(/[^A-Za-z]/g, '').toUpperCase();
  return last || 'DOCTOR';
}

export function buildCaseId(lastName: string, tooth: number, yymmdd: string, seq: number): string {
  return `RMDI-${lastName}-${tooth}-${yymmdd}-${String(seq).padStart(3, '0')}`;
}

export function formatMtDateTime(dateTime: string): string {
  const date = new Date(dateTime);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Denver',
  }).format(date);
}

export function parseUploadPayload(input: unknown): { token: string; cbctLink?: string; stlLink?: string; cbctUploaded: boolean; stlUploaded: boolean } {
  const source = input as Record<string, unknown>;
  return {
    token: sanitizeText(source?.token),
    cbctLink: sanitizeText(source?.cbctLink) || undefined,
    stlLink: sanitizeText(source?.stlLink) || undefined,
    cbctUploaded: Boolean(source?.cbctUploaded),
    stlUploaded: Boolean(source?.stlUploaded),
  };
}
