# Binding Playbook

이 문서는 OASIS의 `PropertyEL`, `MethodBinding` 규칙과 대표 테스트 패턴을 기준으로 정리한 가이드다. 실제 Java source/BPMN XML 조각은 `source-bpmn-examples.md` 의 binding 섹션을 같이 보고, 리스트 결과 소비와 루프 입력/출력은 `list-loop-guide.md` 를 같이 본다.

## PropertyEL 핵심 문법

기본 형태는 `키[접근키]->반환키` 이다.

- `aa -> bb`
  - 컨텍스트에서 `aa` 를 읽고 `bb` 라는 이름으로 사용한다.
- `aa[0] -> bb`
  - `aa` 가 리스트라면 0번째 요소를 `bb` 라는 이름으로 사용한다.
- `aa['kk'] -> bb`
  - `aa` 가 맵이라면 `kk` 키의 값을 `bb` 라는 이름으로 사용한다.
- `aa -> bb,yy[0] -> kk`
  - 표현식은 `,` 로 이어서 여러 개 쓸 수 있다.

## PropertyEL 해석 포인트

- 먼저 source key가 현재 컨텍스트에 존재해야 한다.
- 그다음 accessor가 실제 타입과 맞아야 한다.
  - 리스트면 숫자 인덱스
  - 맵이면 문자열 키
- `->` 뒤 alias는 다음 태스크 입력에서 사용할 이름이다.
- 표현식이 맞아도 alias를 소비하는 쪽 입력 프로퍼티가 다르면 기대와 다른 동작이 나온다.

## PropertyEL 디버깅 체크리스트

1. source key가 `ServiceContext` 또는 직전 output에 실제로 존재하는지 확인한다.
2. accessor가 타입과 맞는지 확인한다.
3. alias 이름이 다음 task 파라미터 이름 또는 입력 프로퍼티와 맞는지 확인한다.
4. BPMN의 `input` / `output` 확장 프로퍼티가 기대한 방향으로 연결돼 있는지 확인한다.
5. 가장 가까운 샘플 BPMN을 `pattern-map.md` 에서 찾아 비교한다.

실제 BPMN XML 예제:
- `source-bpmn-examples.md` 의 “`PropertyEL` / output alias 예제”

## MethodBinding 결정 규칙

`JavaServiceTask` 는 지정한 클래스의 객체를 만든 뒤 `method` 프로퍼티에 지정한 메서드를 호출한다.

생성자/메서드 선택 규칙:
- 후보는 `public` 생성자/메서드다.
- 파라미터 수가 긴 순서로 먼저 시도한다.
- 각 파라미터는 아래 순서로 매칭한다.
  - 파라미터 이름으로 컨텍스트 값 조회
  - 없으면 사용자 정의 타입 기준 호환 타입 조회
- 모든 파라미터가 매칭되는 후보를 선택한다.

중요 제약:
- `String`, `Map` 같은 기본 제공 타입은 타입 fallback 대상으로 기대하지 않는다.
- 이름 매칭이 더 중요하다.

## MethodBinding 디버깅 체크리스트

1. BPMN의 `class`, `method`, `input` 확장 프로퍼티를 확인한다.
2. task 클래스의 `public` 생성자/메서드 시그니처를 확인한다.
3. 파라미터 이름이 실제 컨텍스트 키와 같은지 확인한다.
4. 오버로딩이 있다면 가장 긴 시그니처가 먼저 시도된다는 점을 감안한다.
5. built-in type fallback 을 기대하고 있지 않은지 확인한다.
6. 필요하면 가장 작은 재현 테스트를 만들어 어떤 시그니처가 선택되는지 고정한다.

실제 BPMN XML / Java 예제:
- `source-bpmn-examples.md` 의 “`MethodBinding` / `inputParameter` 예제”

## 대표 샘플 패턴

- `PropertyEL` 과 output/result 검증
  - output alias가 다음 태스크 입력으로 제대로 연결되는지 본다.
- 메서드 파라미터 바인딩
  - 같은 이름의 메서드가 여러 개 있을 때 어떤 시그니처가 선택되는지 본다.
- 서비스 입력 어댑터와 바인딩 실패/성공 비교
  - 컨텍스트 키 이름이 맞을 때와 틀릴 때 결과가 어떻게 달라지는지 본다.
- 문자열/타입 표현식 파싱
  - type hint 와 문자열 표현식이 실제 task 실행 계약으로 어떻게 이어지는지 본다.

## 흔한 오해

- alias를 정했다고 해서 자동으로 원하는 파라미터에 들어가지는 않는다.
  - 소비하는 쪽의 입력 이름과 연결을 확인해야 한다.
- 오버로딩된 메서드가 있으면 “이름만 같으면 되겠지”라고 생각하면 안 된다.
  - OASIS는 후보 순서와 파라미터 매칭 규칙에 따라 선택한다.
- 컨텍스트에 값이 있어도 타입 fallback 으로 자동 연결되리라 기대하면 실패할 수 있다.
  - 특히 `String`, `Map` 같은 타입은 이름 매칭 위주로 본다.
