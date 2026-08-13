import { createHash, randomInt } from 'node:crypto';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const accessCode = Array.from(
  { length: 43 },
  () => alphabet[randomInt(alphabet.length)],
).join('');
const accessCodeHash = createHash('sha256').update(accessCode).digest('hex');
const groupedAccessCode = accessCode.match(/.{1,4}/g)?.join(' ') ?? accessCode;

console.log(`Access code: ${accessCode}`);
console.log(`Manual entry: ${groupedAccessCode}`);
console.log(`ACCESS_CODE_HASH: ${accessCodeHash}`);
