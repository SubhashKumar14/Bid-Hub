const BASE = "/api/bids";

export async function acceptBid(bidId, token) {
  const res = await fetch(`${BASE}/${bidId}/accept`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to accept bid");
  return data;
}

export async function rejectBid(bidId, token) {
  const res = await fetch(`${BASE}/${bidId}/reject`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to reject bid");
  return data;
}
