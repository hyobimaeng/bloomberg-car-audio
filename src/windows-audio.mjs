import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createSpeech({
  text,
  voice,
  workDir,
  powershellPath,
  ffmpegPath
}) {
  const tempDir = path.join(workDir, ".tmp");
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const textPath = path.join(tempDir, `${stamp}.txt`);
  const wavPath = path.join(tempDir, `${stamp}.wav`);
  const mp3Path = path.join(tempDir, `${stamp}.mp3`);
  const speechScript = path.join(workDir, "scripts", "export-speech.ps1");

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(textPath, String(text || "").trim(), "utf8");

  await execFileAsync(
    powershellPath,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      speechScript,
      "-TextPath",
      textPath,
      "-OutputPath",
      wavPath,
      "-VoiceName",
      voice
    ],
    {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    }
  );

  const resolvedFfmpegPath = await resolveFfmpegPath(ffmpegPath);
  await execFileAsync(
    resolvedFfmpegPath,
    [
      "-y",
      "-i",
      wavPath,
      "-codec:a",
      "libmp3lame",
      "-qscale:a",
      "3",
      mp3Path
    ],
    {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    }
  );

  const buffer = await fs.readFile(mp3Path);
  await cleanupFiles([textPath, wavPath, mp3Path]);
  return buffer;
}

async function resolveFfmpegPath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.FFMPEG_PATH,
    "ffmpeg",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "WinGet",
      "Packages",
      "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "ffmpeg-8.1-full_build",
      "bin",
      "ffmpeg.exe"
    )
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") {
      return candidate;
    }

    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("FFmpeg executable was not found. Set FFMPEG_PATH or add ffmpeg to PATH.");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupFiles(files) {
  await Promise.all(
    files.map(async (filePath) => {
      try {
        await fs.rm(filePath, { force: true });
      } catch {
        return;
      }
    })
  );
}
