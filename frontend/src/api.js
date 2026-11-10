export async function apiRequest(endpoint, options = {}, onWakeup) {
  let timer = null;
  if (onWakeup) {
    timer = setTimeout(() => onWakeup(true), 5000);
  }

  try {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const body = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      body
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: {
        success: false,
        error: { message: 'Network connection error. Is the server running?' }
      }
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
      if (onWakeup) onWakeup(false);
    }
  }
}
