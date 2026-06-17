const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => { reject(err); });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  try {
    const patientToken = 'mock-uid-patient';
    const expertToken = 'mock-uid-expert';
    let requestId = null;

    console.log("=== HealthGuard Expert Review API End-to-End Test ===");

    // Step 1: Register mock expert
    console.log("\n1. Registering verified expert...");
    const regData = JSON.stringify({
      name: "Dr. Alexander Fleming",
      role: "doctor",
      specialization: "Clinical Immunology"
    });
    const regRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/mock-expert-signup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expertToken}`,
        'Content-Length': Buffer.byteLength(regData)
      }
    }, regData);
    console.log("Status:", regRes.statusCode, "Body:", regRes.body);

    // Step 2: Set up user profile
    console.log("\n2. Creating patient profile...");
    const profileData = JSON.stringify({
      age: 45,
      gender: "male",
      heightCm: 175,
      weightKg: 85,
      smoking: "former",
      exercise: "light",
      familyHistory: "Type 2 Diabetes",
      symptoms: "Mild hypertension",
      alcohol: "never",
      diseases: "",
      language: "en"
    });
    const profileRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/profile',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`,
        'Content-Length': Buffer.byteLength(profileData)
      }
    }, profileData);
    console.log("Status:", profileRes.statusCode);

    // Step 3: Create expert review request
    console.log("\n3. Submitting expert review request...");
    const reqRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/request',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });
    console.log("Status:", reqRes.statusCode, "Body:", reqRes.body);
    const reqBody = JSON.parse(reqRes.body);
    requestId = reqBody.requestId;
    if (!requestId) {
      throw new Error("Failed to retrieve requestId from response!");
    }

    // Step 4: Verify duplicate request gets blocked
    console.log("\n4. Verifying duplicate request blocking...");
    const dupRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/request',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });
    console.log("Status (expecting 400):", dupRes.statusCode, "Body:", dupRes.body);

    // Step 5: Get my requests as patient
    console.log("\n5. Fetching patient requests list...");
    const myReqRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/my-requests',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });
    console.log("Status:", myReqRes.statusCode, "Found Requests:", JSON.parse(myReqRes.body).requests.length);

    // Step 6: Security check - unauthorized expert endpoint access
    console.log("\n6. Testing unauthorized expert access...");
    const unauthRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/pending',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });
    console.log("Status (expecting 403):", unauthRes.statusCode, "Body:", unauthRes.body);

    // Step 7: Get pending reviews as expert
    console.log("\n7. Fetching pending reviews as expert...");
    const pendingRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/expert-review/pending',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${expertToken}`
      }
    });
    console.log("Status:", pendingRes.statusCode, "Pending count:", JSON.parse(pendingRes.body).requests.length);

    // Step 8: Accept review request as expert
    console.log("\n8. Accepting review request...");
    const acceptRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/expert-review/${requestId}/accept`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${expertToken}`
      }
    });
    console.log("Status:", acceptRes.statusCode, "Body:", acceptRes.body);

    // Step 9: Send chat messages
    console.log("\n9. Exchanging real-time chat messages...");
    
    // Patient sends message
    const msg1Data = JSON.stringify({ message: "Hello Doctor, what do you think of my high glycemic factors?", senderRole: "user" });
    const msg1Res = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/expert-review/${requestId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`,
        'Content-Length': Buffer.byteLength(msg1Data)
      }
    }, msg1Data);
    console.log("Patient message sent status:", msg1Res.statusCode);

    // Expert sends message
    const msg2Data = JSON.stringify({ message: "Hello. I see high family indicators. We should focus on limiting simple carbs and regular cardio.", senderRole: "expert" });
    const msg2Res = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/expert-review/${requestId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expertToken}`,
        'Content-Length': Buffer.byteLength(msg2Data)
      }
    }, msg2Data);
    console.log("Expert message sent status:", msg2Res.statusCode);

    // Step 10: Fetch messages transcript
    console.log("\n10. Fetching chat messages transcript...");
    const msgListRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/expert-review/${requestId}/messages`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });
    console.log("Status:", msgListRes.statusCode);
    const messages = JSON.parse(msgListRes.body).messages;
    messages.forEach(m => {
      console.log(`[${m.senderRole.toUpperCase()}] ${m.message}`);
    });

    // Step 11: Complete the review
    console.log("\n11. Completing the expert review...");
    const compRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/expert-review/${requestId}/complete`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${expertToken}`
      }
    });
    console.log("Status:", compRes.statusCode, "Body:", compRes.body);

    console.log("\n=== End-to-End API Test Finished Successfully ===");
  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

run();
