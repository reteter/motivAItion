import { randomBytes, createHash } from 'node:crypto';

const accessCode = randomBytes(32).toString('base64url');
const accessCodeHash = createHash('sha256').update(accessCode).digest('hex');

console.log(`Access code: ${accessCode}`);
console.log(`ACCESS_CODE_HASH: ${accessCodeHash}`);
