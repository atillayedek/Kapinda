import { Link } from "react-router-dom";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-extrabold text-primary ${className}`} aria-label="Kapında ana sayfa">
      <img src="/icons/icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
      <span className="text-xl">Kapında</span>
    </Link>
  );
}
