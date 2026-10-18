// Only payment callback routes can be resumed from untrusted login URLs.
// These parameters are instructions to server verification, never payment proof.
export function authReturn(search: string): string {
  const candidate = new URLSearchParams(search).get("returnTo");
  if (!candidate || /[\\\r\n]/.test(candidate)) return "/account";
  const path = candidate.split(/[?#]/, 1)[0];
  return ["/checkout/verify", "/account/wallet/verify"].includes(path) ? candidate : "/account";
}

export function authPath(path: string, destination: string): string {
  return destination === "/account" ? path : `${path}?${new URLSearchParams({ returnTo: destination })}`;
}
