import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface Props {
  children: ReactNode;
}

export default function MainLayout({ children }: Props) {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />

      <main className="flex-1 p-8 space-y-8">
        <Topbar />
        {children}
      </main>
    </div>
  );
}