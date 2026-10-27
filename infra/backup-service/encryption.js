'use strict';

// Encryption of everything that leaves the server for S3. The server holds
// only the age PUBLIC key (BACKUP_AGE_RECIPIENT): it can encrypt but never
// decrypt, so a leaked bucket or S3 key exposes nothing. The private key lives
// with the owner, off the server; without it the S3 copies cannot be restored.
// Local copies under /backups stay plain — the server already holds the live
// data, and the in-app restore reads them.

// age X25519 recipient: "age1" + 58 bech32 characters.
const AGE_RECIPIENT_PATTERN = /^age1[02-9ac-hj-np-z]{58}$/;

// Parsed once at startup: { kind: 'off' } | { kind: 'age', recipient } | { kind: 'invalid', reason }
const parseAgeRecipient = (raw) => {
  const value = (raw || '').trim();
  if (!value) return { kind: 'off' };
  if (!AGE_RECIPIENT_PATTERN.test(value)) {
    return { kind: 'invalid', reason: 'not an age public key (expected age1… from `age-keygen -y`)' };
  }
  return { kind: 'age', recipient: value };
};

const encryptWithAge = (execFileAsync) => (src, dst, recipient) => execFileAsync('age', [
  '--encrypt',
  '--recipient', recipient,
  '--output', dst,
  src,
]);

let tmpCounter = 0;

// Returns upload(filePath, key) → the S3 key actually written. Encrypted
// objects get a ".age" suffix so a restore can tell them apart. An invalid
// recipient refuses every upload: sending plaintext because of a typo would
// silently undo the protection.
// deps: { recipientConfig, tmpDir, fs, path, put(filePath, key), encryptFile(src, dst, recipient) }
const createS3Uploader = ({ recipientConfig, tmpDir, fs, path, put, encryptFile }) => async (filePath, key) => {
  if (recipientConfig.kind === 'invalid') {
    throw new Error(`BACKUP_AGE_RECIPIENT is set but unusable: ${recipientConfig.reason}`);
  }
  if (recipientConfig.kind === 'off') {
    await put(filePath, key);
    return key;
  }
  await fs.mkdir(tmpDir, { recursive: true });
  tmpCounter += 1;
  const encryptedPath = path.join(tmpDir, `upload-${process.pid}-${tmpCounter}.age`);
  try {
    await encryptFile(filePath, encryptedPath, recipientConfig.recipient);
    await put(encryptedPath, `${key}.age`);
  } finally {
    await fs.unlink(encryptedPath).catch(() => {});
  }
  return `${key}.age`;
};

module.exports = { parseAgeRecipient, encryptWithAge, createS3Uploader };
