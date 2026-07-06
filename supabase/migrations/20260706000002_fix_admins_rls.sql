-- Fix RLS policy on admins table to allow other admins to view names/emails
DROP POLICY IF EXISTS "Admins only access admins" ON admins;

CREATE POLICY "Admins can read all admins" 
ON admins FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify their own record" 
ON admins FOR ALL 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
