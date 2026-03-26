import { Command } from "commander";
import { initDb } from "../db";
import { getDraftById, listDrafts } from "../db/repositories";

export function runListDraftsCommand(query?: string): string[] {
  const db = initDb();
  const drafts = listDrafts(db, query);
  return drafts.map((draft) => {
    const title = draft.title ? ` - ${draft.title}` : "";
    const application = draft.application_status ? ` | application=${draft.application_status}` : "";
    const gmail = draft.gmail_draft_id ? ` | gmail=${draft.gmail_draft_id}` : "";
    return `#${draft.id} | ${draft.company_name}${title} | variant=${draft.variant}${application}${gmail} | updated=${draft.updated_at}`;
  });
}

export function runShowDraftCommand(draftId: number): string {
  const db = initDb();
  const draft = getDraftById(db, draftId);
  if (!draft) {
    throw new Error(`Draft ${draftId} not found.`);
  }
  const title = draft.title ? ` - ${draft.title}` : "";
  const content = draft.edited_content ?? draft.generated_content;
  const application = draft.application_status ? ` | application=${draft.application_status}` : "";
  const gmail = draft.gmail_draft_id ? ` | gmail=${draft.gmail_draft_id}` : "";
  return `Draft #${draft.id} | ${draft.company_name}${title} | variant=${draft.variant}${application}${gmail}\n\n${content}`;
}

export function registerDraftsCommand(): Command {
  const command = new Command("drafts").description("List and show saved draft variants");

  command
    .command("list")
    .description("List saved drafts")
    .option("--query <text>", "filter drafts by company, role, or variant")
    .action((opts: { query?: string }) => {
      const lines = runListDraftsCommand(opts.query);
      if (lines.length === 0) {
        console.log("No saved drafts.");
        return;
      }
      for (const line of lines) console.log(line);
    });

  command
    .command("show")
    .description("Show a saved draft")
    .argument("<draft-id>", "draft id")
    .action((draftId: string) => {
      console.log(runShowDraftCommand(parseInt(draftId, 10)));
    });

  return command;
}
