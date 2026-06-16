export const DURATIONS = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "6 hours", seconds: 6 * 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "2 days", seconds: 2 * 24 * 60 * 60 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "1 week", seconds: 7 * 24 * 60 * 60 },
];

export function fmtTime(unixSeconds) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function countdown(endTime) {
  const now = Math.floor(Date.now() / 1000);
  let s = endTime - now;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ") + " left";
}

export const STATUS_BADGE = {
  Created: "bg-slate-100 text-slate-700",
  Active: "bg-green-100 text-green-700",
  Ended: "bg-red-100 text-red-700",
};
