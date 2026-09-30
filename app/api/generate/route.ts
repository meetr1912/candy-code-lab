import { failure, generate, readInput } from "@/lib/lab-store";
export async function POST(request: Request) {
  try { return Response.json(await generate(await readInput(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
