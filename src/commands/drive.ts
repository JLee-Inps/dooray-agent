// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";

/** 드라이브 명령 그룹 (실험적): list, files, download, upload. */
export function driveCommand(): Command {
  const drive = new Command("drive").description("드라이브 명령 (실험적)");

  const list = new Command("list")
    .description("드라이브 목록 (실험적)")
    .action(async () => {
      const mode = list.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("드라이브 조회 중...");
      const items = await client.listDrives();
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name"],
          rows: items.map((d) => [d.id, d.name ?? ""]),
        },
        json: items,
        ids: items.map((d) => d.id),
      });
    });

  const files = new Command("files")
    .description("드라이브 파일 목록 (실험적)")
    .argument("<drive-id>", "드라이브 ID (drive list 로 확인)")
    .action(async (driveId: string) => {
      const mode = files.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("파일 조회 중...");
      const items = await client.listDriveFiles(driveId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name", "size"],
          rows: items.map((f) => [f.id, f.name, f.size]),
        },
        json: items,
        ids: items.map((f) => f.id),
      });
    });

  const download = new Command("download")
    .description("드라이브 파일 다운로드 (실험적)")
    .argument("<drive-id>", "드라이브 ID")
    .argument("<file-id>", "파일 ID")
    .option("--out <dir>", "저장 디렉터리", ".")
    .action(async (driveId: string, fileId: string, opts: { out: string }) => {
      const mode = download.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("파일 다운로드 중...");
      const { buffer, fileName } = await client.downloadDriveFile(
        driveId,
        fileId,
      );
      const outputPath = join(opts.out, fileName);
      await writeFile(outputPath, buffer);
      stopSpinner();
      reportWrite(mode, {
        json: {
          outputPath,
          fileName,
          size: buffer.length,
          status: "downloaded",
        },
        id: outputPath,
        message: `파일이 저장되었습니다: ${outputPath}`,
      });
    });

  const upload = new Command("upload")
    .description("드라이브에 파일 업로드 (실험적)")
    .argument("<drive-id>", "드라이브 ID")
    .argument("<file-path>", "업로드할 로컬 파일 경로")
    .action(async (driveId: string, filePath: string) => {
      const mode = upload.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("파일 업로드 중...");
      const id = await client.uploadDriveFile(driveId, filePath);
      stopSpinner();
      reportWrite(mode, {
        json: { fileId: id, status: "uploaded" },
        id,
        message: `파일이 업로드되었습니다: ${id}`,
      });
    });

  drive.addCommand(list);
  drive.addCommand(files);
  drive.addCommand(download);
  drive.addCommand(upload);
  return drive;
}
