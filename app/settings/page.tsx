import MainLayout from "@/components/layout/MainLayout";

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="mt-2 text-zinc-400">
            Configure ici les préférences de ZingSwap.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Slippage par défaut</h2>
              <p className="text-sm text-zinc-400">
                Valeur utilisée pour les swaps.
              </p>
            </div>
            <span className="rounded-lg bg-zinc-800 px-3 py-2 text-cyan-400">
              0.50%
            </span>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Mode sombre</h2>
              <p className="text-sm text-zinc-400">
                Interface optimisée pour ZingSwap.
              </p>
            </div>
            <span className="rounded-lg bg-zinc-800 px-3 py-2 text-cyan-400">
              Activé
            </span>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Version</h2>
              <p className="text-sm text-zinc-400">
                Build actuel de l'application.
              </p>
            </div>
            <span className="rounded-lg bg-zinc-800 px-3 py-2 text-cyan-400">
              v1
            </span>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}