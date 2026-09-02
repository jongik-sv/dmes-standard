# oasis-skill 업스트림 동기화 가이드

## 무엇

`.claude/skills/oasis-project-support/` 는 [oasis-official/oasis-skill](https://github.com/oasis-official/oasis-skill) 저장소의 콘텐츠를 **git subtree** 로 임포트한 결과다. 다른 작업자 입장에서는 dmes-standard 의 일반 디렉터리이며 별도 작업이 필요 없다.

## 누가 업데이트하는가

레포 메인테이너만. oasis-skill 업스트림에 새 변경이 생겼을 때 메인테이너가 dmes-standard 의 main 에 subtree pull 로 반영하고 push 한다.

## 단축 명령 (alias 등록된 환경)

```bash
git oasis-update
```

이 alias 는 dmes-standard 의 로컬 `.git/config` 에만 저장된다 (다른 작업자에게 영향 없음). 다른 머신에서 dmes-standard 을 clone 한 뒤 alias 가 필요하면 아래 두 명령을 한 번 실행:

```bash
git remote add oasis git@github.com:oasis-official/oasis-skill.git
git config --local alias.oasis-update '!git fetch oasis && git subtree pull --prefix=.claude/skills/oasis-project-support oasis main --squash'
```

## raw 명령 (alias 없이)

```bash
git fetch oasis
git subtree pull --prefix=.claude/skills/oasis-project-support oasis main --squash
```

## 결과

- `.claude/skills/oasis-project-support/` 가 oasis-skill 의 최신 main 으로 갱신
- main 에 squash 커밋 1개 + 머지 커밋 1개 추가
- working tree 가 깨끗해야 실행 가능 — dirty 시 stash 후 재시도

## 충돌이 났을 때

dmes-standard 안에서 `.claude/skills/oasis-project-support/` 를 직접 수정한 적이 없다면 충돌은 발생하지 않는다. 만약 충돌이 발생하면 **업스트림 변경을 우선**하고 (`git checkout --theirs <file>`) 정리한다 — skill 콘텐츠는 oasis-skill 본체에서만 수정하는 것이 원칙.

## 푸시

`git oasis-update` 후 동기화 결과를 원격 dmes-standard 에 반영하려면:

```bash
git push origin main      # 사내 GitLab
# 또는
git push github main      # GitHub mirror
```
