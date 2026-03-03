import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRoute } from 'astro';
import { getCaseByUploadToken, updateCaseByUploadToken } from '../../lib/db';
import { sendFilesReceivedAlert } from '../../lib/email';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../../data/uploads');

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function saveDirectUpload(caseId: string, file: File, prefix: 'cbct' | 'stl'): Promise<string> {
  const safeName = sanitizeFilename(file.name || `${prefix}.bin`);
  const folder = path.resolve(UPLOAD_DIR, sanitizeFilename(caseId));
  await mkdir(folder, { recursive: true });

  const targetPath = path.resolve(folder, `${prefix}-${Date.now()}-${safeName}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(targetPath, bytes);
  return targetPath;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';

    let token = '';
    let cbctLink: string | undefined;
    let stlLink: string | undefined;
    let cbctUploaded = false;
    let stlUploaded = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      token = String(formData.get('token') || '').trim();
      cbctLink = String(formData.get('cbctLink') || '').trim() || undefined;
      stlLink = String(formData.get('stlLink') || '').trim() || undefined;

      const cbctFile = formData.get('cbctFile');
      const stlFile = formData.get('stlFile');

      if (cbctFile instanceof File && cbctFile.size > 0) cbctUploaded = true;
      if (stlFile instanceof File && stlFile.size > 0) {
        if (stlFile.size > 100 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: 'STL direct upload must be 100MB or less.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        stlUploaded = true;
      }

      if (token) {
        const existing = await getCaseByUploadToken(token);
        if (!existing) {
          return new Response(JSON.stringify({ error: 'Case not found for upload token.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (cbctFile instanceof File && cbctFile.size > 0) {
          cbctLink = await saveDirectUpload(existing.id, cbctFile, 'cbct');
        }

        if (stlFile instanceof File && stlFile.size > 0) {
          stlLink = await saveDirectUpload(existing.id, stlFile, 'stl');
        }
      }
    } else {
      const payload = (await request.json()) as Record<string, unknown>;
      token = String(payload.token || '').trim();
      cbctLink = String(payload.cbctLink || '').trim() || undefined;
      stlLink = String(payload.stlLink || '').trim() || undefined;
      cbctUploaded = Boolean(payload.cbctUploaded);
      stlUploaded = Boolean(payload.stlUploaded);
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Upload token is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await getCaseByUploadToken(token);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Case not found for upload token.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const nextCbctLink = cbctLink || (cbctUploaded ? 'direct upload' : existing.cbctLink);
    const nextStlLink = stlLink || (stlUploaded ? 'direct upload' : existing.stlLink);

    if (!nextCbctLink || !nextStlLink) {
      return new Response(JSON.stringify({ error: 'Both CBCT and STL uploads (file or link) are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await updateCaseByUploadToken(token, {
      cbctLink: nextCbctLink,
      stlLink: nextStlLink,
      status: 'files_received',
    });

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Unable to update case.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await sendFilesReceivedAlert(updated);

    return new Response(
      JSON.stringify({
        success: true,
        caseId: updated.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Upload completion failed.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
