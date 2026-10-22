export function amountToPaise(value) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d{1,9}(\.\d{1,2})?$/.test(text)) throw Object.assign(new Error("Amount must be a positive decimal with at most two decimal places."), { status: 400 });
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise <= 0) throw Object.assign(new Error("Amount out of range."), { status: 400 });
  return paise;
}

export function boundedInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) return null;
  return Number(value);
}

export function httpErrorStatus(error) {
  if (error.status >= 400 && error.status <= 599) return error.status;
  if (["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"].includes(error.code)) return 413;
  if (["ValidationError", "CastError"].includes(error.name)) return 400;
  return error.code === 11000 ? 409 : 500;
}
