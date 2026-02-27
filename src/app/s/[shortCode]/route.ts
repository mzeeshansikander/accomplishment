import { resolveShortCode } from '@/lib/pdf-shortener';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;

  if (!shortCode) {
    return NextResponse.json({ message: 'Missing short code' }, { status: 400 });
  }

  const pdfUrl = resolveShortCode(shortCode);

  const upstream = await fetch(pdfUrl);
  if (!upstream.ok) {
    return NextResponse.json({ message: 'PDF not found' }, { status: 404 });
  }

  const pdfBuffer = await upstream.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
