import prisma from "../prisma.js";

const ROLES = ["MANAGER", "STAFF", "FOLLOWER"];

/**
 * POST /api/users
 * Body: { username, role? }
 * Upserts a user by username. Primarily used to create a MANAGER so games can
 * be authored (game creation requires a creatorId).
 */
export async function createUser(req, res, next) {
  try {
    const { username, role } = req.body;
    if (!username) return res.status(400).json({ error: "username is required" });
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of ${ROLES.join(", ")}` });
    }

    const user = await prisma.user.upsert({
      where: { username },
      update: role ? { role } : {},
      create: { username, role: role ?? undefined },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}
