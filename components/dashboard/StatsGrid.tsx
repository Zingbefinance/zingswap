import StatsCard from "./StatsCard";

const stats = [
  {
    title: "TVL",
    value: "$0",
    change: "+0%",
  },
  {
    title: "24H Volume",
    value: "$0",
    change: "+0%",
  },
  {
    title: "Swaps",
    value: "0",
    change: "+0%",
  },
  {
    title: "Fees",
    value: "$0",
    change: "+0%",
  },
];

export default function StatsGrid() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatsCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          change={stat.change}
        />
      ))}
    </section>
  );
}