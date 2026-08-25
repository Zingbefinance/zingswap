"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";

type ZingNewsItem = {
  title: string;
  description: string;
};

type ZingNewsCarouselProps = {
  news: ZingNewsItem[];
};

export default function ZingNewsCarousel({
  news,
}: ZingNewsCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (news.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % news.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [news.length]);

  if (news.length === 0) {
    return null;
  }

  const activeNews = news[activeIndex];

  return (
    <div className="flex items-start gap-4 rounded-xl bg-zinc-900 p-4">
      <Newspaper
        className="mt-1 shrink-0 text-green-400"
        size={22}
      />

      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          key={activeIndex}
          className="animate-[zingNewsSlide_0.6s_ease-out]"
        >
          <p className="font-semibold text-white">
            {activeNews.title}
          </p>

          <p className="mt-1 text-sm text-zinc-400">
            {activeNews.description}
          </p>
        </div>

        {news.length > 1 && (
          <div className="mt-3 flex items-center gap-1.5">
            {news.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex
                    ? "w-5 bg-green-400"
                    : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}