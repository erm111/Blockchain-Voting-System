const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:4000";

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const apiLogin = (matric) => api("/api/login", { method: "POST", body: { matric } });
export const apiRequestParticipation = (electionId, matric, department) =>
  api(`/api/elections/${electionId}/request`, { method: "POST", body: { matric, department } });
export const apiListRequests = (electionId) => api(`/api/elections/${electionId}/requests`);
export const apiListVoters = (electionId) => api(`/api/elections/${electionId}/voters`);
export const apiVoterStatus = (electionId, matric) =>
  api(`/api/elections/${electionId}/status/${encodeURIComponent(matric)}`);
export const apiVote = (electionId, matric, votes) =>
  api(`/api/elections/${electionId}/vote`, { method: "POST", body: { matric, votes } });
