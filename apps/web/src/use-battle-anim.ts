/**
 * 战场动画播放器（2026-10-25 新增）
 *
 * 把 `planFrames()` 产出的帧序列按各自 `durationMs` 逐帧吐给 `<BattleStage frame={...}>`。
 * 纯 setTimeout 链（与全真模拟的 `pump` 循环同一套节奏观感），不引第三方动画库。
 *
 * 两页用法：
 *  - 全真模拟：每收满一个「回合组」→ planFrames(本组事件, hits) → play()
 *  - 数值代理：回放播放器每推进一组 → 同样 planFrames → play()
 *
 * 换组时直接 `play()` 覆盖旧队列（不排队），避免高倍速下动画滞后于战斗推进。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimFrame } from './battle-anim.js';

export interface BattleAnimController {
  /** 当前帧（null = 静止） */
  frame: AnimFrame | null;
  /** 是否还在播 */
  playing: boolean;
  /** 播放一组帧（覆盖当前队列） */
  play: (frames: readonly AnimFrame[]) => void;
  /** 立即停并清空 */
  stop: () => void;
}

export function useBattleAnim(): BattleAnimController {
  const [frame, setFrame] = useState<AnimFrame | null>(null);
  const [playing, setPlaying] = useState(false);
  const queue = useRef<AnimFrame[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const stop = useCallback((): void => {
    clearTimer();
    queue.current = [];
    setFrame(null);
    setPlaying(false);
  }, [clearTimer]);

  const play = useCallback(
    (frames: readonly AnimFrame[]): void => {
      clearTimer();
      queue.current = frames.slice();
      if (queue.current.length === 0) {
        setFrame(null);
        setPlaying(false);
        return;
      }
      setPlaying(true);
      const run = (): void => {
        const next = queue.current.shift();
        if (!next) {
          setFrame(null);
          setPlaying(false);
          return;
        }
        setFrame(next);
        timer.current = setTimeout(run, next.durationMs);
      };
      run();
    },
    [clearTimer],
  );

  // 卸载（含 StrictMode 重挂载）时清掉定时器，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      clearTimer();
      queue.current = [];
    };
  }, [clearTimer]);

  return { frame, playing, play, stop };
}
