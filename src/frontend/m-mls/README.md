# @dk-oasis/m-mls

물류·재고 도메인의 **화면 라이브러리** 패키지다. 단독 실행되는 Next.js 앱이 아니라,
tsup 으로 빌드한 페이지 컴포넌트를 서브패스로 내보내고 포털 호스트인 `@dk-oasis/mcm` (m-mcm) 이
이를 마이크로 프론트엔드 모듈로 조합해 렌더링한다.

## 디렉토리 규약

```
pages/{area}/{screenId}.tsx   화면 엔트리 (얇은 래퍼, default export = 페이지 컴포넌트)
src/{area}/...                실제 화면 구현
src/index.ts                  배럴 — 공용 타입만 재수출
```

업무 영역(area) 하나가 `pages/{area}/` 와 `src/{area}/` 한 쌍을 가진다.
이 템플릿에서는 `sample` 이 유일한 자리표시자 영역이며,
실제 영역은 `inbound / stock / outbound` 처럼 도메인에 맞게 새로 만든다.

## 화면 추가 절차

1. `src/{area}/` 에 화면 구현을 작성한다.
2. `pages/{area}/{screenId}.tsx` 에 `PageProps` 를 받는 얇은 래퍼를 만들고 default export 한다.
3. `tsup.config.ts` 의 두 번째 설정 `entry` 에 `"pages/{area}/{screenId}"` 를 1줄 추가한다.
4. `package.json` 의 `exports` 는 `"./pages/*"` 와일드카드라 별도 수정이 필요 없다.
5. 호스트(m-mcm)의 포털 라우팅에 해당 서브패스를 등록한다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm build` | tsup 번들 생성 (`dist/`) |
| `pnpm dev` | tsup watch — 호스트 dev 서버와 병행 |
| `pnpm dev:next` | 포트 5004 단독 미리보기 |
| `pnpm lint` | `tsc --noEmit` 타입 검사 |
| `pnpm test` | vitest 단위 테스트 |

## 자리표시자

`src/sample/SampleInventoryPanel.tsx` 는 `@dk-oasis/shared/layout` 의
`PageLayout` / `ContentBody` / `ContentPanel` 사용법만 보여주는 더미다.
실제 업무 화면을 채울 때 삭제한다.
