import { assertAdmin, createAdminClient, handleCors, jsonResponse, readBody, requireUser, writeAudit } from "../_shared/admin.ts";

type Body = {
  user_id: string;
  is_admin: boolean;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const adminClient = createAdminClient();
    const actor = await requireUser(req);
    await assertAdmin(adminClient, actor.id);

    const body = await readBody<Body>(req);
    if (!body.user_id || typeof body.is_admin !== "boolean") {
      return jsonResponse(400, { error: "user_id and is_admin are required" });
    }

    const { error } = await adminClient
      .from("profiles")
      .update({ is_admin: body.is_admin })
      .eq("id", body.user_id);
    if (error) return jsonResponse(400, { error: error.message });

    await writeAudit(adminClient, actor.id, "admin_set_role", body);
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(401, { error: e instanceof Error ? e.message : "Unauthorized" });
  }
});
