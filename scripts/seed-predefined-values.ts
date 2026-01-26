import 'dotenv/config';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import PredefinedValues from '@/models/PredefinedValues';

async function seedPredefinedValues() {
  try {
    console.log('Connecting to database...');
    await connectToDatabase();
    console.log('Connected successfully');

    // Get all unique values from existing users
    console.log('Fetching existing users...');
    const users = await User.find({});

    const teams = new Set<string>();
    const designations = new Set<string>();
    const paidFrom = new Set<string>();
    const categories = new Set<string>();

    users.forEach((user) => {
      if (user.workingUnderPartner) teams.add(user.workingUnderPartner);
      if (user.designation) designations.add(user.designation);
      if (user.paidFrom) paidFrom.add(user.paidFrom);
      if (user.category) categories.add(user.category);
    });

    console.log(`Found ${users.length} users`);
    console.log(`Extracted values: teams(${teams.size}), designations(${designations.size}), paidFrom(${paidFrom.size}), categories(${categories.size})`);

    // Clear existing predefined values
    console.log('Clearing existing predefined values...');
    await PredefinedValues.deleteMany({});

    // Seed the predefined values
    const predefinedData = [
      {
        type: 'teams' as const,
        values: Array.from(teams).sort()
      },
      {
        type: 'designations' as const,
        values: Array.from(designations).sort()
      },
      {
        type: 'paidFrom' as const,
        values: Array.from(paidFrom).sort()
      },
      {
        type: 'categories' as const,
        values: Array.from(categories).sort()
      }
    ];

    console.log('Seeding predefined values...');
    for (const data of predefinedData) {
      await PredefinedValues.create(data);
      console.log(`✓ Seeded ${data.type}: ${data.values.length} values`);
    }

    console.log('Seeding completed successfully!');

    // Verify the data
    const allValues = await PredefinedValues.getAllValues();
    console.log('Verification:');
    console.log(`- Teams: ${allValues.teams.length} values`);
    console.log(`- Designations: ${allValues.designations.length} values`);
    console.log(`- Paid From: ${allValues.paidFrom.length} values`);
    console.log(`- Categories: ${allValues.categories.length} values`);

  } catch (error) {
    console.error('Error seeding predefined values:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the seed function
seedPredefinedValues();