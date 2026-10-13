'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { SESSION_COOKIE, checkPassword, createSession } from '@/lib/auth';
import { requireAuth } from '@/lib/session';
import { RateLimiter, clientIp } from '@/lib/rate-limit';
import * as store from '@/lib/db';

const loginAttempts = new RateLimiter(10, 15 * 60_000);

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  if (!loginAttempts.take(clientIp(h))) return { error: 'Too many attempts. Wait 15 minutes and try again.' };
  const pw = String(form.get('password') ?? '');
  if (!checkPassword(pw)) return { error: 'Wrong password.' };
  const session = createSession();
  if (!session) return { error: 'Login is not configured (COMMANDO_PASSWORD missing or shorter than 12 characters).' };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: session.expires,
  });
  redirect('/');
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

function id(form: FormData, field = 'id'): number {
  const n = Number(form.get(field));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${field}`);
  return n;
}

function clean(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

/** Assigns an installation to an existing client, a new client (typed name) or none, and saves its notes. */
export async function saveInstallation(form: FormData): Promise<void> {
  await requireAuth();
  const installationId = id(form);
  const choice = String(form.get('client') ?? '');
  const newName = clean(form.get('new_client'), 200);
  let clientId: number | null = null;
  if (newName) clientId = await store.ensureClient(newName);
  else if (choice && choice !== 'none') clientId = id(form, 'client');
  await store.updateInstallation(installationId, clientId, clean(form.get('notes'), 5000));
  revalidatePath('/', 'layout');
  redirect(`/installations/${installationId}?saved=1`);
}

export async function removeInstallation(form: FormData): Promise<void> {
  await requireAuth();
  await store.deleteInstallation(id(form));
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function createClient(form: FormData): Promise<void> {
  await requireAuth();
  const name = clean(form.get('name'), 200);
  if (!name) redirect('/clients');
  const clientId = await store.ensureClient(name);
  revalidatePath('/clients');
  redirect(`/clients/${clientId}`);
}

export async function saveClient(form: FormData): Promise<void> {
  await requireAuth();
  const clientId = id(form);
  const name = clean(form.get('name'), 200);
  if (name) {
    try {
      await store.updateClient(clientId, name, clean(form.get('notes'), 5000));
    } catch {
      redirect(`/clients/${clientId}?error=duplicate`);
    }
  }
  revalidatePath('/', 'layout');
  redirect(`/clients/${clientId}?saved=1`);
}

export async function removeClient(form: FormData): Promise<void> {
  await requireAuth();
  await store.deleteClient(id(form));
  revalidatePath('/', 'layout');
  redirect('/clients');
}
