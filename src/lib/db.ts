import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CASES_FILE = path.resolve(DATA_DIR, 'cases.json');

export type CaseStatus =
  | 'pending_upload'
  | 'files_received'
  | 'planning'
  | 'review_scheduled'
  | 'completed'
  | 'delivered';

export interface CaseRecord {
  id: string;
  uploadToken: string;
  doctorName: string;
  practiceName: string;
  email: string;
  phone?: string;
  toothNumbers: number[];
  implantSystem: string;
  dateNeeded: string;
  reviewDatetime: string;
  calendarEventId?: string;
  labDeliveryOption: 'self' | 'partner' | 'custom';
  labName?: string;
  labEmail?: string;
  partnerLab?: string;
  notes?: string;
  cbctLink?: string;
  stlLink?: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

async function ensureStorage(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(CASES_FILE, 'utf-8');
  } catch {
    await writeFile(CASES_FILE, '[]\n', 'utf-8');
  }
}

export async function getCases(): Promise<CaseRecord[]> {
  await ensureStorage();
  const raw = await readFile(CASES_FILE, 'utf-8');
  try {
    return JSON.parse(raw) as CaseRecord[];
  } catch {
    return [];
  }
}

export async function saveCases(cases: CaseRecord[]): Promise<void> {
  await ensureStorage();
  await writeFile(CASES_FILE, `${JSON.stringify(cases, null, 2)}\n`, 'utf-8');
}

export async function getNextSequence(lastName: string, tooth: number, yymmdd: string): Promise<number> {
  const cases = await getCases();
  const prefix = `RMDI-${lastName}-${tooth}-${yymmdd}-`;
  const matches = cases
    .filter((entry) => entry.id.startsWith(prefix))
    .map((entry) => Number(entry.id.split('-').at(-1) ?? 0))
    .filter((num) => Number.isInteger(num));

  return (matches.length ? Math.max(...matches) : 0) + 1;
}

export async function insertCase(record: CaseRecord): Promise<void> {
  const cases = await getCases();
  cases.push(record);
  await saveCases(cases);
}

export async function getCaseByUploadToken(uploadToken: string): Promise<CaseRecord | undefined> {
  const cases = await getCases();
  return cases.find((entry) => entry.uploadToken === uploadToken);
}

export async function updateCaseByUploadToken(
  uploadToken: string,
  updates: Partial<CaseRecord>,
): Promise<CaseRecord | undefined> {
  const cases = await getCases();
  const index = cases.findIndex((entry) => entry.uploadToken === uploadToken);
  if (index === -1) return undefined;

  const updated: CaseRecord = {
    ...cases[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  cases[index] = updated;
  await saveCases(cases);
  return updated;
}
