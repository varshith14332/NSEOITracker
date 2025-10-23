// scrape_trendlyne.js
const puppeteer = require("puppeteer");
const axios = require("axios");
const cron = require("node-cron");

async function scrapeAndSend() {
  try {
    console.log("🚀 Navigating to Trendlyne OI Gainers page...");

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto("https://smartoptions.trendlyne.com/futures/oi-gainers/", {
      waitUntil: "networkidle2",
    });

    // Wait for table to load
    await page.waitForSelector("table tbody tr");

    // Scrape data
    const trendlyneData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table tbody tr")).slice(0, 25);

      return rows.map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          Symbol: cells[0]?.innerText.trim() || "",
          LTP: parseFloat(cells[1]?.innerText.replace(/,/g, "")) || 0,
          DayChangePercent: parseFloat(cells[2]?.innerText.replace("%", "").trim()) || 0,
          OI: parseFloat(cells[6]?.innerText.replace(/,/g, "")) || 0,
          OIChangePercent: parseFloat(cells[7]?.innerText.replace("%", "").trim()) || 0,
          Buildup: cells[11]?.innerText.trim() || "",
        };
      });
    });

    await browser.close();

    console.table(trendlyneData);

    // Your n8n webhook URL
    const webhookUrl = "https://kai14332.app.n8n.cloud/webhook/5b5e69f8-50ec-4fb2-af98-6d6855b30516";

    // Send to n8n
    await axios.post(webhookUrl, trendlyneData, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Data sent to n8n successfully!");
  } catch (error) {
    console.error("❌ Error scraping Trendlyne:", error.message);
  }
}

// Run immediately
scrapeAndSend();

// Schedule every 2 minutes
cron.schedule("*/2 * * * *", scrapeAndSend);
