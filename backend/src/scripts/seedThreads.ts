import mongoose from 'mongoose';
import { Thread } from '../models/Thread';

// Initial threads data from PRD section 7
const initialThreads = [
  // Threads — Roles/Programs
  { name: 'Blockchain Club FUTMinna Technical Lead', category: 'Role/Program', frequency: 'weekly', status: 'active' },
  { name: 'TEDx FUTMinna Website Manager', category: 'Role/Program', frequency: 'weekly', fixedDay: 2, status: 'active' }, // Wednesday
  { name: 'Wesonline', category: 'Role/Program', frequency: 'weekly', status: 'active' },
  { name: 'AWS Builder Group Technical Lead', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 5, status: 'active' }, // Saturday
  { name: 'Suiaah Learn sessions', category: 'Role/Program', frequency: 'fixed-day', fixedDay: 2, status: 'active' }, // Wednesday
  
  // Threads — Active Builds
  { name: 'Safroi', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Buiry', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Tenaxai', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'Cight', category: 'Active Build', frequency: 'weekly', status: 'active' },
  { name: 'ECAPs R&D', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Agentic Architecture (Engineering/Robotics) R&D', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Prive/PriveStudios', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Pathfinder.io', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'Solar Panel/Renewable Energy R&D', category: 'Active Build', frequency: 'multiple', status: 'active' },
  { name: 'ESS', category: 'Active Build', frequency: 'multiple', status: 'active' },
  
  // Threads — Learning Tracks
  { name: 'Computer Vision', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'HackerRank/LeetCode', category: 'Learning Track', frequency: 'daily', status: 'active' },
  { name: 'Python relearning', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'Nvidia Courses/CUDA', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'System design & architecture', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Backend projects', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Java — RedHat course', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'AI Automation', category: 'Learning Track', frequency: 'weekly', status: 'active' },
  { name: 'Mechatronics skills — Matlab/Proteus/Arduino', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  { name: 'Learning new tech by building with it', category: 'Learning Track', frequency: 'multiple', status: 'active' },
  
  // Threads — Applications/Outreach
  { name: 'Jobs & gigs applications', category: 'Application/Outreach', frequency: 'daily', status: 'active' },
  { name: 'Scholarships/grants applications', category: 'Application/Outreach', frequency: 'daily', status: 'active' },
  { name: 'LinkedIn posting', category: 'Application/Outreach', frequency: 'multiple', status: 'active' },
  { name: 'Huawei Competition prep', category: 'Application/Outreach', frequency: 'multiple', status: 'active' },
  
  // Threads — Other
  { name: 'Kebbi Plan', category: 'Other', frequency: 'weekly', fixedDay: 5, status: 'active' }, // Saturday
];

async function seedThreads() {
  try {
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/workspace';
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing threads (optional - uncomment if you want to clear before seeding)
    // await Thread.deleteMany({});
    // console.log('Cleared existing threads');

    // Insert initial threads
    const createdThreads = await Thread.insertMany(initialThreads);
    console.log(`Successfully seeded ${createdThreads.length} threads:`);
    
    // Log seeded threads by category
    const categories = [...new Set(initialThreads.map(t => t.category))];
    for (const category of categories) {
      const threadsInCategory = createdThreads.filter(t => t.category === category);
      console.log(`  ${category}: ${threadsInCategory.length} threads`);
    }

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding threads:', error);
    process.exit(1);
  }
}

// Run the seeding function
seedThreads();