import mongoose from 'mongoose';
import { startOfDay, addDays } from 'date-fns';
import { Thread } from '../models/Thread';
import { Task } from '../models/Task';
import { generateToday } from '../services/dailyGenerationService';
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

async function test() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('Connected');

  // Clean slate for test threads
  const testThreadDiscrete = await Thread.findOne({ name: 'Blockchain Club FUTMinna Technical Lead' });
  const testThreadContinuous = await Thread.findOne({ name: 'HackerRank/LeetCode' });
  if (!testThreadDiscrete || !testThreadContinuous) {
    console.error('Test threads not found');
    process.exit(1);
  }

  // Ensure no existing unscheduled tasks for these threads
  await Task.deleteMany({ threadId: { $in: [testThreadDiscrete._id, testThreadContinuous._id] }, date: null, timeBlock: 'unscheduled' });

  // Create queued tasks
  const today = startOfDay(new Date());
  const dueDate = addDays(today, 2);
  await Task.create({
    title: 'Discrete queued task',
    threadId: testThreadDiscrete._id,
    date: null,
    timeBlock: 'unscheduled',
    priority: 'high',
    source: 'manual'
  });
  await Task.create({
    title: 'Continuous queued task',
    threadId: testThreadContinuous._id,
    date: null,
    timeBlock: 'unscheduled',
    priority: 'medium',
    source: 'manual'
  });
  await Task.create({
    title: 'Due date task',
    threadId: testThreadContinuous._id,
    date: null,
    timeBlock: 'unscheduled',
    dueDate,
    priority: 'low',
    source: 'manual'
  });

  console.log('Running generateToday for today');
  const results = await generateToday(today);
  console.log('Results:', results);

  const scheduledDiscrete = await Task.find({ threadId: testThreadDiscrete._id, date: today });
  const scheduledContinuous = await Task.find({ threadId: testThreadContinuous._id, date: today });
  console.log('Discrete scheduled count', scheduledDiscrete.length);
  console.log('Continuous scheduled count', scheduledContinuous.length);
  console.log('Scheduled tasks:', [...scheduledDiscrete, ...scheduledContinuous].map(t => ({ title: t.title, dueDate: t.dueDate })));

  // Verify due-date task not scheduled yet? dueDate is +2 days, window is dueDate-3 to dueDate => today is within window? dueDate 2 days ahead => window starts 1 day ago? Actually dueDate-3 = -1 day, so yes eligible.
  // Due-date task should be scheduled with priority over normal? It has low priority but due.
  // Just report.

  await mongoose.disconnect();
  console.log('Test complete');
}
test().catch(e => { console.error(e); process.exit(1); });
