# oasis subtree 동기화 가이드

## 무엇

`src/backend/oasis/`는 `oasis` 저장소를 **git subtree**로 임포트한 결과다. 다른 작업자 입장에서는 dmes-standard의 일반 소스 디렉터리처럼 보이며, 별도 체크아웃이 필요하지 않다.

## 누가 업데이트하는가

레포 메인테이너만. `oasis` 저장소에 업데이트가 생기면, 메인테이너가 `src/backend/oasis`만 `git subtree pull` 로 반영하고 `main` 브랜치에 병합/푸시한다.

## 단축 명령 (alias 등록된 환경)

```bash
git oasis-subtree-update
```

이 alias 는 dmes-standard의 로컬 `.git/config` 에만 저장되며, 다른 작업자에게 영향이 없다. 다른 머신에서 같은 alias를 쓰고 싶으면 아래 2개를 한 번 실행:

```bash
git remote add oasis-src git@github.com:thecodinglog/oasis.git

git config --local alias.oasis-subtree-update '!git fetch oasis-src && git subtree pull --prefix=src/backend/oasis oasis-src master --squash'
```

## raw 명령 (alias 없이)

```bash
git fetch oasis-src
git subtree pull --prefix=src/backend/oasis oasis-src master --squash
```

GitHub pull 권한이 없어 remote로 직접 가져오지 못하는 경우(또는 내부 mirror만 존재하는 경우), 담당자 로컬 mirror 경로를 remote로 등록해서 사용할 수 있다:

```bash
git remote add oasis /Users/cothe/projects/oasis
git fetch oasis
git subtree pull --prefix=src/backend/oasis oasis main --squash
```

(위 경로는 각자의 로컬 환경에 맞게 교체)

## 결과

- `src/backend/oasis/` 가 `oasis` 저장소의 최신 `main` 커밋 기준으로 갱신됨
- `main`에 squash 커밋 1개 + 병합 커밋 1개가 추가됨(프로젝트 정책에 따라 squash 없이 운영해도 됨)
- 작업 실행 전 working tree가 깨끗해야 함 — dirty 상태면 stash/pull 후 재실행

## 충돌이 났을 때

`src/backend/oasis/`를 로컬에서 직접 수정한 이력이 없다면 충돌은 보통 없지만, 발생할 수 있다. 이 경우 원칙적으로 업스트림 변경을 우선하고 충돌 파일을 정리한다:

```bash
git checkout --theirs <file>
git add <file>
git commit
```

업데이트를 유지하면서 충돌을 최소화하려면, dmes-standard의 수정 작업은 `src/backend/oasis/` 내부가 아닌 연동 모듈(`cactus-core` 등)에서 진행한다.

## 푸시

`git oasis-subtree-update` 수행 후 결과를 반영하려면:

```bash
git push origin main      # 사내 GitLab
# 또는
git push github main      # GitHub mirror
```
