const BASE = "/api/users";

export async function getUserProfile(userId) {
  const res = await fetch(`${BASE}/${userId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch profile");
  return data;
}

export async function updateUserProfile(userId, payload, token) {
  const res = await fetch(`${BASE}/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update profile");
  return data;
}

export async function uploadAvatar(formData, token) {
  const res = await fetch(`${BASE}/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to upload avatar");
  return data;
}
