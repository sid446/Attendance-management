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
        description: 'BioMax biometric machine with EMP Code, Emp Name, In Time, Out Time, Date columns. In Time and Out Time may contain date-time strings like "01-12-2025 10:56:00".',
        headers: ['EMP Code', 'Emp Name', 'In Time', 'Out Time', 'Date']
      },
      {
        machineId: 'machine2',
        name: 'TimeClock Pro System',
        description: 'Standard time clock system with ID, Name, Date, In, Out columns. Uses standard Excel date/time formats.',
        headers: ['ID', 'Name', 'Date', 'In', 'Out']
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