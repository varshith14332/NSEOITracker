const puppeteer = require("puppeteer");
const axios = require("axios");

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("Navigating to NSE OI Spurts page...");
    await page.goto("https://www.nseindia.com/market-data/oi-spurts", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector("table tbody tr");

    // Scrape top 20 rows
    const nseData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("table tbody tr")).slice(0, 20);

      return rows.map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          Symbol: cells[0]?.innerText.trim(),
          OI_Today: parseFloat(cells[1]?.innerText.replace(/,/g, "")) || 0,
          OI_Yesterday: parseFloat(cells[2]?.innerText.replace(/,/g, "")) || 0,
          OIChangePercent: parseFloat(cells[4]?.innerText.replace("%", "").trim()) || 0,
          FuturesValue: parseFloat(cells[6]?.innerText.replace(/,/g, "")) || 0,
        };
      });
    });

    console.log("✅ NSE data extracted");
    console.table(nseData);

    // ✅ Replace this with your n8n webhook URL
    const webhookUrl = "https://kai14332.app.n8n.cloud/webhook/5b5e69f8-50ec-4fb2-af98-6d6855b30516";

    console.log("Sending data to n8n...");
    const response = await axios.post(webhookUrl, nseData, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Data sent successfully:", response.status);
    await browser.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
})();
