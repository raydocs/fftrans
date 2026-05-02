#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(__dirname, 'msq-gender-coverage.json');
const BASE = 'https://ffxiv.consolegameswiki.com';
const MAIN_SCENARIO_INDEX_URL = 'https://ffxiv.consolegameswiki.com/wiki/Main_Scenario_Quests';
const SEEDED_SOURCE_URLS = [
  'https://ffxiv.consolegameswiki.com/wiki/Seventh_Umbral_Era_Main_Scenario_Quests',
];

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function extractQuestTables(html = '') {
  const tables = [];
  const tableRegex = /<table[^>]*class="[^"]*quest table[^"]*"[^>]*>[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRegex.exec(html))) {
    tables.push(match[0]);
  }
  return tables;
}

function extractCells(rowHtml = '') {
  const cells = [];
  const cellRegex = /<td\b[^>]*>[\s\S]*?<\/td>/gi;
  let match;
  while ((match = cellRegex.exec(rowHtml))) {
    cells.push(match[0]);
  }
  return cells;
}

function extractLinks(cellHtml = '') {
  const links = [];
  const linkRegex = /<a\b[^>]*href="(\/wiki\/[^"]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(cellHtml))) {
    const href = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    const label = stripTags(match[3]);
    if (!href.includes(':') && title && label) {
      links.push({ href, title, label });
    }
  }
  return links;
}

function extractMainScenarioCollectionUrls(html = '') {
  const urls = new Set(SEEDED_SOURCE_URLS);
  const linkRegex = /<a\b[^>]*href="(\/wiki\/[^"]+)"[^>]*title="([^"]+)"/gi;
  let match;
  while ((match = linkRegex.exec(html))) {
    const href = decodeHtml(match[1]).split('#')[0];
    const title = decodeHtml(match[2]);
    if (/Main Scenario Quests$/.test(title) && !href.includes(':')) {
      urls.add(`${BASE}${href}`);
    }
  }
  return Array.from(urls).sort();
}

function extractQuestGivers(html = '', sourceUrl = '') {
  const givers = [];
  for (const table of extractQuestTables(html)) {
    const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = extractCells(row);
      if (cells.length < 4) continue;
      const questLinks = extractLinks(cells[0]);
      const giverLinks = extractLinks(cells[3]);
      if (!questLinks.length || !giverLinks.length) continue;
      for (const giver of giverLinks) {
        givers.push({
          name: giver.label || giver.title,
          title: giver.title,
          href: giver.href,
          url: `${BASE}${giver.href}`,
          quest: questLinks[0].label || questLinks[0].title,
          sourceUrl,
        });
      }
    }
  }
  return givers;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FFTrans gender coverage analysis/0.1 (+local developer tool)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function extractGender(html = '') {
  const match = html.match(/<dt>\s*Gender\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
  if (!match) return 'unknown';
  const text = stripTags(match[1]).toLowerCase();
  if (text.includes('female')) return 'female';
  if (text.includes('male')) return 'male';
  return 'unknown';
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function buildRuntimeArtifact(report = {}, reportPath = DEFAULT_OUTPUT) {
  const gendersByName = {};
  const characters = Array.isArray(report.characters) ? report.characters : [];
  characters.forEach((item = {}) => {
    if (typeof item.name === 'string' && ['male', 'female'].includes(item.gender)) {
      gendersByName[item.name] = item.gender;
    }
  });

  return {
    schemaVersion: 1,
    source: {
      report: path.relative(ROOT, reportPath).replace(/\\/g, '/'),
      generatedAt: report.generatedAt || '',
      coveragePercent: report.totals?.coveragePercent || 0,
      genderCovered: report.totals?.genderCovered || Object.keys(gendersByName).length,
      uniqueQuestGivers: report.totals?.uniqueQuestGivers || 0,
    },
    gendersByName: Object.fromEntries(
      Object.entries(gendersByName).sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

function writeRuntimeArtifact(report = {}, runtimeOutput = '', reportPath = DEFAULT_OUTPUT) {
  if (!runtimeOutput) return;
  const artifact = buildRuntimeArtifact(report, reportPath);
  fs.mkdirSync(path.dirname(runtimeOutput), { recursive: true });
  fs.writeFileSync(runtimeOutput, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Runtime artifact: ${path.relative(ROOT, runtimeOutput)}`);
}

async function main() {
  const output = path.resolve(getArg('--output', DEFAULT_OUTPUT));
  const runtimeOutputArg = getArg('--runtime-output', '');
  const runtimeOutput = runtimeOutputArg ? path.resolve(runtimeOutputArg) : '';

  if (runtimeOutput && !process.argv.includes('--refresh') && fs.existsSync(output)) {
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    writeRuntimeArtifact(report, runtimeOutput, output);
    console.log(`Gender covered: ${report.totals.genderCovered}/${report.totals.uniqueQuestGivers} (${report.totals.coveragePercent}%)`);
    console.log(`Local lookup p95: ${report.totals.localLookupP95Ms}ms`);
    console.log(`Report: ${path.relative(ROOT, output)}`);
    return;
  }
  const startMs = performance.now();
  const sourcePages = [];
  let rawGivers = [];

  const indexHtml = await fetchText(MAIN_SCENARIO_INDEX_URL);
  const sourceUrls = extractMainScenarioCollectionUrls(indexHtml);

  for (const url of sourceUrls) {
    const html = await fetchText(url);
    const givers = extractQuestGivers(html, url);
    sourcePages.push({ url, questGiverMentions: givers.length });
    rawGivers = rawGivers.concat(givers);
  }

  const byHref = new Map();
  for (const giver of rawGivers) {
    const key = giver.href;
    const existing = byHref.get(key);
    if (existing) {
      existing.mentions += 1;
      existing.quests.add(giver.quest);
      existing.sources.add(giver.sourceUrl);
    } else {
      byHref.set(key, {
        name: giver.name,
        title: giver.title,
        href: giver.href,
        url: giver.url,
        mentions: 1,
        quests: new Set([giver.quest]),
        sources: new Set([giver.sourceUrl]),
      });
    }
  }

  const uniqueGivers = Array.from(byHref.values());
  const fetchTimings = [];
  const resolved = await mapLimit(uniqueGivers, 8, async (giver) => {
    const fetchStart = performance.now();
    try {
      const html = await fetchText(giver.url);
      fetchTimings.push(performance.now() - fetchStart);
      return {
        ...giver,
        quests: Array.from(giver.quests).sort(),
        sources: Array.from(giver.sources).sort(),
        gender: extractGender(html),
      };
    } catch (error) {
      fetchTimings.push(performance.now() - fetchStart);
      return {
        ...giver,
        quests: Array.from(giver.quests).sort(),
        sources: Array.from(giver.sources).sort(),
        gender: 'unknown',
        error: error.message,
      };
    }
  });

  const genderCounts = resolved.reduce((acc, item) => {
    acc[item.gender] = (acc[item.gender] || 0) + 1;
    return acc;
  }, {});
  const covered = resolved.filter(item => item.gender === 'male' || item.gender === 'female').length;
  const coverage = uniqueGivers.length ? covered / uniqueGivers.length : 0;

  const lookupMap = new Map(resolved.map(item => [item.name.toLowerCase(), item.gender]));
  const lookupTimings = [];
  for (let i = 0; i < 10000; i++) {
    const item = resolved[i % Math.max(1, resolved.length)] || { name: '' };
    const lookupStart = performance.now();
    lookupMap.get(item.name.toLowerCase()) || 'unknown';
    lookupTimings.push(performance.now() - lookupStart);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePages,
    totals: {
      questGiverMentions: rawGivers.length,
      uniqueQuestGivers: uniqueGivers.length,
      genderCovered: covered,
      coveragePercent: Number((coverage * 100).toFixed(2)),
      genderCounts,
      totalFetchMs: Number((performance.now() - startMs).toFixed(1)),
      characterFetchMedianMs: Number(quantile(fetchTimings, 0.5).toFixed(3)),
      characterFetchP95Ms: Number(quantile(fetchTimings, 0.95).toFixed(3)),
      localLookupMedianMs: Number(quantile(lookupTimings, 0.5).toFixed(6)),
      localLookupP95Ms: Number(quantile(lookupTimings, 0.95).toFixed(6)),
    },
    unresolved: resolved.filter(item => !['male', 'female'].includes(item.gender)).map(item => ({
      name: item.name,
      url: item.url,
      mentions: item.mentions,
      error: item.error || '',
    })),
    characters: resolved
      .filter(item => ['male', 'female'].includes(item.gender))
      .map(item => ({
        name: item.name,
        gender: item.gender,
        url: item.url,
        mentions: item.mentions,
        quests: item.quests,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  writeRuntimeArtifact(report, runtimeOutput, output);
  console.log(`Source pages: ${sourcePages.map(p => `${p.questGiverMentions} from ${p.url}`).join('; ')}`);
  console.log(`Unique quest givers: ${report.totals.uniqueQuestGivers}`);
  console.log(`Gender covered: ${report.totals.genderCovered}/${report.totals.uniqueQuestGivers} (${report.totals.coveragePercent}%)`);
  console.log(`Gender counts: ${JSON.stringify(report.totals.genderCounts)}`);
  console.log(`Local lookup p95: ${report.totals.localLookupP95Ms}ms`);
  console.log(`Report: ${path.relative(ROOT, output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
