// scrape_nse.js
const puppeteer = require("puppeteer");
const axios = require("axios");
const cron = require("node-cron");

/**
 * CONFIG
 */
const WEBHOOK_URL = "https://kai14332.app.n8n.cloud/webhook/8db47b68-df6e-4cdf-a753-52e78df976fe"; // <<-- REPLACE
const ROWS_TO_SCRAPE = 25;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000; // exponential backoff base

function parseNumber(text) {
  if (text === undefined || text === null) return 0;
  // Remove commas, non-breaking spaces, and stray characters
  const cleaned = String(text).replace(/[\u00A0\s,₹₹\s]/g, "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function attemptScrapeOnce() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Realistic UA
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Some useful headers so the site treats us like a normal browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.nseindia.com/market-data/oi-spurts",
    });

    console.log("Navigating to NSE OI Spurts page...");
    await page.goto("https://www.nseindia.com/market-data/oi-spurts", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for the table rows to appear (give extra time)
    await page.waitForSelector("table tbody tr", { timeout: 30000 });
    await page.evaluate(() => new Promise(res => setTimeout(res, 1200)));
 // small extra wait to let table finish rendering

    const extracted = await page.evaluate((rowsCount) => {
      const rows = Array.from(document.querySelectorAll("table tbody tr"));
      return rows.slice(0, rowsCount).map((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((c) => c.innerText.trim());
        // Column layout on NSE OI Spurts (observed):
        // 0: Symbol
        // 1: Open Interest (Today)       <-- "OI Tdy"
        // 2: Open Interest (Previous)    <-- "OI Pre Day"
        // 3: Change in OI (absolute)
        // 4: % Change in OI              <-- "% OI Chng"
        // 5: Volume (contracts)
        // 6: Futures Value (₹ Lakhs)     <-- "Fut Value"
        return {
          rawSymbol: cells[0] ?? "",
          rawOI_Tdy: cells[1] ?? "",
          rawOI_Pre: cells[2] ?? "",
          rawOI_pct: cells[4] ?? "",
          rawFutVal: cells[6] ?? "",
        };
      });
    }, ROWS_TO_SCRAPE);

    // Map and parse numbers, and output in required order:
    function roundInt(value) {
  return Math.round(value);
}

// Map and parse numbers, and output in required order:
const mapped = extracted.map((r) => ({
  Symbol: `=HYPERLINK("https://www.nseindia.com/get-quotes/equity?symbol=${r.rawSymbol}", "${r.rawSymbol}")`,
  "OI Pre Day": parseNumber(r.rawOI_Pre),
  "OI Tdy": parseNumber(r.rawOI_Tdy),
  "% OI Chng": roundInt(parseNumber(r.rawOI_pct)),
  "Fut Value": roundInt(parseNumber(r.rawFutVal)),
}));


    await browser.close();
    return mapped;
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

async function scrapeWithRetries() {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      const data = await attemptScrapeOnce();
      return data;
    } catch (err) {
      console.warn(`Scrape attempt ${attempt} failed: ${err.message}`);
      if (attempt >= MAX_RETRIES) throw err;
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`Waiting ${backoff}ms before retrying...`);
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
  throw new Error("Max retries reached");
}

async function scrapeAndSend() {
  try {
    console.log(new Date().toLocaleString(), "- Starting scrapeAndSend");
    const data = await scrapeWithRetries();

    // Show table in console in the requested order
    console.table(data);

    // Add timestamp optionally (uncomment if you want timestamp in sheet)
    // const payload = data.map(r => ({ ...r, scraped_at: new Date().toISOString() }));
    const payload = data;

    // POST to n8n webhook
    const res = await axios.post(WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    console.log("Webhook response status:", res.status);
  } catch (err) {
    console.error(new Date().toLocaleString(), "❌ scrapeAndSend failed:", err.message);
  }
}

// Run once immediately
scrapeAndSend().catch((e) => console.error("Initial run failed:", e.message));

// Schedule every 2 minutes
cron.schedule("*/2 * * * *", () => {
  scrapeAndSend().catch((e) => console.error("Scheduled run failed:", e.message));
});

