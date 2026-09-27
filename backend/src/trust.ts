// ─────────────────────────────────────────────────────────────────────────────
//  One definition of the request trust boundary.
//
//  Every POST in this API accepts an ALLOWLIST of body fields and nothing else.
//  A commit, a branch, a path, a command, an executable, a cwd or a result-file
//  path sent by a client is rejected here, before any router looks at it, and the
//  rejection names the offending KEYS only — a value is never echoed back, so a
//  rejected field cannot become a reflected injection point in the error body.
//
//  This exists as a shared function because there are now two POST routes that
//  need the identical guard (create a checkpoint run, execute a modernization).
//  Two copies of a security primitive is two things to audit and two things to
//  forget; one function is one.
// ─────────────────────────────────────────────────────────────────────────────

export type BodyRejection = {
  ok: false;
  status: 400 | 413;
  code: string;
  message: string;
};

export type BodyAcceptance = { ok: true; value: Record<string, unknown> };

/**
 * Validate `req.body` against a field allowlist.
 *
 * Fail-closed on every oddity: a non-object body, an array, or null are all
 * rejections rather than a value to be inspected defensively later.
 */
export function readBody(body: unknown, allowed: readonly string[]): BodyAcceptance | BodyRejection {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_BODY",
      message: "Send a JSON object with the documented fields only.",
    };
  }

  const keys = Object.keys(body as Record<string, unknown>);
  const unexpected = keys.filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    return {
      ok: false,
      status: 400,
      code: "UNEXPECTED_FIELD",
      message: `This endpoint accepts only ${allowed.join(", ")}. Rejected: ${unexpected.join(", ")}.`,
    };
  }

  return { ok: true, value: body as Record<string, unknown> };
}

/** A required string field. Returns the trimmed value or null. */
export function requireText(
  value: unknown,
  field: string,
  code: string,
): { ok: true; value: string } | { ok: false; status: 400; code: string; message: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, status: 400, code, message: `${field} is required.` };
  }
  return { ok: true, value: value.trim() };
}
