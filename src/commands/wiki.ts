// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { summarizeDownloads, type DownloadOutcome } from "../core/download";
import { startSpinner, stopSpinner } from "../core/spinner";
import { resolveWikiId, resolveParentPageId } from "../resolve/project";

const MARKDOWN = "text/x-markdown";

/** 위키 명령 그룹: pages, page get/create/edit. */
export function wikiCommand(): Command {
  const wiki = new Command("wiki").description("위키 명령");

  const pages = new Command("pages")
    .description("위키 페이지 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = pages.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("위키 페이지 조회 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      const { items } = await client.listWikiPages(wikiId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "subject"],
          rows: items.map((p) => [p.id, p.subject]),
        },
        json: items,
        ids: items.map((p) => p.id),
      });
    });

  const page = new Command("page").description("위키 페이지 읽기/쓰기");

  const get = new Command("get")
    .description("위키 페이지 조회 (본문 포함)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .action(async (projectInput: string, pageId: string) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("위키 페이지 조회 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      const wikiPage = await client.getWikiPage(wikiId, pageId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["field", "value"],
          rows: [
            ["id", wikiPage.id],
            ["subject", wikiPage.subject],
          ],
        },
        json: wikiPage,
        ids: [wikiPage.id],
      });
      // 기본 모드에서는 본문도 이어서 보여준다(자동화 모드는 --json 이 본문 포함).
      if (!mode.json && !mode.quiet && wikiPage.body) {
        process.stdout.write("\n" + wikiPage.body.content + "\n");
      }
    });

  const create = new Command("create")
    .description("위키 페이지 생성")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .requiredOption("--title <title>", "페이지 제목")
    .option("--body <text>", "본문(마크다운)", "")
    .option("--parent <pageId>", "부모 페이지 ID")
    .action(
      async (
        projectInput: string,
        opts: { title: string; body: string; parent?: string },
      ) => {
        const mode = create.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("위키 페이지 생성 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        const { id } = await client.createWikiPage(wikiId, {
          subject: opts.title,
          body: { mimeType: MARKDOWN, content: opts.body },
          parentPageId: await resolveParentPageId(client, wikiId, opts.parent),
        });
        stopSpinner();
        reportWrite(mode, {
          json: { pageId: id, status: "created" },
          id,
          message: `위키 페이지가 생성되었습니다: ${id}`,
        });
      },
    );

  const edit = new Command("edit")
    .description("위키 페이지 수정 (제목/본문 부분 수정 가능)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .option("--title <title>", "새 제목")
    .option("--body <text>", "새 본문(마크다운)")
    .action(
      async (
        projectInput: string,
        pageId: string,
        opts: { title?: string; body?: string },
      ) => {
        const mode = edit.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("위키 페이지 수정 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        // 지정하지 않은 필드는 현재 값을 유지한다.
        const current = await client.getWikiPage(wikiId, pageId);
        const subject = opts.title ?? current.subject;
        const content = opts.body ?? current.body?.content ?? "";
        await client.updateWikiPage(wikiId, pageId, {
          subject,
          body: { mimeType: MARKDOWN, content },
        });
        stopSpinner();
        reportWrite(mode, {
          json: { pageId, status: "updated" },
          id: pageId,
          message: `위키 페이지가 수정되었습니다: ${pageId}`,
        });
      },
    );

  const del = new Command("delete")
    .description("위키 페이지 삭제")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .action(async (projectInput: string, pageId: string) => {
      const mode = del.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("위키 페이지 삭제 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      await client.deleteWikiPage(wikiId, pageId);
      stopSpinner();
      reportWrite(mode, {
        json: { pageId, status: "deleted" },
        id: pageId,
        message: `위키 페이지가 삭제되었습니다: ${pageId}`,
      });
    });

  const comment = new Command("comment").description("위키 페이지 댓글");

  const commentList = new Command("list")
    .description("위키 페이지 댓글 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .action(async (projectInput: string, pageId: string) => {
      const mode = commentList.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("댓글 조회 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      const { items } = await client.listWikiComments(wikiId, pageId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "createdAt"],
          rows: items.map((c) => [c.id, c.createdAt ?? ""]),
        },
        json: items,
        ids: items.map((c) => c.id),
      });
    });

  const commentAdd = new Command("add")
    .description("위키 페이지 댓글 추가")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .requiredOption("--body <text>", "댓글 본문")
    .action(
      async (projectInput: string, pageId: string, opts: { body: string }) => {
        const mode = commentAdd.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("댓글 작성 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        const { id } = await client.createWikiComment(wikiId, pageId, {
          body: { content: opts.body },
        });
        stopSpinner();
        reportWrite(mode, {
          json: { commentId: id, status: "created" },
          id,
          message: `댓글이 작성되었습니다: ${id}`,
        });
      },
    );

  const commentEdit = new Command("edit")
    .description("위키 페이지 댓글 수정")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .argument("<comment-id>", "댓글 ID")
    .requiredOption("--body <text>", "새 댓글 본문")
    .action(
      async (
        projectInput: string,
        pageId: string,
        commentId: string,
        opts: { body: string },
      ) => {
        const mode = commentEdit.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("댓글 수정 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        await client.updateWikiComment(wikiId, pageId, commentId, {
          body: { content: opts.body },
        });
        stopSpinner();
        reportWrite(mode, {
          json: { commentId, status: "updated" },
          id: commentId,
          message: `댓글이 수정되었습니다: ${commentId}`,
        });
      },
    );

  const commentDelete = new Command("delete")
    .description("위키 페이지 댓글 삭제")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .argument("<comment-id>", "댓글 ID")
    .action(async (projectInput: string, pageId: string, commentId: string) => {
      const mode = commentDelete.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("댓글 삭제 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      await client.deleteWikiComment(wikiId, pageId, commentId);
      stopSpinner();
      reportWrite(mode, {
        json: { commentId, status: "deleted" },
        id: commentId,
        message: `댓글이 삭제되었습니다: ${commentId}`,
      });
    });

  comment.addCommand(commentList);
  comment.addCommand(commentAdd);
  comment.addCommand(commentEdit);
  comment.addCommand(commentDelete);

  const file = new Command("file").description("위키 페이지 첨부파일");

  const fileList = new Command("list")
    .description("위키 페이지 첨부파일 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .action(async (projectInput: string, pageId: string) => {
      const mode = fileList.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("첨부파일 조회 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      const files = await client.listWikiFiles(wikiId, pageId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name", "size"],
          rows: files.map((f) => [f.id, f.name, f.size]),
        },
        json: files,
        ids: files.map((f) => f.id),
      });
    });

  const fileUpload = new Command("upload")
    .description("위키 페이지에 파일 업로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .argument("<file-path>", "업로드할 로컬 파일 경로")
    .action(async (projectInput: string, pageId: string, filePath: string) => {
      const mode = fileUpload.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("파일 업로드 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      const id = await client.uploadWikiFile(wikiId, pageId, filePath);
      stopSpinner();
      reportWrite(mode, {
        json: { fileId: id, status: "uploaded" },
        id,
        message: `파일이 업로드되었습니다: ${id}`,
      });
    });

  const fileDownload = new Command("download")
    .description("위키 페이지 첨부파일 다운로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .argument("<file-id>", "첨부파일 ID")
    .option("--out <dir>", "저장 디렉터리", ".")
    .action(
      async (
        projectInput: string,
        pageId: string,
        fileId: string,
        opts: { out: string },
      ) => {
        const mode = fileDownload.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("파일 다운로드 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        const { buffer, fileName } = await client.downloadWikiFile(
          wikiId,
          pageId,
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
      },
    );

  const fileDownloadAll = new Command("download-all")
    .description("위키 페이지 첨부파일 전체 다운로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .option("--out <dir>", "저장 디렉터리", ".")
    .action(
      async (projectInput: string, pageId: string, opts: { out: string }) => {
        const mode = fileDownloadAll.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("첨부파일 전체 다운로드 중...");
        const wikiId = await resolveWikiId(client, projectInput);
        const files = await client.listWikiFiles(wikiId, pageId);
        const outcomes: DownloadOutcome[] = [];
        // 파일별로 실패를 수집한다 — 하나가 실패해도 나머지는 계속 받는다.
        for (const meta of files) {
          try {
            const { buffer, fileName } = await client.downloadWikiFile(
              wikiId,
              pageId,
              meta.id,
            );
            const outputPath = join(opts.out, fileName);
            await writeFile(outputPath, buffer);
            outcomes.push({ fileId: meta.id, outputPath });
          } catch (error) {
            outcomes.push({
              fileId: meta.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        stopSpinner();
        const summary = summarizeDownloads(outcomes);
        reportWrite(mode, {
          json: summary,
          id: opts.out,
          message: `첨부파일 ${summary.succeeded.length}/${summary.count}개 다운로드 완료 (실패 ${summary.failed.length}개)`,
        });
        // 부분 실패는 정상 출력 후 종료코드만 1 로(중앙 에러 싱크는 거치지 않음).
        if (summary.failed.length > 0) process.exitCode = 1;
      },
    );

  const fileDelete = new Command("delete")
    .description("위키 페이지 첨부파일 삭제")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<page-id>", "위키 페이지 ID")
    .argument("<file-id>", "첨부파일 ID")
    .action(async (projectInput: string, pageId: string, fileId: string) => {
      const mode = fileDelete.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("첨부파일 삭제 중...");
      const wikiId = await resolveWikiId(client, projectInput);
      await client.deleteWikiFile(wikiId, pageId, fileId);
      stopSpinner();
      reportWrite(mode, {
        json: { fileId, status: "deleted" },
        id: fileId,
        message: `첨부파일이 삭제되었습니다: ${fileId}`,
      });
    });

  file.addCommand(fileList);
  file.addCommand(fileUpload);
  file.addCommand(fileDownload);
  file.addCommand(fileDownloadAll);
  file.addCommand(fileDelete);

  page.addCommand(get);
  page.addCommand(create);
  page.addCommand(edit);
  page.addCommand(del);
  page.addCommand(comment);
  page.addCommand(file);
  wiki.addCommand(pages);
  wiki.addCommand(page);
  return wiki;
}
