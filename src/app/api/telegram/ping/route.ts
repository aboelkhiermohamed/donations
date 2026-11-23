import { NextRequest, NextResponse } from 'next/server';
import { callTelegramApi } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || process.env.TELEGRAM_BOT_TOKEN || '9282410484:AAEAw9GBu97si8367x3QmBIzMs8UkOdCQvs';

  const start = Date.now();
  const res = await callTelegramApi('getMe', token);
  const durationMs = Date.now() - start;

  return NextResponse.json({
    durationMs,
    tokenUsed: token.slice(0, 10) + '...',
    telegramResponse: res,
  });
}
