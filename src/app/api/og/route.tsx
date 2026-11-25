import { NextRequest } from 'next/server';
import { GET as getCampaignOg } from './campaign/[id]/route';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const DEFAULT_CAMPAIGN_ID = 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || searchParams.get('campaignId') || DEFAULT_CAMPAIGN_ID;

  return getCampaignOg(req, {
    params: Promise.resolve({ id }),
  });
}
