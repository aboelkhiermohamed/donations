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

function fixArabic(str: string): string {
  if (!str) return '';
  return str.trim().split(/\s+/).reverse().join(' ');
}

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
            padding: '40px 48px',
            backgroundColor: '#FAF9F5',
            color: '#153C32',
            fontFamily: 'Cairo, sans-serif',
            border: '10px solid #153C32',
          }}
        >
          {/* 1. Top Header Row */}
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
                background: '#FFFFFF',
                padding: '6px 20px',
                borderRadius: '999px',
                border: '1.5px solid #B79B68',
                color: '#8C6D34',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              {fixArabic('أطباء الدفعة التاسعة — طب كفر الشيخ')}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#FFFFFF',
                padding: '6px 20px',
                borderRadius: '999px',
                border: '1.5px solid #153C32',
              }}
            >
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#153C32' }}>
                {fixArabic('منصة صدقة جارية')}
              </span>
              <span style={{ fontSize: '20px' }}>🌿</span>
            </div>
          </div>

          {/* 2. Dedication */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(183, 155, 104, 0.15)',
                padding: '5px 20px',
                borderRadius: '999px',
                border: '1px solid #B79B68',
                color: '#8C6D34',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              {fixArabic('صدقة جارية — إهداء إلى روح الفقيدين')}
            </div>
            <div
              style={{
                fontSize: '35px',
                fontWeight: 700,
                color: '#153C32',
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              {fixArabic('الدكتور حسين علي الأمير   •   الدكتورة ندى هاني حامد')}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 500,
                color: '#55625B',
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              {fixArabic('مبادرة لتوفير جهاز تنفس صناعي لوحدة العناية المركزة بمستشفيات جامعة كفر الشيخ')}
            </div>
          </div>

          {/* 3. Stats Card (White Matching Website) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              background: '#FFFFFF',
              padding: '18px 30px',
              borderRadius: '20px',
              border: '1.5px solid #DDD9CC',
              width: '100%',
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: '14px', color: '#738079' }}>
                  {fixArabic('المساهمات الموثقة')}
                </span>
                <span style={{ fontSize: '26px', fontWeight: 700, color: '#153C32' }}>
                  {donorsCount} {fixArabic('مساهمة')}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '14px', color: '#738079' }}>
                  {fixArabic('المستهدف المالي')}
                </span>
                <span style={{ fontSize: '26px', fontWeight: 700, color: '#8C6D34' }}>
                  {isUnlimited ? fixArabic('هدف مفتوح ♾️') : `${target.toLocaleString('en-US')} ${fixArabic('ج.م')} (${progressPercent}%)`}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                <span style={{ fontSize: '14px', color: '#738079' }}>
                  {fixArabic('إجمالي الحصيلة')}
                </span>
                <span style={{ fontSize: '36px', fontWeight: 700, color: '#217A61' }}>
                  {totalCollected.toLocaleString('en-US')} {fixArabic('ج.م')}
                </span>
              </div>
            </div>

            {/* Banner or Progress */}
            {isUnlimited ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  background: '#F0F9F6',
                  border: '1px solid #A2D9C8',
                  color: '#153C32',
                  fontSize: '15px',
                  fontWeight: 500,
                }}
              >
                {fixArabic('الحملة مستمرة في استقبال المساهمات وتوسيع أثر الصدقة الجارية ✨')}
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
                    backgroundColor: '#EAE8DE',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #24B58A, #153C32)',
                      borderRadius: '999px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid #DDD9CC',
              paddingTop: '12px',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#153C32',
                color: '#FFFFFF',
                padding: '8px 22px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '15px',
              }}
            >
              {fixArabic('تبرع وساهم الآن')}
            </div>

            <span
              style={{
                fontSize: '16px',
                color: '#55625B',
                fontStyle: 'italic',
                opacity: 0.95,
              }}
            >
              {fixArabic('«ساهم في إحداث أثر طيب .. مشاركتك قد تكون سبباً في وصول الخير»')}
            </span>
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
