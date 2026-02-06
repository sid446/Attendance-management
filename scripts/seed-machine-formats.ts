import dbConnect from '@/lib/mongodb';
import MachineFormat from '@/models/MachineFormat';

async function seedMachineFormats() {
  try {
    await dbConnect();

    // Check if formats already exist
    const existingFormats = await MachineFormat.countDocuments();
    if (existingFormats > 0) {
      console.log('Machine formats already seeded');
      return;
    }

    const formats = [
      {
        machineId: 'machine1',
        name: 'BioMax Attendance Machine',
        description: 'BioMax biometric machine with User ID, Full Name, Date, Out, In columns. Edited times are set automatically during upload and can be modified later through employee correction requests.',
        headers: ['User ID', 'Full Name', 'Date', 'Out', 'In']
      },
      {
        machineId: 'machine2',
        name: 'TimeClock Pro System',
        description: 'Standard time clock system with ID, Name, Date, In, Out columns. Uses standard Excel date/time formats. Edited times are set automatically during upload and can be modified later through employee correction requests.',
        headers: ['ID', 'Name', 'Date', 'In', 'Out', 'Edited In', 'Edited Out']
      }
    ];

    await MachineFormat.insertMany(formats);
    console.log('Machine formats seeded successfully');
  } catch (error) {
    console.error('Error seeding machine formats:', error);
  } finally {
    process.exit(0);
  }
}

seedMachineFormats();