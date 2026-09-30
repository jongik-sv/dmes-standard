// 추가 Task G1 — 끌 때 맞춤 안내선·스냅 순수 함수(snapMove). 기준: 왼·가운데·오른쪽 x, 위·가운데·아래 y, 축마다 가장 가까운 하나.
import { describe, expect, it } from "vitest";

import { SHORTCUT_HELP } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";
import { SNAP_THRESHOLD_PX, boundsOf, snapHitIn, snapIndex, snapMove, snapMoveIn, snapThreshold, type Box } from "../../../pages/dme/ruleSetEdit/canvas/snap";

/** 기준 상자 A — x 기준 0·50·100, y 기준 0·20·40. */
const A: Box = { x: 0, y: 0, w: 100, h: 40 };

describe("snapMove — x 축(세로 안내선)", () => {
  it("왼쪽이 맞으면 왼쪽에 붙고 안내선은 두 상자를 잇는 길이다", () => {
    const r = snapMove({ x: 3, y: 200, w: 60, h: 20 }, [A], 6);
    expect(r).toEqual({ dx: -3, dy: 0, guides: [{ axis: "x", at: 0, from: 0, to: 220 }] });
  });

  it("가운데가 맞으면 가운데에 붙는다", () => {
    const r = snapMove({ x: 22, y: 200, w: 60, h: 20 }, [A], 6); // 가운데 52 → 50
    expect(r).toEqual({ dx: -2, dy: 0, guides: [{ axis: "x", at: 50, from: 0, to: 220 }] });
  });

  it("오른쪽이 맞으면 오른쪽에 붙는다 — 왼쪽도 임계값 안이지만 더 가까운 하나만", () => {
    const r = snapMove({ x: 44, y: 200, w: 60, h: 20 }, [A], 6); // 왼쪽 44→50(6), 오른쪽 104→100(4)
    expect(r).toEqual({ dx: -4, dy: 0, guides: [{ axis: "x", at: 100, from: 0, to: 220 }] });
  });

  it("끄는 대상의 왼쪽이 다른 상자의 오른쪽에 맞아도 붙는다(6개 기준끼리 모두 비교)", () => {
    const r = snapMove({ x: 102, y: 200, w: 60, h: 20 }, [A], 6);
    expect(r.dx).toBe(-2);
    expect(r.guides).toEqual([{ axis: "x", at: 100, from: 0, to: 220 }]);
  });
});

describe("snapMove — y 축(가로 안내선)", () => {
  it("위·가운데가 모두 임계값 안이면 더 가까운 가운데에 붙고 안내선은 두 상자를 잇는 가로 길이다", () => {
    const r = snapMove({ x: 300, y: -4, w: 60, h: 10 }, [A], 6); // 위 -4→0(4), 가운데 1→0(1)
    expect(r).toEqual({ dx: 0, dy: -1, guides: [{ axis: "y", at: 0, from: 0, to: 360 }] });
  });

  it("위가 맞으면 위에 붙는다(가운데와 거리가 같으면 위·가운데·아래 순서로 앞의 것)", () => {
    const r = snapMove({ x: 300, y: 3, w: 60, h: 80 }, [A], 6); // 위 3→0(3), 가운데 43→40(3) — 같으면 위(먼저) · 아래 83
    expect(r).toEqual({ dx: 0, dy: -3, guides: [{ axis: "y", at: 0, from: 0, to: 360 }] });
  });

  it("가운데가 맞으면 가운데에 붙는다", () => {
    const r = snapMove({ x: 300, y: 12, w: 60, h: 20 }, [A], 6); // 가운데 22 → 20
    expect(r).toEqual({ dx: 0, dy: -2, guides: [{ axis: "y", at: 20, from: 0, to: 360 }] });
  });

  it("아래가 맞으면 아래에 붙는다", () => {
    const r = snapMove({ x: 300, y: -39, w: 60, h: 83 }, [A], 6); // 위 -39, 가운데 2.5, 아래 44 → 40(4) · 가운데 2.5→0(2.5)
    expect(r.dy).toBe(-2.5);
    const s = snapMove({ x: 300, y: 25, w: 60, h: 17 }, [A], 6); // 위 25→20(5), 가운데 33.5, 아래 42→40(2)
    expect(s).toEqual({ dx: 0, dy: -2, guides: [{ axis: "y", at: 40, from: 0, to: 360 }] });
  });
});

describe("snapMove — 임계값·최근접·후보", () => {
  it("임계값과 같은 거리는 붙고, 넘으면 붙지 않는다", () => {
    expect(snapMove({ x: 6, y: 500, w: 10, h: 10 }, [A], 6).dx).toBe(-6);
    const far = snapMove({ x: 6.5, y: 500, w: 10, h: 10 }, [A], 6);
    expect(far).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapMove({ x: -6, y: 500, w: 30, h: 10 }, [A], 6).dx).toBe(6);
  });

  it("후보 여럿이 임계값 안이면 축마다 가장 가까운 하나에만 붙고 안내선도 하나다", () => {
    const B: Box = { x: 5, y: 300, w: 100, h: 40 };
    const r = snapMove({ x: 3, y: 600, w: 10, h: 10 }, [A, B], 6); // 0 까지 3, 5 까지 2
    expect(r.dx).toBe(2);
    expect(r.guides.filter((g) => g.axis === "x")).toEqual([{ axis: "x", at: 5, from: 300, to: 610 }]);
  });

  it("같은 기준값의 상자가 여럿이면 안내선은 끄는 대상과 가장 가까운 상자와 잇는다", () => {
    const C: Box = { x: 0, y: 500, w: 100, h: 40 };
    const r = snapMove({ x: 2, y: 300, w: 10, h: 20 }, [A, C], 6);
    expect(r.dx).toBe(-2);
    expect(r.guides).toEqual([{ axis: "x", at: 0, from: 300, to: 540 }]); // A(아래 40 — 260 떨어짐)가 아니라 C(위 500 — 180)
  });

  it("두 축이 모두 맞으면 안내선 둘 — 길이는 붙은 뒤 자리로 잰다", () => {
    const r = snapMove({ x: 104, y: 3, w: 50, h: 40 }, [A], 6); // 왼쪽 104→100, 위 3→0
    expect(r.dx).toBe(-4);
    expect(r.dy).toBe(-3);
    expect(r.guides).toEqual([
      { axis: "x", at: 100, from: 0, to: 40 },
      { axis: "y", at: 0, from: 0, to: 150 },
    ]);
  });

  it("후보가 없거나 모두 멀면 움직이지 않는다", () => {
    expect(snapMove({ x: 3, y: 3, w: 10, h: 10 }, [], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapMove({ x: 1000, y: 1000, w: 10, h: 10 }, [A], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("크기나 자리가 유한하지 않은 상자는 후보에서 빼고, 끄는 상자가 그렇면 붙지 않는다", () => {
    expect(snapMove({ x: 3, y: 500, w: 10, h: 10 }, [{ x: 0, y: 0, w: Number.NaN, h: 10 }], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapMove({ x: Number.NaN, y: 500, w: 10, h: 10 }, [A], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("미리 모은 색인(snapIndex)으로 부른 결과가 매번 모으는 snapMove 와 같다(이분 탐색 = 전수 비교)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const others: Box[] = Array.from({ length: 60 }, () => ({ x: Math.round(rnd() * 2000), y: Math.round(rnd() * 2000), w: 20 + Math.round(rnd() * 200), h: 14 + Math.round(rnd() * 60) }));
    const idx = snapIndex(others);
    for (let i = 0; i < 200; i++) {
      const m: Box = { x: rnd() * 2000, y: rnd() * 2000, w: 30 + rnd() * 200, h: 14 + rnd() * 60 };
      const r = snapMoveIn(m, idx, 6);
      expect(r).toEqual(snapMove(m, others, 6));
      // 전수 비교 — 축마다 가장 가까운 거리
      const best = (refs: number[], cands: number[]) => {
        let b = Infinity;
        for (const a of refs) for (const c of cands) if (Math.abs(c - a) < Math.abs(b)) b = c - a;
        return Math.abs(b) <= 6 ? b : 0;
      };
      const xs = others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w]);
      const ys = others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h]);
      expect(Math.abs(r.dx)).toBeCloseTo(Math.abs(best([m.x, m.x + m.w / 2, m.x + m.w], xs)), 9);
      expect(Math.abs(r.dy)).toBeCloseTo(Math.abs(best([m.y, m.y + m.h / 2, m.y + m.h], ys)), 9);
    }
  });
});

describe("snapHitIn — 맞은 상자 ID(I2)", () => {
  it("축마다 안내선이 이은 상자 ID 를 돌려준다 — 같은 상자면 한 번, ID 없는 상자는 빠진다", () => {
    const a: Box = { ...A, id: "a" };
    const b: Box = { x: 500, y: 300, w: 60, h: 20, id: "b" };
    const both = snapHitIn({ x: 2, y: 301, w: 30, h: 30 }, snapIndex([a, b]), 6); // x → a 왼쪽 0, y → b 위 300
    expect(both.targets).toEqual(["a", "b"]);
    expect(snapHitIn({ x: 102, y: 1, w: 30, h: 30 }, snapIndex([a, b]), 6).targets).toEqual(["a"]); // 두 축 모두 a
    expect(snapHitIn({ x: 102, y: 1, w: 30, h: 30 }, snapIndex([A]), 6).targets).toEqual([]);
    expect(snapHitIn({ x: 900, y: 900, w: 30, h: 30 }, snapIndex([a]), 6).targets).toEqual([]);
  });

  it("이동량·안내선은 snapMoveIn 과 같다", () => {
    const idx = snapIndex([{ ...A, id: "a" }]);
    const m: Box = { x: 3, y: 200, w: 60, h: 20 };
    const { targets, ...rest } = snapHitIn(m, idx, 6);
    expect(targets).toEqual(["a"]);
    expect(rest).toEqual(snapMoveIn(m, idx, 6));
  });
});

describe("snapThreshold·boundsOf", () => {
  it("화면 6px 을 흐름 좌표로 바꾼다(확대 배율로 나눈다)", () => {
    expect(SNAP_THRESHOLD_PX).toBe(6);
    expect(snapThreshold(1)).toBe(6);
    expect(snapThreshold(2)).toBe(3);
    expect(snapThreshold(0.5)).toBe(12);
    expect(snapThreshold(0)).toBe(6); // 배율을 모르면 1 로 본다
  });

  it("같은 거리(흐름 4)라도 확대하면 붙지 않고 축소하면 붙는다", () => {
    const m: Box = { x: 4, y: 500, w: 10, h: 10 };
    expect(snapMove(m, [A], snapThreshold(2)).dx).toBe(0);
    expect(snapMove(m, [A], snapThreshold(1)).dx).toBe(-4);
    expect(snapMove({ ...m, x: 10 }, [A], snapThreshold(0.5)).dx).toBe(-10);
  });

  it("여러 상자의 경계 상자(묶음) — 없으면 null", () => {
    expect(boundsOf([{ x: 10, y: 20, w: 30, h: 40 }, { x: -5, y: 50, w: 10, h: 100 }])).toEqual({ x: -5, y: 20, w: 45, h: 130 });
    expect(boundsOf([])).toBeNull();
  });
});

describe("도움말", () => {
  it("단축키 도움말에 「Alt+끌기(노드·메모) = 스냅 끄기」가 편집 모드 포인터 조작으로 있다(키 디스패처는 그대로)", () => {
    const row = SHORTCUT_HELP.find((r) => r.id === "snapOff");
    expect(row).toEqual({ id: "snapOff", win: "Alt+끌기(노드·메모)", mac: "⌥+끌기(노드·메모)", label: "끌 때 맞춤 안내선·스냅 끄기", modes: ["edit"] });
  });
});
