import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { google } from 'googleapis';
import type { CaseRecord } from './db';
import { formatMtDateTime } from './utils';

const SENDER = process.env.GMAIL_SEND_AS || 'info@rockymountaindentalimplants.com';
const RMDI_EMAIL = 'info@rockymountaindentalimplants.com';

interface TokenFile {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
}

async function readTokenFile(): Promise<TokenFile> {
  const filePath = path.join(os.homedir(), '.secrets', 'google-token.json');
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as TokenFile;
}

async function getOAuthClient() {
  const token = await readTokenFile();
  const clientId = token.client_id || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = token.client_secret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = token.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth credentials.');
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function encodeMessage({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const mime = [
    `From: Rocky Mountain Dental Implants <${SENDER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\n');

  return Buffer.from(mime)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const auth = await getOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodeMessage({ to, subject, body }),
    },
  });
}

function partnerLabLabel(code?: string): string {
  if (code === 'newcraft') return 'Newcraft Dental Arts';
  if (code === 'bioaesthetic') return 'Bio Aesthetic Dental Studio';
  return '';
}

function labDeliveryLabel(record: CaseRecord): string {
  if (record.labDeliveryOption === 'self') return 'Send STL back to doctor for local production';
  if (record.labDeliveryOption === 'partner') return `Send to partner lab: ${partnerLabLabel(record.partnerLab)}`;
  return `Send to custom lab: ${record.labName || 'N/A'} (${record.labEmail || 'N/A'})`;
}

export async function sendDoctorConfirmation(record: CaseRecord, uploadLink: string): Promise<void> {
  const subject = `RMDI Case Received - ${record.id}`;
  const body = [
    `Hi Dr. ${record.doctorName},`,
    '',
    'Thank you for submitting your case to Rocky Mountain Dental Implants.',
    '',
    `Case ID: ${record.id}`,
    `Teeth: #${record.toothNumbers.join(', ')}`,
    `Review scheduled: ${formatMtDateTime(record.reviewDatetime)} MT`,
    '',
    'NEXT STEP: Upload your files',
    'Please click the link below to upload your CBCT and STL files:',
    uploadLink,
    '',
    'Important: Files must be de-identified (no patient name or DOB).',
    '',
    'Questions? Reply to this email.',
    '',
    '- Rocky Mountain Dental Implants',
  ].join('\n');

  await sendEmail(record.email, subject, body);
}

export async function sendRmdiNewCaseAlert(record: CaseRecord, uploadLink: string): Promise<void> {
  const subject = `New Case Submitted - ${record.id}`;
  const body = [
    `New case from Dr. ${record.doctorName} at ${record.practiceName}`,
    '',
    `Case ID: ${record.id}`,
    `Teeth: #${record.toothNumbers.join(', ')}`,
    `Date needed: ${record.dateNeeded}`,
    `Review scheduled: ${formatMtDateTime(record.reviewDatetime)} MT`,
    `Lab delivery: ${labDeliveryLabel(record)}`,
    '',
    'Awaiting file upload.',
    `Upload link: ${uploadLink}`,
    '',
    `Doctor contact: ${record.email} / ${record.phone || 'No phone provided'}`,
  ].join('\n');

  await sendEmail(RMDI_EMAIL, subject, body);
}

export async function sendFilesReceivedAlert(record: CaseRecord): Promise<void> {
  const subject = `Files Received - ${record.id}`;
  const body = [
    `Files uploaded for case ${record.id}`,
    '',
    `Doctor: Dr. ${record.doctorName}`,
    `Teeth: #${record.toothNumbers.join(', ')}`,
    `Review: ${formatMtDateTime(record.reviewDatetime)} MT`,
    '',
    `CBCT: ${record.cbctLink || 'direct upload'}`,
    `STL: ${record.stlLink || 'direct upload'}`,
    '',
    'Ready for planning.',
  ].join('\n');

  await sendEmail(RMDI_EMAIL, subject, body);
}
