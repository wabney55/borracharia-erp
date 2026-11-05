"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, LoaderCircle, X } from "lucide-react";

export function PasswordDialog({ forced, onClose, onSaved }: { forced: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) { setBusy(false); setError("A nova senha e a confirmação precisam ser iguais."); return; }
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível alterar a senha.");
      onSaved(); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível alterar a senha."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop password-backdrop"><section className="modal-card password-modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><div className="modal-heading"><div><span className="panel-kicker">SEGURANÇA DA CONTA</span><h2 id="password-title">{forced ? "Defina sua senha pessoal" : "Alterar senha"}</h2><p>{forced ? "Para começar a usar o sistema, troque a senha inicial." : "Use uma senha nova com pelo menos 12 caracteres."}</p></div>{!forced && <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>}</div><form onSubmit={save} className="modal-form"><div className="password-safety-note"><KeyRound size={16} /><span>Sua senha é armazenada com proteção e não aparece nos registros do sistema.</span></div><label className="form-field"><span>Senha atual <i>*</i></span><input required type="password" name="currentPassword" autoComplete="current-password" /></label><label className="form-field"><span>Nova senha <i>*</i></span><input required type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={100} /></label><label className="form-field"><span>Confirme a nova senha <i>*</i></span><input required type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={100} /></label>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions">{!forced && <button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button>}<button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Salvar nova senha</button></div></form></section></div>;
}
