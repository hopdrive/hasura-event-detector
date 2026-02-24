import crypto from 'node:crypto';

const TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function buildToken(secret: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })
  ).toString('base64url');
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token: string, secret: string): boolean {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) { console.log('[verify] FAIL: missing parts'); return false; }

  const expectedSig = sign(payloadB64, secret);
  console.log('[verify] sig from token:', sig.substring(0, 20));
  console.log('[verify] expected sig: ', expectedSig.substring(0, 20));
  console.log('[verify] sig match:', sig === expectedSig);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  console.log('[verify] sig buf length:', sigBuf.length, 'expected buf length:', expectedBuf.length);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    console.log('[verify] FAIL: signature mismatch');
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    console.log('[verify] payload:', JSON.stringify(payload));
    if (typeof payload.exp !== 'number') { console.log('[verify] FAIL: no exp'); return false; }
    const now = Math.floor(Date.now() / 1000);
    console.log('[verify] exp:', payload.exp, 'now:', now, 'valid:', payload.exp > now);
    return payload.exp > now;
  } catch (e) {
    console.log('[verify] FAIL: parse error', e);
    return false;
  }
}
