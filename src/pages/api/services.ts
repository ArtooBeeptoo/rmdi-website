import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      services: [
        {
          name: 'Surgical Guide Planning',
          price: { standard: 100, nobel_discount: 75 },
          turnaround: '48-72 hours',
          includes: ['CBCT review', 'Implant positioning', 'STL export', '15-min consultation'],
        },
      ],
      contact: {
        email: 'info@rockymountaindentalimplants.com',
      },
      availability_endpoint: '/api/availability',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
