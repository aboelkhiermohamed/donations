-- Add verified_by_admin_id column to donations table linking to admins table (which references auth.users)
ALTER TABLE donations 
ADD COLUMN verified_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL;
