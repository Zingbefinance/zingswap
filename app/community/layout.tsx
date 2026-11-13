import Link from "next/link";

export default function CommunityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <Link href="/community" className="text-lg font-bold text-cyan-300">ZingSwap Community</Link>
          <nav aria-label="Community" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
            <Link href="/community/feed" className="hover:text-white">Fil d’actualité</Link>
            <Link href="/community/projects" className="hover:text-white">Projets</Link>
            <Link href="/community/wallet" className="hover:text-white">ZinWallet</Link>
            <Link href="/community/moderation" className="hover:text-white">Modération</Link>
            <Link href="/community/login" className="hover:text-white">Connexion</Link>
            <Link href="/community/register" className="hover:text-white">Inscription</Link>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
