// Test bootstrap for the official local Edge Runtime; never deployed with the app.
// The CLI's Windows stdin archive copy is not required with source passed by environment.
const serve = Deno.serve.bind(Deno);
const authFetch = globalThis.fetch;
const serviceUrl = Deno.env.get("SUPABASE_URL")!;
if (serviceUrl !== "http://supabase_kong_studyhub-staging:8000") throw new Error("Local staging only");
Deno.serve = (handler: any) => serve(async (request: Request) => {
  if (request.method === "OPTIONS") return handler(request);
  const response = await authFetch(`${serviceUrl}/auth/v1/user`, {headers:{apikey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,Authorization:request.headers.get("Authorization") || ""}});
  if (!response.ok) return Response.json({message:"Authenticated synthetic user required"},{status:401});
  return handler(request);
});
await import("./transport.ts");
