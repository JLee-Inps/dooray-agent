// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { createClient } from "../core/session";
import type { DoorayClient } from "../dooray/client";
import type { PostUserRef } from "../dooray/types";
import { render, reportWrite, type OutputMode } from "../core/output";
import { summarizeDownloads, type DownloadOutcome } from "../core/download";
import { startSpinner, stopSpinner } from "../core/spinner";
import { resolveProjectId } from "../resolve/project";
import { resolveMemberId } from "../resolve/member";
import { resolveTagId } from "../resolve/tag";
import { resolveMilestoneId } from "../resolve/milestone";
import { findClosedWorkflowId, resolveWorkflowId } from "../resolve/workflow";

const MARKDOWN = "text/x-markdown";

/** 반복 지정 옵션(--tag/--cc/--to)을 배열로 누적한다. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** 부가 필드 옵션. create/edit 가 공유한다. */
interface ExtraOpts {
  tag: string[];
  cc: string[];
  to: string[];
}

/**
 * --tag/--cc/--to 입력을 Dooray ID 로 해석해 PostInput 부가 필드로 만든다.
 * 아무것도 지정하지 않았으면 빈 객체를 돌려준다(기본 동작 불변).
 */
async function resolveExtras(
  client: DoorayClient,
  projectId: string,
  opts: ExtraOpts,
): Promise<{
  users?: { to?: PostUserRef[]; cc?: PostUserRef[] };
  tagIdList?: string[];
}> {
  const tagIdList = await Promise.all(
    opts.tag.map((name) => resolveTagId(client, projectId, name)),
  );
  const toIds = await Promise.all(
    opts.to.map((m) => resolveMemberId(client, projectId, m)),
  );
  const ccIds = await Promise.all(
    opts.cc.map((m) => resolveMemberId(client, projectId, m)),
  );
  const toRef = (id: string): PostUserRef => ({
    type: "member",
    member: { organizationMemberId: id },
  });

  const extras: {
    users?: { to?: PostUserRef[]; cc?: PostUserRef[] };
    tagIdList?: string[];
  } = {};
  if (tagIdList.length > 0) extras.tagIdList = tagIdList;
  if (toIds.length > 0 || ccIds.length > 0) {
    extras.users = {};
    if (toIds.length > 0) extras.users.to = toIds.map(toRef);
    if (ccIds.length > 0) extras.users.cc = ccIds.map(toRef);
  }
  return extras;
}

/** 업무 명령 그룹: list, get, create, edit, done, workflow, search, comment. */
export function postCommand(): Command {
  const post = new Command("post").description("업무 명령");

  const list = new Command("list")
    .description("업무 목록 (최신순)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .option("--page <n>", "페이지 번호", "0")
    .option("--size <n>", "페이지 크기", "20")
    .action(
      async (projectInput: string, opts: { page: string; size: string }) => {
        const mode = list.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("업무 조회 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const { items } = await client.listPosts(projectId, {
          page: Number(opts.page),
          size: Number(opts.size),
          order: "-createdAt",
        });
        stopSpinner();
        render(mode, {
          table: {
            columns: ["number", "subject"],
            rows: items.map((p) => [p.number, p.subject]),
          },
          json: items,
          ids: items.map((p) => String(p.number)),
        });
      },
    );

  const get = new Command("get")
    .description("업무 조회 (본문 포함)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .action(async (projectInput: string, postId: string) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("업무 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const found = await client.getPost(projectId, postId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["field", "value"],
          rows: [
            ["id", found.id],
            ["number", found.number],
            ["subject", found.subject],
          ],
        },
        json: found,
        ids: [found.id],
      });
      if (!mode.json && !mode.quiet && found.body) {
        process.stdout.write("\n" + found.body.content + "\n");
      }
    });

  const create = new Command("create")
    .description("업무 생성")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .requiredOption("--title <title>", "업무 제목")
    .option("--body <text>", "본문(마크다운)", "")
    .option("--tag <name>", "태그(반복 지정 가능)", collect, [])
    .option("--cc <member>", "참조 멤버(반복 지정 가능)", collect, [])
    .option("--to <member>", "수신 멤버(반복 지정 가능)", collect, [])
    .option("--milestone <name>", "마일스톤 이름 또는 ID")
    .option("--workflow <name>", "초기 워크플로 이름/클래스 또는 ID")
    .action(
      async (
        projectInput: string,
        opts: {
          title: string;
          body: string;
          tag: string[];
          cc: string[];
          to: string[];
          milestone?: string;
          workflow?: string;
        },
      ) => {
        const mode = create.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("업무 생성 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const extras = await resolveExtras(client, projectId, opts);
        // 미지정 시 payload 에 미포함(기본 동작 불변).
        const milestoneId = opts.milestone
          ? await resolveMilestoneId(client, projectId, opts.milestone)
          : undefined;
        const workflowId = opts.workflow
          ? await resolveWorkflowId(client, projectId, opts.workflow)
          : undefined;
        const { id } = await client.createPost(projectId, {
          subject: opts.title,
          body: { mimeType: MARKDOWN, content: opts.body },
          ...extras,
          ...(milestoneId ? { milestoneId } : {}),
          ...(workflowId ? { workflowId } : {}),
        });
        stopSpinner();
        reportWrite(mode, {
          json: { postId: id, status: "created" },
          id,
          message: `업무가 생성되었습니다: ${id}`,
        });
      },
    );

  const edit = new Command("edit")
    .description("업무 수정 (제목/본문 부분 수정 가능)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .option("--title <title>", "새 제목")
    .option("--body <text>", "새 본문(마크다운)")
    .option("--tag <name>", "태그(반복 지정 가능)", collect, [])
    .option("--cc <member>", "참조 멤버(반복 지정 가능)", collect, [])
    .option("--to <member>", "수신 멤버(반복 지정 가능)", collect, [])
    .action(
      async (
        projectInput: string,
        postId: string,
        opts: {
          title?: string;
          body?: string;
          tag: string[];
          cc: string[];
          to: string[];
        },
      ) => {
        const mode = edit.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("업무 수정 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const current = await client.getPost(projectId, postId);
        const subject = opts.title ?? current.subject;
        const content = opts.body ?? current.body?.content ?? "";
        const extras = await resolveExtras(client, projectId, opts);
        await client.updatePost(projectId, postId, {
          subject,
          body: { mimeType: MARKDOWN, content },
          ...extras,
        });
        stopSpinner();
        reportWrite(mode, {
          json: { postId, status: "updated" },
          id: postId,
          message: `업무가 수정되었습니다: ${postId}`,
        });
      },
    );

  const done = new Command("done")
    .description("업무를 완료(closed) 상태로 변경")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .action(async (projectInput: string, postId: string) => {
      const mode = done.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("업무 완료 처리 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const workflowId = await findClosedWorkflowId(client, projectId);
      await client.setPostWorkflow(projectId, postId, workflowId);
      stopSpinner();
      reportWrite(mode, {
        json: { postId, status: "done" },
        id: postId,
        message: `업무 완료 처리됨: ${postId}`,
      });
    });

  const workflow = new Command("workflow")
    .description("업무 워크플로 상태 변경")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<workflow>", "워크플로 이름/클래스 또는 ID")
    .action(
      async (projectInput: string, postId: string, workflowInput: string) => {
        const mode = workflow.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("워크플로 변경 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const workflowId = await resolveWorkflowId(
          client,
          projectId,
          workflowInput,
        );
        await client.setPostWorkflow(projectId, postId, workflowId);
        stopSpinner();
        reportWrite(mode, {
          json: { postId, workflow: workflowInput, status: "updated" },
          id: postId,
          message: `업무 워크플로가 변경되었습니다: ${postId}`,
        });
      },
    );

  const search = new Command("search")
    .description("업무 검색 (제목 키워드)")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .requiredOption("--keyword <kw>", "검색 키워드")
    .action(async (projectInput: string, opts: { keyword: string }) => {
      const mode = search.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("업무 검색 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const { items } = await client.listPosts(projectId, {
        subjects: opts.keyword,
        order: "-createdAt",
      });
      stopSpinner();
      render(mode, {
        table: {
          columns: ["number", "subject"],
          rows: items.map((p) => [p.number, p.subject]),
        },
        json: items,
        ids: items.map((p) => String(p.number)),
      });
    });

  const comment = new Command("comment").description("업무 댓글");

  const commentList = new Command("list")
    .description("업무 댓글 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .action(async (projectInput: string, postId: string) => {
      const mode = commentList.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("댓글 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const { items } = await client.listPostComments(projectId, postId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "author", "createdAt"],
          rows: items.map((c) => [
            c.id,
            c.creator?.member?.organizationMemberId ?? "",
            c.createdAt ?? "",
          ]),
        },
        json: items,
        ids: items.map((c) => c.id),
      });
    });

  const commentAdd = new Command("add")
    .description("업무 댓글 추가")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .requiredOption("--body <text>", "댓글 본문(마크다운)")
    .action(
      async (projectInput: string, postId: string, opts: { body: string }) => {
        const mode = commentAdd.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("댓글 작성 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const { id } = await client.createPostComment(projectId, postId, {
          body: { mimeType: MARKDOWN, content: opts.body },
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
    .description("업무 댓글 수정")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<comment-id>", "댓글 ID")
    .requiredOption("--body <text>", "새 댓글 본문(마크다운)")
    .action(
      async (
        projectInput: string,
        postId: string,
        commentId: string,
        opts: { body: string },
      ) => {
        const mode = commentEdit.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("댓글 수정 중...");
        const projectId = await resolveProjectId(client, projectInput);
        await client.updatePostComment(projectId, postId, commentId, {
          body: { mimeType: MARKDOWN, content: opts.body },
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
    .description("업무 댓글 삭제")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<comment-id>", "댓글 ID")
    .action(async (projectInput: string, postId: string, commentId: string) => {
      const mode = commentDelete.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("댓글 삭제 중...");
      const projectId = await resolveProjectId(client, projectInput);
      await client.deletePostComment(projectId, postId, commentId);
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

  const file = new Command("file").description("업무 첨부파일");

  const fileList = new Command("list")
    .description("업무 첨부파일 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .action(async (projectInput: string, postId: string) => {
      const mode = fileList.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("첨부파일 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const files = await client.listPostFiles(projectId, postId);
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
    .description("업무에 파일 업로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<file-path>", "업로드할 로컬 파일 경로")
    .action(async (projectInput: string, postId: string, filePath: string) => {
      const mode = fileUpload.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("파일 업로드 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const id = await client.uploadPostFile(projectId, postId, filePath);
      stopSpinner();
      reportWrite(mode, {
        json: { fileId: id, status: "uploaded" },
        id,
        message: `파일이 업로드되었습니다: ${id}`,
      });
    });

  const fileDownload = new Command("download")
    .description("업무 첨부파일 다운로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<file-id>", "첨부파일 ID")
    .option("--out <dir>", "저장 디렉터리", ".")
    .action(
      async (
        projectInput: string,
        postId: string,
        fileId: string,
        opts: { out: string },
      ) => {
        const mode = fileDownload.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("파일 다운로드 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const { buffer, fileName } = await client.downloadPostFile(
          projectId,
          postId,
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
    .description("업무 첨부파일 전체 다운로드")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .option("--out <dir>", "저장 디렉터리", ".")
    .action(
      async (projectInput: string, postId: string, opts: { out: string }) => {
        const mode = fileDownloadAll.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("첨부파일 전체 다운로드 중...");
        const projectId = await resolveProjectId(client, projectInput);
        const files = await client.listPostFiles(projectId, postId);
        const outcomes: DownloadOutcome[] = [];
        // 파일별로 실패를 수집한다 — 하나가 실패해도 나머지는 계속 받는다.
        for (const meta of files) {
          try {
            const { buffer, fileName } = await client.downloadPostFile(
              projectId,
              postId,
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
    .description("업무 첨부파일 삭제")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .argument("<post-id>", "업무 ID")
    .argument("<file-id>", "첨부파일 ID")
    .action(async (projectInput: string, postId: string, fileId: string) => {
      const mode = fileDelete.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("첨부파일 삭제 중...");
      const projectId = await resolveProjectId(client, projectInput);
      await client.deletePostFile(projectId, postId, fileId);
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

  post.addCommand(list);
  post.addCommand(get);
  post.addCommand(create);
  post.addCommand(edit);
  post.addCommand(done);
  post.addCommand(workflow);
  post.addCommand(search);
  post.addCommand(comment);
  post.addCommand(file);
  return post;
}
