'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const { parseAgeRecipient, createS3Uploader, encryptWithAge } = require('./encryption');

const RECIPIENT = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';

const makeDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'backup-encryption-'));

const makeUploader = async (recipientConfig) => {
  const tmpDir = await makeDir();
  const calls = { puts: [], encrypts: [] };
  const upload = createS3Uploader({
    recipientConfig,
    tmpDir,
    fs,
    path,
    put: async (filePath, key) => {
      calls.puts.push([key, await fs.readFile(filePath, 'utf8')]);
    },
    encryptFile: async (src, dst, recipient) => {
      calls.encrypts.push(recipient);
      await fs.writeFile(dst, `ENC(${await fs.readFile(src, 'utf8')})`);
    },
  });
  return { upload, calls, tmpDir };
};

test('parseAgeRecipient: empty is off, a valid key is accepted, anything else is invalid', () => {
  assert.deepEqual(parseAgeRecipient(''), { kind: 'off' });
  assert.deepEqual(parseAgeRecipient(undefined), { kind: 'off' });
  assert.deepEqual(parseAgeRecipient(`  ${RECIPIENT}\n`), { kind: 'age', recipient: RECIPIENT });
  assert.equal(parseAgeRecipient('AGE-SECRET-KEY-1QQQ').kind, 'invalid');
  assert.equal(parseAgeRecipient('age1short').kind, 'invalid');
});

test('encryption off: the file goes up as is, under its own key', async () => {
  const src = path.join(await makeDir(), 'daily.dump');
  await fs.writeFile(src, 'PGDMP');
  const { upload, calls } = await makeUploader({ kind: 'off' });

  assert.equal(await upload(src, 'daily.dump'), 'daily.dump');
  assert.deepEqual(calls.puts, [['daily.dump', 'PGDMP']]);
  assert.deepEqual(calls.encrypts, []);
});

test('encryption on: only ciphertext goes up, as <key>.age, and the temp file is gone', async () => {
  const src = path.join(await makeDir(), 'daily.dump');
  await fs.writeFile(src, 'PGDMP');
  const { upload, calls, tmpDir } = await makeUploader({ kind: 'age', recipient: RECIPIENT });

  assert.equal(await upload(src, 'daily.dump'), 'daily.dump.age');
  assert.deepEqual(calls.puts, [['daily.dump.age', 'ENC(PGDMP)']]);
  assert.deepEqual(calls.encrypts, [RECIPIENT]);
  assert.deepEqual(await fs.readdir(tmpDir), []);
  assert.equal(await fs.readFile(src, 'utf8'), 'PGDMP'); // the local copy stays readable
});

test('encryption on: a failed upload still removes the temp file', async () => {
  const src = path.join(await makeDir(), 'daily.dump');
  await fs.writeFile(src, 'PGDMP');
  const tmpDir = await makeDir();
  const upload = createS3Uploader({
    recipientConfig: { kind: 'age', recipient: RECIPIENT },
    tmpDir,
    fs,
    path,
    put: async () => { throw new Error('S3 down'); },
    encryptFile: async (_src, dst) => { await fs.writeFile(dst, 'x'); },
  });
  await assert.rejects(upload(src, 'daily.dump'), /S3 down/);
  assert.deepEqual(await fs.readdir(tmpDir), []);
});

test('invalid recipient: refuses to upload anything rather than sending plaintext', async () => {
  const src = path.join(await makeDir(), 'daily.dump');
  await fs.writeFile(src, 'PGDMP');
  const { upload, calls } = await makeUploader({ kind: 'invalid', reason: 'not an age public key' });

  await assert.rejects(upload(src, 'daily.dump'), /BACKUP_AGE_RECIPIENT.*not an age public key/);
  assert.deepEqual(calls.puts, []);
});

const hasAge = (() => {
  try { execFileSync('age', ['--version'], { stdio: 'ignore' }); return true; } catch (_e) { return false; }
})();

test('encryptWithAge: real round trip through the age CLI', { skip: !hasAge && 'age CLI not installed' }, async () => {
  const dir = await makeDir();
  const identity = path.join(dir, 'key.txt');
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();
  const src = path.join(dir, 'plain.bin');
  await fs.writeFile(src, 'secret rows');

  await encryptWithAge(promisify(execFile))(src, path.join(dir, 'plain.bin.age'), recipient);
  const decrypted = execFileSync('age', ['--decrypt', '-i', identity, path.join(dir, 'plain.bin.age')], { encoding: 'utf8' });
  assert.equal(decrypted, 'secret rows');
  assert.ok(!(await fs.readFile(path.join(dir, 'plain.bin.age'))).includes('secret rows'));
});
