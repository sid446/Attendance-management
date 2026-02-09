import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function updateMachineFormats() {
  // Dynamic imports after dotenv is loaded
  const { default: dbConnect } = await import('@/lib/mongodb');
  const { default: MachineFormat } = await import('@/models/MachineFormat');
  
  try {
    await dbConnect();

    // Update Machine 2
    const result2 = await MachineFormat.findOneAndUpdate(
      { machineId: 'machine2' },
      {
        $set: {
          name: 'TimeClock Pro System',
          description: 'Complex multi-date format: Report header rows, then repeating "Date :" markers followed by header row (Emp Name, In Time, Out Time) and attendance records for each date. Time format: 01-01-1900 HH:MM:SS',
          headers: ['Emp Name', 'In Time', 'Out Time']
        }
      },
      { new: true }
    );

    if (result2) {
      console.log('Machine2 format updated successfully:');
      console.log(JSON.stringify(result2, null, 2));
    } else {
      console.log('Machine2 format not found.');
    }

    // Add or Update Machine 3
    const result3 = await MachineFormat.findOneAndUpdate(
      { machineId: 'machine3' },
      {
        $set: {
          machineId: 'machine3',
          name: 'Asija Attendance System',
          description: 'Multi-date format with Location row. Similar to Machine 2 but with actual dates in time fields (DD-MM-YYYY HH:MM:SS). Headers: Emp Name, In Time, Out Time.',
          headers: ['Emp Name', 'In Time', 'Out Time'],
          isActive: true
        }
      },
      { new: true, upsert: true }
    );

    console.log('Machine3 format added/updated successfully:');
    console.log(JSON.stringify(result3, null, 2));

  } catch (error) {
    console.error('Error updating machine formats:', error);
  } finally {
    process.exit(0);
  }
}

updateMachineFormats();
