import mongoose from 'mongoose';
import { Thread } from '../models/Thread';
import * as fs from 'fs';
import * as path from 'path';

// Simple .env loader
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

type ThreadMapping = { name: string; taskMode: 'discrete' | 'continuous' };

const discreteThreads: ThreadMapping[] = [
  { name: 'Blockchain Club FUTMinna Technical Lead', taskMode: 'discrete' },
  { name: 'TEDx FUTMinna Website Manager', taskMode: 'discrete' },
  { name: 'AWS Builder Group Technical Lead', taskMode: 'discrete' },
  { name: 'Suiaah Learn sessions', taskMode: 'discrete' },
  { name: 'Wesonline', taskMode: 'discrete' },
  { name: 'Safroi', taskMode: 'discrete' },
  { name: 'Buiry', taskMode: 'discrete' },
  { name: 'Tenaxai', taskMode: 'discrete' },
  { name: 'Cight', taskMode: 'discrete' },
  { name: 'ECAPs R&D', taskMode: 'discrete' },
  { name: 'Agentic Architecture (Engineering/Robotics) R&D', taskMode: 'discrete' },
  { name: 'Prive/PriveStudios', taskMode: 'discrete' },
  { name: 'Pathfinder.io', taskMode: 'discrete' },
  { name: 'ESS', taskMode: 'discrete' },
  { name: 'Huawei Competition prep', taskMode: 'discrete' },
];

const continuousThreads: ThreadMapping[] = [
  { name: 'HackerRank/LeetCode', taskMode: 'continuous' },
  { name: 'Python relearning', taskMode: 'continuous' },
  { name: 'Nvidia Courses/CUDA', taskMode: 'continuous' },
  { name: 'Java — RedHat course', taskMode: 'continuous' },
  { name: 'System design & architecture', taskMode: 'continuous' },
  { name: 'Backend projects', taskMode: 'continuous' },
  { name: 'AI Automation', taskMode: 'continuous' },
  { name: 'Computer Vision', taskMode: 'continuous' },
  { name: 'Mechatronics skills — Matlab/Proteus/Arduino', taskMode: 'continuous' },
  { name: 'Learning new tech by building with it', taskMode: 'continuous' },
  { name: 'Solar Panel/Renewable Energy R&D', taskMode: 'continuous' },
  { name: 'Jobs & gigs applications', taskMode: 'continuous' },
  { name: 'Scholarships/grants applications', taskMode: 'continuous' },
  { name: 'LinkedIn posting', taskMode: 'continuous' },
  { name: 'Kebbi Plan', taskMode: 'continuous' },
];

const allMappings = [...discreteThreads, ...continuousThreads];

async function migrateTaskMode() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    let updated = 0;
    let notFound = 0;

    for (const { name, taskMode } of allMappings) {
      const result = await Thread.collection.updateOne(
        { name },
        { $set: { taskMode } }
      );
      if (result.matchedCount === 0) {
        console.warn(`⚠️  Thread not found: "${name}"`);
        notFound++;
      } else {
        console.log(`✓ Updated "${name}" → taskMode: ${taskMode}`);
        updated++;
      }
    }

    console.log(`\nMigration complete: ${updated} updated, ${notFound} not found`);
  } catch (error) {
    console.error('Error migrating taskMode:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateTaskMode();
}

export { migrateTaskMode };
