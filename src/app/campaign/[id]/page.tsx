import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import PublicDonationPage from '@/app/page';

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_TITLE = 'صدقة جارية — الدفعة التاسعة طب كفر الشيخ | د. حسين علي الأمير ود. ندى هاني حامد';
const DEFAULT_DESC = 'مبادرة صدقة جارية لدعم وتجهيز وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ، صدقةً جارية عن روح الفقيدين د. حسين علي الأمير ود. ندى هاني حامد رحمة الله عليهما.';

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { id } = await params;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESC;

  try {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('name_ar, description_ar')
      .eq('id', id)
      .maybeSingle();

    if (campaign?.name_ar) title = campaign.name_ar;
    if (campaign?.description_ar) description = campaign.description_ar;
  } catch (err) {
    console.error('Error fetching campaign metadata:', err);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://donations-tau.vercel.app').replace(/\/$/, '');
  const campaignUrl = `${siteUrl}/campaign/${id}`;
  const ogImageUrl = `${siteUrl}/api/og/campaign/${id}`;

  return {
    title,
    description,
    alternates: {
      canonical: campaignUrl,
    },
    openGraph: {
      title,
      description,
      url: campaignUrl,
      siteName: 'منصة صدقة جارية',
      locale: 'ar_EG',
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  return <PublicDonationPage initialCampaignId={id} />;
}
