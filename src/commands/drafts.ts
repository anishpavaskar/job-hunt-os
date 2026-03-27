import { Command } from "commander";
import { initDb } from "../db";
import { getDraftById, listDrafts } from "../db/repositories";

export async function runListDraftsCommand(query?: string): Promise<string[]> {
  const db = await initDb();
  const drafts = await listDrafts(db, query);
  return drafts.map((draft) => {
    const title = draft.title ? ` - ${draft.title}` : "";
    const application = draft.application_status ? ` | application=${draft.application_status}` : "";
    const gmail = draft.gmail_draft_id ? ` | gmail=${draft.gmail_draft_id}` : "";
    return `#${draft.id} | ${draft.company_name}${title} | variant=${draft.variant}${application}${gmail} | updated=${draft.updated_at}`;
  });
}

export async function runShowDraftCommand(draftId: number): Promise<string> {
  const db = await initDb();
  const draft = await getDraftById(db, draftId);
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
    .action(async (opts: { query?: string }) => {
      const lines = await runListDraftsCommand(opts.query);
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
    .action(async (draftId: string) => {
      console.log(await runShowDraftCommand(parseInt(draftId, 10)));
    });

  return command;
}
