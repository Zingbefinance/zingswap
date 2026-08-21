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
        gap-2
        rounded-xl
        bg-zinc-800
        px-4
        py-2
        font-semibold
        text-white
        transition
        hover:bg-cyan-500
        hover:text-black
        cursor-pointer
      "
    >
      <div className="h-7 w-7 rounded-full bg-cyan-500" />

      {token.symbol}

      <span>▼</span>
    </button>
  );
}