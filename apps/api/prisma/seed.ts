import { CampaignStatus, ElectionStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";

const seedEnv = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SEED_ORGANIZER_EMAIL: z.string().email().default("organizer@example.test"),
    SEED_ORGANIZER_PASSWORD: z.string().min(12).default("replace-with-local-seed-password")
  })
  .parse(process.env);

const electionId = "10000000-0000-4000-8000-000000000001";
const campaignId = "10000000-0000-4000-8000-000000000002";
const firstOptionId = "10000000-0000-4000-8000-000000000003";
const secondOptionId = "10000000-0000-4000-8000-000000000004";

async function main(): Promise<void> {
  if (seedEnv.NODE_ENV === "production") {
    throw new Error("The synthetic development seed must not run in production.");
  }

  let organizer = await prisma.user.findUnique({
    where: { email: seedEnv.SEED_ORGANIZER_EMAIL }
  });

  if (!organizer) {
    await auth.api.signUpEmail({
      body: {
        email: seedEnv.SEED_ORGANIZER_EMAIL,
        password: seedEnv.SEED_ORGANIZER_PASSWORD,
        name: "BirdLoud Demo Organizer"
      }
    });

    organizer = await prisma.user.findUniqueOrThrow({
      where: { email: seedEnv.SEED_ORGANIZER_EMAIL }
    });
  }

  await prisma.election.upsert({
    where: { id: electionId },
    update: {},
    create: {
      id: electionId,
      organizerId: organizer.id,
      title: "BirdLoud Local Demo Election",
      description: "Synthetic local-only data for exercising organizer and voter flows.",
      status: ElectionStatus.DRAFT,
      campaigns: {
        create: {
          id: campaignId,
          title: "Local Demo Campaign",
          description: "Choose one synthetic option.",
          status: CampaignStatus.DRAFT,
          options: {
            create: [
              {
                id: firstOptionId,
                label: "Option A",
                position: 0
              },
              {
                id: secondOptionId,
                label: "Option B",
                position: 1
              }
            ]
          }
        }
      }
    }
  });

  console.log(`Seeded synthetic organizer ${organizer.email} and draft election ${electionId}.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
