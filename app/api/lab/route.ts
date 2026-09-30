import { failure, loadState } from "@/lib/lab-store";
export async function GET() {
  try { return Response.json(await loadState(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
