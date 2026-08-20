// Feynman grading removed — AI is no longer used.
// Explanation saving is handled by PATCH /api/learn/concept.
// This file is kept as a stub so existing client imports don't 404.
export async function POST() {
  return new Response(JSON.stringify({ error: "AI grading has been removed. Save your explanation via the concept route." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
}
