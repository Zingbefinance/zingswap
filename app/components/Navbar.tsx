import WalletButton from "./WalletButton";
export default function Navbar() {
  return (
    <nav className="flex justify-between items-center p-6 bg-black text-white">
      <h1 className="text-2xl font-bold text-purple-500">
        ZINGSWAP
      </h1>

     <WalletButton /> 
    </nav>
  );
}