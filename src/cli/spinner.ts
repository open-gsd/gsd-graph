// gsd-graph — stderr spinner / progress for long CLI ops (enable, sync)

import pc from 'picocolors';

export type ProgressReporter = (message: string) => void;

export interface CliSpinner {
  /** Start or update the active status line. */
  update: ProgressReporter;
  /** Clear spinner and print a success line. */
  succeed: (message?: string) => void;
  /** Clear spinner and print a failure line. */
  fail: (message?: string) => void;
  /** Stop without a status line (used before JSON stdout). */
  stop: () => void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

function isInteractive(): boolean {
  if (process.env.CI === 'true' || process.env.CI === '1') return false;
  if (process.env.GSD_GRAPH_NO_SPINNER === '1') return false;
  return Boolean(process.stderr.isTTY);
}

/**
 * Create a spinner that writes **only to stderr** so stdout stays pure JSON (K22).
 *
 * Note: long sync CPU work blocks the event loop, so the interval may freeze.
 * Callers should call `update()` often; each update advances the frame and
 * refreshes elapsed time even when setInterval cannot fire.
 */
export function createCliSpinner(initial?: string): CliSpinner {
  const interactive = isInteractive();
  const plain =
    !interactive &&
    (process.env.GSD_GRAPH_PROGRESS === '1' ||
      process.env.GSD_GRAPH_PROGRESS === 'true');

  let message = initial ?? '';
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let active = false;
  const startedAt = Date.now();
  let lastPlainAt = 0;

  const elapsedLabel = (): string => {
    const s = (Date.now() - startedAt) / 1000;
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
  };

  const clearLine = (): void => {
    if (!interactive) return;
    process.stderr.write('\r\x1b[K');
  };

  const render = (): void => {
    if (!interactive || !active) return;
    const glyph = FRAMES[frame % FRAMES.length]!;
    frame += 1;
    const line = `${pc.cyan(`${glyph} ${message}`)} ${pc.dim(`· ${elapsedLabel()}`)}`;
    process.stderr.write(`\r\x1b[K${line}`);
  };

  const start = (): void => {
    if (active) return;
    active = true;
    if (interactive) {
      // Keep animating when the event loop is free (I/O gaps).
      timer = setInterval(render, 80);
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
      render();
    }
  };

  const update = (msg: string): void => {
    message = msg;
    if (!active) start();
    if (interactive) {
      // Always repaint + advance frame on progress (survives event-loop block).
      render();
      return;
    }
    if (plain) {
      // Throttle plain logs to avoid flooding non-TTY pipes.
      const now = Date.now();
      if (now - lastPlainAt >= 500 || lastPlainAt === 0) {
        lastPlainAt = now;
        process.stderr.write(`[gsd-graph] ${message} · ${elapsedLabel()}\n`);
      }
    }
  };

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (active && interactive) clearLine();
    active = false;
  };

  const succeed = (msg?: string): void => {
    stop();
    if (!interactive && !plain) return;
    const text = msg ?? message;
    if (interactive) {
      process.stderr.write(
        pc.green(`✔ ${text}`) + pc.dim(` · ${elapsedLabel()}`) + '\n',
      );
    } else if (plain) {
      process.stderr.write(`[gsd-graph] done: ${text} · ${elapsedLabel()}\n`);
    }
  };

  const fail = (msg?: string): void => {
    stop();
    if (!interactive && !plain) return;
    const text = msg ?? message;
    if (interactive) {
      process.stderr.write(
        pc.red(`✖ ${text}`) + pc.dim(` · ${elapsedLabel()}`) + '\n',
      );
    } else if (plain) {
      process.stderr.write(`[gsd-graph] failed: ${text} · ${elapsedLabel()}\n`);
    }
  };

  if (initial) update(initial);

  return { update, succeed, fail, stop };
}

/**
 * Run work under a spinner; always stops spinner before returning so
 * subsequent JSON stdout is clean. Does not print succeed (caller may writeOk).
 */
export function withSpinner<T>(
  label: string,
  fn: (report: ProgressReporter) => T,
): T {
  const spinner = createCliSpinner(label);
  try {
    const result = fn((msg) => spinner.update(msg));
    spinner.stop();
    return result;
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }
}
