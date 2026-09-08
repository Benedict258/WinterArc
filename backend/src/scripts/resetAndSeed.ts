import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}
loadEnv();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/workspace';

async function resetAndSeed() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  console.log('Connected, dropping database...');
  await db.dropDatabase();
  console.log('Database dropped.');
  // Trigger seed on next connection via server seedIfEmpty
  console.log('Database reset complete. Restart server to seed fresh data.');
  await mongoose.disconnect();
}

resetAndSeed().catch(e => { console.error(e); process.exit(1); });
