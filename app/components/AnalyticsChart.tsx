"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const data = [
  { name: "00h", price: 0.00010 },
  { name: "04h", price: 0.00013 },
  { name: "08h", price: 0.00018 },
  { name: "12h", price: 0.00016 },
  { name: "16h", price: 0.00022 },
  { name: "20h", price: 0.00028 },
  { name: "24h", price: 0.00035 },
];

export default function AnalyticsChart() {
  return (
    <div className="bg-[#11131B] rounded-3xl border border-zinc-800 p-6 shadow-xl">

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Analytics
          </h2>

          <p className="text-gray-400">
            ZING Token Performance
          </p>
        </div>

        <div className="flex gap-2">
          <button className="bg-violet-600 text-white px-3 py-1 rounded-lg text-sm">
            24H
          </button>

          <button className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-lg text-sm">
            7D
          </button>

          <button className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-lg text-sm">
            30D
          </button>

          <button className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-lg text-sm">
            1Y
          </button>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#333"
            />

            <XAxis
              dataKey="name"
              stroke="#888"
            />

            <YAxis
              stroke="#888"
            />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="price"
              stroke="#8B5CF6"
              strokeWidth={4}
              dot={{ r: 5 }}
            />

          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}