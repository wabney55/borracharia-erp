"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível entrar.");
      router.replace(result.redirectTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return <form className="login-form" onSubmit={submit}>
    <label className="field-label" htmlFor="email">E-mail</label>
    <div className="input-with-icon"><Mail size={17} /><input id="email" name="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" required maxLength={160} /></div>
    <div className="password-label-row"><label className="field-label" htmlFor="password">Senha</label></div>
    <div className="input-with-icon"><LockKeyhole size={17} /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" required maxLength={200} /><button className="icon-button reveal-password" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <button className="button button-primary login-submit" disabled={busy} type="submit">{busy ? <><LoaderCircle className="spin" size={17} /> Entrando...</> : <>Entrar no sistema <span aria-hidden="true">→</span></>}</button>
  </form>;
}
