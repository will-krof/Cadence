/**
 * The columns a profile travels with. Spelled out rather than "everything"
 * because a profile now carries a password hash, and that never leaves the
 * server. The username does: it is how the person signs in, and the roster
 * shows whether they have set a login up at all.
 */
export const DEVELOPER_FIELDS = {
  id: true,
  name: true,
  color: true,
  role: true,
  email: true,
  phone: true,
  birthday: true,
  workStatus: true,
  startDate: true,
  salary: true,
  currency: true,
  employmentType: true,
  active: true,
  notes: true,
  timezone: true,
  country: true,
  languages: true,
  workLocation: true,
  username: true,
  createdAt: true,
} as const;

/**
 * What a team member may know about the people they work with: enough to see
 * who is who on a board or a roster. What somebody is paid, their phone number,
 * their home email and whatever an admin wrote in their notes are the
 * workspace's business, so those stay behind.
 */
export const TEAMMATE_FIELDS = {
  id: true,
  name: true,
  color: true,
  role: true,
  // Where somebody is this week is what a colleague needs to know to plan
  // around them; what they are paid is not.
  workStatus: true,
  active: true,
  currency: true,
  // Which hours somebody keeps, and in what languages, is the same kind of
  // fact: you need it to work with them at all. A colleague gets these.
  timezone: true,
  country: true,
  languages: true,
  workLocation: true,
  createdAt: true,
} as const;

interface Teammate {
  id: string;
  name: string;
  color: string;
  role: string | null;
  workStatus: string | null;
  active: boolean;
  currency: string;
  timezone: string | null;
  country: string | null;
  languages: string | null;
  workLocation: string | null;
  createdAt: Date;
}

/**
 * Pads a teammate out to the shape the client reads, with the private fields
 * spelled as absent rather than left undefined — the roster then renders "—"
 * the same way it does for a field nobody filled in.
 */
export function teammatePayload(developer: Teammate) {
  return {
    ...developer,
    email: null,
    phone: null,
    // When somebody was born is theirs, not the workspace's to hand around.
    birthday: null,
    startDate: null,
    salary: null,
    employmentType: null,
    notes: null,
    username: null,
  };
}
