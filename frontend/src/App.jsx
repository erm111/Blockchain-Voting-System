import { NavLink, Outlet, Link } from "react-router-dom";

const navClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium ${
    isActive ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"
  }`;

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-babcock text-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-babcock font-extrabold">
              BVS
            </span>
            <div className="leading-tight">
              <div className="font-bold">Babcock Voting System</div>
              <div className="text-xs text-white/70">Verifiable on Ethereum</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            <NavLink to="/vote" className={navClass}>
              Vote
            </NavLink>
            <NavLink to="/results" className={navClass}>
              Results
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        BVS — votes recorded immutably on the Ethereum blockchain.
        <span className="mx-2 text-slate-300">·</span>
        <Link to="/admin" className="text-slate-400 hover:text-babcock hover:underline">
          Election Officials
        </Link>
      </footer>
    </div>
  );
}
