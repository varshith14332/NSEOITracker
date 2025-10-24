// scrape_nse.js
const puppeteer = require("puppeteer");
const axios = require("axios");
const cron = require("node-cron");

async function scrapeAndSend() {
  try {
    console.log("🚀 Navigating to NSE OI SPURTS page...");

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto("https://www.nseindia.com/market-data/oi-spurts", {
      waitUntil: "networkidle2",
    });

    // Wait for table to load
    await page.waitForSelector("table tbody tr");

    // Scrape data
    const nseData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table tbody tr")).slice(0, 25);

      return rows.map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          Symbol: cells[0]?.innerText.trim() || "",
          "OIchng%": parseFloat(cells[4]?.innerText.replace("%", "").replace(/,/g, "").trim()) || 0,
          "OI Tdy": parseFloat(cells[1]?.innerText.replace(/,/g, "")) || 0,
          "OI YST": parseFloat(cells[2]?.innerText.replace(/,/g, "")) || 0,
          FutVal: parseFloat(cells[6]?.innerText.replace(/,/g, "")) || 0,
        };
      });
    });

    await browser.close();

    console.table(nseData);

    // Your n8n webhook URL
    const webhookUrl = "https://kai14332.app.n8n.cloud/webhook/8db47b68-df6e-4cdf-a753-52e78df976fe";

    // Send to n8n
    await axios.post(webhookUrl, nseData, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Data sent to n8n successfully!");
  } catch (error) {
    console.error("❌ Error scraping NSE:", error.message);
  }
}

// Run immediately
scrapeAndSend();

// Schedule every 2 minutes
cron.schedule("*/2 * * * *", scrapeAndSend);
