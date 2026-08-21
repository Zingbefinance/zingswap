import MainLayout from "@/components/layout/MainLayout";
import StatsGrid from "@/components/dashboard/StatsGrid";
import SwapCard from "@/features/swap/components/SwapCard";

export default function Home() {
  return (
    <MainLayout>
      <StatsGrid />

      <div className="mt-6">
        <SwapCard />
      </div>
    </MainLayout>
  );
}