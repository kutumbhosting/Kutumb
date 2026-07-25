/**
 * Generates the next event registration number, scoped per event, in the
 * format R0001, R0002, ... Computed LIVE as "highest existing registration
 * number for this event's registrations + 1" - same approach as membership
 * numbers, so there's no separate counter file to get out of sync.
 */
export function getNextRegistrationNumber(existingRegistrations) {
  let maxSeq = 0;
  for (const reg of existingRegistrations) {
    const num = reg?.registrationNumber;
    if (typeof num !== "string" || !num.startsWith("R")) continue;
    const seq = parseInt(num.slice(1), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  const nextSeq = maxSeq + 1;
  return `R${String(nextSeq).padStart(4, "0")}`;
}
