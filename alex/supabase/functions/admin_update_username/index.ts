import { assertAdmin, createAdminClient, handleCors, jsonResponse, readBody, requireUser, writeAudit } from "../_shared/admin.ts";

type Body = {
  user_id: string;
  username: string;
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
    if (!body.user_id || !username) {
      return jsonResponse(400, { error: "user_id and username are required" });
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ username })
      .eq("id", body.user_id);
    if (profileError) return jsonResponse(400, { error: profileError.message });

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(body.user_id, {
      user_metadata: { username },
    });
    if (metadataError) return jsonResponse(400, { error: metadataError.message });

    await writeAudit(adminClient, actor.id, "admin_update_username", { user_id: body.user_id, username });
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(401, { error: e instanceof Error ? e.message : "Unauthorized" });
  }
});
