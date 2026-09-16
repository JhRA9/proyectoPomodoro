import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../supabase/migrations/202609160001_create_studyhub_states.sql", import.meta.url);

function compactSql() {
  return readFileSync(migrationUrl, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("cloud database isolation policy", () => {
  it("stores one authenticated-user-owned snapshot and enables RLS", () => {
    const sql = compactSql();
    expect(sql).toContain("user_id uuid primary key references auth.users (id) on delete cascade");
    expect(sql).toContain("alter table public.studyhub_states enable row level security");
    expect(sql).toContain("revoke all privileges on table public.studyhub_states from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.studyhub_states to authenticated");
  });

  it("limits select, insert, update and delete policies to auth.uid", () => {
    const sql = compactSql();
    expect(sql).toMatch(/create policy "studyhub_states_select_own".+?for select.+?using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/create policy "studyhub_states_insert_own".+?for insert.+?with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/create policy "studyhub_states_update_own".+?for update.+?using \(\(select auth\.uid\(\)\) = user_id\).+?with check \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).toMatch(/create policy "studyhub_states_delete_own".+?for delete.+?using \(\(select auth\.uid\(\)\) = user_id\)/);
  });
});
