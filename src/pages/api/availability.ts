import type { APIRoute } from 'astro';
import { getAvailability } from '../../lib/calendar';

export const GET: APIRoute = async () => {
  try {
    const availability = await getAvailability(14);
    return new Response(JSON.stringify(availability), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Unable to fetch availability.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
