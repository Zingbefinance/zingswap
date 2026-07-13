import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import StatsCards from "./components/StatsCards";
import SwapCard from "./components/SwapCard";
import AnalyticsChart from "./components/AnalyticsChart";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex">
      <Sidebar />

      <div className="flex-1">
        <Navbar />

        <div className="p-6 space-y-6">
        <p className="text-white">ZingSwap fonctionne !</p>
       <StatsCards />
 <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
  <SwapCard />

  <div className="xl:col-span-2">
    <AnalyticsChart />
  </div>
</div>
        </div>
      </div>
    </main>
  );
}