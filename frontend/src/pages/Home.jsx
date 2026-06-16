import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-babcock to-babcock-dark p-8 text-white">
        <h1 className="text-3xl font-extrabold">Babcock University Student Elections</h1>
        <p className="mt-2 max-w-2xl text-white/85">
          Every vote is recorded on the Ethereum blockchain — tamper-proof, transparent, and
          independently verifiable. Log in with your matric number, get verified by an election
          official, and cast your vote.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Card
          to="/vote"
          title="Cast Your Vote"
          desc="Log in with your matric number (00/0000), get verified, and vote — one vote per position. It only takes a minute."
          cta="Go to voting"
        />
        <Card
          to="/results"
          title="View Results"
          desc="Live and final tallies with charts, read straight from the blockchain — transparent and tamper-proof."
          cta="See results"
        />
      </section>

      <section className="card">
        <h2 className="font-bold text-slate-800">How it works</h2>
        <ol className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-4">
          <Step n="1" t="Officials set up">Create an election, add positions & candidates.</Step>
          <Step n="2" t="Students verified">Enter matric number; an official approves you.</Step>
          <Step n="3" t="Vote on-chain">Pick one candidate per position. Vote is relayed to Ethereum.</Step>
          <Step n="4" t="Results published">As soon as voting stops, results are final and visible.</Step>
        </ol>
      </section>
    </div>
  );
}

function Card({ to, title, desc, cta }) {
  return (
    <Link to={to} className="card transition hover:shadow-md hover:-translate-y-0.5">
      <h3 className="text-lg font-bold text-babcock">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{desc}</p>
      <span className="mt-4 inline-block text-sm font-semibold text-babcock">{cta} →</span>
    </Link>
  );
}

function Step({ n, t, children }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2 font-semibold text-slate-800">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-babcock text-xs text-white">
          {n}
        </span>
        {t}
      </div>
      <p className="mt-1">{children}</p>
    </li>
  );
}
