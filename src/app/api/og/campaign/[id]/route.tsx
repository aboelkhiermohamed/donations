import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Cache for 60 seconds

const CANONICAL_CAMPAIGN = {
  id: 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0',
  name_ar: 'صدقة جارية — إهداء لروح د. حسين علي الأمير ود. ندى هاني حامد',
  description_ar: 'بأثرٍ يبقى، وخيرٍ يمتد. نشارك معًا في توفير جهاز تنفس صناعي لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ، صدقةً جارية عن روح فقيدينا الدكتور حسين علي الأمير والدكتورة ندى هاني حامد.',
  target_amount: 100000,
  organizer_ar: 'أطباء الدفعة التاسعة — طب كفر الشيخ',
};

// Cache font buffers in memory
let boldFontBuffer: Buffer | null = null;
let mediumFontBuffer: Buffer | null = null;

function getFonts() {
  if (!boldFontBuffer) {
    try {
      const boldPath = path.join(process.cwd(), 'public', 'fonts', 'Cairo-Bold.ttf');
      boldFontBuffer = fs.readFileSync(boldPath);
    } catch (err) {
      console.error('Failed to load Cairo-Bold.ttf from disk:', err);
    }
  }

  if (!mediumFontBuffer) {
    try {
      const mediumPath = path.join(process.cwd(), 'public', 'fonts', 'Cairo-Medium.ttf');
      mediumFontBuffer = fs.readFileSync(mediumPath);
    } catch (err) {
      console.error('Failed to load Cairo-Medium.ttf from disk:', err);
    }
  }

  return { boldFontBuffer, mediumFontBuffer };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // 1. Fetch live campaign data
    const [campaignRes, targetSettingRes, donationsRes] = await Promise.all([
      supabaseAdmin.from('campaigns').select('*').eq('id', id).maybeSingle(),
      supabaseAdmin.from('settings').select('value').eq('key', 'campaign_target').maybeSingle(),
      supabaseAdmin
        .from('donations')
        .select('amount, donor_id')
        .in('status', ['auto_verified', 'manual_verified']),
    ]);

    const campaign = campaignRes?.data || CANONICAL_CAMPAIGN;
    const targetSetting = targetSettingRes?.data?.value as any;
    const isUnlimited = targetSetting?.is_unlimited === true;

    const donations = (donationsRes?.data as any[]) || [];
    const totalCollected = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const donorSet = new Set(donations.map(d => d.donor_id).filter(Boolean));
    const donorsCount = donorSet.size || donations.length;

    const target = isUnlimited
      ? 0
      : Number(targetSetting?.target_amount || campaign.target_amount) || 100000;

    const progressPercent = isUnlimited
      ? 100
      : Math.min(100, Math.round((totalCollected / (target || 1)) * 100));

    const campaignTitle = campaign.name_ar || CANONICAL_CAMPAIGN.name_ar;
    const campaignDesc = campaign.description_ar || CANONICAL_CAMPAIGN.description_ar;
    const organizer = campaign.organizer_ar || CANONICAL_CAMPAIGN.organizer_ar;

    // 2. Load Fonts
    const { boldFontBuffer, mediumFontBuffer } = getFonts();
    const fonts: any[] = [];

    if (boldFontBuffer) {
      fonts.push({
        name: 'Cairo',
        data: boldFontBuffer,
        style: 'normal',
        weight: 700,
      });
    }

    if (mediumFontBuffer) {
      fonts.push({
        name: 'Cairo',
        data: mediumFontBuffer,
        style: 'normal',
        weight: 500,
      });
    }

    // 3. Render Dynamic Card
    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '48px 56px',
            backgroundColor: '#0a1a15',
            backgroundImage: 'radial-gradient(circle at 10% 10%, #153c32 0%, #0a1a15 70%)',
            color: '#ffffff',
            fontFamily: 'Cairo, sans-serif',
            direction: 'rtl',
            border: '8px solid #1c473c',
          }}
        >
          {/* Top Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '10px 22px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <span style={{ fontSize: '26px' }}>🌿</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#34d399' }}>
                منصة صدقة جارية
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(183, 155, 104, 0.15)',
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1px solid rgba(183, 155, 104, 0.4)',
                color: '#e5c992',
                fontSize: '18px',
                fontWeight: 500,
              }}
            >
              {organizer}
            </div>
          </div>

          {/* Middle Campaign Title & Details */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              margin: '8px 0',
            }}
          >
            <div
              style={{
                fontSize: '38px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.35,
                letterSpacing: '-0.5px',
              }}
            >
              {campaignTitle}
            </div>
            <div
              style={{
                fontSize: '21px',
                fontWeight: 500,
                color: '#94a3b8',
                lineHeight: 1.45,
                maxHeight: '60px',
                overflow: 'hidden',
              }}
            >
              {campaignDesc}
            </div>
          </div>

          {/* Stats & Progress Box */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              background: 'rgba(21, 60, 50, 0.75)',
              padding: '24px 34px',
              borderRadius: '24px',
              border: '1px solid #23584b',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '16px', color: '#94a3b8' }}>
                  إجمالي الحصيلة حتى الآن
                </span>
                <span style={{ fontSize: '38px', fontWeight: 700, color: '#34d399' }}>
                  {totalCollected.toLocaleString('en-US')} ج.م
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', color: '#94a3b8' }}>
                  {isUnlimited ? 'المستهدف' : 'الهدف المالي'}
                </span>
                <span style={{ fontSize: '26px', fontWeight: 700, color: '#e5c992' }}>
                  {isUnlimited ? 'هدف مفتوح (غير محدود) ♾️' : `${target.toLocaleString('en-US')} ج.م (${progressPercent}%)`}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', color: '#94a3b8' }}>
                  المساهمات الموثقة
                </span>
                <span style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff' }}>
                  {donorsCount} مساهمة
                </span>
              </div>
            </div>

            {/* Progress Bar (if target) or Continuous Banner (if unlimited) */}
            {isUnlimited ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  background: 'rgba(52, 211, 153, 0.12)',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  color: '#34d399',
                  fontSize: '17px',
                  fontWeight: 500,
                }}
              >
                ✨ الحملة مستمرة في استقبال المساهمات وتوسيع أثر الصدقة الجارية
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '14px',
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #34d399, #10b981)',
                      borderRadius: '999px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Motivational Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              paddingTop: '6px',
            }}
          >
            <span
              style={{
                fontSize: '18px',
                color: '#cbd5e1',
                fontStyle: 'italic',
              }}
            >
              «ساهم في إحداث فرق.. مشاركتك قد تكون سبباً في وصول الخير»
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 24px',
                borderRadius: '999px',
                backgroundColor: '#34d399',
                color: '#0a1a15',
                fontSize: '17px',
                fontWeight: 700,
              }}
            >
              تبرع وساهم الآن
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error: any) {
    console.error('Error generating campaign OG image:', error);
    return new Response(`Failed to generate image: ${error?.message}`, { status: 500 });
  }
}
