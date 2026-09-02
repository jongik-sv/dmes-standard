import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(projectRoot, "src");
const forbidden = [
  { pattern: /\bfetch\s*\(/, label: "fetch()" },
  { pattern: /\baxios\b/, label: "axios" },
  { pattern: /@dk-oasis\/shared\/http/, label: "@dk-oasis/shared/http" },
  { pattern: /\/api\//, label: "/api/ 경로" },
  { pattern: /https?:\/\//, label: "외부 HTTP URL" },
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(target) : [target];
    }),
  );
  return nested.flat();
}

const failures = [];
for (const file of await filesUnder(sourceRoot)) {
  if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      failures.push(`${path.relative(projectRoot, file)}: ${rule.label}`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    "디자인 더미에서 백엔드/외부 네트워크 호출 흔적을 발견했습니다.",
  );
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "백엔드/외부 네트워크 호출 없음: 디자인 더미는 로컬 데이터만 사용합니다.",
);
