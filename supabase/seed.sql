-- Supabase Seed Data for Donation Platform

-- 1. Seed Active Campaign
INSERT INTO campaigns (id, name, name_ar, description, description_ar, target_amount, collected_amount, organizer, organizer_ar, cover_image)
VALUES (
    'c580436d-9654-4720-bc2f-a9cb6bf0f7a0',
    'Medical Ventilator for Kafr El-Sheikh University Hospital (9th Batch)',
    'جهاز تنفس صناعي لمستشفى كفر الشيخ الجامعي (الدفعة التاسعة)',
    'Donations campaign by the 9th Batch of Kafr El-Sheikh Medicine to purchase and provide a state-of-the-art ventilator to Kafr El-Sheikh University Hospital ICU.',
    'حملة تبرعات الدفعة التاسعة طب كفر الشيخ لتوفير جهاز تنفس صناعي حديث لدعم وحدة العناية المركزة بمستشفيات جامعة كفر الشيخ وتأمين رعاية فائقة للمرضى.',
    500000.00,
    0.00, -- will be re-tallied dynamically by triggers as donations are verified
    'Kafr El-Sheikh Medicine - 9th Batch',
    'طب كفر الشيخ - الدفعة التاسعة',
    '/ventilator_campaign_cover.png'
) ON CONFLICT (id) DO NOTHING;

-- 2. Seed Default Settings
INSERT INTO settings (key, value)
VALUES 
    ('payment_accounts', '{"vodafone_cash": "01015339426", "instapay_address": "01015339426@instapay"}'),
    ('matching_engine_rules', '{"time_window_minutes": 30, "auto_approve_confidence_threshold": 100}')
ON CONFLICT (key) DO NOTHING;

-- 3. Seed Mock Donors
INSERT INTO donors (id, name, phone)
VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Samer M Abouelkheir', '01020226381'),
    ('d1000000-0000-0000-0000-000000000002', 'Ahmed Mahmoud', '01123456789'),
    ('d1000000-0000-0000-0000-000000000003', 'Hassan Ali', '01298765432')
ON CONFLICT (id) DO NOTHING;

-- 4. Seed Mock Pending Donations
-- (These represent entries created by the web form, waiting for matching SMS alerts)
INSERT INTO donations (id, donor_id, campaign_id, amount, payment_method, status, transaction_ref, last_4_digits, notes)
VALUES
    ('a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0', 460.00, 'vodafone_cash', 'pending', '', '', 'Gaza aid support'),
    ('a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0', 4000.00, 'instapay', 'pending', '4a36aa42', '7425', 'Urgent relief supply'),
    ('a1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'c580436d-9654-4720-bc2f-a9cb6bf0f7a0', 1500.00, 'vodafone_cash', 'pending', '', '', 'Warm clothing packages')
ON CONFLICT (id) DO NOTHING;

-- 5. Seed SMS Parsing Success Audit log Examples
INSERT INTO sms_logs (sender, message, received_at, status)
VALUES
    ('Vodafone Cash', 'تم استلام مبلغ 1200 جنيه من رقم 01055556666 على رقم محفظتك 01015339426. رقم العملية: 0204999111', NOW() - INTERVAL '1 hour', 'success'),
    ('InstaPay', 'IPN transfer received with amount of EGP 500.00 on 1234 on 24/06 at 11:30 AM. Ref# 9b87cd31', NOW() - INTERVAL '2 hours', 'success')
ON CONFLICT (id) DO NOTHING;

-- Note:
-- Admins will register in the `admins` table by matching the `id` from the auth.users table.
-- Create a user in the Supabase Auth system and insert their uuid into the `admins` table:
-- INSERT INTO admins (id, name, email, role) VALUES ('<supabase-auth-uuid>', 'Admin User', 'admin@charity.org', 'superadmin');
