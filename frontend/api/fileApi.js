export async function downloadAttachment(event, url, name, token) {
  if (!url.startsWith("/api/uploads/files/")) return;
  event.preventDefault();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("This file could not be downloaded. It may have been removed, or this account may not have access. Check that you are signed in to the right account and try again.");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl; link.download = name || "attachment"; link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
