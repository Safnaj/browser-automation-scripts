import puppeteer from "puppeteer";

const POST_URL = "YOUR_FACEBOOK_POST_URL_HERE"; // Replace with your Facebook post URL

const delay = (time) => new Promise((res) => setTimeout(res, time));

const initBrowser = async () => {
  return await puppeteer.launch({
    headless: false,
    userDataDir: "./my-puppeteer-profile",
    defaultViewport: null,
  });
};

(async () => {
  const browser = await initBrowser();

  const page = await browser.newPage();
  await page.goto(POST_URL, { waitUntil: "networkidle2" });

  console.log("✅ Loaded post, starting automation...");

  while (true) {
    const comments = await page.$$(
      "div[aria-label='Like'], div[aria-label='Remove Love']"
    );
    console.log("🔎 Found comments so far:", comments.length);

    for (const comment of comments) {
      const alreadyDone = await comment.evaluate((el) => el.dataset.processed);
      if (alreadyDone) continue;

      // Skip if this is a reply (check parent chain for aria-label^="Reply by")
      const isReply = await comment.evaluate((el) => {
        let parent = el.parentElement;
        while (parent) {
          if (
            parent.getAttribute &&
            parent.getAttribute("aria-label")?.startsWith("Reply by")
          ) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      });

      if (isReply) {
        console.log("↩️ This is a nested reply, skipping completely.");
        await comment.evaluate((el) => (el.dataset.processed = true));
        continue;
      }

      // If already reacted → skip reaction + reply
      const reactionLabel = await comment.evaluate((el) =>
        el.getAttribute("aria-label")
      );
      if (reactionLabel === "Remove Love") {
        console.log("💡 Already loved this comment, skipping.");
        await comment.evaluate((el) => (el.dataset.processed = true));
        continue;
      }

      // Add Heart reaction
      await comment.hover();
      await delay(1500);

      try {
        const loveBtn = await page.$("div[role='button'][aria-label='Love']");
        if (loveBtn) {
          await loveBtn.click();
          console.log("❤️ Love reaction added!");
          await delay(2000);
        }
      } catch (err) {
        console.log("⚠️ Error reacting:", err.message);
      }

      // Check if main comment already has replies
      const hasReplies = await comment.evaluate((el) => {
        const li = el.closest("li");
        if (!li) return false;
        return !!li.querySelector("div[aria-label^='Reply by']");
      });

      if (hasReplies) {
        console.log("💡 Main comment already has replies, skipping reply.");
      } else {
        try {
          const replyHandle = await comment.evaluateHandle((el) => {
            const likeLi = el.closest("li");
            if (!likeLi) return null;

            const ul = likeLi.parentElement;
            if (!ul || ul.tagName !== "UL") return null;

            const lis = ul.querySelectorAll("li");
            for (const li of lis) {
              const div = li.querySelector("div[role='button']");
              if (div && div.textContent.trim() === "Reply") {
                return div;
              }
            }
            return null;
          });

          const replyEl = replyHandle.asElement();
          if (replyEl) {
            await replyEl.click();
            await delay(1500);
            await page.keyboard.type("Thank you ❤️");
            await page.keyboard.press("Enter");
            console.log("✅ Replied to main comment");
          } else {
            console.log("❌ Reply button not found for main comment");
          }
        } catch (err) {
          console.log("⚠️ Error replying:", err.message);
        }
      }

      // Mark as processed
      await comment.evaluate((el) => (el.dataset.processed = true));
      await delay(4000);
    }

    // Scroll to load more comments
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 1.5);
    });

    await delay(3000);
  }
})();
