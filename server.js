const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const keywordExtractor = require('keyword-extractor');
const puppeteer = require('puppeteer');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Fetch page content
const fetchPageContent = async (url) => {
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    console.error('Error fetching page content:', error);
    throw new Error('Failed to fetch page content');
  }
};

// Check links status
const checkLinks = async (url, content) => {
  const $ = cheerio.load(content);
  const links = [];
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href && href.startsWith('http')) {
      links.push(href);
    }
  });

  const linkStatus = await Promise.all(
    links.map(async (link) => {
      try {
        await axios.get(link);
        return { link, status: 'Reachable' };
      } catch (error) {
        return { link, status: '404 Not Found' };
      }
    })
  );

  return linkStatus;
};

// Extract keywords
const extractKeywords = (textContent) => {
  const extractor = keywordExtractor;
  const keywords = extractor.extract(textContent, {
    language: 'english',
    remove_digits: true,
    return_changed_case: true,
    remove_duplicates: true
  });

  return keywords;
};

// Sanitize keyword
const sanitizeKeyword = (keyword) => {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special characters
};

// Scan keywords
const scanKeywords = (content) => {
  const $ = cheerio.load(content);
  let textContent = $('body').text().toLowerCase();

  // Remove non-alphanumeric characters except spaces
  textContent = textContent.replace(/[^a-z\s]/g, ' ');

  const keywords = extractKeywords(textContent);

  const keywordResults = keywords.map((keyword) => {
    const sanitizedKeyword = sanitizeKeyword(keyword);
    const occurrences = (textContent.match(new RegExp(`\\b${sanitizedKeyword}\\b`, 'g')) || []).length;
    const keywordDensity = occurrences / textContent.split(' ').length * 100;

    return {
      keyword,
      occurrences,
      density: keywordDensity.toFixed(2),
    };
  });

  // Sort by occurrences in descending order and get top 10
  const topKeywords = keywordResults
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);

  return topKeywords;
};

// Get page speed
const getPageSpeed = async (url) => {
  try {
    const apiKey = 'AIzaSyCSxrtRNaXt84PXo_YXMXff17fMAmZ2q28'; 
    const response = await axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&key=${apiKey}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching page speed:', error);
    throw new Error('Failed to fetch page speed');
  }
};

// Get page preview
const getPagePreview = async (url) => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const screenshot = await page.screenshot({ encoding: 'base64' });
    await browser.close();
    return screenshot;
  } catch (error) {
    console.error('Error taking page screenshot:', error);
    throw new Error('Failed to take page screenshot');
  }
};

// Audit endpoint
app.post('/api/audit', async (req, res) => {
  const { url } = req.body;

  try {
    const content = await fetchPageContent(url);
    const links = await checkLinks(url, content);
    const keywords = scanKeywords(content);
    const pageSpeed = await getPageSpeed(url);
    const pagePreview = await getPagePreview(url);

    res.json({ links, keywords, pageSpeed, pagePreview });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
