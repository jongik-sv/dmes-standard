# MDM 메타 캐시 버전별 적재(정의@버전 + 색인) 설계

> 작성: 2026-10-03 · 상태: **구현 완료(브랜치 feat/mdm-meta-cache-per-version)** · 기반: 현행 설계 [`2026-10-02-mdm-meta-cache-design.md`](2026-10-02-mdm-meta-cache-design.md)(이하 "현행 스펙") + D-152(RELEASED 투영, dev 머지 27451909)
> 근거 표기의 줄임: `engine/` = `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/`, `cactus/` = `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/`, `mdm/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/`, `부록 A` = 이 문서 끝의 벤치 요약, `현행 스펙` = `docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md`. 줄 번호는 dev 27451909 기준이다.

## 1. 목적과 범위

### 1.1 바꾸려는 것

업무 모듈(cactus) 메타 캐시는 지금 정의 하나의 RELEASED 전 이력을 키 하나에 담는다. 이 문서는 그 값을 **목차 키**(버전 목록)와 **버전 본문 키**(버전 하나의 정의)로 나누는 구조를 정한다. 대상은 코드(CODE)·룰(RULE)·룰 세트(RULE_SET)·전문(LAYOUT) 네 가지다. 컬럼(COLUMN)·도메인(DOMAIN)은 버전이 없으므로 바꾸지 않는다.

### 1.2 지금 상태 (2026-10-03 확인)

- 값 모양: 룰·룰 세트·전문은 RELEASED 버전 전체 목록을, 코드는 엔진 `CodeRows`(다섯 표 원본)를 한 키에 싣는다(현행 스펙:116-119, `mdm/feed/metaFeed/service/MetaFeedDefinitions.java:70-158`). D-152 는 코드 값을 RELEASED 투영으로 줄였지만 여전히 전 이력이다(`engine/code/CodeRowsProjection.java:46-63`, `MetaFeedDefinitions.java:121-128`).
- 판정: 업무 모듈은 판정할 때마다 목록에서 버전을 고른다. 룰·세트·전문은 `MdmDefinitionLookup.select`(`cactus/MdmDefinitionLookup.java:102-113`), 코드는 엔진 `DefaultCodeResolver` 가 고른다(`engine/code/DefaultCodeResolver.java:102-107`).
- 비용: 코드 해석기는 호출마다 고른 버전의 유효 행을 찾으려고 items·cateItems 전체를 훑는다(`DefaultCodeResolver.java:115-150`). 엔진이 미리 계산한 집합을 받는 자리(`CodeEffLookup`)가 있지만 업무 모듈은 `CodeEffLookup.NONE` 을 쓴다(`cactus/MdmValidator.java:114`, `cactus/MdmMetaController.java:77`).
- 벤치(부록 A, 코드 1,000개·RELEASED 1,000버전·버전마다 10% 변경, 시나리오 C):
  - 메모리는 전 이력 투영이 84.6 MB(힙)이고, 현재 버전 하나만 담으면 0.83 MB 다(부록 A.2·A.4).
  - TABLE 소속 판정(isMember)은 1회에 투영 2.8 ms, 코드@버전 스냅숏 34 µs, 색인 6 ns 걸렸다(부록 A.3).
  - 색인을 만드는 데 1 ms 미만, 스냅숏을 자르는 데 최대 약 3 ms 걸렸다(부록 A.4).
  - 주의할 점이 있다. 옛 버전 스냅숏을 약 10개 넘게 함께 들면 전 이력 투영 한 덩어리보다 커진다. 이력이 짧은 코드(코드 100개·10버전)는 스냅숏 6개가 투영의 4배다. 다만 절대 크기는 0.5 MB 다(부록 A.4).

### 1.3 사용자 결정 (2026-10-03, 그대로 반영)

| # | 결정 | 내용 |
|---|---|---|
| P1 | 버전별 캐시 | 업무 모듈은 주로 최종 버전만 쓴다. 그래서 버전별로 캐시한다. 대상은 코드·룰·룰 세트·전문 모두 |
| P2 | 키 구조 | 목차 키(예 `CODE:X`) + 버전 본문 키(예 `CODE:X@ver`). 목차는 버전 목록(ver·status·applyFrom·applyTo)만 들고, 시각 → 버전 선택은 목차로 한다 |
| P3 | 최종 버전 | 지금 시각에 적용 중인 버전 |
| P4 | 카테고리 소속 | 코드 버전 본문의 카테고리(REGEX·TABLE 모두)는 소속 코드 키 배열을 MDM 이 미리 계산해 싣는다. 결과가 그 버전 items 전체이면 배열 대신 "전체" 표시를 한다(이름이 아니라 계산 결과로 판단). 업무 모듈은 적재할 때 해시·비트셋 같은 색인으로 바꾼다. 엔진의 `CodeEffLookup` 자리를 활용할 수 있는지 검토한다 |
| P5 | 무효화 | 지금 기록기를 그대로 쓰고, 정의 단위로 목차와 본문을 묶어 지운다 |
| P6 | 수명 | 옛 버전 본문의 유휴 수명은 10분. 최종 버전 본문은 지금 수명 정책(유휴 60분·절대 24시간, 현행 스펙:175-176)을 유지 |
| (전제) | 취소 버전 | 확정 취소한 버전은 "없던 것"으로 본다(D-152 투영을 따른다) |

설계 중에 나온 추가 결정 P7~P13(2026-10-03 사용자 결정)은 §12 에 근거와 함께 적는다.

### 1.4 범위

- 범위 안: MDM 피드의 목차·본문 제공, cactus 캐시의 키·적재·색인·수명·무효화, 엔진 코드 해석기와의 연결, 판정 동치 시험, 캐시 관리 화면 영향, 배포 순서.
- 범위 밖: §11 에 적는다.

## 2. 전체 구조

```
[MDM 8096]                                            [업무 모듈 cactus-core]
 metaFeed/view                                          MdmMetaService
   part 없음  → 지금 값(전 이력, 옛 cactus 용)            lookupAt(type, keys, t)
   part=TOC   → 목차(+ 선택: at 시각의 본문 하나) ◀──────── ① 목차 미스: TOC(at=t) 한 번에
   part=BODY  → 본문(키·버전 쌍) ◀──────────────────────── ② 본문 미스: BODY(key, ver) 묶음
 CODE 본문 = 투영(D-152) → 버전 자르기 → 카테고리 소속 계산      MdmMetaCache
 TB_MDM_META_REV (그대로, 정의 키)                         목차 X  ─┬─ 본문 X@1.000 (옛 → 유휴 10분)
        ▲ 기록기 변경 없음                                         └─ 본문 X@2.000 (최종 → 유휴 60분)
        └──────── changes(since) ◀── MdmRevisionPoller: 키 X → 목차 X + 본문 X@* 묶어 지움
                                                          엔진 연결: 목차 → 버전 → 본문·색인(CodeEffLookup)
```

## 3. 키와 값 모양

### 3.1 공통 규칙

- **논리 키**:
  - 목차 키는 지금 키 그대로다(`CODE:PROC_CD`, `RULE:R0001`, `RULE_SET:S0001`, `LAYOUT:42`).
  - 본문 키는 `{정의 키}@{ver}` 다. ver 는 MDM `VersionNumbers.plain` 의 scale 3 문자열(`"1.000"`)이다. 같은 형식이 전문 피드에 이미 있다(`mdm/feed/metaFeed/service/MetaFeedDefinitions.java:172`).
  - 키 비교는 문자열 그대로 한다. 따라서 `1.0` 과 `1.000` 을 같은 키로 만들려면 ver 를 늘 scale 3 으로 맞춘다.
- **`@` 충돌**: 정의 ID 에 `@` 가 들어갈 수 없다는 전제를 둔다. 구현 계획 첫 단계에서 코드·룰·세트 ID 의 입력 검증을 실측해 확인한다(전문 키는 숫자라 해당하지 않는다, `MetaFeedDefinitions.java:141-146`).
- **목차 값**: `{header, versions[]}` 다. versions 는 RELEASED 만 담고, ver 를 수 비교로 오름차순 정렬한다(지금 목록 정렬과 같다, `MetaFeedDefinitions.java:92`). 버전마다 `{ver, status, applyFrom, applyTo}` 를 싣는다. status 는 늘 `RELEASED` 다. 결정 P2 가 status 를 목차에 두라고 했으므로 칸은 남긴다. header 는 코드만 쓰고 나머지 대상은 null 이다(§3.3).
- **RELEASED 가 없는 정의**: 목차는 있고 versions 는 빈 목록이다. 지금의 "빈 목록" 값과 같은 뜻이다(`MetaFeedDefinitions.java:36-39`). 이런 정의는 본문이 없다.
- **MDM 에 없는 정의**: 지금처럼 목차 키를 "없음"으로 캐시한다(현행 스펙:193).

### 3.2 대상별 버전 선택과 "최종 버전"

선택 규칙은 대상마다 다르다. 하나로 합치지 않고, 지금 쓰는 함수를 목차에 그대로 적용한다.

| 대상 | 시각 t 의 버전 (목차로 고른다) | 근거 | "최종 버전"(결정 P3: t = 지금) |
|---|---|---|---|
| 코드 | 아래 두 단계로 고른다.<br>① RELEASED 중 `applyFrom <= t < applyTo` 인 버전. 여럿이면 applyFrom 이 가장 이른 것<br>② ①이 없으면 ver 가 가장 작은 RELEASED 버전으로 **소급**한다. 처음 버전보다 앞선 시각, 빈틈, 닫힌 끝 뒤 모두 소급한다 | `engine/code/DefaultCodeResolver.java:102-107`, `engine/code/Segments.java:17-22` | 지금 시각의 소급 결과. RELEASED 가 하나라도 있으면 **늘 있다** |
| 룰·룰 세트·전문 | RELEASED 중 `applyFrom <= t < applyTo`(applyFrom 이 null 이면 제외, applyTo 가 null 이면 열린 끝). 여럿이면 ver 가 가장 큰 것을 고르고, 소급은 없다 | `cactus/MdmDefinitionLookup.java:102-113` | 지금 시각에 적용 중인 버전. **없을 수 있다**. 없으면 본문이 없고, 판정 결과는 지금과 같이 RULE_NOT_FOUND·SET_NOT_FOUND·빈 값이다 |
| 전문 | 위와 같은 규칙으로 버전을 고른 뒤, 본문 안의 합성 구간에서 t 를 담는 구간을 고른다 | `cactus/MdmDefinitionLookup.java:82-87` | 룰과 같다 |

- 코드 선택 함수는 지금 `DefaultCodeResolver` 의 private static 메서드다(`DefaultCodeResolver.java:102`). 목차 선택과 본문 생성이 같은 함수를 쓰도록 엔진에 공개 함수로 꺼낸다(예 `CodeVersions.select(versions, t)`). 이렇게 하면 판정 의미가 엔진 한 곳에 남는다(D-152 의 근거와 같다).
- 예약 버전(applyFrom 이 미래)은 최종 버전이 아니다. 적용 시작 시각이 지나면 쓰기 없이도 최종이 된다(현행 스펙:134). 그래서 "최종인가"는 적재할 때 정하지 않고, 조회하거나 쓸 때마다 목차와 지금 시각으로 다시 판정한다(§5.5).

### 3.3 코드(CODE)

**목차** `CODE:PROC_CD`:

```json
{
  "header": { "maruCodeId": "PROC_CD", "status": "INUSE" },
  "versions": [
    { "ver": 1.000, "status": "RELEASED", "applyFrom": "2026-01-01T00:00:00", "applyTo": "2026-07-01T00:00:00" },
    { "ver": 2.000, "status": "RELEASED", "applyFrom": "2026-07-01T00:00:00", "applyTo": "9999-12-31T00:00:00" }
  ]
}
```

- header 는 목차에 싣는다. 엔진 `codeList` 는 버전을 고르기 전에 헤더가 DEPRECATED 인지 본다(`DefaultCodeResolver.java:80`). 헤더 상태는 버전과 무관하므로 본문에 두면 버전마다 중복된다.
- versions 원소는 엔진 `CodeVersionRow` 모양 그대로다(`engine/spi/CodeLookup.java:33`). ver 직렬화도 지금 CODE 값과 같다.

**본문** `CODE:PROC_CD@2.000`:

```json
{
  "maruCodeId": "PROC_CD",
  "ver": 2.000,
  "items": [
    { "code": "CGL", "fromVer": 2.000, "toVer": 9999.000, "name": "연속아연도금", "alterName": null, "seq": 1,
      "lvl": ["P", null, null, null, null], "attrs": ["X", null, null, null, null, null, null, null, null, null] },
    { "code": "EGL", "fromVer": 1.000, "toVer": 9999.000, "name": "전기아연도금", "alterName": null, "seq": 2,
      "lvl": ["P", null, null, null, null], "attrs": [null, null, null, null, null, null, null, null, null, null] }
  ],
  "categories": [
    { "cateId": "BASE", "fromVer": 1.000, "toVer": 9999.000, "defKind": "REGEX", "defExpr": ".*", "defTarget": "CODE",
      "all": true, "members": null },
    { "cateId": "PLATING", "fromVer": 3.000, "toVer": 9999.000, "defKind": "TABLE", "defExpr": null, "defTarget": null,
      "all": false, "members": ["CGL"] }
  ]
}
```

- **items**: 이 버전에 유효한 코드 행(`fromVer <= v < toVer`)만 담는다. 해석기와 같은 조건이다(`DefaultCodeResolver.java:146-150`). fromVer·toVer 는 원본 값을 그대로 둔다. 그래야 엔진 `CodeItemRow` 를 바꾸지 않아도 되고, 관리 화면에서 행의 출처를 볼 수 있다.
- **categories**: D-152 투영에 남은 cateId 마다 `Segments.coveringOrEarliest` 로 고른 정의 하나와 그 정의로 계산한 소속을 싣는다(`DefaultCodeResolver.java:116-120`). 고른 정의가 없는 cateId 는 싣지 않는다. 해석기도 그런 cateId 를 빈 집합으로 판정한다(`:118-120`).
  - 예시의 `PLATING` 은 정의 fromVer(3.000)가 본문 ver(2.000)보다 뒤다. 이렇게 이 버전을 덮지 않는 정의도 최초 소급으로 고를 수 있으므로 싣는다(`engine/code/Segments.java:28-37`).
  - TABLE 소속은 `effVer = max(정의 fromVer, v)` 기준의 cateItems 로 계산한다(`DefaultCodeResolver.java:133-141`). 본문 버전과 다른 버전의 소속 행을 읽을 수 있다는 뜻이다. 그래서 cateItems 원본은 싣지 않고 계산 결과만 싣는다.
- **members / all**(결정 P4):
  - members 는 엔진 `effectiveCodes(id, v, cateId)` 결과다. 이 결과는 소급을 적용했고 이 버전에 유효한 코드의 부분집합이다(`engine/code/CodeResolver.java:31-32`, `DefaultCodeResolver.java:114`).
  - 결과가 이 본문 items 의 코드 집합과 같으면 `all: true, members: null` 로 싣는다. 판단은 카테고리 이름이 아니라 집합 비교로 한다.
  - 정의는 있는데 소속이 없으면 `all: false, members: []` 다.
- 버전 하나만 담으므로 versions·cateItems 칸은 없다.

### 3.4 룰(RULE)

- 목차 `RULE:R0001` = `{"header": null, "versions": [{ver, status, applyFrom, applyTo}…]}`.
- 본문 `RULE:R0001@1.001` = 엔진 `RuleDefinition` 하나다(`engine/spi/DefinitionLookup.java:71-81`). 지금 목록의 원소 하나와 같은 모양이다.
- 목차의 applyFrom·applyTo 는 본문의 같은 칸과 같은 값이다. 선택은 목차로만 하고, 본문 칸은 확인용으로 남긴다.

### 3.5 룰 세트(RULE_SET)

- 목차는 룰과 같은 모양이다.
- 본문 `RULE_SET:S0001@2.000` = 엔진 `RuleSetDefinition` 하나다(`DefinitionLookup.java:157-164`). `status`(부모 계산 상태)는 지금처럼 본문에 남는다.
- 세트 본문은 `ruleIds` 로 룰을 가리킨다. 가리킨 룰은 같은 판정 시각으로 각자 목차 → 본문을 따로 고른다. 지금도 세트와 룰을 따로 고른다(`cactus/MdmValidator.java:235-262`).

### 3.6 전문(LAYOUT)

- 목차는 룰과 같은 모양이다.
- 본문 `LAYOUT:42@1.000` = `MdmLayoutVersion` 하나다. 버전 구간과 헤더 경계로 나눈 합성 구간 `segments[{applyFrom, applyTo, snapshot}]` 을 담는다(`cactus/MdmLayoutVersion.java:15-23`). 구간 고르기는 지금과 같이 본문 안에서 한다.
- 본문 하나에 그 버전의 합성 구간이 전부 들어 있다. 헤더 확정·확정 취소는 그 헤더를 쌓은 전문 키로 이미 펼쳐 기록하므로(`mdm/common/version/DefaultVersionStateService.java:219-226`) 구간이 바뀌면 묶음 무효화가 된다.

## 4. MDM 쪽

### 4.1 피드 API 변경 — `metaFeed/view` 에 `part` 를 더한다

| 요청 | params | 키(`grids.keys.rows`) | 응답 `data.result` |
|---|---|---|---|
| 지금 그대로 | `type` | `[{key}]` | 지금과 같다(전 이력). **`part` 칸이 없다** |
| 목차 | `type`, `part: "TOC"`, 선택 `at`(KST `yyyy-MM-ddTHH:mm:ss`) | `[{key}]` | `{part: "TOC", items: [{key, value: 목차, current: {ver, value: 본문} \| null}], failed: [{key, message}]}` |
| 본문 | `type`, `part: "BODY"` | `[{key, ver}]` | `{part: "BODY", items: [{key, ver, value: 본문}], failed: [{key, ver, message}]}` |

- `type` 은 지금 여섯 가지 그대로다. `MetaTargetType` 은 변경 기록 표의 `TARGET_TYPE` CHECK 와 피드 type 이 함께 쓰는 enum 이다(`mdm/common/metarev/MetaTargetType.java:6-8`, `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V20__create_mdm_meta_rev.sql:25`). 새 type 을 더하면 기록 표와 강제 기록(`force`)까지 번지므로 type 은 늘리지 않는다.
- `part` 는 COLUMN·DOMAIN 에서 무시한다. 그 경우 응답에 `part` 를 싣지 않아 지금과 같다.
- **하위 호환 신호는 두 가지다.** 옛 MDM 이 모르는 params(`part`·`at`)를 어떻게 다루는지는 **확인하지 못했다**. BPMN 은 params 를 `MetaFeedViewRequest` 로 묶는데(`src/backend/mdm/api/src/main/resources/services/feed/metaFeed.bpmn:39-44`), 이 DTO 에는 `type`·`systemCode` 두 칸뿐이다(`mdm/feed/metaFeed/dto/MetaFeedViewRequest.java:4-13`). 모르는 칸을 무시할지 거부할지는 OASIS 런타임(외부 jar)의 바인딩 설정에 달려 있다. 그래서 두 경우를 모두 옛 MDM 신호로 본다.
  - (가) 응답에 요청한 `part` 가 되울려 오지 않으면 옛 MDM 이 params 를 무시한 것이다. 받은 값은 전 이력이고, §5.8 물러남으로 처리한다. 값 모양으로 짐작하지 않는다.
  - (나) `part` 를 담은 요청이 업무 거부(`meta.success=false`)로 돌아오면 옛 MDM 이 거부한 것일 수 있다. 지금 클라이언트는 이 거부를 그 묶음 키 전부의 failed 로 바꾼다(`cactus/MdmMetaClient.java:99-101`). 그러면 (가) 검사가 한 번도 걸리지 않고 모든 키가 받을 수 없음이 된다. 그래서 TOC·BODY 요청이 거부되면 같은 키 묶음을 `part` 없이 **한 번** 다시 보내고, 성공하면 §5.8 물러남으로 처리한다. 새 MDM 에서는 이런 거부가 키 상한 초과 같은 입력 오류뿐이고 cactus 는 500 개씩 나눠 보내므로, 한 번 더 보내도 해가 없다.
  - 어느 쪽인지는 구현 계획 첫 단계에서 옛 MDM 에 `part` 를 보내 실측한다. 실측 결과와 상관없이 두 신호를 모두 처리한다.
- **`at` 과 `current`**: 목차를 처음 받을 때 본문까지 한 번에 받아 왕복을 줄인다.
  - MDM 은 §3.2 규칙으로 `at` 시각의 버전을 고르고, 그 본문을 같은 읽기 트랜잭션에서 만든다. 그래서 목차와 본문이 같은 시점의 원장을 본다.
  - cactus 는 받은 목차로 직접 다시 고른다. 고른 ver 가 `current.ver` 와 다르면 `current` 를 버리고 BODY 로 다시 받는다. 버전 선택 판단은 늘 cactus 가 한다.
- **본문에 RELEASED 가 아닌 ver 를 요청한 경우**(목차가 낡았을 때): `failed` 에 `message: "NOT_RELEASED"` 를 담는다. 이 경우를 "없음"으로 주지 않는다(§5.6).
- 키 상한: `MAX_KEYS`(500)는 요청 행 수로 센다(`MetaFeedService.java:40`). 본문은 키·버전 쌍 하나가 행 하나다. cactus 는 지금처럼 500 개씩 나눠 보낸다(`cactus/MdmMetaClient.java:86-91`).
- BODY 키 읽기는 지금 `keyList` 를 다시 쓰지 않는다. `keyList` 는 `key` 문자열만으로 중복을 지우므로(`MetaFeedService.java:137-153`) 같은 코드의 두 버전을 요청하면 하나가 사라진다. BODY 는 `(key, ver)` 쌍으로 중복을 지우는 별도 함수를 둔다.
- BPMN 의 view 흐름과 DTO 지정은 그대로 둔다(`metaFeed.bpmn:39-48`). `MetaFeedViewRequest` 에 `part`·`at` 칸을 더하고, 서비스가 키 행의 `ver` 를 읽는다. 키 목록은 계속 `grids.keys.rows` 로만 받는다(params 배열 금지, `MetaFeedService.java:33`).

### 4.2 본문 생성

**코드** (D-152 투영 위에 선다):

1. 원장 다섯 표를 읽는다. 지금 조회를 그대로 쓴다(`mdm/common/mastercode/MdmCodeLookup.java:27-47`). 이 조회는 `MARU_CODE_ID` 조건만 있어 코드의 전 이력을 읽는다(`mdm/common/mastercode/MasterCodeLedgerQueries.java:145-151, :171-174, :184-187`).
2. `CodeRowsProjection.releasedOnly` 를 적용한다(`engine/code/CodeRowsProjection.java:46-63`). 확정 취소한 버전은 여기서 없던 것이 된다.
3. 엔진의 새 공개 함수 `CodeVersionSlicer.slice(projected, v)` 로 §3.3 본문을 만든다. 유효 items, 카테고리별 정의 고르기, `DefaultCodeResolver.effectiveCodes` 로 소속 계산, "전체" 판정을 한 함수에서 한다. 이 함수를 엔진에 두는 까닭은 두 가지다. cactus 물러남(§5.8)이 같은 함수를 쓰고, 동치 시험(§6)의 기준이 한 곳에 있게 된다.
4. 한 요청에 같은 코드의 버전이 여럿이면 1·2 단계는 한 번만 한다.

- **목차**는 헤더와 버전 표만 읽는다(`MasterCodeLedgerQueries.header`·`versions`, `:73-107`). items 는 읽지 않는다. 버전 표에는 RELEASED 필터만 적용하면 투영 결과와 같다(`CodeRowsProjection.java:47`).
- **비용**:
  - 벤치는 DB 읽기를 빼고 쟀다. 시나리오 C 에서 투영 12 ms, 자르기 2.8 ms, 소속 계산은 해석기 한 번(TABLE·REGEX 각 수 ms)이다(부록 A.4).
  - DB 읽기는 전 이력 행 수(C 기준 items 약 10만 행)에 비례한다. 다만 본문은 미스 때만 만든다. 최종 버전은 수명이 길어 미스가 드물다.
  - 1차 구현은 "전부 읽기 → 투영 → 자르기"로 한다. SQL 로 버전을 거르는 최적화(`FROM_VER <= :v AND :v < TO_VER`, TABLE 은 effVer 로 한 번 더)는 실측으로 필요성이 보이면 후속으로 한다. 그때도 결과가 같은지를 §6 시험이 확인한다.

**룰**: `ruleQueries.versions(id)` 에서 ver 가 같은 RELEASED 버전 하나만 읽어 조립한다(`MetaFeedDefinitions.java:81-90`). 지금은 전 버전을 조립하므로 본문 요청이 지금보다 싸다. 목차는 버전 행만 읽고 조립하지 않는다.

**룰 세트**: `StoredDefinitionLookup.releasedSets(id)` 에서 ver 로 하나를 고른다(`MetaFeedDefinitions.java:101-113`). 버전 하나만 만드는 메서드를 더할지는 구현 계획에서 비용을 보고 정한다.

**전문**: `LayoutReleaseTimeline.released(id)` 에서 ver 로 하나를 고른다(`MetaFeedDefinitions.java:137-158`). 타임라인은 전 버전 구간을 계산하므로 1차는 그대로 쓰고 거르기만 한다.

### 4.3 변경 기록 — 바꾸지 않는다 (결정 P5)

- 기록기는 지금처럼 정의 키만 남긴다. 확정·확정 취소는 `DefaultVersionStateService.record` 한 곳에서 기록한다(`mdm/common/version/DefaultVersionStateService.java:212-226`). 코드는 `recorder.code(id)` 가 도메인·컬럼까지 펼친다(`mdm/common/metarev/MetaRevisionRecorder.java:135-148`).
- 본문은 불변이 아니다. 다음 세 경우를 보면 버전 하나가 확정된 뒤에도 그 본문이 바뀔 수 있다. 그래서 "버전 본문은 불변이니 무효화하지 않는다"는 최적화는 하지 않는다.
  - RELEASED 행을 제자리에서 고친다(`CodeItemEditService.patch`, 현행 스펙:101).
  - 새 버전에서 처음 생긴 카테고리 정의가 최초 소급으로 옛 버전 판정에 들어간다(`Segments.java:28-37`).
  - 헤더 확정이 전문 구간을 다시 나눈다(현행 스펙:102).

## 5. 업무 모듈 쪽 (cactus-core `com.dongkuk.dmes.cactus.mdm`)

### 5.1 저장 구조

- 대상 종류별 맵(`cactus/MdmMetaCache.java:63`)에서 목차는 지금처럼 정의 키로 둔다. 본문은 **정의 키 아래 묶음**으로 둔다. 예: `ConcurrentHashMap<String 정의키, Group>`, `Group{Entry toc; ConcurrentHashMap<String ver, Entry> bodies}`. 이렇게 두면 정의 하나를 지울 때 접두어를 훑지 않고 묶음째 지운다.
- 관리 화면과 상태 응답에는 논리 키(`X`, `X@ver`)로 보인다(§7.1).
- `Entry` 는 지금 칸(값·적재 시각·마지막 조회·적재 순번·조회 수·추정 크기, `MdmMetaCache.java:92-117`)에 `part`(TOC·BODY)와 `ver` 를 더한다.

### 5.2 적재 흐름

입구는 `MdmMetaService.lookupAt(type, keys, t)` 다. 지금의 `lookup(type, keys)`(`cactus/MdmMetaService.java:57-91`)을 대신하고, RULE·RULE_SET·CODE·LAYOUT 에 쓴다.

1. **목차**: 키마다 목차를 캐시에서 찾는다. 없는 키는 묶어서 `part=TOC, at=t` 로 한 번 요청한다. 같은 키 동시 적재 합류(`inflight`, `:39, :76-82`)와 연속 실패 건너뛰기(`:164-181`)는 지금 규칙을 그대로 쓴다.
2. **버전 선택**: §3.2 규칙으로 고른다. 고를 버전이 없으면 결과는 "적용 버전 없음"이다. 이것은 "없음"(정의 자체가 없음)과 구별한다. 엔진은 지금처럼 빈 값으로 받는다.
3. **본문**: `{정의 키, ver}` 로 캐시를 찾는다. 1단계 응답의 `current` 가 고른 ver 와 같으면 그것을 넣는다. 아니면 미스 본문을 묶어서 `part=BODY` 로 한 번 요청한다. 본문 미스는 이렇게 단건(키·버전) 적재다.
4. 각 적재는 지금처럼 `Ticket` 을 받아 넣는다(`MdmMetaCache.java:157-159, :343-353`). 경합 규칙은 §5.6 이 정의 키 기준으로 바꾼다.
5. **캐시만 읽기**(`MdmCachedDefinitions` 경로)는 목차와 고른 버전의 본문이 둘 다 캐시에 있을 때만 값을 준다. 하나라도 없으면 지금처럼 부재 기록을 남긴다(`cactus/MdmCachedDefinitions.java:88-98`). 기록 키는 `CODE:X` 또는 `CODE:X@ver` 다.

### 5.3 코드 색인

본문을 적재할 때(잠금 밖) 아래 색인을 만들어 값 객체 `MdmCodeVersion` 에 함께 둔다. 부록 A 측정에 쓴 색인(해시 + 집합 + 정렬 목록)과 같은 구성이다. 색인을 만드는 데 1 ms 미만, 힙은 코드 1,000개에 약 96~99 KB 였다(부록 A.2·A.4).

| 색인 | 모양 | 쓰는 곳 |
|---|---|---|
| 코드 → 행 | `Map<String, CodeItemRow>` | attr |
| 카테고리 → 소속 | `Map<String, Set<String>>`. `all` 이면 "items 코드 집합" 한 벌을 공유한다(복사하지 않는다). 본문에 없는 cateId 는 맵에 없다 | isMember·codeList·`CodeEffLookup` |
| items 코드 집합 | `Set<String>` | 위 `all` 공유 |

- 해시 집합을 쓴다. 비트셋은 카테고리가 많아 집합 메모리가 문제가 될 때 검토한다(코드 순번 → 비트).
- 추정 크기(`bytes`)는 지금처럼 본문 JSON 직렬화 크기다(`MdmMetaCache.java:411-420`). 색인은 넣지 않는다. 관리 화면 머리 툴팁의 "실제 힙 점유는 이보다 큼"(현행 스펙:236)이 그대로 맞다.

### 5.4 엔진 해석기와의 연결 (결정 P7)

- **제약 1**: 엔진 `CodeLookup.code(id)` 는 시각을 받지 않는다(`engine/spi/CodeLookup.java:19`).
- **제약 2**: `MASTER`·`MASTER_AT` 이 쓰는 해석기는 엔진이 직접 만든다. `new DefaultCodeResolver(lookups.codes(), lookups.codeEff())` 형태라(`engine/expr/FunctionDictionaries.java:48-49`) cactus 가 해석기를 바꿔 끼울 자리가 없다.
- **제약 3**: 버전 하나짜리 행을 지금 해석기에 넣으면 판정이 틀린다. 해석기는 `code(id)` 의 versions 로 버전을 고르고 같은 행에서 items 를 찾는다(`DefaultCodeResolver.java:56-61, :102-107`). 다른 버전이 골리면 엉뚱한 items 로 판정한다.
- 따라서 엔진 변경 없이는 결정 P1 을 코드에 적용할 수 없다. 그래서 엔진 spi 를 아래와 같이 넓힌다(결정 P7, 버린 안은 §12).

**엔진 spi 에 버전 본문 조회를 default 메서드로 더한다**:

```java
public interface CodeLookup {
    Optional<CodeRows> code(String maruCodeId);
    /** 버전 ver 판정에 필요한 행. 기본은 전체 행 — 원장·옛 구현은 바꿀 것이 없다. */
    default Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) { return code(maruCodeId); }
}
```

- **해석기**: `DefaultCodeResolver` 는 버전 선택과 DEPRECATED 판단에만 `code(id)` 를 쓴다. 유효 items 와 카테고리 계산에는 `codeAt(id, ver)` 를 쓴다. `effectiveCodes` 는 지금 `codeEff` 를 거치지 않고 `compute` 를 바로 부른다(`DefaultCodeResolver.java:97-99`). 이 경로도 `codeEff` → `codeAt` 순서로 맞춘다.
- **cactus 쪽 연결**:
  - `code(id)` 는 목차로 만든 `CodeRows(header, versions, [], [], [])` 를 준다. `MasterQuery` 의 "마루 코드인가" 판정은 `code(id).isPresent()` 만 보므로(`engine/expr/MasterQuery.java:59`) 목차로 충분하다.
  - `codeAt(id, ver)` 는 본문을 `CodeRows(header, [그 버전 1행], items, 고른 정의들, [])` 로 준다.
  - `CodeEffLookup` 은 색인에서 `Optional.of(소속 집합)` 을 준다. 본문에 없는 cateId 는 `Optional.of(Set.of())` 다.
  - `Optional.empty()` 는 "계산해 두지 않음"이고 빈 집합은 "소속 없음"이다(`engine/spi/CodeEffLookup.java:11-12`).
  - **불변식**: 목차가 있는 코드에 대해 cactus `CodeEffLookup` 은 빈 값(`Optional.empty()`)을 **절대 주지 않는다**. 본문이 캐시에 없으면 일반 경로는 본문을 적재해 집합을 주고, 캐시만 읽는 경로는 `MdmUnavailableException` 을 던진다(지금 `code()` 미스와 같은 처리, `cactus/MdmCachedDefinitions.java:121-128`).
  - 이 불변식이 필요한 까닭: `codeAt` 이 주는 본문 행은 cateItems 가 빈 목록이다. 빈 값을 한 번이라도 주면 해석기가 `compute(codeAt 행)` 으로 내려가고(`DefaultCodeResolver.java:110-112`), TABLE 소속은 빈 cateItems 를 거르므로(`:133-141`) 예외 없이 **조용히 false** 가 된다.
- **결정 P4 의 "`CodeEffLookup` 자리 활용" 검토 결과**:
  - 키 `(maruCodeId, ver, cateId)` 와 뜻("소급을 적용한 결과", `CodeEffLookup.java:8-9`)이 MDM 이 미리 계산하는 소속과 정확히 맞는다. 그래서 소속 판정은 이 자리로 충분하다.
  - 다만 이 자리만으로는 버전 선택과 items(attr·codeList 의 이름·순번)를 해결하지 못한다. 그래서 `codeAt` 이 함께 필요하다.
- **기대 성능**:
  - isMember 는 목차 선택 + 해시 조회가 된다. 해시 조회는 ns 급이고, 전체 시간은 아래 목차 선택이 정한다.
  - attr·codeList 는 해석기가 본문 items(코드 수만큼)를 훑으므로 부록 A.3 의 "코드@버전" 수준(C 에서 수십 µs)이다.
  - 이것도 ns 급으로 줄이려면 엔진에 "버전의 코드 행 하나"·"정렬된 목록" 조회 default 메서드를 더 둔다. 이 확장은 이 작업의 범위 밖이다(결정 P7, §11).
  - 목차 선택(`Segments.covering`)은 버전 수에 비례한다. 버전이 1,000개면 수 µs 다. 필요하면 "최종 버전 + 유효 구간"을 목차 값에 기억해 두고 t 가 그 구간이면 바로 쓴다.
- **룰·세트·전문**은 엔진 변경이 필요 없다. `DefinitionLookup.rule(id, evalTs)`·`ruleSet(id, evalTs)` 는 이미 시각을 받는다(`engine/spi/DefinitionLookup.java:26, :32`). `MdmDefinitionLookup`·`MdmCachedDefinitions` 가 "목차 → 선택 → 본문"으로 바꾸면 된다(`cactus/MdmDefinitionLookup.java:56-79`, `cactus/MdmCachedDefinitions.java:109-128`).

### 5.5 수명·용량 (결정 P6)

| 항목 | 유휴 수명 | 절대 상한 |
|---|---|---|
| 목차 | `max-idle`(60분) | `max-age`(24시간) |
| 본문 — 최종 버전 | `max-idle`(60분) | `max-age`(24시간) |
| 본문 — 옛 버전(지난 버전) | **`old-version-max-idle`(10분, 새 설정)** | `max-age`(24시간) |
| 본문 — 예약 버전(applyFrom 이 미래) | `old-version-max-idle`(10분). 미리 받지 않고 조회했을 때만 생긴다(결정 P9) | `max-age`(24시간) |

- **판정 시점**: "최종인가"는 `get`·쓸기(`markApplied`)·`entries`·`peek` 마다 그 정의의 목차와 지금 시각으로 다시 판정한다. 목차가 캐시에 없으면 옛 버전으로 본다. 예약 버전의 적용 시작 시각이 지나면 다음 조회부터 최종 수명이 된다. 반대로 최종이던 본문은 새 버전이 적용되는 순간부터 마지막 조회 + 10분 규칙을 따른다.
- **구현 변경**: `MdmMetaCache` 의 유휴 수명은 지금 하나뿐이다(`MdmMetaCache.java:61, :399-408`). 만료 판정 `expired(e, now)` 가 항목별 유휴 수명을 받도록 바꾼다. 남은 수명(`remainingSeconds`, `:321-326`)도 같은 기준으로 계산한다.
- **상한**: `max-entries`(20,000)는 목차와 본문을 합해 센다. 넘으면 지금처럼 만료 먼저, 그다음 LRU 로 줄인다(`MdmMetaCache.java:364-396`). 옛 본문은 유휴 수명이 짧아 먼저 빠진다.
- **정의별 옛 본문 개수 상한**: 벤치는 옛 스냅숏이 10개를 넘으면 전 이력 한 덩어리보다 커진다고 보였다(부록 A.4). 개수 상한은 두지 않는다. 10분 유휴 수명과 전체 `max-entries` 로 막고, 관리 화면의 추정 크기로 지켜본다(결정 P10).
- 설정 블록(현행 스펙:167-179)에 더하는 칸:

```yaml
cactus:
  mdm:
    old-version-max-idle: 10m     # 옛 버전 본문 유휴 수명(결정 P6). 목차·최종 본문은 max-idle
    versioned-feed: auto          # auto(기본) | off — off 면 지금처럼 전 이력 한 키(§5.8 물러남을 강제)
```

### 5.6 무효화와 경합 (결정 P5)

- **폴러 지움**: 변경 기록의 키 X 를 받으면 `evict(type, X, seq)` 가 목차 X 와 본문 `X@*` 를 묶음째 지운다. 지움 기록(tombstone)은 **정의 키 X** 하나에 남긴다(`MdmMetaCache.java:211-215, :356-361` 의 키를 정의 키로).
- **적재 경합**: `putOne` 의 지움 기록 검사(`MdmMetaCache.java:347-349`)는 본문을 넣을 때도 정의 키 X 의 기록을 본다. 지움 기록을 본문 키 `X@ver` 로 찾으면 X 의 지움에 막히지 않는다. 그러면 지움 전에 시작한 본문 적재가 지운 뒤에 옛 값을 다시 넣는다. 이 구멍을 막는 것이 이 규칙의 목적이다.
- **목차와 본문의 어긋남**: 폴링 간격(10초) 안에서는 목차가 옛 시점, 본문이 새 시점일 수 있다. 다음 세 규칙으로 다룬다.
  - (가) 본문 응답이 `NOT_RELEASED` 면 목차가 낡은 것이다. 이 인스턴스에서 그 정의 묶음을 지우고(`evictLocal` 과 같은 지움 기록), 목차부터 한 번만 다시 받는다. 두 번째에도 어긋나면 "받을 수 없음"으로 답한다. "없음"으로 캐시하지 않는다.
  - (나) 처음 적재는 `TOC + current` 를 한 읽기 트랜잭션에서 받으므로 어긋나지 않는다(§4.1).
  - (다) 그 밖의 어긋남(같은 ver 인데 내용이 제자리 수정됨)은 지금도 있는 "폴링 간격만큼 늦음"과 같은 범위다. 다음 폴링이 묶음을 지운다.
    엔진이 한 해석기 호출 안에서 옛 목차로 고른 ver 가 그새 확정 취소되면, 본문 `NOT_RELEASED` → 목차 다시 받기 → 그 ver 없음이다. 이때 `codeAt`·`codes` 는 빈 값이 아니라 **받을 수 없음**(`MdmUnavailableException`)을 던져 §5.4 의 빈 값 금지 불변식을 지킨다(빈 값이면 해석기가 소속을 빈 집합으로 내려 옛 판정도 새 판정도 아닌 값이 된다). 캐시만 읽는 조회기는 그 본문이 캐시에 없으므로 부재 기록 후 던진다.
- **RELOAD**: 지운 뒤 목차와 지금 시각의 최종 본문을 다시 받는다(`MdmRevisionPoller.java:146-155`  에서 `refreshAfterEvict(…, now)` 로). 지우기 전에 있던 옛 본문은 다시 받지 않는다. 필요해지면 미스 때 받는다. 진행 중 적재에 합류하지 않는다(관리 화면 reload 와 같은 자리 빼앗기, `MdmMetaService.refreshAfterEvict`). 지움 전 Ticket 으로 시작한 적재에 합류하면 그 결과는 지움 기록에 막혀 캐시에 들어가지 못하고, 목차 없이 본문만 따로 들어가 옛 수명으로 강등되며, 폴러가 잠금을 쥔 채 그 적재를 기다린다(fu3). 다시 받는 적재의 Ticket 은 지움·`markApplied` 뒤에 받으므로 캐시에 들어간다. 최종 본문이 목차 응답의 current 로 오면 목차와 한 Ticket 으로 함께 들어가고, 목차가 이미 캐시에 있으면 본문만 따로 적재한다. 값 대상과 versioned-feed off 경로도 같은 규칙이다.
- **통째 비우기**(기동·truncated·역행, `MdmRevisionPoller.java:113-128`)는 지금 그대로다. 세대가 올라가 목차·본문이 함께 버려진다(`MdmMetaCache.java:227-232`).

### 5.7 노드 간 일관성

- 인스턴스마다 자기 캐시를 갖는다. 지금과 같이 각자 폴링으로 늦어야 10초 안에 같아진다(현행 스펙 D2).
- 같은 목차와 같은 시각이면 버전 선택은 결정적이다. 시각은 KST 벽시계다(`cactus/MdmDefinitionLookup.java:30, :104`). 노드 간 시계 차이로 적용 시작 경계 직전·직후의 판정이 갈릴 수 있다. 이 차이도 전 이력 방식과 같다. 이 설계로 새로 생기는 차이는 없다.
- 노드마다 적재한 본문 집합은 다를 수 있다. 판정 결과에는 영향이 없고 미스 비용만 다르다.

### 5.8 옛 MDM 과 함께 돌 때 (물러남)

- 새 cactus 가 `part` 를 보냈는데 응답에 `part` 가 없거나, 거부 뒤 `part` 없이 다시 보낸 요청이 성공하면 옛 MDM 이다(§4.1 신호 (가)·(나)). 받은 값은 지금 모양의 전 이력이다. cactus 는 그 값으로 직접 목차와 본문을 만든다.
  - CODE 는 엔진 `CodeRowsProjection.releasedOnly` 와 `CodeVersionSlicer.slice` 를 쓴다(§4.2 와 같은 함수).
  - 룰·세트·전문은 목록에서 ver 로 고른다.
- 이렇게 하면 추가 호출이 없고, cactus 의 조회·판정 경로는 하나로 남는다. 받은 전 이력 값 자체는 캐시에 남기지 않는다.
- 단, CODE 를 cactus 에서 투영하려면 D-152 엔진 변경(`CodeRowsProjection`)이 cactus 가 쓰는 엔진 jar 에 들어 있어야 한다.
- `versioned-feed: off` 면 `part` 를 보내지 않고 지금 방식(전 이력 한 키)으로 돈다. 배포 중 문제가 생기면 이것으로 되돌린다. 이 경우 엔진 연결(§5.4)은 `codeAt` 기본 구현(= 전체 행)으로 지금과 같이 돈다.

### 5.9 MDM 장애

현행 스펙 §5.4 규칙(캐시 항목은 계속 쓰고, 캐시에 없는 키는 받을 수 없음, 30초 건너뛰기, 현행 스펙:206-212)을 목차와 본문에 똑같이 적용한다. 다만 경우가 하나 새로 생긴다. 목차는 있는데 고른 버전의 본문이 없고 MDM 이 멈춘 경우다. 이때는 **받을 수 없음**으로 답한다. 다른 버전 본문으로 대신 판정하지 않는다. 그렇게 하면 동치가 깨진다.

- **장애 중 적용 경계 통과는 지금보다 후퇴하며, 이 후퇴는 받아들인 것이다(결정 P9).** 지금은 전 이력이 캐시에 있으므로 MDM 이 멈춘 동안 예약 버전의 적용 시작 시각이 지나도 판정이 된다(현행 스펙:208 원칙). 새 구조에서는 새 최종 버전의 본문이 캐시에 없으면 받을 수 없음이 되고, 저장 정책이 REJECT 면 저장이 막힌다.
- 옛 시각 판정(`MASTER_AT`, §7.3)도 같은 이유로 장애 중에는 캐시에 있는 본문만 쓸 수 있다.
- 예약 버전 본문을 미리 받으면 이 후퇴가 줄지만, 정의마다 본문 하나만큼 메모리가 늘고 목차가 만료되면 결국 같은 상황이 된다. 그래서 미리 받지 않기로 했다(결정 P9).

## 6. 판정 동치

### 6.1 조건

같은 원장 상태에서 새 경로(목차 + 본문 + 색인)로 판정한 결과가 지금 경로(D-152 투영된 전 이력 + 지금 선택 함수)로 판정한 결과와 모든 시각·카테고리·코드에서 같아야 한다.

| 대상 | 비교하는 판정 |
|---|---|
| 코드 | `selectVersion`·`isMember`·`attr`(attr01~10)·`codeList`·`effectiveCodes` — 엔진 `CodeResolver` 다섯 메서드 전부(`engine/code/CodeResolver.java:19-32`) |
| 룰·룰 세트 | `rule(id, t)`·`ruleSet(id, t)` 가 돌려준 정의가 같다(값 동등) |
| 전문 | `layout(id, t)` 의 스냅숏이 같다 |

### 6.2 시험

| 층 | 무엇을 | 어떻게 |
|---|---|---|
| 엔진 단위 | `CodeVersionSlicer.slice` + `codeAt`·`CodeEffLookup` 연결이 위 다섯 판정에서 투영 전 이력과 같다 | `CodeRowsProjectionTest` 처럼 엔진 시험으로 둔다. 기준은 `new DefaultCodeResolver(id -> projected, NONE)`. 시각은 RELEASED 버전마다 applyFrom·applyTo 의 ±1초, 첫 버전 이전, 버전 사이 빈틈, 닫힌 끝 뒤, 열린 끝(9999) 직전. 카테고리는 투영에 남은 cateId 전부 + `BASE` + 없는 cateId + null·빈 문자열. 코드는 각 버전 items 코드 전부 + 없는 코드 + null |
| 엔진 데이터 | 생성 데이터와 손 사례 | 부록 A.1 의 생성기 A·B·C(1,200건 동치 단언을 썼다)를 시험용으로 옮긴다. 손 사례: 뒤 버전에만 정의가 있는 카테고리의 최초 소급, TABLE effVer(정의 fromVer > v), REGEX 의 LVL·ATTR 대상, 소속 없는 카테고리(`members: []`), "전체" 판정(REGEX `.*` 와 TABLE 이 우연히 전부 담는 경우 둘 다), DEPRECATED 헤더의 빈 codeList, 확정 취소 버전(D-152 결함 고정 사례), RELEASED 없는 코드, **TABLE 카테고리 + 본문 미적재 상태의 `CodeEffLookup`**(빈 값을 주지 않고 적재하거나 예외를 던지는지 — §5.4 불변식) |
| MDM 피드 | `part` 없음은 지금 응답과 글자 그대로 같다(JSON 정규화 뒤 비교 — BigDecimal 자리수·칸 순서까지). TOC·BODY 모양, `at`·`current`, `NOT_RELEASED`, 500 행 상한, COLUMN·DOMAIN 은 `part` 무시 | `MdmMetaFeedContractHttpTest` 에 사례 추가(OASIS HTTP) |
| MDM 생성 | 피드 본문 = 엔진 `slice`(전부 읽기 경로). 후속으로 SQL 거르기를 하면 두 경로가 같은지 | SQLite 서비스 시험 |
| cactus 판정 | 새 경로와 전 이력 경로가 같다. 가짜 피드 두 벌(새 MDM·옛 MDM)로 같은 원장을 흉내 내고 `MdmValidator.validate` 결과(오류·검증 불가·세트 결과)가 같은지 본다 | 단위 시험(가짜 피드·가짜 시계) |
| cactus 룰·세트·전문 | 전 목록 `select`·`selectSet`·`selectLayout` 결과 = 목차 선택 + 본문 | 단위 시험, 경계 시각은 위와 같다 |

## 7. 기존 기능에 미치는 영향

### 7.1 캐시 관리 화면 (m-mcm `csa/mdmCacheMng`)

- **대상 종류**: 여섯 가지 그대로다(`src/frontend/m-mcm/page-components/csa/mdmCacheMng/types.ts:6`).
- **항목 목록**(`entries`):
  - 행에 `part`(목차·본문)·`ver`·`current`(최종 여부)를 더한다.
  - 화면에 "구분" 열(목차 / 본문(최종) / 본문(옛))을 더한다.
  - 키 검색 `q` 는 논리 키(`X@1.000` 포함)에 대해 지금처럼 부분 일치다.
  - 남은 수명은 §5.5 기준으로 계산한다.
  - 옛 cactus 는 새 칸을 주지 않는다. 그때 화면은 그 칸을 비운다. 옛 모듈의 빈 칸 처리와 같은 방식이다(현행 스펙:238).
- **상태**(`status`): `counts`·`bytes` 는 지금처럼 대상 종류별 합계로 둔다(목차 + 본문). 본문 수를 따로 보여 줄지는 화면 검토 때 정한다. API 는 `bodyCounts` 를 더해 둔다.
- **삭제·재등록 버튼**: 본문 행에서 눌러도 정의 키(`X`)로 MDM `force` 를 기록한다. 변경 기록은 정의 키 단위이기 때문이다(결정 P5, `mdm/feed/metaFeed/service/MetaFeedService.java:116-134`). 확인 대화 상자 문구에 "이 정의의 목차와 모든 버전 본문"을 적는다.
- **등록**(`load`): 키 `X` 는 목차와 최종 본문을 받는다. 키 `X@ver` 는 목차와 그 본문을 받는다. 지금 `reload` 는 키를 그대로 지운다(`cactus/MdmMetaService.java:117-136`). 본문 키를 받으면 그 본문만 이 인스턴스에서 지우고 다시 받는다.
- **항목 상세**(`entry`): 본문 값(§3.3 JSON, 소속 배열 포함)을 그대로 보인다. 색인은 보이지 않는다.

### 7.2 저장 검증(`MdmValidator`) 미리 받기

- 컬럼·세트·룰·코드를 미리 받는 순서(`cactus/MdmValidator.java:198-283`)는 그대로 둔다. 다만 각 단계가 "목차 → 판정 시각 ts 의 본문" 을 받는다.
- 세트 버전 선택(`:243`)과 룰 버전 선택(`:258-259`)은 목차로 한다. 코드는 목차와 ts 시점의 본문을 받는다.

### 7.3 `MASTER_AT` — 옛 시각의 코드 판정 (결정 P8)

- 지금은 코드 값에 전 이력이 있다. 그래서 식이 `MASTER_AT(id, cate, key, 시각)` 으로 어떤 시각을 주어도 캐시만 읽어 판정한다.
- 바뀐 뒤에는 그 시각의 버전 본문이 캐시에 있어야 한다. 그런데 미리 받기는 요청 판정 시각 ts 하나만 안다(`MdmValidator.java:151`). 평가 중에는 MDM 을 부르지 않는다(1초 평가 제한, `cactus/MdmCachedDefinitions.java:15-17`).
- 아무 대책이 없으면 base_dt 가 ts 와 다른 버전을 가리킬 때 지금은 되던 판정이 **검증 불가**로 바뀐다. 저장 정책 `on-unavailable` 이 REJECT 면 저장이 막힌다.
- 영향 범위: 식 참조 찾기는 `MASTER_AT` 의 첫 인자만 모은다(`cactus/MdmExprRefs.java:21-24, :33`). 넷째 인자(base_dt)는 보지 않는다.
- 그래서 미리 받기에서 base_dt 를 미리 풀어 그 시각의 버전 본문까지 받는다(결정 P8).
  - 넷째 인자가 문자열 상수면 그 시각으로 받는다.
  - 넷째 인자가 **요청 행에 실제로 있는 칸** 하나를 가리키면, 요청 행들의 그 칸 값을 모아 서로 다른 시각마다 목차로 버전을 고르고 본문을 묶어 받는다. 룰 결과 변수처럼 미리 받기 시점에 값이 없는 변수는 여기에 해당하지 않는다.
  - 시각 문자열 해석은 엔진 `MasterQuery.baseDt` 와 같은 규칙(8자리 `YYYYMMDD` → 그날 00:00, 14자리 `YYYYMMDDHHMMSS` → 그 시각, 그 밖은 평가 오류)을 쓴다(`engine/expr/MasterQuery.java:75-94`). 해석할 수 없는 값은 미리 받지 않고 엔진 평가에 맡긴다.
  - 그 밖의 식이면 지금처럼 부재 기록 → 검증 불가로 둔다. 이 경우는 지금보다 후퇴하는 범위로 남는다.
  - 식 참조 찾기(`MdmExprRefs`)가 `MASTER_AT` 의 넷째 인자를 함께 돌려주도록 넓힌다.
- 컬럼의 코드 도메인 자동 MASTER 와 `MASTER` 는 평가 시각을 쓴다. 그래서 미리 받은 ts 본문으로 충분하다(`engine/code/CodeResolver.java:14-15`).

### 7.4 그 밖

- **화면 허용 코드**(`allowedCodes`): 지금 시각 `codeList` 다(`cactus/MdmMetaController.java:361-375`). 최종 본문과 색인을 쓰므로 빨라진다. 바뀌는 동작은 없다.
- **`MdmDefinitionLookup.column`** 은 코드 참조가 있으면 코드를 미리 받는다(`cactus/MdmDefinitionLookup.java:43-53`). 이것을 "목차 + 지금 시각 본문"으로 바꾼다.
- **일반 엔진 경로의 기준 시각 미리 받기**: `column` 에는 시각 인자가 없어 늘 지금 시각 본문만 미리 받는다. 일반 엔진(`DefaultDomainValidator`·`MdmEvaluator` 를 `MdmDefinitionLookup` 위에 만든 경우)을 과거 `evalTs` 로 쓰는 호출자는 평가 전에 `MdmDefinitionLookup.prefetchColumns(columnNames, evalTs)`(codeRef 코드까지) 또는 `prefetchCodes(maruCodeIds, evalTs)`(코드 목차 + 그 시각 본문, 목차 한 번 + 본문 한 번으로 묶음)를 불러야 한다. 부르지 않으면 그 시각 본문을 평가 스레드(시간 한도 1초)에서 받게 되어 느린 MDM 은 TIMEOUT, 받을 수 없음은 EVALUATION_ERROR 로 분류된다(§5.4 불변식·결정 P9 가 일반 경로의 캐시 부재 적재를 허용하므로 결함이 아니라 분류·지연 위험이다). 이 API 는 호출자 스레드에서 받을 수 없음을 `MdmUnavailableException` 으로 올리고, MDM 에 없는 코드·컬럼은 조용히 넘기며, `versioned-feed: off` 에서는 전 이력 한 키(목차·본문 요청 없음)로 받는다. `column` 은 `prefetchCodes(…, now())` 위임이라 동작이 같다. 호출처가 아직 없어 자동 보호(장식자)는 두지 않았다.
  - **남는 빈틈(별도 후속)**: 표준식·비즈니스식이 참조하는 코드, 일반 `RuleEngine` 룰 식이 참조하는 코드(`MASTER`·`MASTER_AT`·`CODE`)는 이 API 가 컬럼 이름만으로 찾지 못해 여전히 미리 받지 않는다(호출자가 `prefetchCodes` 로 직접 넘겨야 한다). 저장 검증기(`MdmValidator`, §7.2)는 `MdmExprRefs` 로 이를 받는다. 일반 경로에도 같은 수집을 공개하려면 검증기 prefetch 를 공용으로 떼어내는 별도 작업이 필요하다.
- **강제 기록(`force`)·변경 기록 표·Flyway**: 바꾸지 않는다(§4.3).
- **도메인·컬럼 캐시**: 바꾸지 않는다.

## 8. 이전(마이그레이션)·배포 순서

캐시는 메모리에만 있다(현행 스펙:137). 그래서 데이터 이전은 없다. DB 스키마 변경도 없다.

| 조합 | 동작 |
|---|---|
| 새 MDM + 옛 cactus | 옛 cactus 는 `part` 를 보내지 않는다. MDM 은 지금 응답을 그대로 준다(§4.1, `part` 없음 경로는 글자 그대로(JSON 정규화 뒤 비교) 같다는 시험). **안 깨진다** |
| 옛 MDM + 새 cactus | 옛 MDM 이 `part` 를 무시하면 응답에 `part` 가 없고, 거부하면 cactus 가 `part` 없이 한 번 다시 보낸다(§4.1 신호 (가)·(나)). 어느 쪽이든 물러남(§5.8)으로 전 이력에서 목차·본문을 만든다. **안 깨진다**. 메모리 이득은 그대로이고 MDM 전송량만 지금과 같다. 거부 쪽이면 미스마다 HTTP 가 한 번 더 든다 |
| 새 MDM + 새 cactus | 목차·본문 경로 |
| D-152 전 엔진 jar 의 cactus | CODE 물러남이 투영을 못 한다. D-152 는 이미 dev 에 있고(27451909), 엔진 jar 는 cactus·MDM 이 같은 저장소 소스로 빌드하므로 이 작업 브랜치에서는 생기지 않는다 |

- 권장 순서: ① D-152 dev 머지(끝남, 27451909) → ② 엔진 변경(`codeAt` default·`CodeVersions.select` 공개·`CodeVersionSlicer`) → ③ MDM 피드 `part` → ④ cactus 목차·본문·색인·수명 → ⑤ 화면.
- ②만 배포되어도 동작은 바뀌지 않는다. 기본 구현이 전체 행을 주기 때문이다. ③과 ④는 어느 쪽을 먼저 올려도 된다(위 표).
- 문제가 생기면 cactus `versioned-feed: off` 로 지금 방식으로 돌린다. 재기동 없이 바꿀지는 구현 계획에서 정한다. 1차는 재기동해 반영한다.
- 물러남 코드(§5.8)와 `versioned-feed: off` 는 모든 업무 모듈이 새 cactus 로 바뀐 다음 릴리스에 지운다(결정 P12).

## 9. 테스트 (현행 스펙 §7 에 더한다)

| 층 | 무엇을 | 어떻게 |
|---|---|---|
| 엔진 | §6.2 엔진 단위·데이터, `codeAt` default 가 지금 동작과 같음(원장 구현 그대로) | 엔진 단위 시험 |
| MDM 피드 | §6.2 MDM 피드·생성 | OASIS HTTP 시험, SQLite |
| cactus 캐시 | 묶음 지움(목차 + 본문 전부), 정의 키 지움 기록이 본문 늦은 적재를 막음, 지움 뒤 시작한 본문 적재는 들어감, 항목별 유휴 수명(최종 60분·옛 10분·예약 버전은 옛, 적용 시작 도래 뒤 최종으로 바뀜, 목차 없으면 옛), 상한(목차 + 본문 합산), `entries` 의 part·ver·current·남은 수명 | 단위 시험(가짜 시계) |
| cactus 적재 | 목차 미스 → TOC(at) 한 번, `current` 불일치 시 BODY 재요청, 본문 미스 묶음 요청, 동시 적재 1회, `NOT_RELEASED` → 묶음 지우고 1회 재시도 → 받을 수 없음, 적용 버전 없음 ≠ 없음, 물러남(옛 MDM 응답) | 단위 시험(가짜 피드) |
| cactus 폴러 | 정의 키 변경 → 묶음 지움, RELOAD → 목차 + 최종 본문 | 단위 시험 |
| cactus 판정 | §6.2 cactus 판정·룰·세트·전문 | 단위 시험 |
| 화면 | 구분 열·옛 모듈 빈 칸·본문 행 삭제가 정의 키로 기록 | Vitest, audit 2종 0건 |
| 통합 | 로컬 mdm + mls: 코드 새 버전 확정 → 10초 안에 최종 본문 바뀜, 예약 버전 적용 시작 도래 → 쓰기 없이 최종 바뀜, 화면 재등록 | 수동 E2E(ego-browser), 끝나면 브라우저 닫기 |

- 도커는 쓰지 않는다. DB 는 SQLite 만 쓴다.

## 10. 함께 남길 기록

- **결정 기록**: `docs/mdm/decisions.md` 에 D-154 로 남겼다. dev 의 마지막 번호는 D-153 이다(`docs/mdm/decisions.md:1411`). 번호는 다른 작업의 머지 순서에 따라 바뀔 수 있다.
- **ADR**: ADR-0007(하이브리드 캐시·리비전 무효화)의 캐시 값 모양 결정을 바꾸는 일이다. 그래서 0007 에 개정 절을 더한다. 무효화·배포 구조는 그대로이기 때문이다(결정 P13).
- **현행 스펙**: §3.4 피드 표, §4.1 대상 표, §5.1 설정, §5.2 구성 요소, §6 화면을 이 문서로 링크해 고친다.
- **가이드**: "업무 모듈에서 MDM 메타 켜기" 절(현행 스펙:270)에 `old-version-max-idle`·`versioned-feed` 를 더한다.

## 11. 범위 밖

- **`CodeReferenceCheck` 의 초안 카테고리 소급 결함(MDM 내부)**:
  - 룰 저장 검사는 원장 그대로인 `MdmCodeLookup` 으로 해석기를 만든다(`mdm/common/rule/check/ledger/CodeReferenceCheck.java:50`). 그리고 등록 시각의 `isMember` 로 값 존재를 경고한다(`:74-79`).
  - 그래서 DRAFT 에만 있는 카테고리 정의가 최초 소급으로 RELEASED 판정에 들어간다. D-152 는 피드만 고쳤고 이 검사는 일부러 두었다(D-152 결정 (4), `docs/mdm/decisions.md:1403-1410`).
  - 이 문서는 바꾸지 않는다. 별도 결정으로 다룬다.
- **SQL 버전 거르기 최적화**(§4.2): 후속으로 한다.
- **엔진의 "코드 행 하나"·"정렬된 목록" 조회 확장**(§5.4): attr·codeList 를 ns 급으로 줄이는 확장이다. 범위 밖이다(결정 P7).
- **마스터데이터(`MasterLookup`) 캐시, 전문 소비 연동, 변경 기록 보관 정리**: 현행 스펙과 같이 범위 밖이다(현행 스펙:274).
- **예약 버전 본문 미리 받기**: 하지 않기로 했다(결정 P9).

## 12. 결정 사항 (2026-10-03 사용자 결정)

설계 중에 나온 질문 일곱 가지를 사용자가 정했다. §1.3 의 P1~P6 에 이어 P7~P13 으로 적는다.

| # | 결정 | 근거 | 버린 안 |
|---|---|---|---|
| P7 | 엔진 연결: `CodeLookup.codeAt(id, ver)` default 메서드 + `CodeEffLookup` 색인(§5.4). ns 급 확장(코드 행 하나·정렬된 목록 조회)은 범위 밖 | 판정 의미가 엔진 한 곳에 남고, 원장·옛 구현은 기본 구현으로 그대로 돈다. isMember 는 해시 조회가 된다 | cactus 가 해석기를 직접 구현(의미가 두 벌이 됨), 코드만 전 이력 유지(결정 P1 과 어긋나고 메모리 이득 없음) |
| P8 | `MASTER_AT`: 미리 받기에서 base_dt 를 미리 풀어 그 시각의 본문을 받는다(§7.3) | 흔한 사용(행의 일자 칸)을 덮고, 평가 중 MDM 을 부르지 않는 1초 제한을 지킨다 | 해당 코드는 전 이력 캐시(메모리 이득 사라짐), 검증 불가로 둠(동작 후퇴) |
| P9 | 예약 버전 본문은 미리 받지 않고 수명은 10분(§5.5). 장애 중 적용 경계 통과 후퇴는 받아들인다(§5.9) | 적용 시작 뒤 첫 조회에서 HTTP 한 번·수 ms 로 받으면 된다. 미리 받아도 목차가 만료되면 같은 상황이라 메모리 대비 이득이 작다 | 다음 예약 버전 하나를 최종 수명(60분)으로 미리 받기 |
| P10 | 정의별 옛 본문 개수 상한은 두지 않는다(§5.5) | 10분 유휴 수명과 전체 `max-entries` 로 충분하고, 관리 화면의 추정 크기로 지켜볼 수 있다 | 정의마다 10개 상한 + 정의 안 LRU |
| P11 | 처음 적재는 `TOC + at` 으로 목차와 본문을 한 번에 받는다(`current`, §4.1) | 처음 판정 지연이 HTTP 한 번으로 준다. 버전 선택은 늘 cactus 가 다시 확인한다 | TOC·BODY 두 번 왕복 |
| P12 | 물러남 경로(§5.8)와 `versioned-feed: off` 는 모든 업무 모듈이 새 cactus 로 바뀐 다음 릴리스에 지운다(§8) | 섞인 배포 동안만 필요하다. 그때 MDM 의 `part` 없는 경로도 함께 지울지 다시 정한다 | 계속 둔다 |
| P13 | ADR 은 ADR-0007 에 개정 절을 더한다(§10) | 캐시 값 모양만 바뀌고 하이브리드 배포·리비전 무효화 구조는 그대로다 | ADR-0008 신설 |

## 13. 자체 점검

- **빈칸**:
  - `@` 가 정의 ID 에 못 들어간다는 전제(§3.1)와 룰 세트 버전 하나 생성 메서드(§4.2)는 구현 계획에서 실측할 항목으로 남겼다.
  - 상태 응답의 `bodyCounts` 를 화면에 보일지는 화면 검토로 미뤘다(§7.1).
  - 옛 MDM 이 모르는 params 를 무시하는지 거부하는지는 확인하지 못했다(§4.1). 두 신호를 모두 처리하도록 설계했고, 구현 계획 첫 단계에서 실측한다.
  - 그 밖에 TODO·TBD 는 없다.
- **모순**:
  - 결정 P2 는 목차에 status 를 둔다. 투영 뒤에는 늘 RELEASED 라 정보가 없지만, 결정대로 칸을 남겼다(§3.1).
  - 결정 P5 "기록기 그대로"와 본문 무효화는 정의 키 묶음 지움으로 맞췄다(§4.3, §5.6).
  - "최종 본문은 지금 수명"과 "옛 본문 10분"은 조회 때마다 다시 판정해 예약 버전 도래와 맞췄다(§5.5).
  - 예약 버전 수명은 결정 P6 밖이었고, 결정 P9 로 10분·미리 받지 않기로 정했다. §5.5 표·§5.9·§11 이 같은 내용이다.
- **모호함**:
  - "최종 버전"은 대상마다 뜻이 다르다. 코드는 소급 때문에 늘 있고, 룰·세트·전문은 없을 수 있다. 이것을 §3.2 표로 고정했다.
  - "전체" 표시는 집합 비교로 판단한다고 적었다(§3.3).
  - "적용 버전 없음"과 "없음"을 구별했다(§5.2).
- **범위**:
  - 구현·빌드·시험을 하지 않았다. 저장소에 쓰지 않았다.
  - 엔진 변경은 결정 P7 로 정했다. ns 급 확장은 범위 밖으로 적었다(§11).
  - `MASTER_AT` 의 남는 후퇴(미리 풀 수 없는 식)는 §7.3 에, 받아들인 장애 중 적용 경계 통과 후퇴는 §5.9 에 적었다(결정 P8·P9).
  - CodeReferenceCheck 는 범위 밖으로만 기록했다.

## 부록 A. 벤치 요약 (2026-10-03)

이 문서의 크기·시간 근거다. 원본 측정 기록에서 설계 판단에 쓴 값만 옮겼다.

### A.1 측정 조건

| 시나리오 | RELEASED 버전 | 코드 수 | 버전마다 바뀌는 코드 | 그 밖 |
|---|---|---|---|---|
| A | 10 | 100 | 5% | 모든 시나리오 공통: 초안(DRAFT) 1개, 카테고리 REGEX(`RX`, ATTR01 이 "X", 약 25%) 1개 + TABLE(`TB`) 1개, 적용 구간은 하루씩 연속이고 마지막 RELEASED 는 열린 끝 |
| B | 1,000 | 1,000 | 1% | |
| C | 1,000 | 1,000 | 10% | |

- 데이터: 첫 버전에 코드마다 열린 행 하나를 두고, 버전마다 바뀌는 코드만 이전 행을 닫고 새 행을 연다. TABLE 소속도 바뀐 코드만 구간을 끊는다. 마지막 초안은 열린 행 전체를 사본으로 만든다.
- 방법: `maru-mdm-engine` 의 임시 JUnit 시험으로 쟀고 측정 뒤 지웠다. JMH 는 쓰지 않았다. 운영과 같은 C2 컴파일러, 힙 `-Xmx5g` 로 돌렸다.
  - 크기: "JSON" 은 Jackson 직렬화 바이트 수다. "힙" 은 그 JSON 을 역직렬화한 객체를 잡은 채 GC 4회 뒤 늘어난 사용량이다.
  - 조회 시간: 워밍업 뒤 약 0.5초 창을 다섯 번 재어 중앙값을 냈다(ns/회). 측정 대상 다섯 가지를 반복마다 순서를 돌려 번갈아 쟀다.
- 판정 동치: 코드@버전 스냅숏과 투영 결과의 selectVersion·isMember·attr·codeList·effectiveCodes 가 세 버전(가장 오래된·중간·현재)에서 1,200건 모두 같았다. 원본과 투영 사이 불일치도 0건이었다.
- 신뢰도: 회차는 두 번(1차 A→B→C, 2차 C→B→A) 돌렸다. **B·C 의 1차 값만 깨끗하다**(측정 스레드 CPU 비율 0.82 이상). 2차는 PC 부하로 2~4배 느리게 나와 방향 확인에만 쓴다. A 는 1차도 흔들렸고 값이 10 µs 대라, 원본·투영·스냅숏 사이 차이는 "차이 없음"으로 읽는다. 아래 표는 모두 1차 값이다.

### A.2 크기 (행 수·힙)

| 시나리오 | 구분 | items | cateItems | JSON 바이트 | 힙 바이트 |
|---|---|---|---|---|---|
| A | 원본(초안 포함) | 245 | 121 | 59,774 | 209,645 |
| A | RELEASED 투영 | 145 | 72 | 35,466 | 120,031 |
| A | 코드@버전 현재(versions 1행) | 100 | 49 | 23,963 | 81,574 |
| A | 색인(스냅숏 제외) | - | - | - | 11,640 |
| B | 원본 | 11,990 | 6,025 | 2,973,517 | 10,176,176 |
| B | RELEASED 투영 | 10,990 | 5,505 | 2,727,161 | 9,345,344 |
| B | 코드@버전 현재(versions 1행) | 1,000 | 520 | 241,898 | 838,366 |
| B | 색인(스냅숏 제외) | - | - | - | 98,752 |
| C | 원본 | 101,900 | 50,875 | 24,659,416 | 85,393,632 |
| C | RELEASED 투영 | 100,900 | 50,425 | 24,415,646 | 84,571,408 |
| C | 코드@버전 현재(versions 1행) | 1,000 | 450 | 239,522 | 827,822 |
| C | 색인(스냅숏 제외) | - | - | - | 96,356 |

- 스냅숏에 versions 를 전부 실으면(1,000행) B·C 에서 힙이 약 1.05 MB 로 220 KB 늘어난다. 이 설계는 versions 를 목차에만 둔다.
- 투영이 덜어 내는 것은 초안 사본 행뿐이다. 그래서 투영 효과는 A −41%, B −8%, C −1% 다.

### A.3 조회 시간 (현재 버전, ns/회, 1차 중앙값)

| 시나리오 | 연산 | 원본 | RELEASED 투영 | 코드@버전 스냅숏(해석기) | 코드@버전 + 색인(해석기 없이) |
|---|---|---|---|---|---|
| A | isMember(TABLE) | 19,311 | 18,529 | 13,953 | 19 |
| B | isMember(TABLE) | 211,239 | 193,163 | 54,258 | 8 |
| C | isMember(TABLE) | 2,798,167 | 2,810,703 | 34,268 | 6 |
| C | attr(TABLE, attr02) | 3,718,519 | 3,755,317 | 49,333 | 12 |
| C | codeList(TABLE) | 6,207,722 | 6,079,898 | 80,857 | 6 |

- 해석기 비용은 훑는 행 수에 비례한다. 스냅숏은 코드 수(1,000행)만 훑으므로 C 에서 투영의 약 1/80 이다.
- 색인 열은 해시 조회·집합 포함 검사·미리 정렬한 목록 크기만 쟀다. 엔진 해석기를 거치지 않으므로 다른 열과 같은 잣대가 아니다.

### A.4 메모리 구성과 적재 비용

| 구성(힙 바이트) | A | B | C |
|---|---|---|---|
| 전 이력 투영 한 덩어리 | 120,031 | 9,345,344 | 84,571,408 |
| 현재 버전 하나 | 81,574 | 838,366 | 827,822 |
| 현재 + 옛 5개 | 492,209 | 4,989,017 | 5,017,753 |

- 현재 + 옛 5개는 B 투영의 약 54%, C 투영의 약 6% 다. A 에서는 투영의 4배다.
- 변경이 적은 B 에서도 스냅숏 약 10개를 함께 들면 투영 한 덩어리와 같아진다. 손익분기는 "변경 이력 행 수 ≈ 캐시할 버전 수 × 코드 수"다.

| 적재 비용(ms, DB 읽기 제외) | A | B | C |
|---|---|---|---|
| 투영 함수 `releasedOnly` 1회 | 0.02 | 5.39 | 12.01 |
| 스냅숏 1개 자르기 — 현재 버전 | 0.01 | 0.18 | 2.80 |
| 스냅숏 1개 자르기 — 가장 오래된 버전 | 0.01 | 0.15 | 2.61 |
| 색인 1개 만들기(해석기로 소속·목록 계산 포함) | 0.08 | 0.70 | 0.36 |

- 자르기는 입력(투영 결과) 전체를 한 번 훑으므로 이력 길이에 비례한다. MDM 이 원장에서 행을 읽는 시간은 들어 있지 않다(§4.2).

