async function testMachineFormatsAPI() {
  try {
    const response = await fetch("http://localhost:3000/api/machine-formats");
    const data = await response.json();
    console.log("API Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error testing API:", error.message);
  }
}

testMachineFormatsAPI();
