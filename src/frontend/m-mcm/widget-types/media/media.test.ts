/**
 * 미디어 위젯 유형 순수 로직 시험 — 스펙 2026-10-02-widget-admin-generic §6(media)·§4.3, 계획 Task 13.
 * 렌더 시험은 없다(m-mcm 은 node 환경). 화면(renderer·editor)이 쓰는 판단은 전부 media.ts·upload.ts 의 순수 함수다.
 */
import { describe, expect, it, vi } from "vitest";

import {
  buildItemFromUrl,
  clampIndex,
  clampIntervalSec,
  DEFAULT_INTERVAL_SEC,
  guessKind,
  MAX_INTERVAL_SEC,
  MEDIA_FILE_URL_PREFIX,
  MIN_INTERVAL_SEC,
  mediaSrc,
  moveItem,
  nextIndex,
  normalizeMediaConfig,
  prevIndex,
  slideAdvance,
  slideTimerReady,
  validateMediaConfig,
  youtubeEmbed,
  type MediaItem,
} from "./media";
import { meta } from "./type.meta";
import {
  checkUploadFile,
  IMAGE_MAX_BYTES,
  mediaItemFromUpload,
  MEDIA_UPLOAD_URL,
  parseUploadResponse,
  uploadKindOf,
  uploadMedia,
  UPLOAD_ACCEPT,
  VIDEO_MAX_BYTES,
} from "./upload";

const FILE_ID = "0123456789abcdef0123456789abcdef";
const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("유형 메타", () => {
  it("스펙 §3 의 id·기본 크기·여백·초기 설정", () => {
    expect(meta.id).toBe("media");
    expect(meta.defaultSize).toEqual({ w: 8, h: 10 });
    expect(meta.bodyPadding).toBe(false);
    expect(meta.initialConfig).toEqual({ items: [], intervalSec: 8, fit: "contain" });
  });
});

describe("mediaSrc", () => {
  it("media:{id} 는 BFF 다운로드 경로로 바꾼다", () => {
    expect(mediaSrc(`media:${FILE_ID}`)).toBe(`/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/${FILE_ID}`);
    expect(MEDIA_FILE_URL_PREFIX).toBe("/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/");
  });

  it("http(s) 주소는 그대로 돌려준다(앞뒤 공백만 뺀다)", () => {
    expect(mediaSrc("https://example.com/a.png?v=1#x")).toBe("https://example.com/a.png?v=1#x");
    expect(mediaSrc("http://10.0.0.1:8080/video.mp4")).toBe("http://10.0.0.1:8080/video.mp4");
    expect(mediaSrc("  https://example.com/a.png  ")).toBe("https://example.com/a.png");
  });

  it("그 밖은 null — 위험한 스킴·상대·프로토콜 상대 주소·형식 어긋난 파일 ID", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "//example.com/a.png",
      "/api/auth/me",
      "ftp://example.com/a.png",
      "http:example.com",
      "https://",
      "example.com/a.png",
      "",
      "   ",
      "media:",
      "media:abc",
      "media:../../auth/me",
      `media:${FILE_ID.toUpperCase()}`,
      `media:${FILE_ID}0`,
    ]) {
      expect(mediaSrc(bad), bad).toBeNull();
    }
    expect(mediaSrc(undefined)).toBeNull();
    expect(mediaSrc(null)).toBeNull();
    expect(mediaSrc(42 as unknown as string)).toBeNull();
  });
});

describe("youtubeEmbed", () => {
  it("watch·youtu.be·shorts·embed·live 주소를 nocookie embed 로 바꾼다", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ  ",
    ]) {
      expect(youtubeEmbed(url), url).toBe(YT);
    }
  });

  it("YouTube 가 아니거나 영상 ID 가 없거나 모양이 틀리면 null", () => {
    for (const bad of [
      "",
      "not a url",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be.evil.com/dQw4w9WgXcQ",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQtoolong",
      "https://www.youtube.com/watch?v=dQw4w9WgXc!",
      "https://www.youtube.com/channel/UC1234567890",
      "https://www.youtube.com/",
      "https://youtu.be/",
      "javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ",
      "ftp://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/videoseries?list=PLabcdefghijk",
      "https://youtu.be/videoseries",
    ]) {
      expect(youtubeEmbed(bad), bad).toBeNull();
    }
    expect(youtubeEmbed(undefined)).toBeNull();
  });
});

describe("guessKind — 주소로 종류 자동 판정", () => {
  it("확장자로 이미지·동영상, 주소 모양으로 YouTube", () => {
    expect(guessKind("https://example.com/a.png")).toBe("image");
    expect(guessKind("https://example.com/a.JPG")).toBe("image");
    expect(guessKind("https://example.com/a.jpeg?x=1")).toBe("image");
    expect(guessKind("https://example.com/a.gif#frag")).toBe("image");
    expect(guessKind("https://example.com/path/a.webp")).toBe("image");
    expect(guessKind("https://example.com/a.mp4")).toBe("video");
    expect(guessKind("http://example.com/a.webm?token=abc")).toBe("video");
    expect(guessKind("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(guessKind("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
  });

  it("모르는 확장자·주소가 아닌 값·SVG 는 null", () => {
    expect(guessKind("https://example.com/a.svg")).toBeNull();
    expect(guessKind("https://example.com/a.html")).toBeNull();
    expect(guessKind("https://example.com/image")).toBeNull();
    expect(guessKind("https://example.com/")).toBeNull();
    expect(guessKind("https://www.youtube.com/channel/UC1234567890")).toBeNull();
    expect(guessKind("javascript:alert(1).png")).toBeNull();
    expect(guessKind("not a url.png")).toBeNull();
    expect(guessKind("")).toBeNull();
    expect(guessKind(`media:${FILE_ID}`)).toBeNull();
  });
});

describe("clampIntervalSec — 넘김 간격", () => {
  it("없거나 숫자가 아니면 기본 8초", () => {
    expect(DEFAULT_INTERVAL_SEC).toBe(8);
    expect(clampIntervalSec(undefined)).toBe(8);
    expect(clampIntervalSec(null)).toBe(8);
    expect(clampIntervalSec("5")).toBe(8);
    expect(clampIntervalSec(Number.NaN)).toBe(8);
    expect(clampIntervalSec(Number.POSITIVE_INFINITY)).toBe(8);
  });

  it("최소 3초 — 그보다 짧게 준 값은 3초", () => {
    expect(MIN_INTERVAL_SEC).toBe(3);
    expect(clampIntervalSec(3)).toBe(3);
    expect(clampIntervalSec(2)).toBe(3);
    expect(clampIntervalSec(0)).toBe(3);
    expect(clampIntervalSec(-5)).toBe(3);
  });

  it("정상 값은 정수로 반올림하고, setTimeout 한계를 넘지 않게 상한을 둔다", () => {
    expect(clampIntervalSec(10)).toBe(10);
    expect(clampIntervalSec(7.6)).toBe(8);
    expect(clampIntervalSec(MAX_INTERVAL_SEC + 1)).toBe(MAX_INTERVAL_SEC);
    expect(clampIntervalSec(1e12)).toBe(MAX_INTERVAL_SEC);
    expect(MAX_INTERVAL_SEC * 1000).toBeLessThan(2 ** 31);
  });
});

describe("normalizeMediaConfig", () => {
  it("정의가 없거나 모양이 틀리면 빈 기본값", () => {
    for (const raw of [null, undefined, "x", 3, [], { items: "no" }]) {
      expect(normalizeMediaConfig(raw)).toEqual({ items: [], fit: "contain" });
    }
  });

  it("항목·간격·맞춤 방식을 그대로 읽는다", () => {
    const raw = {
      items: [
        { kind: "image", src: `media:${FILE_ID}`, caption: "공장 전경" },
        { kind: "video", src: "https://example.com/a.mp4" },
        { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ", caption: "" },
      ],
      intervalSec: 5,
      fit: "cover",
    };
    expect(normalizeMediaConfig(raw)).toEqual({
      items: [
        { kind: "image", src: `media:${FILE_ID}`, caption: "공장 전경" },
        { kind: "video", src: "https://example.com/a.mp4" },
        { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" },
      ],
      intervalSec: 5,
      fit: "cover",
    });
  });

  it("종류가 틀린 항목·객체 아닌 항목은 버리고, src 가 없으면 빈 주소로 두어 검사가 잡게 한다", () => {
    const cfg = normalizeMediaConfig({
      items: [{ kind: "audio", src: "x" }, "x", null, { kind: "image" }, { kind: "image", src: 7 }],
      fit: "stretch",
      intervalSec: "빠르게",
    });
    expect(cfg.items).toEqual([
      { kind: "image", src: "" },
      { kind: "image", src: "" },
    ]);
    expect(cfg.fit).toBe("contain");
    expect(cfg.intervalSec).toBeUndefined();
  });
});

describe("validateMediaConfig — 편집기 검사", () => {
  const ok: MediaItem = { kind: "image", src: `media:${FILE_ID}` };

  it("항목 0개면 「미디어를 하나 이상 넣으세요」", () => {
    expect(validateMediaConfig({ items: [], fit: "contain" })).toEqual(["미디어를 하나 이상 넣으세요"]);
    expect(validateMediaConfig(null)).toEqual(["미디어를 하나 이상 넣으세요"]);
    expect(validateMediaConfig(meta.initialConfig)).toEqual(["미디어를 하나 이상 넣으세요"]);
  });

  it("정상 항목은 오류 없음", () => {
    expect(
      validateMediaConfig({
        items: [ok, { kind: "video", src: "https://example.com/a.mp4" }, { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" }],
        intervalSec: 8,
        fit: "cover",
      }),
    ).toEqual([]);
  });

  it("잘못된 주소는 몇 번째 항목인지 알려 준다", () => {
    const errors = validateMediaConfig({
      items: [ok, { kind: "image", src: "javascript:alert(1)" }, { kind: "youtube", src: "https://example.com/x" }, { kind: "video", src: "" }],
    });
    expect(errors).toEqual([
      "2번째 항목의 주소가 올바르지 않습니다",
      "3번째 항목의 주소가 올바르지 않습니다",
      "4번째 항목의 주소가 올바르지 않습니다",
    ]);
  });

  it("YouTube 항목에 media: 주소를 넣으면 잘못된 주소", () => {
    expect(validateMediaConfig({ items: [{ kind: "youtube", src: `media:${FILE_ID}` }] })).toEqual(["1번째 항목의 주소가 올바르지 않습니다"]);
  });

  it("넘김 간격이 최소값 미만이면 오류, 비우면 기본값이라 오류 아님", () => {
    expect(validateMediaConfig({ items: [ok], intervalSec: 2 })).toEqual(["넘김 간격은 3초 이상이어야 합니다"]);
    expect(validateMediaConfig({ items: [ok], intervalSec: 3 })).toEqual([]);
    expect(validateMediaConfig({ items: [ok] })).toEqual([]);
  });
});

describe("buildItemFromUrl — [주소로 추가]", () => {
  it("종류를 자동 판정해 항목을 만든다(YouTube 는 입력한 주소 그대로 보관)", () => {
    expect(buildItemFromUrl("https://example.com/a.png")).toEqual({ item: { kind: "image", src: "https://example.com/a.png" } });
    expect(buildItemFromUrl(" https://example.com/a.mp4 ")).toEqual({ item: { kind: "video", src: "https://example.com/a.mp4" } });
    expect(buildItemFromUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({ item: { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" } });
  });

  it("종류를 직접 고르면 확장자가 없는 주소도 받는다", () => {
    expect(buildItemFromUrl("https://picsum.photos/800/600", "image")).toEqual({
      item: { kind: "image", src: "https://picsum.photos/800/600" },
    });
    expect(buildItemFromUrl("https://example.com/stream/1", "video")).toEqual({
      item: { kind: "video", src: "https://example.com/stream/1" },
    });
  });

  it("YouTube 주소는 종류 선택과 상관없이 YouTube", () => {
    expect(buildItemFromUrl("https://youtu.be/dQw4w9WgXcQ", "image")).toEqual({
      item: { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" },
    });
  });

  it("빈 값·주소가 아닌 값·종류를 알 수 없는 주소는 오류 문구", () => {
    expect(buildItemFromUrl("   ")).toEqual({ error: "주소를 입력하세요" });
    expect(buildItemFromUrl("javascript:alert(1)")).toEqual({ error: "http:// 또는 https:// 로 시작하는 주소를 입력하세요" });
    expect(buildItemFromUrl("javascript:alert(1)", "image")).toEqual({ error: "http:// 또는 https:// 로 시작하는 주소를 입력하세요" });
    expect(buildItemFromUrl(`media:${FILE_ID}`, "image")).toEqual({ error: "http:// 또는 https:// 로 시작하는 주소를 입력하세요" });
    expect(buildItemFromUrl("https://example.com/image")).toEqual({
      error: "종류를 알 수 없는 주소입니다. 종류를 이미지나 동영상으로 직접 고르세요",
    });
    expect(buildItemFromUrl("https://example.com/a.svg")).toEqual({
      error: "종류를 알 수 없는 주소입니다. 종류를 이미지나 동영상으로 직접 고르세요",
    });
  });
});

describe("슬라이드 이동", () => {
  it("nextIndex·prevIndex 는 끝에서 돌아온다", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(prevIndex(1, 3)).toBe(0);
    expect(prevIndex(0, 3)).toBe(2);
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });

  it("clampIndex — 항목이 줄어도 범위 안", () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(4, 0)).toBe(0);
  });

  it("slideAdvance — 하나면 넘기지 않고, 동영상은 끝나면, 나머지는 시간이 되면 넘긴다", () => {
    const image: MediaItem = { kind: "image", src: "https://e.com/a.png" };
    const video: MediaItem = { kind: "video", src: "https://e.com/a.mp4" };
    const yt: MediaItem = { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" };
    expect(slideAdvance(image, false, 1)).toBe("none");
    expect(slideAdvance(video, false, 1)).toBe("none");
    expect(slideAdvance(undefined, false, 0)).toBe("none");
    expect(slideAdvance(image, false, 3)).toBe("timer");
    expect(slideAdvance(yt, false, 3)).toBe("timer");
    expect(slideAdvance(video, false, 3)).toBe("ended");
    // 불러오기에 실패한 동영상은 끝나는 일이 없으므로 시간으로 넘긴다
    expect(slideAdvance(video, true, 3)).toBe("timer");
  });

  it("slideTimerReady — 이미지는 받아지거나 실패한 뒤에, 나머지는 바로 센다", () => {
    const image: MediaItem = { kind: "image", src: "https://e.com/a.png" };
    const video: MediaItem = { kind: "video", src: "https://e.com/a.mp4" };
    const yt: MediaItem = { kind: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" };
    expect(slideTimerReady(image, false, false)).toBe(false);
    expect(slideTimerReady(image, true, false)).toBe(true);
    expect(slideTimerReady(image, false, true)).toBe(true);
    expect(slideTimerReady(yt, false, false)).toBe(true);
    expect(slideTimerReady(video, false, true)).toBe(true);
    expect(slideTimerReady(undefined, true, false)).toBe(false);
  });
});

describe("moveItem — 순서 바꾸기", () => {
  const list = ["a", "b", "c"];
  it("한 칸 위·아래로 옮긴다", () => {
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("범위를 벗어나면 그대로(같은 참조)", () => {
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 2, 1)).toBe(list);
    expect(moveItem(list, 9, 1)).toBe(list);
  });
  it("원본을 바꾸지 않는다", () => {
    moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("업로드 파일 검사(서버 문구와 같다)", () => {
  const BAD_TYPE = "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)";
  const TOO_BIG = "이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다";

  it("허용 확장자는 통과", () => {
    for (const name of ["a.png", "a.JPG", "a.jpeg", "a.gif", "a.webp", "a.mp4", "a.webm", "내 사진.final.PNG"]) {
      expect(checkUploadFile({ name, size: 1024 }), name).toBeNull();
    }
  });

  it("SVG·html·확장자 없음은 형식 오류", () => {
    for (const name of ["a.svg", "a.html", "a.exe", "a", "png", "a.png.exe"]) {
      expect(checkUploadFile({ name, size: 1024 }), name).toBe(BAD_TYPE);
    }
  });

  it("이미지 10MB·동영상 100MB 를 넘으면 크기 오류, 경계값은 통과", () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(VIDEO_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(checkUploadFile({ name: "a.png", size: IMAGE_MAX_BYTES })).toBeNull();
    expect(checkUploadFile({ name: "a.png", size: IMAGE_MAX_BYTES + 1 })).toBe(TOO_BIG);
    expect(checkUploadFile({ name: "a.mp4", size: VIDEO_MAX_BYTES })).toBeNull();
    expect(checkUploadFile({ name: "a.mp4", size: VIDEO_MAX_BYTES + 1 })).toBe(TOO_BIG);
    expect(checkUploadFile({ name: "a.mp4", size: IMAGE_MAX_BYTES + 1 })).toBeNull();
  });

  it("input accept 는 SVG 를 내놓지 않도록 형식을 하나씩 적는다", () => {
    expect(UPLOAD_ACCEPT).toBe("image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm");
    expect(UPLOAD_ACCEPT).not.toContain("svg");
    expect(UPLOAD_ACCEPT).not.toContain("image/*");
  });
});

describe("업로드 응답 해석", () => {
  const FLAT = { fileId: FILE_ID, origNm: "공장.png", contentType: "image/png", size: 2048 };

  it("평평한 JSON 을 읽는다", () => {
    expect(parseUploadResponse(200, FLAT)).toEqual(FLAT);
  });

  it("data·data.result 봉투도 읽는다", () => {
    expect(parseUploadResponse(200, { success: true, data: FLAT })).toEqual(FLAT);
    expect(parseUploadResponse(200, { meta: { success: true }, data: { result: FLAT } })).toEqual(FLAT);
  });

  it("fileId 가 없거나 모양이 틀리면 응답 오류", () => {
    expect(() => parseUploadResponse(200, { ...FLAT, fileId: "" })).toThrow("업로드 응답이 올바르지 않습니다");
    expect(() => parseUploadResponse(200, { ...FLAT, fileId: "../x" })).toThrow("업로드 응답이 올바르지 않습니다");
    expect(() => parseUploadResponse(200, null)).toThrow("업로드 응답이 올바르지 않습니다");
    expect(() => parseUploadResponse(200, "ok")).toThrow("업로드 응답이 올바르지 않습니다");
  });

  it("오류 응답은 서버가 준 문구를 우선 쓴다(error.message·message·meta.message·errors[0])", () => {
    expect(() => parseUploadResponse(400, { error: { message: "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)" } })).toThrow(
      "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)",
    );
    expect(() => parseUploadResponse(400, { success: false, message: "크기 초과" })).toThrow("크기 초과");
    expect(() => parseUploadResponse(400, { meta: { success: false, message: "거부" } })).toThrow("거부");
    expect(() => parseUploadResponse(400, { errors: [{ message: "첫 오류" }] })).toThrow("첫 오류");
  });

  it("OASIS 처럼 HTTP 200 이어도 meta.success=false 면 오류", () => {
    expect(() => parseUploadResponse(200, { meta: { success: false, message: "권한 없음" } })).toThrow("권한 없음");
  });

  it("본문이 없으면 상태 코드로 안내한다", () => {
    expect(() => parseUploadResponse(413, null)).toThrow("이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다");
    expect(() => parseUploadResponse(401, null)).toThrow("인증이 만료되었습니다");
    expect(() => parseUploadResponse(403, null)).toThrow("권한이 없습니다");
    expect(() => parseUploadResponse(500, null)).toThrow("(HTTP 500)");
  });
});

describe("uploadKindOf·mediaItemFromUpload", () => {
  it("서버가 정한 contentType 으로 종류를 정한다(브라우저 file.type 이 아님)", () => {
    expect(uploadKindOf("image/png", "x")).toBe("image");
    expect(uploadKindOf("image/webp", "x")).toBe("image");
    expect(uploadKindOf("video/mp4", "x")).toBe("video");
    expect(uploadKindOf("video/webm", "x")).toBe("video");
  });

  it("contentType 이 이상하면 이름의 확장자로, 그래도 모르면 null", () => {
    expect(uploadKindOf("", "a.mp4")).toBe("video");
    expect(uploadKindOf("application/octet-stream", "a.gif")).toBe("image");
    expect(uploadKindOf("application/octet-stream", "a.svg")).toBeNull();
    expect(uploadKindOf("image/svg+xml", "a.svg")).toBeNull();
  });

  it("업로드 결과를 media:{fileId} 항목으로 바꾼다", () => {
    expect(mediaItemFromUpload({ fileId: FILE_ID, origNm: "a.png", contentType: "image/png", size: 1 })).toEqual({
      kind: "image",
      src: `media:${FILE_ID}`,
    });
    expect(mediaItemFromUpload({ fileId: FILE_ID, origNm: "a.mp4", contentType: "video/mp4", size: 1 })).toEqual({
      kind: "video",
      src: `media:${FILE_ID}`,
    });
  });

  it("올릴 수 없는 종류면 던진다", () => {
    expect(() => mediaItemFromUpload({ fileId: FILE_ID, origNm: "a.svg", contentType: "image/svg+xml", size: 1 })).toThrow(
      "올릴 수 없는 파일 형식입니다",
    );
  });
});

describe("uploadMedia — 요청 모양", () => {
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "공장.png", { type: "image/png" });
  const okBody = { fileId: FILE_ID, origNm: "공장.png", contentType: "image/png", size: 4 };

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  it("멀티파트 POST — 필드 file, Content-Type 은 브라우저가 경계값과 함께 정하게 둔다", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, okBody));
    const out = await uploadMedia(file, fetchMock as unknown as typeof fetch);
    expect(out).toEqual(okBody);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MEDIA_UPLOAD_URL);
    expect(url).toBe("/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const sent = (init.body as FormData).get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("공장.png");
  });

  it("서버 오류 문구를 그대로 던진다", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { success: false, message: "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)" }));
    await expect(uploadMedia(file, fetchMock as unknown as typeof fetch)).rejects.toThrow("올릴 수 없는 파일 형식입니다");
  });

  it("JSON 이 아닌 오류 본문(게이트웨이 413 등)은 상태 코드로 안내한다", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>too large</html>", { status: 413 }));
    await expect(uploadMedia(file, fetchMock as unknown as typeof fetch)).rejects.toThrow("이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다");
  });

  it("네트워크가 끊기면 연결 안내", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(uploadMedia(file, fetchMock as unknown as typeof fetch)).rejects.toThrow("서버와 연결할 수 없습니다");
  });
});
