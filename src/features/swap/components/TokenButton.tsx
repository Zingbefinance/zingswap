import { Token } from "@/lib/tokens/types";

interface Props {
  token: Token;
  onClick?: () => void;
}

export default function TokenButton({ token, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex
        items-center
        min-w-0
        max-w-full
        gap-2
        rounded-xl
        bg-zinc-800
        px-3
        py-2
        font-semibold
        text-white
        transition
        hover:bg-cyan-500
        hover:text-black
        cursor-pointer
      "
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-black">
        {token.symbol.slice(0, 1)}
      </div>

      <span className="max-w-[35vw] truncate sm:max-w-none">{token.symbol}</span>

      <span>▼</span>
    </button>
  );
}
