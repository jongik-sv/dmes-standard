function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function encodeValue(raw: string): string {
  if (typeof btoa !== "function") {
    return raw;
  }

  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeValue(encoded: string): string {
  if (typeof atob !== "function") {
    return encoded;
  }

  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function readSecureJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  const encoded = window.localStorage.getItem(key);
  if (!encoded) {
    return null;
  }

  try {
    return JSON.parse(decodeValue(encoded)) as T;
  } catch {
    return null;
  }
}

export function writeSecureJson<T>(key: string, value: T): void {
  if (!canUseStorage()) {
    return;
  }

  const serialized = JSON.stringify(value);
  window.localStorage.setItem(key, encodeValue(serialized));
}

export function removeSecureValue(key: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
}
