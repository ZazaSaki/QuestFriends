import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds a minimal but complete scenario so the gameplay flow can be tested:
 * one manager, a game with intro/conclusion, two quests (one open-challenge
 * gated), one track with two waypoints, and an open room (which auto-generates
 * a team per track when created via the API — here we create the room+team too
 * so IDs are printed for immediate testing).
 *
 * Run: npm run seed   (after the DB is up and `prisma db push` has run)
 */
async function main() {
  const manager = await prisma.user.upsert({
    where: { username: "manager1" },
    update: { role: "MANAGER" },
    create: { username: "manager1", role: "MANAGER" },
  });

  const game = await prisma.game.create({
    data: {
      title: "Downtown Scavenger Hunt",
      description: "A demo quest around the city center.",
      introduction: { text: "Welcome, adventurers!", media: null },
      conclusion: { text: "You made it — well done!", media: null },
      creatorId: manager.id,
    },
  });

  const quest1 = await prisma.quest.create({
    data: {
      gameId: game.id,
      title: "The Old Fountain",
      score: 20,
      openChallengeType: "NONE",
      content: { description: "Snap a photo of the fountain." },
      challengeType: "PHOTO",
      postChallengeContent: { reward: "Nice! The fountain was built in 1901." },
    },
  });

  const quest2 = await prisma.quest.create({
    data: {
      gameId: game.id,
      title: "Secret Door",
      score: 30,
      openChallengeType: "PASSWORD",
      openChallengeValue: "letmein",
      // `answer` (or `answers: [...]`) is the auto-grade key read by submit().
      content: {
        description: "What year was the library founded?",
        answer: "1898",
      },
      challengeType: "QUIZ",
      postChallengeContent: { reward: "Correct! Head to the final stop." },
    },
  });

  const track = await prisma.track.create({
    data: {
      gameId: game.id,
      name: "Blue Route",
      waypoints: {
        create: [
          {
            questId: quest1.id,
            sequenceOrder: 1,
            latitude: 40.4168,
            longitude: -3.7038,
            radius: 20,
          },
          {
            questId: quest2.id,
            sequenceOrder: 2,
            latitude: 40.4170,
            longitude: -3.7050,
            radius: 20,
          },
        ],
      },
    },
  });

  // Open a room with a team per track (mirrors POST /api/rooms behaviour).
  const room = await prisma.room.create({
    data: {
      gameId: game.id,
      staffPassword: "staff123",
      teams: { create: [{ trackId: track.id, name: track.name }] },
    },
    include: { teams: true },
  });

  console.log("Seed complete:");
  console.log(JSON.stringify(
    {
      managerId: manager.id,
      gameId: game.id,
      questIds: [quest1.id, quest2.id],
      trackId: track.id,
      roomId: room.id,
      teamId: room.teams[0].id,
      staffPassword: "staff123",
      firstWaypoint: { latitude: 40.4168, longitude: -3.7038, radius: 20 },
      quest2Password: "letmein",
      quest2QuizAnswer: "1898",
    },
    null,
    2
  ));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
