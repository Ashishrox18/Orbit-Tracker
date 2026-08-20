import { z } from "zod";
import { getLocalUser } from "@/db";
import { handle, UserFacingError } from "@/lib/api";
import { isoDate } from "@/lib/contracts";
import { addWordManual, todaysWords, deleteWord } from "@/services/learn";

// POST — add a word manually
const addInput = z.object({
  date:         isoDate,
  word:         z.string().trim().min(1).max(80),
  meaning:      z.string().trim().min(1).max(500),
  partOfSpeech: z.string().trim().max(40).optional(),
  etymology:    z.string().trim().max(300).optional(),
  example:      z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  return handle(request, addInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    if (!user.onboardedAt) throw new UserFacingError("Finish onboarding first.", 409);
    const word = await addWordManual(user, input.date, {
      word:         input.word,
      meaning:      input.meaning,
      partOfSpeech: input.partOfSpeech ?? null,
      etymology:    input.etymology ?? null,
      examples:     input.example ? [input.example] : [],
    });
    return { word };
  });
}

// PATCH — save user sentence (no AI check, just store)
const sentenceInput = z.object({
  id:       z.string().uuid(),
  sentence: z.string().trim().min(1).max(500),
});

export async function PATCH(request: Request) {
  return handle(request, sentenceInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    const word = await saveUserSentence(user.id, input.id, input.sentence);
    if (!word) throw new UserFacingError("That word no longer exists.", 404);
    return { word };
  });
}

// DELETE — remove a word
const deleteInput = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  return handle(request, deleteInput, { limit: 60 }, async (input) => {
    const user = await getLocalUser();
    await deleteWord(user.id, input.id);
    return { ok: true };
  });
}

// inline helper — no AI, just a DB write
import { db } from "@/db";
import { vocabulary } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function saveUserSentence(userId: string, id: string, sentence: string) {
  const updated = await db
    .update(vocabulary)
    .set({ userSentence: sentence, sentenceVerdict: null, sentenceFeedback: null })
    .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, userId)))
    .returning();
  return updated[0] ?? null;
}
