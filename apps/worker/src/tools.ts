import { spawn } from 'node:child_process';
import { cfg } from './config';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class ToolError extends Error {
  constructor(
    readonly tool: string,
    readonly code: number,
    readonly stderr: string,
  ) {
    super(`${tool} завершился с кодом ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 500)}`);
  }
}

/**
 * Запуск внешнего обработчика (FFmpeg, libvips, ExifTool…) с таймаутом.
 * Программы из загруженных файлов никогда не запускаются — только эти инструменты над ними (ТЗ §10.1).
 */
export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; input?: Buffer; onStdoutLine?: (line: string) => void; maxOutput?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const max = opts.maxOutput ?? 8 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let lineBuf = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? cfg.toolTimeoutMs);
    // Инструмент может закрыть вход раньше, чем прочитает всё (например, `file` по первым байтам) — это не ошибка
    child.stdin.on('error', () => undefined);

    child.stdout.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      if (stdout.length < max) stdout += s;
      if (opts.onStdoutLine) {
        lineBuf += s;
        let i: number;
        while ((i = lineBuf.indexOf('\n')) >= 0) {
          opts.onStdoutLine(lineBuf.slice(0, i).trim());
          lineBuf = lineBuf.slice(i + 1);
        }
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-32 * 1024);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGKILL') return reject(new ToolError(cmd, -1, `прерван по таймауту\n${stderr}`));
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (opts.input) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

export async function runOk(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new ToolError(cmd, r.code, r.stderr);
  return r;
}
