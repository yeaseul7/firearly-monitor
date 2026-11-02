import { load } from "cheerio";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TARGET_URL = "https://firearlydev.pages.dev/";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SNAPSHOT_PATH = "data/versions.json";

export function extractVersions(html) {
  const $ = load(html);
  const entries = [];
  $(".games-grid article.game-card .game-copy h2").each((_, element) => {
    const heading = $(element).clone();
    const version = heading.find(".game-version").text().replace(/\s+/g, " ").trim();
    // 버전이 없는 컬렉션 카드는 감시 대상에서 제외합니다.
    if (!version) return;
    if (!/^v\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/i.test(version)) {
      throw new Error("게임 버전 형식이 올바르지 않습니다.");
    }
    heading.find(".game-version, script, style").remove();
    const title = heading.text().normalize("NFC").replace(/\s+/g, " ").trim();
    if (!title) throw new Error("게임 제목을 추출하지 못했습니다.");
    if (entries.some(([name]) => name === title)) throw new Error("중복 게임 제목이 있습니다.");
    entries.push([title, version]);
  });
  if (!entries.length) throw new Error("게임 버전 추출 실패");
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

async function fetchWebsite() {
  const response = await fetch(TARGET_URL, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "FirearlyMonitor/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`사이트 요청 실패: ${response.status}`);
  }

  return extractVersions(await response.text());
}

async function getPreviousSnapshot() {
  try {
    return JSON.parse(
      await readFile(SNAPSHOT_PATH, "utf8")
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function sendDiscordNotification(changes) {
  if (!WEBHOOK_URL) {
    throw new Error("Discord Webhook Secret이 없습니다.");
  }

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Firearly Update Bot",
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "🎮 Firearly 게임 업데이트 감지!",
          url: TARGET_URL,
          description: changes.map(({ name, from, to }) =>
            from === undefined
              ? `🆕 **${name}**\n신규 등록: ${to}`
              : `⬆️ **${name}**\n${from} → **${to}**`
          ).join("\n\n").slice(0, 3900) +
            `\n\n[Firearly 홈페이지 확인하기](${TARGET_URL})`,
          color: 3447003,
          timestamp: new Date().toISOString(),
          footer: {
            text: "Weekly Website Monitor"
          }
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Discord 알림 실패: ${response.status}`);
  }
}

async function saveSnapshot(snapshot) {
  await mkdir("data", { recursive: true });

  await writeFile(
    SNAPSHOT_PATH,
    JSON.stringify(snapshot, null, 2) + "\n"
  );
}

export async function main() {
  console.log("Firearly 사이트 확인 시작");

  const current = await fetchWebsite();
  const previous = await getPreviousSnapshot();

  if (previous === null) {
    console.log("최초 게임 버전 기준 저장 (알림 없음)");
    await saveSnapshot(current);
    return;
  }

  if (typeof previous !== "object" || Array.isArray(previous) ||
      !Object.keys(previous).length || Object.entries(previous).some(([name, version]) =>
        !name.trim() || typeof version !== "string" || !/^v\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/i.test(version))) {
    throw new Error("저장된 게임 버전 형식이 올바르지 않습니다.");
  }

  const changes = Object.entries(current).flatMap(([name, to]) => {
    const from = Object.hasOwn(previous, name) ? previous[name] : undefined;
    return from === to ? [] : [{ name, from, to }];
  });
  if (changes.length) {
    console.log(`게임 업데이트 ${changes.length}개 감지`);
    // 전송 실패 시 기존 기준을 유지해 다음 실행에서 재시도합니다.
    await sendDiscordNotification(changes);
    console.log("Discord 알림 전송 완료");
  } else {
    console.log("게임 버전 변경 없음 (알림 없음)");
  }
  await saveSnapshot(current);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
