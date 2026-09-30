import { exportLedger, failure } from "@/lib/lab-store";

export async function GET() {
  try { return Response.json(await exportLedger(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}
