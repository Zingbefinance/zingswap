import MainLayout from "@/components/layout/MainLayout";
import StatsGrid from "@/components/dashboard/StatsGrid";
import SwapCard from "@/features/swap/components/SwapCard";

export default function Home() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Swap en premier sur mobile */}
        <div className="order-1 md:order-2">
          <SwapCard />
        </div>

        {/* Dashboard en dessous sur mobile, en premier sur PC */}
        <div className="order-2 md:order-1">
          <StatsGrid />
        </div>
      </div>
    </MainLayout>
  );
}