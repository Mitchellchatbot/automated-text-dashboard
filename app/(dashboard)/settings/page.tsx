import { createClient } from "@/lib/supabase/server";
import { TemplateEditor } from "@/components/messaging/TemplateEditor";
import { RevealScope } from "@/components/motion/RevealScope";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_templates")
    .select("body")
    .eq("key", "see_off")
    .maybeSingle();

  return (
    <RevealScope>
      <header data-reveal>
        <p className="eyebrow">Messaging</p>
        <h1>See-off text template</h1>
        <p className="lead">
          The one-time message texted to a discharged client. Staff send it manually from a client&rsquo;s record.
        </p>
      </header>

      <div data-reveal data-reveal-delay="60">
        {data ? (
          <TemplateEditor initialBody={data.body} />
        ) : (
          <EmptyState
            title="Template not found"
            description="The see-off template row is missing. Re-run the messaging migration."
            icon="⚠️"
          />
        )}
      </div>
    </RevealScope>
  );
}
