#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

const POSTS_DIR = path.join(process.cwd(), "src", "content", "posts");
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const rl = readline.createInterface({ input, output });
const lines = rl[Symbol.asyncIterator]();

async function ask(prompt) {
  output.write(prompt);
  const { value, done } = await lines.next();

  if (done) {
    throw new Error("Input ended before all questions were answered.");
  }

  return value ?? "";
}

function slugifyTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeYamlString(value) {
  return JSON.stringify(value);
}

function formatDateForYaml(date) {
  return date.toISOString().replace(".000Z", "Z");
}

function parseDateAnswer(answer, fieldName) {
  const date = new Date(answer);

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`${fieldName} must be a valid date or ISO 8601 datetime.`);
  }

  return date;
}

async function askRequired(question) {
  while (true) {
    const answer = (await ask(`${question}: `)).trim();

    if (answer) {
      return answer;
    }

    console.log("Please enter a value.");
  }
}

async function askOptional(question) {
  return (await ask(`${question} (optional): `)).trim();
}

async function askBoolean(question, defaultValue = false) {
  const defaultLabel = String(defaultValue);

  while (true) {
    const answer = (
      await ask(`${question} [${defaultLabel}] (true/false): `)
    )
      .trim()
      .toLowerCase();

    if (!answer) {
      return defaultValue;
    }

    if (["true", "t", "yes", "y", "1"].includes(answer)) {
      return true;
    }

    if (["false", "f", "no", "n", "0"].includes(answer)) {
      return false;
    }

    console.log("Please enter true, false, or press return for the default.");
  }
}

async function askTags() {
  const answer = (
    await ask("Tags [others] (comma-separated, or press return): ")
  ).trim();

  if (!answer) {
    return ["others"];
  }

  const tags = answer
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : ["others"];
}

async function askOptionalDate(question) {
  while (true) {
    const answer = await askOptional(question);

    if (!answer) {
      return null;
    }

    try {
      return parseDateAnswer(answer, question);
    } catch (error) {
      console.log(error.message);
    }
  }
}

async function askPubDatetimeLast() {
  while (true) {
    const now = new Date();
    const defaultValue = formatDateForYaml(now);
    const answer = (
      await ask(`pubDatetime [${defaultValue}] (press return to accept): `)
    ).trim();

    if (!answer) {
      return now;
    }

    try {
      return parseDateAnswer(answer, "pubDatetime");
    } catch (error) {
      console.log(error.message);
    }
  }
}

function buildFrontmatter({
  title,
  author,
  pubDatetime,
  modDatetime,
  featured,
  draft,
  tags,
  ogImage,
  description,
  canonicalURL,
  hideEditPost,
  timezone,
}) {
  const lines = [
    "---",
    `title: ${escapeYamlString(title)}`,
    `author: ${escapeYamlString(author)}`,
    `pubDatetime: ${formatDateForYaml(pubDatetime)}`,
  ];

  if (modDatetime) {
    lines.push(`modDatetime: ${formatDateForYaml(modDatetime)}`);
  }

  lines.push(
    `featured: ${featured}`,
    `draft: ${draft}`,
    "tags:",
    ...tags.map(tag => `  - ${escapeYamlString(tag)}`)
  );

  if (ogImage) {
    lines.push(`ogImage: ${escapeYamlString(ogImage)}`);
  }

  lines.push(`description: ${escapeYamlString(description)}`);

  if (canonicalURL) {
    lines.push(`canonicalURL: ${escapeYamlString(canonicalURL)}`);
  }

  lines.push(`hideEditPost: ${hideEditPost}`);

  if (timezone) {
    lines.push(`timezone: ${escapeYamlString(timezone)}`);
  }

  lines.push("---", "", "");

  return lines.join("\n");
}

async function main() {
  console.log("New AstroPaper post\n");
  console.log("Press return to accept values shown in brackets.\n");

  const title = await askRequired("Title");
  const slugDefault = slugifyTitle(title);
  const slugAnswer = (
    await ask(`Slug [${slugDefault || "new-post"}]: `)
  ).trim();
  const slug = slugifyTitle(slugAnswer || slugDefault || "new-post");
  const author = await askRequired("Author");
  const featured = await askBoolean("Featured", false);
  const draft = await askBoolean("Draft", false);
  const tags = await askTags();
  const ogImage = await askOptional(
    "OG image path or URL (example: ../../assets/images/example.png)"
  );
  const description = await askRequired("Description");
  const canonicalURL = await askOptional("Canonical URL");
  const hideEditPost = await askBoolean("Hide edit-post button", false);
  const timezone = await askOptional("Timezone (IANA, example: America/New_York)");
  const modDatetime = await askOptionalDate(
    "modDatetime ISO 8601 (only for modified posts)"
  );
  const pubDatetime = await askPubDatetimeLast();

  const year = String(pubDatetime.getUTCFullYear());
  const month = MONTH_NAMES[pubDatetime.getUTCMonth()];
  const postDir = path.join(POSTS_DIR, year, month);
  const postPath = path.join(postDir, `${slug}.md`);
  const frontmatter = buildFrontmatter({
    title,
    author,
    pubDatetime,
    modDatetime,
    featured,
    draft,
    tags,
    ogImage,
    description,
    canonicalURL,
    hideEditPost,
    timezone,
  });

  await mkdir(postDir, { recursive: true });
  await writeFile(postPath, frontmatter, { flag: "wx" });

  console.log(`\nCreated ${path.relative(process.cwd(), postPath)}`);
}

try {
  await main();
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(
      "\nA post with that slug already exists. Run the script again with a different slug."
    );
  } else {
    console.error(`\n${error.message}`);
  }

  process.exitCode = 1;
} finally {
  rl.close();
}
