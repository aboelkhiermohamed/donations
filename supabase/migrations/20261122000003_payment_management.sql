-- Migration: 20261122000003_payment_management.sql
-- Description: Dynamic Payment Methods and Wallet Management

-- Insert or update the payment_methods configuration in settings table
INSERT INTO settings (key, value, updated_at)
VALUES (
  'payment_methods',
  '[
    {
      "id": "vodafone_cash",
      "method_key": "vodafone_cash",
      "display_name": "Vodafone Cash",
      "display_name_ar": "فودافون كاش",
      "description_ar": "تحويل مباشر لمحفظة فودافون كاش الرسمية للدفعة",
      "description_en": "Direct transfer to official Vodafone Cash wallet",
      "enabled": true,
      "display_order": 1,
      "wallets": [
        {
          "id": "wallet_1",
          "label": "محفظة فودافون كاش (1) - الأساسية",
          "phone_number": "01099568228",
          "enabled": true,
          "display_order": 1
        },
        {
          "id": "wallet_2",
          "label": "محفظة فودافون كاش (2)",
          "phone_number": "01026635103",
          "enabled": true,
          "display_order": 2
        }
      ]
    },
    {
      "id": "instapay",
      "method_key": "instapay",
      "display_name": "InstaPay",
      "display_name_ar": "إنستاباي (InstaPay)",
      "description_ar": "تحويل لحظي عبر شبكة المدفوعات اللحظية IPN",
      "description_en": "Instant transfer via IPN network",
      "enabled": false,
      "display_order": 2,
      "configuration": {
        "instapay_address": "0000000000@instapay",
        "instapay_phone": "00000000000",
        "instapay_payment_link": "https://donations-tau.vercel.app/",
        "instapay_qr_url": "https://prcqdmiynkcfmkfzjdou.supabase.co/storage/v1/object/public/receipts/settings/instapay_qr_1782687199673.png"
      }
    }
  ]'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
