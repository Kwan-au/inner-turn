export const config = { path: "/api/pageview" };

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  let path = "/";
  let ref = "";
  try {
    const body = await req.json();
    path = String(body.path || "/").slice(0, 180);
    ref = String(body.ref || "").slice(0, 180);
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify({ kind: "pageview", path, ref }));
  return new Response(null, { status: 204 });
};
