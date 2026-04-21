// ========================================
// NATIVE FETCH — Replaces cross-fetch in Edge Workers
// cross-fetch uses XMLHttpRequest which doesn't exist in Workers
// This shim uses native Web API globals instead
// ========================================

export const fetch = globalThis.fetch.bind(globalThis);
export const Request = globalThis.Request.bind(globalThis);
export const Headers = globalThis.Headers.bind(globalThis);
export const Response = globalThis.Response.bind(globalThis);
export default fetch;
