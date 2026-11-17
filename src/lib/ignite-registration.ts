// Pure rules for the Ignite registration flow. Prices shown here are display-only;
// any live checkout must take the amount from the server, never from the client.
export const SEAT_CAPACITY = 100;
export const DEPOSIT_USD = 400;

export type Details = { fullName: string; email: string; countryCode: string; phone: string; marketingOptIn: boolean };
export type Errors = Partial<Record<"fullName" | "email" | "phone" | "countryCode", string>>;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function validateDetails(d: Details): Errors {
  const errors: Errors = {};
  const name = d.fullName.trim();
  if (name.length < 2) errors.fullName = "Enter your full name.";
  else if (name.length > 100) errors.fullName = "Name must be under 100 characters.";
  const email = normalizeEmail(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 255) errors.email = "Enter a valid email address.";
  if (!/^\+\d{1,4}$/.test(d.countryCode)) errors.countryCode = "Choose a country code.";
  const digits = d.phone.replace(/[\s\-().]/g, "");
  if (!/^\d{6,14}$/.test(digits)) errors.phone = "Enter a valid phone number (digits only, 6–14).";
  return errors;
}

// Confirmed event schedule (Cory). 5:00 PM CST = 23:00 UTC.
export const SCHEDULE_DATES = "November 30–December 4, 2026";
export const SCHEDULE_SESSIONS = "Five days · 90 minutes per session";
export const SCHEDULE_TIME = "Daily from 5:00–6:30 PM CST";
export const RECORDING_NOTE = "*Sessions will be recorded.";
export const SCHEDULE_START_UTC = "2026-11-30T23:00:00Z";
export const SCHEDULE_END_UTC = "2026-12-05T00:30:00Z";
