import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { toPublicTaskMediaUrl } from "../_shared/taskMediaPublicUrl.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const MAX_FILE_BYTES = parsePositiveInt(Deno.env.get("TASK_MEDIA_MAX_FILE_BYTES"), 5 * 1024 * 1024);
const USER_QUOTA_BYTES = parsePositiveInt(Deno.env.get("TASK_MEDIA_USER_QUOTA_BYTES"), 200 * 1024 * 1024);
const WORKSPACE_QUOTA_BYTES = parsePositiveInt(Deno.env.get("TASK_MEDIA_WORKSPACE_QUOTA_BYTES"), 2 * 1024 * 1024 * 1024);
const TOKEN_TTL_SECONDS = parsePositiveInt(Deno.env.get("TASK_MEDIA_TOKEN_TTL_SECONDS"), 7 * 24 * 60 * 60);

const STORAGE_BUCKET = "task-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour for signed download URLs
const UTF8_HEADER_PREFIX = "utf8:";

const allowedOrigin = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workspace-id, x-file-name",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hexEncode = (bytes: Uint8Array) => Array.from(bytes)
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

const hexDecode = (hex: string) => {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  if (!/^[a-fA-F0-9]*$/.test(clean) || clean.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }
  return bytes;
};

const createRandomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return hexEncode(new Uint8Array(digest));
};

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const sanitizeFileName = (value: string | null) => {
  const rawHeader = (value ?? "").trim();
  if (!rawHeader) return null;

  let raw = rawHeader;
  if (rawHeader.startsWith(UTF8_HEADER_PREFIX)) {
    try {
      raw = decodeURIComponent(rawHeader.slice(UTF8_HEADER_PREFIX.length));
    } catch (_error) {
      raw = rawHeader.slice(UTF8_HEADER_PREFIX.length);
    }
  }

  if (!raw) return null;
  return raw.slice(0, 180);
};

const buildAccessTokenExpiryIso = () => (
  new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString()
);

const parseTimestamp = (value: unknown) => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAuthUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized", status: 401 };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Unauthorized", status: 401 };
  }

  return { user: data.user };
};

const ensureWorkspaceAccess = async (workspaceId: string, userId: string) => {
  const [{ data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    supabaseAdmin
      .from("workspaces")
      .select("id, owner_id")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (workspaceError) {
    return { error: workspaceError.message, status: 400 };
  }
  if (!workspace) {
    return { error: "Workspace not found.", status: 404 };
  }
  if (membershipError) {
    return { error: membershipError.message, status: 400 };
  }

  const isOwner = workspace.owner_id === userId;
  const isMember = Boolean(membership);
  if (!isOwner && !isMember) {
    return { error: "Forbidden", status: 403 };
  }

  return {};
};

const ensureWorkspaceAdminAccess = async (workspaceId: string, userId: string) => {
  const [{ data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    supabaseAdmin
      .from("workspaces")
      .select("id, owner_id")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (workspaceError) {
    return { error: workspaceError.message, status: 400 };
  }
  if (!workspace) {
    return { error: "Workspace not found.", status: 404 };
  }
  if (membershipError) {
    return { error: membershipError.message, status: 400 };
  }

  const isOwner = workspace.owner_id === userId;
  const isAdmin = membership?.role === "admin";
  if (!isOwner && !isAdmin) {
    return { error: "Forbidden", status: 403 };
  }

  return {};
};

const getUsageBytes = async (column: "owner_id" | "workspace_id", id: string) => {
  const { data, error } = await supabaseAdmin.rpc("get_media_usage_bytes", {
    p_column: column,
    p_id: id,
  });
  if (error) {
    return { error: error.message };
  }

  return { usedBytes: typeof data === "number" ? data : 0 };
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Build the storage path: {workspaceId}/{mediaId}.{ext} */
const buildStoragePath = (workspaceId: string, mediaId: string, mimeType: string) => {
  const ext = mimeType.split("/")[1]?.replace(/\+.*$/, "") || "bin";
  return `${workspaceId}/${mediaId}.${ext}`;
};

const createStorageUploadBody = (bytes: Uint8Array, mimeType: string) =>
  new Blob([bytes], {
    type: mimeType || "application/octet-stream",
  });

// ---------------------------------------------------------------------------
// Upload — writes file to Supabase Storage, metadata to task_media table
// ---------------------------------------------------------------------------

const handleUpload = async (req: Request) => {
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env vars" }, 500);
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  const workspaceId = (req.headers.get("x-workspace-id") ?? "").trim();
  if (!workspaceId) {
    return jsonResponse({ error: "x-workspace-id header is required." }, 400);
  }

  const workspaceAccess = await ensureWorkspaceAccess(workspaceId, authResult.user.id);
  if ("error" in workspaceAccess) {
    return jsonResponse({ error: workspaceAccess.error }, workspaceAccess.status ?? 403);
  }

  const mimeType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    return jsonResponse({ error: "Only image uploads are supported." }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch (_error) {
    return jsonResponse({ error: "Invalid binary payload." }, 400);
  }

  if (bytes.byteLength === 0) {
    return jsonResponse({ error: "Empty file." }, 400);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return jsonResponse({ error: `File size limit exceeded (${MAX_FILE_BYTES} bytes).` }, 413);
  }

  // Quota checks
  const userUsageResult = await getUsageBytes("owner_id", authResult.user.id);
  if ("error" in userUsageResult) {
    return jsonResponse({ error: userUsageResult.error }, 400);
  }
  if (userUsageResult.usedBytes + bytes.byteLength > USER_QUOTA_BYTES) {
    return jsonResponse({ error: `User storage quota exceeded (${USER_QUOTA_BYTES} bytes).` }, 413);
  }

  const workspaceUsageResult = await getUsageBytes("workspace_id", workspaceId);
  if ("error" in workspaceUsageResult) {
    return jsonResponse({ error: workspaceUsageResult.error }, 400);
  }
  if (workspaceUsageResult.usedBytes + bytes.byteLength > WORKSPACE_QUOTA_BYTES) {
    return jsonResponse({ error: `Workspace storage quota exceeded (${WORKSPACE_QUOTA_BYTES} bytes).` }, 413);
  }

  // Generate access token
  const accessToken = createRandomToken();
  const accessTokenHash = await sha256Hex(accessToken);
  const accessTokenExpiresAt = buildAccessTokenExpiryIso();
  const fileName = sanitizeFileName(req.headers.get("x-file-name"));

  const mediaId = crypto.randomUUID();
  const storagePath = buildStoragePath(workspaceId, mediaId, mimeType);

  // Upload binary to Supabase Storage
  const { error: storageError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, createStorageUploadBody(bytes, mimeType), {
      contentType: mimeType,
      upsert: false,
    });

  if (storageError) {
    return jsonResponse({ error: `Storage upload failed: ${storageError.message}` }, 500);
  }

  const { error } = await supabaseAdmin
    .from("task_media")
    .insert({
      id: mediaId,
      workspace_id: workspaceId,
      owner_id: authResult.user.id,
      file_name: fileName,
      mime_type: mimeType,
      byte_size: bytes.byteLength,
      storage_path: storagePath,
      access_token_hash: accessTokenHash,
      access_token_expires_at: accessTokenExpiresAt,
    });

  if (error) {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return jsonResponse({ error: error.message ?? "Failed to upload image." }, 400);
  }

  return jsonResponse({
    id: mediaId,
    token: accessToken,
    expiresAt: accessTokenExpiresAt,
    byteSize: bytes.byteLength,
    userUsedBytes: userUsageResult.usedBytes + bytes.byteLength,
  });
};

// ---------------------------------------------------------------------------
// Download — validates token, then serves from Storage (or legacy bytea)
// ---------------------------------------------------------------------------

const handleDownload = async (req: Request, mediaId: string) => {
  const token = (new URL(req.url)).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Missing token." }, 401);
  }

  const { data, error } = await supabaseAdmin
    .from("task_media")
    .select("id, mime_type, storage_path, content, access_token_hash, access_token_expires_at, access_token_revoked_at")
    .eq("id", mediaId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return jsonResponse({ error: "Image not found." }, 404);
  }

  // Validate access token
  const tokenHash = await sha256Hex(token);
  if (!constantTimeEqual(tokenHash, data.access_token_hash ?? "")) {
    return jsonResponse({ error: "Invalid token." }, 401);
  }

  if (data.access_token_revoked_at) {
    return jsonResponse({ error: "Token revoked." }, 401);
  }

  const expiresAt = parseTimestamp(data.access_token_expires_at);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return jsonResponse({ error: "Token expired." }, 401);
  }

  // Track last access (fire-and-forget)
  supabaseAdmin
    .from("task_media")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined)
    .catch(() => undefined);

  // Path A: file is in Supabase Storage (new uploads)
  if (data.storage_path) {
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS);

    if (!signedUrlError && signedUrlData?.signedUrl) {
      const publicSignedUrl = toPublicTaskMediaUrl(signedUrlData.signedUrl, {
        publicBaseUrl: allowedOrigin,
        requestUrl: req.url,
      });
      return Response.redirect(publicSignedUrl, 302);
    }

    if (typeof data.content !== "string") {
      return jsonResponse({ error: "Failed to generate download URL." }, 500);
    }
  }

  // Path B: legacy bytea fallback (old uploads not yet migrated)
  const content = typeof data.content === "string" ? data.content : "";
  const bytes = hexDecode(content);
  if (!bytes) {
    return jsonResponse({ error: "Stored image payload is corrupted." }, 500);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": data.mime_type || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
};

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

const handleRevoke = async (req: Request, mediaId: string) => {
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env vars" }, 500);
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  const { data, error } = await supabaseAdmin
    .from("task_media")
    .select("id, owner_id, workspace_id, access_token_revoked_at")
    .eq("id", mediaId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return jsonResponse({ error: "Image not found." }, 404);
  }

  if (data.owner_id !== authResult.user.id) {
    const adminAccess = await ensureWorkspaceAdminAccess(data.workspace_id, authResult.user.id);
    if ("error" in adminAccess) {
      return jsonResponse({ error: adminAccess.error }, adminAccess.status ?? 403);
    }
  }

  if (data.access_token_revoked_at) {
    return jsonResponse({ success: true, revokedAt: data.access_token_revoked_at });
  }

  const revokedAt = new Date().toISOString();
  const { error: revokeError } = await supabaseAdmin
    .from("task_media")
    .update({ access_token_revoked_at: revokedAt })
    .eq("id", mediaId);

  if (revokeError) {
    return jsonResponse({ error: revokeError.message }, 400);
  }

  return jsonResponse({ success: true, revokedAt });
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  const [, mediaId, action] = path.split("/");

  if (req.method === "POST" && !mediaId) {
    return handleUpload(req);
  }

  if (req.method === "GET" && mediaId) {
    return handleDownload(req, mediaId);
  }

  if (req.method === "POST" && mediaId && action === "revoke") {
    return handleRevoke(req, mediaId);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};

if (import.meta.main) {
  serve(handler);
}
