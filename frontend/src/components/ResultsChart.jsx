import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const COLORS = ["#7c1d2b", "#a83246", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export default function ResultsChart({ position }) {
  const data = position.candidates.map((c) => ({ name: c.name, votes: c.voteCount }));
  const total = data.reduce((s, d) => s + d.votes, 0);
  const max = Math.max(0, ...data.map((d) => d.votes));
  const leader = max > 0 ? data.find((d) => d.votes === max)?.name : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{position.name}</h3>
        <span className="text-sm text-slate-500">{total} vote(s)</span>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
              <LabelList dataKey="votes" position="top" />
              {data.map((entry, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {d.name}
              {leader === d.name && total > 0 && (
                <span className="badge bg-green-100 text-green-700">leading</span>
              )}
            </span>
            <span className="font-semibold">
              {d.votes} {total > 0 ? `(${Math.round((d.votes / total) * 100)}%)` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
