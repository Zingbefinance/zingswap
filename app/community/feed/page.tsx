import Link from "next/link";
import FeedClient from "./_components/FeedClient";

export default function CommunityFeedPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
            ZingSwap Community
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Fil d’actualité
          </h1>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cyan-300" />
          Fil public
        </span>
      </header>

      <FeedClient />

      <p className="mt-6 text-center text-sm text-zinc-500">
        Les publications sont visibles immédiatement et peuvent être masquées par la modération. {" "}
        <Link href="/community" className="text-cyan-300 hover:text-cyan-200">
          Retour à Community
        </Link>
      </p>
    </div>
  );
}
