const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function hostnameOf(value: string, withScheme: boolean): string | null {
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/** Guards against DNS rebinding: the Host header must name the loopback interface. */
export function isLocalHost(host: string | undefined): boolean {
  const hostname = host ? hostnameOf(host, false) : null;
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}

/** Guards against cross-site requests from browsers. Non-browser clients send no Origin. */
export function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const hostname = hostnameOf(origin, true);
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}
