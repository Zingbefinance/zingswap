import Link from "next/link";

export default function CommunityPage() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-10">
      <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">ZingSwap</p>
      <h1 className="mt-2 text-3xl font-bold">Community</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">Un espace pour découvrir et suivre les projets crypto.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/community/register" className="rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-zinc-950">Créer un compte</Link>
        <Link href="/community/login" className="rounded-lg border border-zinc-700 px-4 py-2.5 font-semibold text-zinc-200">Se connecter</Link>
      </div>
    </section>
  );
}
