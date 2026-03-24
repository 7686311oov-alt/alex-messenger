import { createAdminClient, assertAdmin, handleCors, jsonResponse, readBody, requireUser, writeAudit } from "../_shared/admin.ts";

type Body = {
  username: string;
  password: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const adminClient = createAdminClient();
    const actor = await requireUser(req);
    await assertAdmin(adminClient, actor.id);

    const body = await readBody<Body>(req);
    const username = (body.username || "").trim();
    const password = (body.password || "").trim();
    if (!username || password.length < 3) {
      return jsonResponse(400, { error: "username and password are required" });
    }

    const emailDomain = Deno.env.get("AUTH_EMAIL_DOMAIN") || "alex.local";
    const email = `${username}@${emailDomain}`;

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createError) return jsonResponse(400, { error: createError.message });

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: created.user.id,
      username,
      is_admin: false,
      created_at: new Date().toISOString(),
    });
    if (profileError) return jsonResponse(400, { error: profileError.message });

    await writeAudit(adminClient, actor.id, "admin_create_user", { user_id: created.user.id, username });
    return jsonResponse(200, { ok: true, user_id: created.user.id, username });
  } catch (e) {
    return jsonResponse(401, { error: e instanceof Error ? e.message : "Unauthorized" });
  }
});
