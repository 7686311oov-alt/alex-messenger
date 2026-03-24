import { assertAdmin, createAdminClient, handleCors, jsonResponse, readBody, requireUser, writeAudit } from "../_shared/admin.ts";

type Body = {
  user_id: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const adminClient = createAdminClient();
    const actor = await requireUser(req);
    await assertAdmin(adminClient, actor.id);

    const body = await readBody<Body>(req);
    if (!body.user_id) {
      return jsonResponse(400, { error: "user_id is required" });
    }
    if (body.user_id === actor.id) {
      return jsonResponse(400, { error: "Cannot delete your own account" });
    }

    // Optional cleanup for legacy messages table by username.
    const { data: profile } = await adminClient
      .from("profiles")
      .select("username")
      .eq("id", body.user_id)
      .single();
    if (profile?.username) {
      await adminClient.from("messages").delete().eq("sender", profile.username);
    }

    const { error } = await adminClient.auth.admin.deleteUser(body.user_id);
    if (error) return jsonResponse(400, { error: error.message });

    await writeAudit(adminClient, actor.id, "admin_delete_user", { user_id: body.user_id });
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(401, { error: e instanceof Error ? e.message : "Unauthorized" });
  }
});
