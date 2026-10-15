import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/welcome");
  if (user.role === "DRIVER") redirect("/me");
  const items = NAV.filter((n) => user.role === "MANAGER" || n.roles.includes(user.role)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={items} user={{ name: user.name, role: user.role }} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
