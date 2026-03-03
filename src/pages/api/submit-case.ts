import type { APIRoute } from 'astro';
import { bookReviewSlot, getAvailability } from '../../lib/calendar';
import { insertCase, getNextSequence } from '../../lib/db';
import { sendDoctorConfirmation, sendRmdiNewCaseAlert } from '../../lib/email';
import {
  buildCaseId,
  createUploadToken,
  formatYYMMDD,
  getLastName,
  validateIntakePayload,
} from '../../lib/utils';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const payload = await request.json();
    const validation = validateIntakePayload(payload);

    if (!validation.valid || !validation.data) {
      return new Response(JSON.stringify({ errors: validation.errors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = validation.data;

    const availability = await getAvailability(14);
    const availableStarts = new Set(
      Object.values(availability.slotsByDay)
        .flat()
        .map((slot) => slot.start),
    );
    if (!availableStarts.has(data.reviewDatetime)) {
      return new Response(
        JSON.stringify({ errors: ['Selected review slot is no longer available. Please choose another.'] }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const lastName = getLastName(data.doctorName);
    const yymmdd = formatYYMMDD(new Date());
    const seq = await getNextSequence(lastName, data.toothNumbers[0], yymmdd);
    const caseId = buildCaseId(lastName, data.toothNumbers[0], yymmdd, seq);
    const uploadToken = createUploadToken();

    const booking = await bookReviewSlot({
      caseId,
      doctorName: data.doctorName,
      doctorEmail: data.email,
      reviewDatetime: data.reviewDatetime,
      toothNumbers: data.toothNumbers,
      contactPhone: data.phone,
    });

    const now = new Date().toISOString();
    const record = {
      id: caseId,
      uploadToken,
      doctorName: data.doctorName,
      practiceName: data.practiceName,
      email: data.email,
      phone: data.phone,
      toothNumbers: data.toothNumbers,
      implantSystem: data.implantSystem,
      dateNeeded: data.dateNeeded,
      reviewDatetime: data.reviewDatetime,
      calendarEventId: booking.eventId,
      labDeliveryOption: data.labDeliveryOption,
      labName: data.labName,
      labEmail: data.labEmail,
      partnerLab: data.partnerLab,
      notes: data.notes,
      status: 'pending_upload' as const,
      createdAt: now,
      updatedAt: now,
    };

    await insertCase(record);

    const uploadLink = `${url.origin}/upload/${uploadToken}`;

    await Promise.all([
      sendDoctorConfirmation(record, uploadLink),
      sendRmdiNewCaseAlert(record, uploadLink),
    ]);

    return new Response(
      JSON.stringify({
        caseId,
        uploadToken,
        uploadLink,
        calendarEventId: booking.eventId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Case submission failed.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
