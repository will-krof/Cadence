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
  avatar: true,
  startDate: true,
  salary: true,
  currency: true,
  employmentType: true,
  active: true,
  notes: true,
  username: true,
  createdAt: true,
} as const;
