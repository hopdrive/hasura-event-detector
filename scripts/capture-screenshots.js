#!/usr/bin/env node

/**
 * Script to capture screenshots of the console UI for PR documentation
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const screenshotsDir = join(__dirname, '..', 'pr-screenshots');

async function captureScreenshots() {
  // Create screenshots directory
  await mkdir(screenshotsDir, { recursive: true });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    const page = await browser.newPage();
    const baseUrl = 'http://localhost:3000';

    console.log('Navigating to dashboard...');
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Screenshot 1: Overview Dashboard with time range selector
    console.log('Capturing overview dashboard...');
    await page.screenshot({
      path: join(screenshotsDir, '01-overview-dashboard.png'),
      fullPage: true,
    });

    // Screenshot 2: Time range selector dropdown
    console.log('Capturing time range selector...');
    const timeRangeSelector = await page.$('[role="combobox"]');
    if (timeRangeSelector) {
      await timeRangeSelector.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({
        path: join(screenshotsDir, '02-time-range-selector.png'),
        fullPage: false,
      });
      // Close dropdown
      await page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Screenshot 3: Database connection status (if visible)
    console.log('Capturing database connection status...');
    await page.screenshot({
      path: join(screenshotsDir, '03-database-status.png'),
      fullPage: true,
    });

    // Screenshot 4: Navigation (showing removed Flow Diagram link)
    console.log('Capturing navigation...');
    const nav = await page.$('nav');
    if (nav) {
      await nav.screenshot({
        path: join(screenshotsDir, '04-navigation.png'),
      });
    }

    console.log(`Screenshots saved to ${screenshotsDir}`);
  } catch (error) {
    console.error('Error capturing screenshots:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
