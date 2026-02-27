/* eslint-disable */

import { generateFolioName } from '@/lib/pdf-shortener';
import { response } from '@/lib/supabase/helper';
import chromium from '@sparticuz/chromium-min';
import { NextRequest } from 'next/server';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';

import { supabase } from '@/lib/supabase/server';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Launch Chromium
async function launchChromium(): Promise<Browser> {
  const isServerless = Boolean(process.env.AWS_REGION || process.env.VERCEL);

  if (isServerless) {
    return puppeteer.launch({
      executablePath: await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v129.0.0/chromium-v129.0.0-pack.tar',
      ),
      args: [...chromium.args, '--no-sandbox'],
      headless: true,
    });
  }

  // Local development paths
  let executablePath = '';
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];

    for (const p of paths) {
      try {
        await fs.access(p);
        executablePath = p;
        break;
      } catch {
        continue;
      }
    }

    if (!executablePath) {
      throw new Error(
        'Chrome executable not found. Please install Google Chrome or update the path in launchChromium().',
      );
    }
  } else if (process.platform === 'darwin') {
    executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    executablePath = '/usr/bin/google-chrome';
  }

  return puppeteer.launch({
    executablePath: isServerless
      ? await chromium.executablePath(
          'https://github.com/Sparticuz/chromium/releases/download/v129.0.0/chromium-v129.0.0-pack.tar',
        )
      : // : '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    // TODO: Remove local path when deploying edge function.
    // executablePath: await chromium.executablePath(
    //   "https://github.com/Sparticuz/chromium/releases/download/v129.0.0/chromium-v129.0.0-pack.tar"
    // ),
    args: isServerless ? [...chromium.args, '--no-sandbox'] : [],
    headless: true,
  });
}

async function getFileText(bucket: string, filePath: string): Promise<string> {
  const localPath = path.join(process.cwd(), 'public', 'template', filePath);
  return await fs.readFile(localPath, 'utf-8');
}

async function getFinalHtml(folioData: any) {
  const [template, css, js] = await Promise.all([
    getFileText('pdf-template', 'template.html'),
    getFileText('pdf-template', 'styles.css'),
    getFileText('pdf-template', 'script.js'),
  ]);
  let html = template;
  html = html.replace(`<link rel="stylesheet" href="styles.css" />`, `<style>${css}</style>`);
  html = html.replace(
    `<script src="script.js" defer></script>`,
    `<script>window.__FOLIO_DATA__ = ${JSON.stringify({
      candidate_data: folioData?.data?.candidate_data,
      accomplishments: folioData?.data?.accomplishments,
    })};</script><script>${js}</script>`,
  );
  return html;
}

async function getFolioDocument(folioId: string) {
  const { data, error } = await supabase.rpc('get_folio_without_pagination', {
    p_folio_id: folioId,
  });
  if (error) {
    console.error('get_folio_without_pagination RPC error: ', error);
    throw error;
  }
  if (!data) {
    throw new Error('No document found for the given folio ID.');
  }
  return data;
}

async function uploadFolioWithRetry(
  pdfBuffer: any,
  firstName: string | undefined,
  maxRetries = 3,
): Promise<{ path: string; folioName: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const folioName = generateFolioName(firstName);

    const { data, error } = await supabase.storage
      .from('generated_folios')
      .upload(folioName, new Uint8Array(pdfBuffer), {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (!error) {
      return { path: data.path, folioName: folioName.replace('.pdf', '') };
    }

    // if (error?.statusCode !== '409') {
    //   throw new Error(`Upload failed: ${error.message}`);
    // }

    console.warn(`Folio name conflict on attempt ${attempt + 1}: ${folioName}, retrying...`);
  }

  throw new Error('Failed to upload folio after max retries due to name conflicts');
}
export async function POST(request: NextRequest) {
  let folio_id: string | null = null;
  try {
    const body = await request.json();
    folio_id = body.folio_id;
    console.log('Received POST request for folio_id:', folio_id);
  } catch (e) {
    console.error('Error parsing request body:', e);
    return response({ data: null, message: 'Invalid JSON in request body', error: e }, 400);
  }

  let browser: Browser | null = null;

  // base log data
  const logData: any = {
    folio_id: folio_id ?? null,
    profile_id: null,
    candidate_id: null,
    email: null,
    message: null,
  };

  try {
    console.log('Fetching folio row from database...');
    // 1. Get folio row from table (for pdf_url + candidate_id)
    const { data: folioRow, error: folioRowError } = await supabase
      .from('folio')
      .select('*')
      .eq('id', folio_id as string)
      .single();

    if (folioRowError) {
      console.error('folioRowError:', folioRowError);
      throw new Error(`Folio not found or query failed: ${folioRowError.message}`);
    }
    if (!folioRow) {
      throw new Error('Folio not found');
    }

    // delete old file if exists
    if (folioRow.pdf_url) {
      console.log('Deleting old PDF:', folioRow.pdf_url);
      const { error: updateError } = await supabase
        .from('folio')
        .update({ pdf_url: null, updated_at: new Date().toISOString() })
        .eq('id', folio_id as string);

      if (updateError) {
        throw new Error(`Failed to clear pdf_url: ${updateError.message}`);
      }

      const oldPath =
        folioRow.pdf_url.split('/generated-folios/')[1] ||
        folioRow.pdf_url.split('/generated_folios/')[1];
      if (oldPath) {
        await supabase.storage.from('generated_folios').remove([oldPath]);
      }
    }

    console.log('Fethcing detailed folio data via RPC...');
    // 2. Get detailed folio data via RPC (for HTML)
    const folioData = await getFolioDocument(folio_id as string);
    console.log('folioData received');

    const candidate = folioData?.data?.candidate_data;

    logData.profile_id = candidate?.profile_id ?? null;
    logData.candidate_id = candidate?.candidate_id ?? null;
    logData.email = candidate?.email ?? null;

    // 3. Generate PDF
    console.log('Launching Chromium...');
    const candidateName = candidate?.first_name?.replaceAll(' ', '-') || 'Anonymous';

    browser = await launchChromium();
    console.log('Chromium launched, creating new page...');
    const page = await browser.newPage();

    console.log('Generating HTML content...');
    const html = await getFinalHtml(folioData);

    console.log('Setting page content...');
    await page.setContent(html, { waitUntil: 'load' });

    console.log('Generating PDF buffer...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    // 4. Upload new PDF
    const { path, folioName } = await uploadFolioWithRetry(pdfBuffer, candidate?.first_name);

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/generated_folios/${path}`;
    const shortUrl = `${new URL(request.url).origin}/s/${folioName}`;

    // 5. Update folio row with new pdf_url
    const { error: finalUpdateError } = await supabase
      .from('folio')
      .update({ pdf_url: publicUrl, short_url: shortUrl, updated_at: new Date().toISOString() })
      .eq('id', folio_id);

    if (finalUpdateError) {
      console.error('Final update error:', finalUpdateError);
      throw finalUpdateError;
    }

    // success log
    logData.message = 'PDF generated and stored successfully';
    console.log('Logging success to folio_pdf_generation_log...');
    await supabase.from('folio_pdf_generation_log').insert([logData]);

    return response(
      {
        data: { publicUrl, shortUrl },
        message: logData.message,
        error: null,
      },
      200,
    );
  } catch (error: any) {
    console.error('PDF generation/upload failed error details:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    logData.message = errorMessage || 'Unknown error';

    try {
      await supabase.from('folio_pdf_generation_log').insert([logData]);
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }

    return response(
      {
        data: null,
        message: logData?.message,
        error: errorMessage,
      },
      500,
    );
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
