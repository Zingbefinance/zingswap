interface StatsCardProps {
  title: string;
  value: string;
  change: string;
}

export default function StatsCard({
  title,
  value,
  change,
}: StatsCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-6 transition hover:border-cyan-500">
      <p className="text-sm text-zinc-400">
        {title}
      </p>

      <h2 className="mt-2 md:mt-3 text-2xl md:text-3xl font-bold text-white break-words">
        {value}
      </h2>

      <p className="mt-2 text-sm font-semibold text-green-400">
        {change}
      </p>
    </div>
  );
}