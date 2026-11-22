import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabaseAdmin';

export interface AdminUserContext {
  userId: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin';
}

/**
 * Verify administrative authorization from Bearer token
 * Returns AdminUserContext if verified, or null if unauthorized
 */
export async function verifyAdminRequest(req: NextRequest): Promise<AdminUserContext | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return null;
  }

  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return null;
    }

    const { data: adminRecord, error: adminErr } = await supabaseAdmin
      .from('admins')
      .select('id, name, email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (adminErr || !adminRecord) {
      return null;
    }

    return {
      userId: user.id,
      email: adminRecord.email || user.email || '',
      name: adminRecord.name || '',
      role: adminRecord.role || 'admin',
    };
  } catch (error) {
    console.error('Error verifying admin request:', error);
    return null;
  }
}
