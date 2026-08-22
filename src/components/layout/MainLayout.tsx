import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface Props {
  children: ReactNode;
}

export default function MainLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-black text-white md:flex">

      <aside className="hidden md:block md:w-64 md:shrink-0">
        <Sidebar />
      </aside>

      <main className="w-full flex-1 p-4 md:p-8 space-y-6 md:space-y-8 overflow-x-hidden">
        <Topbar />
        {children}
      </main>

    </div>
  );
}