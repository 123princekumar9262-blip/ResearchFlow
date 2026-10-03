// Boots a real Postgres (PGlite, in-process WASM), stubs the parts of Supabase
// the migrations depend on (auth.users, auth.uid(), storage), applies every
// migration in order, and lets tests run SQL as a specific signed-in user with
// RLS in force.

import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  -- Same contract as Supabase: the JWT subject of the current request.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner_id text
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated, anon;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on function storage.foldername(text) to authenticated, anon;
`;

export async function createDb() {
  const db = new PGlite();
  // Supabase databases run in UTC; match it so current_date agrees with the tests.
  await db.exec("set timezone = 'UTC'");
  await db.exec(SUPABASE_STUBS);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, MIGRATIONS), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return db;
}

/** Creates an auth user; the on_auth_user_created trigger makes the profile. */
export async function signUp(db, { name, role, timezone = "Asia/Kolkata" }) {
  const id = randomUUID();
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, `${name.toLowerCase().replace(/\W+/g, ".")}@uni.test`, { full_name: name, role, timezone }],
  );
  return id;
}

/**
 * Runs `fn(tx)` as the given user (or anon when `userId` is null) with RLS
 * enforced, inside one transaction: it commits on success and rolls back on
 * error, exactly like one API request. Pass `commit: false` to discard it.
 */
export async function as(db, userId, fn, { commit = true } = {}) {
  let result;
  await db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    result = await fn(tx);
    if (!commit) await tx.rollback();
  });
  return result;
}

/** Runs as superuser (like the service role): no RLS, no auth.uid(). */
export async function asService(db, fn) {
  return fn(db);
}

export async function rows(tx, sql, params = []) {
  return (await tx.query(sql, params)).rows;
}

export async function one(tx, sql, params = []) {
  const result = await rows(tx, sql, params);
  return result[0];
}

/** Asserts that `fn` rejects with a message matching `pattern`. */
export async function expectError(promiseFn, pattern) {
  try {
    await promiseFn();
  } catch (error) {
    if (pattern && !pattern.test(error.message)) {
      throw new Error(`Expected error matching ${pattern}, got: ${error.message}`);
    }
    return error;
  }
  throw new Error(`Expected an error matching ${pattern}, but the statement succeeded`);
}
