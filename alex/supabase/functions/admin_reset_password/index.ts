import { assertAdmin, createAdminClient, handleCors, jsonResponse, readBody, requireUser, writeAudit } from "../_shared/admin.ts";

type Body = {
  user_id: string;
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
    const password = (body.password || "").trim();
    if (!body.user_id || password.length < 3) {
      return jsonResponse(400, { error: "user_id and password(>=3) are required" });
    }

    const { error } = await adminClient.auth.admin.updateUserById(body.user_id, { password });
    if (error) return jsonResponse(400, { error: error.message });

    await writeAudit(adminClient, actor.id, "admin_reset_password", { user_id: body.user_id });
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(401, { error: e instanceof Error ? e.message : "Unauthorized" });
  }
});
