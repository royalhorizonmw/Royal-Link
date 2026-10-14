import { requireUser } from "@/lib/auth";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { changeOwnPassword } from "../actions";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="My account" subtitle={`${me.name} · ${me.email}`} />
      {sp.saved ? <Notice tone="good">Password changed.</Notice> : null}
      {sp.error ? <Notice tone="bad">Current password is wrong, or the new one is shorter than 8 characters.</Notice> : null}
      <Card title="Change password" className="max-w-[520px]">
        <form action={changeOwnPassword} className="grid gap-3">
          <Field label="Current password"><input className="input" type="password" name="current" required autoComplete="current-password" /></Field>
          <Field label="New password"><input className="input" type="password" name="next" minLength={8} required autoComplete="new-password" /></Field>
          <div><button className="btn btn-primary">Change password</button></div>
        </form>
      </Card>
    </>
  );
}
