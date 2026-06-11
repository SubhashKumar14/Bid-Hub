const BASE = "/api/notifications";

export async function getNotifications(token) {
  const res = await fetch(BASE, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch notifications");
  return data; // { notifications: [], unreadCount: 0 }
}

export async function markNotificationRead(notificationId, token) {
  const res = await fetch(`${BASE}/${notificationId}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to mark as read");
  return data;
}

export async function markAllNotificationsRead(token) {
  const res = await fetch(`${BASE}/read-all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to mark all as read");
  return data;
}
