import { PaymentMethodConfig, WalletConfig } from '@/types';
import { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'vodafone_cash',
    method_key: 'vodafone_cash',
    display_name: 'Vodafone Cash',
    display_name_ar: 'فودافون كاش',
    description_ar: 'تحويل مباشر لمحفظة فودافون كاش الرسمية للدفعة',
    description_en: 'Direct transfer to official Vodafone Cash wallet',
    enabled: true,
    display_order: 1,
    wallets: [
      {
        id: 'wallet_1',
        label: 'محفظة فودافون كاش (1)',
        phone_number: '01099568228',
        enabled: true,
        display_order: 1,
      },
      {
        id: 'wallet_2',
        label: 'محفظة فودافون كاش (2)',
        phone_number: '01026635103',
        enabled: true,
        display_order: 2,
      },
    ],
  },
  {
    id: 'instapay',
    method_key: 'instapay',
    display_name: 'InstaPay',
    display_name_ar: 'إنستاباي (InstaPay)',
    description_ar: 'تحويل لحظي عبر شبكة المدفوعات اللحظية IPN',
    description_en: 'Instant transfer via IPN network',
    enabled: false,
    display_order: 2,
    configuration: {
      instapay_address: '0000000000@instapay',
      instapay_phone: '00000000000',
      instapay_payment_link: 'https://donations-tau.vercel.app/',
      instapay_qr_url: 'https://prcqdmiynkcfmkfzjdou.supabase.co/storage/v1/object/public/receipts/settings/instapay_qr_1782687199673.png',
    },
  },
];

/**
 * Fetch all payment methods from settings (including disabled ones) for Admin management
 */
export async function getAllPaymentMethods(supabase: SupabaseClient): Promise<PaymentMethodConfig[]> {
  try {
    const { data: newConfig, error: newErr } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'payment_methods')
      .maybeSingle();

    if (!newErr && newConfig && Array.isArray(newConfig.value) && newConfig.value.length > 0) {
      const methods: PaymentMethodConfig[] = newConfig.value;
      methods.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      methods.forEach(m => {
        if (m.wallets) {
          m.wallets.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        }
      });
      return methods;
    }

    // Fallback to legacy payment_accounts if payment_methods is not set
    const { data: legacyConfig } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'payment_accounts')
      .maybeSingle();

    if (legacyConfig && legacyConfig.value) {
      const val = legacyConfig.value;
      const vfcWallets: WalletConfig[] = [
        {
          id: 'wallet_1',
          label: 'محفظة فودافون كاش (1) - الأساسية',
          phone_number: val.vodafone_cash || '01099568228',
          enabled: val.vodafone_cash_enabled !== false,
          display_order: 1,
        },
      ];
      if (val.vodafone_cash_2) {
        vfcWallets.push({
          id: 'wallet_2',
          label: 'محفظة فودافون كاش (2)',
          phone_number: val.vodafone_cash_2,
          enabled: val.vodafone_cash_2_enabled !== false,
          display_order: 2,
        });
      }

      return [
        {
          id: 'vodafone_cash',
          method_key: 'vodafone_cash',
          display_name: 'Vodafone Cash',
          display_name_ar: 'فودافون كاش',
          description_ar: 'تحويل مباشر لمحفظة فودافون كاش الرسمية للدفعة',
          description_en: 'Direct transfer to official Vodafone Cash wallet',
          enabled: val.vodafone_cash_enabled !== false,
          display_order: 1,
          wallets: vfcWallets,
        },
        {
          id: 'instapay',
          method_key: 'instapay',
          display_name: 'InstaPay',
          display_name_ar: 'إنستاباي (InstaPay)',
          description_ar: 'تحويل لحظي عبر شبكة المدفوعات اللحظية IPN',
          description_en: 'Instant transfer via IPN network',
          enabled: val.instapay_enabled !== false,
          display_order: 2,
          configuration: {
            instapay_address: val.instapay_address || '0000000000@instapay',
            instapay_phone: val.instapay_phone || '00000000000',
            instapay_payment_link: val.instapay_payment_link || '',
            instapay_qr_url: val.instapay_qr_url || '',
          },
        },
      ];
    }

    return DEFAULT_PAYMENT_METHODS;
  } catch (err) {
    console.error('Failed to get payment methods:', err);
    return DEFAULT_PAYMENT_METHODS;
  }
}

/**
 * Fetch only active payment methods and active wallets for the public website
 */
export async function getActivePaymentMethods(supabase: SupabaseClient): Promise<PaymentMethodConfig[]> {
  const allMethods = await getAllPaymentMethods(supabase);
  
  return allMethods
    .filter(m => m.enabled)
    .map(m => {
      if (m.wallets) {
        return {
          ...m,
          wallets: m.wallets.filter(w => w.enabled),
        };
      }
      return m;
    })
    .filter(m => {
      // If it's a wallet-based method like vodafone_cash, ensure it has at least one active wallet
      if (m.method_key === 'vodafone_cash') {
        return m.wallets && m.wallets.length > 0;
      }
      return true;
    });
}

/**
 * Save updated payment methods (admin only) and sync legacy settings for full backwards compatibility
 */
export async function savePaymentMethods(
  supabaseAdmin: SupabaseClient,
  methods: PaymentMethodConfig[]
): Promise<void> {
  // 1. Save new structured format
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'payment_methods',
      value: methods,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;

  // 2. Sync to legacy payment_accounts key for backwards compatibility
  const vfcMethod = methods.find(m => m.method_key === 'vodafone_cash');
  const activeVfcWallets = (vfcMethod?.wallets || []).filter(w => w.enabled);
  const ipnMethod = methods.find(m => m.method_key === 'instapay');

  const legacyAccounts = {
    vodafone_cash: activeVfcWallets[0]?.phone_number || (vfcMethod?.wallets?.[0]?.phone_number || '01099568228'),
    vodafone_cash_2: activeVfcWallets[1]?.phone_number || (vfcMethod?.wallets?.[1]?.phone_number || ''),
    vodafone_cash_enabled: vfcMethod?.enabled !== false && activeVfcWallets.length > 0,
    vodafone_cash_2_enabled: activeVfcWallets.length > 1,
    instapay_enabled: ipnMethod?.enabled !== false,
    instapay_address: ipnMethod?.configuration?.instapay_address || '',
    instapay_phone: ipnMethod?.configuration?.instapay_phone || '',
    instapay_payment_link: ipnMethod?.configuration?.instapay_payment_link || '',
    instapay_qr_url: ipnMethod?.configuration?.instapay_qr_url || '',
  };

  await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'payment_accounts',
      value: legacyAccounts,
      updated_at: new Date().toISOString(),
    });
}
