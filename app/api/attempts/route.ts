import { failure, readInput, recordAttempt } from "@/lib/lab-store";
export async function POST(request: Request) {
  try { return Response.json(await recordAttempt(await readInput(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
