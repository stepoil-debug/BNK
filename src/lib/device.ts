export interface DeviceFingerprint {
  fingerprint_hash: string;
  user_agent: string;
  platform: string;
  browser_language: string;
  timezone: string;
  screen_resolution: string;
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform || 'unknown';
  const browserLanguage = navigator.language || 'unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const screenResolution = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const raw = [userAgent, platform, browserLanguage, timezone, screenResolution].join('|');

  return {
    fingerprint_hash: await sha256(raw),
    user_agent: userAgent,
    platform,
    browser_language: browserLanguage,
    timezone,
    screen_resolution: screenResolution
  };
}
