// usage-band 대조 래퍼 공통: 작업 폴더의 `.mtimes.json`({상대경로: epoch 초})대로 파일 mtime 을 맞춘다(양쪽이 같은 값을 갖도록 절대 시각).
import { readFileSync, utimesSync } from 'node:fs';
try {
  const m = JSON.parse(readFileSync('.mtimes.json', 'utf8'));
  for (const [p, e] of Object.entries(m)) { try { utimesSync(p, e, e); } catch { /* 없는 파일 */ } }
} catch { /* 지정 없음 */ }
