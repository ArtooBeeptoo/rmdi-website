import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { google } from 'googleapis';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'artoobeeptoo@gmail.com';
const MT_TIME_ZONE = 'America/Denver';

interface TokenFile {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  token_uri?: string;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  label: string;
  dayLabel: string;
}

interface AvailabilityResponse {
  generatedAt: string;
  timezone: string;
  slotsByDay: Record<string, AvailabilitySlot[]>;
}

async function getCredentials(): Promise<TokenFile> {
  // Check env vars first (for Render deployment)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      token_uri: 'https://oauth2.googleapis.com/token',
    };
  }

  // Fall back to file (for local dev)
  try {
    const filePath = path.join(os.homedir(), '.secrets', 'google-token.json');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      client_id: parsed.client_id as string,
      client_secret: parsed.client_secret as string,
      refresh_token: parsed.refresh_token as string,
      token_uri: (parsed.token_uri as string) || 'https://oauth2.googleapis.com/token',
    };
  } catch {
    throw new Error('Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN env vars.');
  }
}

async function getOAuthClient() {
  const creds = await getCredentials();

  if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
    throw new Error('Missing Google OAuth credentials in ~/.secrets/google-token.json or env vars.');
  }

  const client = new google.auth.OAuth2({
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
    redirectUri: 'http://localhost',
  });

  client.setCredentials({
    refresh_token: creds.refresh_token,
  });

  return client;
}

function overlaps(start: Date, end: Date, busyStart: Date, busyEnd: Date): boolean {
  return start < busyEnd && end > busyStart;
}

function toSlotLabel(start: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MT_TIME_ZONE,
  }).format(start);
}

function toDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function toDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: MT_TIME_ZONE,
  }).format(date);
}

// Business hours: 8:15am - 6:00pm MT
const BUSINESS_START_HOUR = 8;
const BUSINESS_START_MINUTE = 15;
const BUSINESS_END_HOUR = 18; // 6pm
const BUFFER_MINUTES = 15; // Buffer before/after meetings

export async function getAvailability(nextDays = 14): Promise<AvailabilityResponse> {
  const auth = await getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + nextDays);

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      timeZone: MT_TIME_ZONE,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busyBlocks = freeBusy.data.calendars?.[CALENDAR_ID]?.busy ?? [];
  
  // Expand busy blocks with 15-min buffer before and after
  const bufferedBusyBlocks = busyBlocks.map((block) => {
    const blockStart = new Date(block.start ?? '');
    const blockEnd = new Date(block.end ?? '');
    // Add buffer before
    blockStart.setMinutes(blockStart.getMinutes() - BUFFER_MINUTES);
    // Add buffer after
    blockEnd.setMinutes(blockEnd.getMinutes() + BUFFER_MINUTES);
    return { start: blockStart, end: blockEnd };
  });

  const slotsByDay: Record<string, AvailabilitySlot[]> = {};

  for (let dayOffset = 0; dayOffset < nextDays; dayOffset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);

    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // Skip weekends

    // Generate slots from 8:15am to 5:45pm (last slot ends at 6pm)
    for (let hour = BUSINESS_START_HOUR; hour < BUSINESS_END_HOUR; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        // Skip slots before 8:15am
        if (hour === BUSINESS_START_HOUR && minute < BUSINESS_START_MINUTE) continue;
        
        const slotStart = new Date(day);
        slotStart.setHours(hour, minute, 0, 0);
        if (slotStart <= now) continue;

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 15);
        
        // Don't allow slots that end after 6pm
        if (slotEnd.getHours() >= BUSINESS_END_HOUR && slotEnd.getMinutes() > 0) continue;

        // Check against buffered busy blocks
        const isBusy = bufferedBusyBlocks.some((block) => {
          return overlaps(slotStart, slotEnd, block.start, block.end);
        });

        if (isBusy) continue;

        const dayKey = toDayKey(slotStart);
        const slot: AvailabilitySlot = {
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: toSlotLabel(slotStart),
          dayLabel: toDayLabel(slotStart),
        };
        slotsByDay[dayKey] = [...(slotsByDay[dayKey] ?? []), slot];
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    timezone: MT_TIME_ZONE,
    slotsByDay,
  };
}

export async function bookReviewSlot(params: {
  caseId: string;
  doctorName: string;
  doctorEmail: string;
  reviewDatetime: string;
  toothNumbers: number[];
  contactPhone?: string;
}): Promise<{ eventId?: string; htmlLink?: string }> {
  const auth = await getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(params.reviewDatetime);
  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid review datetime.');
  }

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 15);

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: 'all',
    requestBody: {
      summary: `RMDI Case Review: Dr. ${params.doctorName} - #${params.toothNumbers.join(',')}`,
      description: [
        `Case ID: ${params.caseId}`,
        `Doctor: ${params.doctorName}`,
        `Email: ${params.doctorEmail}`,
        `Phone: ${params.contactPhone || 'Not provided'}`,
        'Zoom: Add manually for now',
      ].join('\n'),
      start: {
        dateTime: start.toISOString(),
        timeZone: MT_TIME_ZONE,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: MT_TIME_ZONE,
      },
      attendees: [{ email: params.doctorEmail }, { email: 'info@rockymountaindentalimplants.com' }],
    },
  });

  return {
    eventId: event.data.id ?? undefined,
    htmlLink: event.data.htmlLink ?? undefined,
  };
}
