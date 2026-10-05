/**
 * 탭 내보내기 파일 내려받기·가져오기 파일 읽기(widget-tabs 2026-10-05) — 브라우저 API 를 쓰는 얇은 부분만 둔다.
 * 파일 내용 만들기·검사는 widget-layout.ts 의 buildTabExport·parseTabImport(순수 함수)가 맡는다.
 */

/** JSON 을 파일로 내려받는다(들여쓰기 2칸). */
export function saveJsonFile(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 내려받기가 시작된 뒤에 푼다.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 고른 파일의 글. Blob.text 가 없는 환경이면 FileReader 로 읽는다. */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsText(file);
  });
}
