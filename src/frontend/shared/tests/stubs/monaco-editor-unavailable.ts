// 시험용 대역: monaco-editor 를 불러오지 못하는 상황을 만든다(vitest.config.ts 의 resolve.alias).
// 이 모듈을 읽으면 던지므로 monaco-loader 의 동적 import 가 거절되고, SqlCodeEditor 는 Textarea 대체 칸으로 돈다.
// Monaco 실제 동작은 jsdom 에서 시험하지 않고 브라우저 확인으로 본다.
throw new Error("monaco-editor is unavailable in unit tests");
