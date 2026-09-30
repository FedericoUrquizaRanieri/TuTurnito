// Anti-abuse limits. Generous enough that a real player never runs into
// them; they only stop someone hoarding every slot or bloating the database.

/** How many days ahead a player can book (the owner has no limit). */
export const BOOKING_HORIZON_DAYS = 30;

/** Future bookings a player can hold at once in the same complex (the owner and class bookings don't count). */
export const MAX_ACTIVE_RESERVATIONS_PER_COMPLEX = 3;

/**
 * Dates anyone can list through the public turns endpoint. Listing a date
 * generates its turns, so without a window anyone could make the server
 * write turns for any year.
 */
export const PUBLIC_TURNS_DAYS_BACK = 7;
export const PUBLIC_TURNS_DAYS_AHEAD = 90;
