// Test script to add a new machine format
async function testAddMachine() {
  try {
    const response = await fetch("http://localhost:3000/api/machine-formats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        machineId: "machine3",
        name: "Test Machine",
        description: "A test machine format",
        headers: ["ID", "Name", "Date", "Time"],
      }),
    });

    const result = await response.json();
    console.log("Add Machine Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testAddMachine();
