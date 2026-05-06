import type { VercelRequest, VercelResponse } from '@vercel/node';

export type WatchlistShareRole = 'viewer' | 'editor';

export interface WatchlistShareResponse {
  id: string;
  watchlist_id: string;
  shared_with_user_id: string;
  shared_with_email: string | null;
  role: WatchlistShareRole;
  shared_by_user_id: string;
  created_at: string;
  updated_at: string | null;
}

type SupabaseLikeClient = {
  auth: {
    getUser: (token: string) => Promise<{ data?: { user?: { id: string } | null }; error?: { message?: string } | null }>;
    admin: {
      listUsers: (options?: { page?: number; perPage?: number }) => Promise<{
        data?: { users?: Array<{ id: string; email?: string | null }> };
        error?: { message?: string } | null;
      }>;
      getUserById?: (id: string) => Promise<{
        data?: { user?: { id: string; email?: string | null } | null };
        error?: { message?: string } | null;
      }>;
    };
  };
  from: (table: string) => any;
};

export class ShareApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly publicMessage = message
  ) {
    super(message);
  }
}

export function setShareCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function normalizeShareRole(role: unknown): WatchlistShareRole | null {
  return role === 'viewer' || role === 'editor' ? role : null;
}

export function readQueryParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function resolveUserByEmail(client: SupabaseLikeClient, email: string): Promise<{ id: string; email: string | null } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new ShareApiError(500, `Failed to resolve user: ${error.message}`, 'Unable to share this watchlist right now.');

    const users = data?.users ?? [];
    const match = users.find(user => user.email?.trim().toLowerCase() === normalizedEmail);
    if (match) return { id: match.id, email: match.email ?? null };
    if (users.length < perPage) break;
  }

  return null;
}

export async function getAuthenticatedUserId(client: SupabaseLikeClient, req: VercelRequest): Promise<string> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw new ShareApiError(401, 'Missing bearer token', 'Authentication required.');

  const { data, error } = await client.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) throw new ShareApiError(401, `Invalid bearer token: ${error?.message ?? 'missing user'}`, 'Authentication required.');

  return userId;
}

async function assertWatchlistOwner(client: SupabaseLikeClient, watchlistId: string, userId: string): Promise<void> {
  const { data, error } = await client
    .from('watchlists')
    .select('id,user_id')
    .eq('id', watchlistId)
    .single();

  if (error || !data) throw new ShareApiError(404, `Watchlist not found: ${watchlistId}`, 'Watchlist not found.');
  if (data.user_id !== userId) throw new ShareApiError(403, `User ${userId} does not own watchlist ${watchlistId}`, 'Only the owner can manage sharing.');
}

async function getShareById(client: SupabaseLikeClient, shareId: string): Promise<any> {
  const { data, error } = await client
    .from('watchlist_shares')
    .select('*')
    .eq('id', shareId)
    .single();

  if (error || !data) throw new ShareApiError(404, `Share not found: ${shareId}`, 'Share not found.');
  return data;
}

async function mapShareEmails(client: SupabaseLikeClient, rows: any[]): Promise<WatchlistShareResponse[]> {
  const emailByUserId = new Map<string, string | null>();

  await Promise.all(rows.map(async row => {
    if (emailByUserId.has(row.shared_with_user_id)) return;

    if (!client.auth.admin.getUserById) {
      emailByUserId.set(row.shared_with_user_id, null);
      return;
    }

    const { data } = await client.auth.admin.getUserById(row.shared_with_user_id);
    emailByUserId.set(row.shared_with_user_id, data?.user?.email ?? null);
  }));

  return rows.map(row => ({
    id: row.id,
    watchlist_id: row.watchlist_id,
    shared_with_user_id: row.shared_with_user_id,
    shared_with_email: emailByUserId.get(row.shared_with_user_id) ?? null,
    role: row.role,
    shared_by_user_id: row.shared_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  }));
}

export async function listWatchlistShares(client: SupabaseLikeClient, userId: string, watchlistId: string): Promise<WatchlistShareResponse[]> {
  await assertWatchlistOwner(client, watchlistId, userId);

  const { data, error } = await client
    .from('watchlist_shares')
    .select('*')
    .eq('watchlist_id', watchlistId)
    .order('created_at', { ascending: true });

  if (error) throw new ShareApiError(500, `Failed to list shares: ${error.message}`, 'Unable to load collaborators.');
  return mapShareEmails(client, data ?? []);
}

export async function createWatchlistShare(
  client: SupabaseLikeClient,
  userId: string,
  input: { watchlistId: unknown; email: unknown; role: unknown }
): Promise<WatchlistShareResponse> {
  const watchlistId = typeof input.watchlistId === 'string' ? input.watchlistId.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const role = normalizeShareRole(input.role);

  if (!watchlistId || !email || !role) throw new ShareApiError(400, 'Invalid share request', 'Enter an email and choose Viewer or Editor.');

  await assertWatchlistOwner(client, watchlistId, userId);

  const recipient = await resolveUserByEmail(client, email);
  if (!recipient) throw new ShareApiError(404, `No user found for ${email}`, 'No account found for this email. Ask them to sign up first.');
  if (recipient.id === userId) throw new ShareApiError(400, 'Cannot share with self', 'You already own this watchlist.');

  const { data, error } = await client
    .from('watchlist_shares')
    .upsert({
      watchlist_id: watchlistId,
      shared_with_user_id: recipient.id,
      role,
      shared_by_user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'watchlist_id,shared_with_user_id' })
    .select('*')
    .single();

  if (error || !data) throw new ShareApiError(500, `Failed to save share: ${error?.message ?? 'missing row'}`, 'Unable to share this watchlist right now.');

  const [share] = await mapShareEmails(client, [{ ...data, shared_with_email: recipient.email }]);
  return { ...share, shared_with_email: recipient.email };
}

export async function updateWatchlistShareRole(
  client: SupabaseLikeClient,
  userId: string,
  shareId: string,
  roleInput: unknown
): Promise<WatchlistShareResponse> {
  const role = normalizeShareRole(roleInput);
  if (!role) throw new ShareApiError(400, 'Invalid share role', 'Choose Viewer or Editor.');

  const existing = await getShareById(client, shareId);
  await assertWatchlistOwner(client, existing.watchlist_id, userId);

  const { data, error } = await client
    .from('watchlist_shares')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', shareId)
    .select('*')
    .single();

  if (error || !data) throw new ShareApiError(500, `Failed to update share: ${error?.message ?? 'missing row'}`, 'Unable to update collaborator access.');
  const [share] = await mapShareEmails(client, [data]);
  return share;
}

export async function deleteWatchlistShare(client: SupabaseLikeClient, userId: string, shareId: string): Promise<void> {
  const existing = await getShareById(client, shareId);
  await assertWatchlistOwner(client, existing.watchlist_id, userId);

  const { error } = await client
    .from('watchlist_shares')
    .delete()
    .eq('id', shareId);

  if (error) throw new ShareApiError(500, `Failed to delete share: ${error.message}`, 'Unable to revoke collaborator access.');
}

export function sendShareError(res: VercelResponse, error: unknown): VercelResponse {
  if (error instanceof ShareApiError) {
    if (error.statusCode >= 500) console.error(error.message);
    return res.status(error.statusCode).json({ error: error.publicMessage, message: error.publicMessage });
  }

  console.error('Watchlist share API error:', error);
  return res.status(500).json({ error: 'Unable to manage watchlist sharing.', message: 'Unable to manage watchlist sharing.' });
}

