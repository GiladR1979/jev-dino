import { readFile, stat } from 'node:fs/promises';
export async function readConfig(env = process.env) {
  const port = Number(env.PORT || 8794);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('PORT must be 1024–65535');
  let key = env.TYPESAFE_API_KEY?.trim() || '';
  if (!key && env.JEV_API_KEY_FILE) {
    const info = await stat(env.JEV_API_KEY_FILE);
    if (!info.isFile() || (process.platform !== 'win32' && info.mode & 0o077))
      throw new Error('Key file must be a private regular file (chmod 600)');
    key = (await readFile(env.JEV_API_KEY_FILE, 'utf8')).trim();
  }
  return { port, key };
}
