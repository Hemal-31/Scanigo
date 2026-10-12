/**
 * Industrial-grade Cookie Utilities for persistent session management and "Remember Me" functionality.
 */

export function setCookie(name, value, days = 30) {
  try {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    const serialized = typeof value === "object" ? JSON.stringify(value) : encodeURIComponent(String(value));
    document.cookie = `${name}=${encodeURIComponent(serialized)}${expires}; path=/; SameSite=Lax`;
  } catch (err) {
    console.warn("Failed to set cookie:", name, err);
  }
}

export function getCookie(name) {
  try {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        const raw = decodeURIComponent(c.substring(nameEQ.length, c.length));
        try {
          return JSON.parse(decodeURIComponent(raw));
        } catch {
          return decodeURIComponent(raw);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to get cookie:", name, err);
  }
  return null;
}

export function deleteCookie(name) {
  try {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
  } catch (err) {
    console.warn("Failed to delete cookie:", name, err);
  }
}
