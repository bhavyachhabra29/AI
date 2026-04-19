import type { Browser, BrowserContext, Page } from "playwright";

/**
 * Manages a single browser session for the automation run.
 * Note: playwright is imported dynamically in launch() to prevent
 * Turbopack from trying to statically bundle the native binary.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(): Promise<void> {
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched yet");
    return this.page;
  }

  async navigate(url: string): Promise<{ title: string; url: string }> {
    const page = this.getPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);
    const title = await page.title();
    return { title, url: page.url() };
  }

  async click(selector: string): Promise<string> {
    const page = this.getPage();
    // Try multiple strategies
    try {
      await page.click(selector, { timeout: 5000 });
      return `Clicked element: ${selector}`;
    } catch {
      // Try by text
      try {
        await page.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
        return `Clicked element by text: ${selector}`;
      } catch {
        // Try by role
        try {
          await page.getByRole("button", { name: selector }).first().click({ timeout: 5000 });
          return `Clicked button by role: ${selector}`;
        } catch {
          throw new Error(`Could not find clickable element: ${selector}`);
        }
      }
    }
  }

  async fill(selector: string, value: string): Promise<string> {
    const page = this.getPage();
    try {
      await page.fill(selector, value, { timeout: 5000 });
      return `Filled "${selector}" with "${value}"`;
    } catch {
      try {
        await page.getByPlaceholder(selector).first().fill(value, { timeout: 5000 });
        return `Filled placeholder "${selector}" with "${value}"`;
      } catch {
        try {
          await page.getByLabel(selector).first().fill(value, { timeout: 5000 });
          return `Filled label "${selector}" with "${value}"`;
        } catch {
          throw new Error(`Could not find input element: ${selector}`);
        }
      }
    }
  }

  async select(selector: string, value: string): Promise<string> {
    const page = this.getPage();
    await page.selectOption(selector, value, { timeout: 5000 });
    return `Selected "${value}" in "${selector}"`;
  }

  async extractContent(): Promise<{
    title: string;
    url: string;
    textContent: string;
    headings: string[];
    links: { text: string; href: string }[];
    images: { alt: string; src: string }[];
  }> {
    const page = this.getPage();
    const title = await page.title();
    const url = page.url();

    const textContent = await page.evaluate(() => {
      return document.body?.innerText?.substring(0, 10000) ?? "";
    });

    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
        (el) => `${el.tagName}: ${el.textContent?.trim()}`
      );
    });

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 50)
        .map((el) => ({
          text: el.textContent?.trim() ?? "",
          href: (el as HTMLAnchorElement).href,
        }));
    });

    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("img"))
        .slice(0, 20)
        .map((el) => ({
          alt: (el as HTMLImageElement).alt,
          src: (el as HTMLImageElement).src,
        }));
    });

    return { title, url, textContent, headings, links, images };
  }

  async extractFields(fieldDescriptions: string[]): Promise<Record<string, string>> {
    const page = this.getPage();
    const fields: Record<string, string> = {};

    for (const desc of fieldDescriptions) {
      try {
        // Try to find input/select elements by label or placeholder
        const value = await page.evaluate((fieldDesc) => {
          // Try label
          const labels = Array.from(document.querySelectorAll("label"));
          for (const label of labels) {
            if (label.textContent?.toLowerCase().includes(fieldDesc.toLowerCase())) {
              const forId = label.getAttribute("for");
              if (forId) {
                const input = document.getElementById(forId) as HTMLInputElement;
                if (input) return input.value || input.textContent || "";
              }
              const input = label.querySelector("input, select, textarea") as HTMLInputElement;
              if (input) return input.value || "";
            }
          }

          // Try by placeholder
          const inputs = Array.from(
            document.querySelectorAll("input, textarea, select")
          ) as HTMLInputElement[];
          for (const input of inputs) {
            if (input.placeholder?.toLowerCase().includes(fieldDesc.toLowerCase())) {
              return input.value || "";
            }
            if (input.name?.toLowerCase().includes(fieldDesc.toLowerCase())) {
              return input.value || "";
            }
          }

          // Try text content match
          const allElements = Array.from(document.querySelectorAll("*"));
          for (const el of allElements) {
            if (
              el.children.length === 0 &&
              el.textContent?.toLowerCase().includes(fieldDesc.toLowerCase())
            ) {
              return el.textContent?.trim() || "";
            }
          }

          return "Not found";
        }, desc);

        fields[desc] = value;
      } catch {
        fields[desc] = "Error extracting";
      }
    }

    return fields;
  }

  async scroll(direction: "down" | "up" = "down", amount = 500): Promise<string> {
    const page = this.getPage();
    await page.evaluate(
      ({ dir, amt }) => {
        window.scrollBy(0, dir === "down" ? amt : -amt);
      },
      { dir: direction, amt: amount }
    );
    await page.waitForTimeout(500);
    return `Scrolled ${direction} by ${amount}px`;
  }

  async screenshot(): Promise<Buffer> {
    const page = this.getPage();
    return await page.screenshot({ fullPage: false });
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<string> {
    const page = this.getPage();
    await page.waitForSelector(selector, { timeout });
    return `Element found: ${selector}`;
  }

  async getCurrentUrl(): Promise<string> {
    return this.getPage().url();
  }

  async getPageTitle(): Promise<string> {
    return await this.getPage().title();
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch {
      // Ignore close errors
    }
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
