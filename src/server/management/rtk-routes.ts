import type { ManagementContext } from "./context";
import { saveConfigPreservingClaudeCode } from "../../config/live-reconcile";
import { rtkDashboardStats } from "../../compression/rtk/transport";
import { readManagementJsonBody, rethrowManagementBodyTooLarge } from "./body";

export function rtkSettings(config: ManagementContext["config"]) {
  return { enabled: config.rtk?.enabled === true, stats: rtkDashboardStats() };
}

export async function handleRtkRoutes(ctx: ManagementContext): Promise<Response | null> {
  if (ctx.url.pathname !== "/api/rtk") return null;
  if (ctx.principal !== "admin-token" && ctx.principal !== "gui-session") {
    return Response.json({ code: "authentication_required" }, { status: 401 });
  }
  if (ctx.req.method === "GET") return Response.json(rtkSettings(ctx.config), { headers: { "Cache-Control": "no-store" } });
  if (ctx.req.method !== "PUT") return Response.json({ code: "method_not_allowed" }, { status: 405 });
  let body: unknown;
  try { body = await readManagementJsonBody(ctx.req); }
  catch (error) { rethrowManagementBodyTooLarge(error); return Response.json({ code: "invalid_setting" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
    || typeof (body as { enabled?: unknown }).enabled !== "boolean") {
    return Response.json({ code: "invalid_setting" }, { status: 400 });
  }
  const before = ctx.config.rtk;
  ctx.config.rtk = { enabled: (body as { enabled: boolean }).enabled };
  try { (ctx.deps.saveConfigPreservingClaudeCode ?? saveConfigPreservingClaudeCode)(ctx.config); }
  catch {
    if (before === undefined) delete ctx.config.rtk; else ctx.config.rtk = before;
    return Response.json({ code: "write_failed" }, { status: 500 });
  }
  return Response.json(rtkSettings(ctx.config));
}
