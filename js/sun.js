// Solar position (after the SunCalc algorithm, accurate to well under a degree).
const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = ms => ms / dayMs - 0.5 + J1970 - J2000;

function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  return { dec: Math.asin(Math.sin(e) * Math.sin(L)), ra: Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L)) };
}

/** azimuth: radians from south, positive towards west. altitude: radians above horizon. */
export function sunPosition(ms, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(ms), c = sunCoords(d);
  const H = rad * (280.16 + 360.9856235 * d) - lw - c.ra;
  return {
    azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)),
    altitude: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
  };
}

/** India Standard Time wall clock -> epoch ms. */
export const istMs = (y, m, d, hour) => Date.UTC(y, m, d) + (hour - 5.5) * 36e5;

/** Scene convention: north = -Z, east = +X, up = +Y. */
export function sunDirection({ azimuth, altitude }) {
  const ca = Math.cos(altitude);
  return { x: -Math.sin(azimuth) * ca, y: Math.sin(altitude), z: Math.cos(azimuth) * ca };
}

export function sunTimes(y, m, d, lat, lng) {
  let rise = null, set = null, prev = null;
  for (let mi = 240; mi <= 1320; mi += 1) {
    const a = sunPosition(istMs(y, m, d, mi / 60), lat, lng).altitude + 0.833 * rad;
    if (prev !== null) {
      if (prev < 0 && a >= 0) rise = mi / 60;
      if (prev >= 0 && a < 0) set = mi / 60;
    }
    prev = a;
  }
  return { rise, set };
}

const NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const bearingName = az => NAMES[Math.round((((az / rad + 180) % 360) + 360) % 360 / 45) % 8];
export const toDeg = r => r / rad;

export function fmtHour(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60) % 60, carry = Math.round((h - hh) * 60) === 60 ? 1 : 0;
  const H = hh + carry, ap = H >= 12 ? 'PM' : 'AM', h12 = ((H + 11) % 12) + 1;
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ap}`;
}
