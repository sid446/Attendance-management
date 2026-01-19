# Machine Formats Management

This system allows you to define and manage different attendance machine formats in the database. Each machine format specifies the expected column headers and processing logic.

## Current Machine Formats

### BioMax Attendance Machine (machine1)

- **Headers**: EMP Code, Emp Name, In Time, Out Time, Date
- **Description**: BioMax biometric machine with EMP Code, Emp Name, In Time, Out Time, Date columns. In Time and Out Time may contain date-time strings like "01-12-2025 10:56:00". The system will automatically extract the time portion. Date column should be in DD-MM-YYYY format.

### TimeClock Pro System (machine2)

- **Headers**: ID, Name, Date, In, Out
- **Description**: Standard time clock system with ID, Name, Date, In, Out columns. Uses standard Excel date/time formats.

## Adding New Machine Formats

### Via API (POST /api/machine-formats)

```json
{
  "machineId": "newmachine",
  "name": "New Machine Model",
  "description": "Description of the machine format and any special handling requirements",
  "headers": ["Column1", "Column2", "Column3", "Column4", "Column5"]
}
```

### Via Database Seeding

Add new formats to the `scripts/seed-machine-formats.ts` file and run the seeder.

## Processing Logic

When a new machine format is added, you may need to:

1. Add the format to the database
2. Create/update the processing function in `src/app/page.tsx`
3. Update the processing logic in the main component to handle the new format

Example processing function structure:

```typescript
const processNewMachineFile = async (): Promise<void> => {
  // Similar structure to processMachine1File/processMachine2File
  // - Load XLSX with proper options
  // - Find header row
  // - Map columns based on machine format headers
  // - Parse date/time values
  // - Process and upload records
};
```

## File Structure

- `src/models/MachineFormat.ts` - Database model
- `src/app/api/machine-formats/route.ts` - API endpoints
- `scripts/seed-machine-formats.ts` - Database seeding script
- `src/components/UploadSection.tsx` - UI component (loads formats dynamically)
- `src/app/page.tsx` - Main processing logic
