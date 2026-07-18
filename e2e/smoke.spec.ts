import { test, expect } from "playwright/test";

test.describe("HealthGuard AI E2E Smoke Suite", () => {
  test("Full User Session Flow", async ({ page }) => {
    // 1. LANDING PAGE LOAD
    console.log("Step 1: Navigating to landing page...");
    await page.goto("/");
    await expect(page).toHaveTitle(/HealthGuard/);
    
    const branding = page.locator("text=HealthGuard").first();
    await expect(branding).toBeVisible();

    // Navigate to Signup page
    console.log("Step 2: Navigating to signup page...");
    await page.goto("/signup");
    await expect(page).toHaveURL(/.*signup/);

    // 2. ONBOARDING REGISTRATION
    console.log("Step 3: Registering new user...");
    const testEmail = `smoke-user-${Date.now()}@example.com`;
    const testPassword = "SmokePassword123!";

    await page.fill("input#name", "Smoke Test Patient");
    await page.fill("input#email", testEmail);
    await page.fill("input#password", testPassword);
    await page.fill("input#confirmPassword", testPassword);

    await page.click('button[type="submit"]');

    // 3. WIZARD ASSESSMENT
    console.log("Step 4: Completing assessment questionnaire...");
    // Wait for redirect to assessment page
    await page.waitForURL("**/assessment**", { timeout: 15000 });

    // Step 1: Demographics (Default values: age 35, weight 72, height 170)
    await expect(page.locator("text=Step 1 of 4")).toBeVisible();
    await page.click("button:has-text('Continue')");

    // Step 2: Lifestyle (Default values: never smoked, light exercise)
    await expect(page.locator("text=Step 2 of 4")).toBeVisible();
    await page.click("button:has-text('Continue')");

    // Step 3: Family History
    await expect(page.locator("text=Step 3 of 4")).toBeVisible();
    await page.fill('textarea[name="familyHistory"]', "Mother has type 2 diabetes");
    await page.click("button:has-text('Continue')");

    // Step 4: Symptoms & Submission
    await expect(page.locator("text=Step 4 of 4")).toBeVisible();
    await page.fill('textarea[name="symptoms"]', "Occasional thirst and dry mouth");
    
    // Disclaimers verification
    const disclaimer = page.locator("text=educational health risk assessments");
    await expect(disclaimer).toBeVisible();

    console.log("Submitting assessment wizard...");
    await page.click("button:has-text('Generate')");

    // 4. VERIFY RESULTS RENDERED
    console.log("Step 5: Verifying dashboard risk results render...");
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    
    // Assert 3 V1 clinical condition risk cards
    await expect(page.locator("text=Diabetes")).toBeVisible();
    await expect(page.locator("text=Heart Disease")).toBeVisible();
    await expect(page.locator("text=Hypertension")).toBeVisible();

    // Verify lack of ML risk cards/claims
    const mlCard = page.locator("text=Machine Learning");
    await expect(mlCard).not.toBeVisible();

    // 5. INSPECT LIFESTYLE IMPACT & ACTION PRIORITIES CARDS
    console.log("Step 6: Inspecting dashboard details...");
    await expect(page.locator("text=Lifestyle Impact")).toBeVisible();
    await expect(page.locator("text=Action Priorities")).toBeVisible();
    await expect(page.locator("text=Expert Review")).toBeVisible();

    // 6. PDF REPORT DOWNLOAD TRIGGER
    console.log("Step 7: Testing PDF report download trigger...");
    const downloadPromise = page.waitForEvent("download");
    await page.click("button:has-text('Download Report')");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("healthguard-report");

    // 7. LOGOUT FLOW & STORAGE CLEANUP
    console.log("Step 8: Logging out...");
    // Click Avatar dropdown
    await page.click("button:has-text('Smoke Test Patient')");
    // Click Log Out
    await page.click("text=Log Out");

    // Wait for redirect to home or login page
    await page.waitForURL(/.*login|.*/, { timeout: 10000 });

    // Assert local storage keys are cleaned up
    const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    const hgKeys = localStorageKeys.filter(key => key.startsWith("hg."));
    expect(hgKeys.length).toBe(0);
  });
});
