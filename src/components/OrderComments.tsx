import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, MessageSquare, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/use-user-roles";

type Comment = {
  id: string;
  order_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const MAX_LINES = 3;
const MAX_CHARS = 300;

function clampLines(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").slice(0, MAX_LINES);
  return lines.join("\n").slice(0, MAX_CHARS);
}

import { formatJalaliDateTime } from "@/lib/calc";

function formatDate(iso: string) {
  return formatJalaliDateTime(iso);
}

export function OrderComments({ orderId, readOnly = false }: { orderId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();

  const { data: comments = [] } = useQuery({
    queryKey: ["order-comments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_comments" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["user_profiles"],
    queryFn: async () => (await supabase.from("user_profiles").select("user_id, full_name")).data ?? [],
  });
  const nameFor = (uid: string) => (profiles as any[]).find((p) => p.user_id === uid)?.full_name ?? "—";

  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["order-comments", orderId] });

  const addComment = async () => {
    const content = clampLines(newText).trim();
    if (!content) return toast.error("متن توضیحات را وارد کنید");
    if (!me?.userId) return toast.error("ابتدا وارد شوید");
    const { error } = await (supabase.from("order_comments" as any) as any).insert({
      order_id: orderId,
      user_id: me.userId,
      content,
    });
    if (error) return toast.error(error.message);
    setNewText("");
    toast.success("توضیحات ثبت شد");
    refresh();
  };

  const saveEdit = async (id: string) => {
    const content = clampLines(editText).trim();
    if (!content) return toast.error("متن توضیحات را وارد کنید");
    const { error } = await (supabase.from("order_comments" as any) as any)
      .update({ content })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    toast.success("به‌روزرسانی شد");
    refresh();
  };

  const removeComment = async (id: string) => {
    if (!confirm("حذف این توضیحات؟")) return;
    const { error } = await (supabase.from("order_comments" as any) as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("حذف شد");
    refresh();
  };

  return (
    <div className="pt-3 border-t mt-3">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" /> توضیحات
      </div>

      <div className="space-y-2">
        {comments.length === 0 && (
          <div className="text-xs text-muted-foreground">هنوز توضیحی ثبت نشده است</div>
        )}
        {comments.map((c) => {
          const isMine = me?.userId === c.user_id;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                <span>{nameFor(c.user_id)} — {formatDate(c.created_at)}</span>
                {isMine && !readOnly && !isEditing && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingId(c.id); setEditText(c.content); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeComment(c.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(clampLines(e.target.value))}
                    rows={3}
                    maxLength={MAX_CHARS}
                  />
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3 w-3 ml-1" /> انصراف</Button>
                    <Button size="sm" onClick={() => saveEdit(c.id)}><Check className="h-3 w-3 ml-1" /> ذخیره</Button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">{c.content}</div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="افزودن توضیحات (حداکثر ۳ خط)"
            value={newText}
            onChange={(e) => setNewText(clampLines(e.target.value))}
            rows={3}
            maxLength={MAX_CHARS}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={addComment}>افزودن توضیحات</Button>
          </div>
        </div>
      )}
    </div>
  );
}
