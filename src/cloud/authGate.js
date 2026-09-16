import { brand } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { escapeHtml } from "../utils/text.js";

function authMessage(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "El correo o la contraseña no son correctos.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "Confirma tu correo antes de iniciar sesión.";
  if (code === "user_already_exists" || /already registered/i.test(message)) return "Ya existe una cuenta con ese correo. Inicia sesión.";
  if (/password/i.test(message) && /least|short|characters/i.test(message)) return "Usa una contraseña de al menos 8 caracteres.";
  if (/network|fetch/i.test(message)) return "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  return message || "No fue posible completar la autenticación.";
}

function authMarkup(mode, notice = null, error = null) {
  const registering = mode === "register";
  return `<main class="auth-page">
    <section class="auth-card" aria-labelledby="auth-title">
      ${brand()}
      <div class="auth-heading">
        <p class="eyebrow">Sincronización segura</p>
        <h1 id="auth-title">${registering ? "Crea tu cuenta" : "Inicia sesión"}</h1>
        <p>${registering ? "Usa un correo y una contraseña para llevar StudyHub a todos tus dispositivos." : "Recupera tus proyectos, sesiones y reflexiones desde cualquier dispositivo."}</p>
      </div>
      <div class="auth-tabs" role="tablist" aria-label="Acceso a StudyHub">
        <button type="button" role="tab" aria-selected="${!registering}" data-auth-mode="login">Iniciar sesión</button>
        <button type="button" role="tab" aria-selected="${registering}" data-auth-mode="register">Crear cuenta</button>
      </div>
      ${notice ? `<div class="auth-notice">${icon("check", 18)}<span>${escapeHtml(notice)}</span></div>` : ""}
      ${error ? `<div class="auth-notice auth-error">${icon("info", 18)}<span>${escapeHtml(error)}</span></div>` : ""}
      <form class="auth-form" data-auth-form="${mode}">
        <label>Correo electrónico<input type="email" name="email" autocomplete="email" inputmode="email" required placeholder="tu@correo.com" autofocus /></label>
        <label>Contraseña<input type="password" name="password" autocomplete="${registering ? "new-password" : "current-password"}" minlength="8" required placeholder="Mínimo 8 caracteres" /></label>
        <button class="primary-button auth-submit" type="submit">${registering ? "Crear cuenta" : "Entrar a StudyHub"}</button>
      </form>
      <p class="auth-footnote">${icon("shield", 17)} Tus datos se separan por cuenta. La contraseña nunca se guarda en StudyHub.</p>
      <p class="auth-local-note">Si ya tienes datos en este navegador, podrás decidir si quieres migrarlos después de entrar.</p>
    </section>
  </main>`;
}

export function mountAuthGate(root, auth, { onAuthenticated = () => globalThis.location?.reload?.() } = {}) {
  let mode = "login";
  let busy = false;
  let notice = null;
  let error = null;
  let completed = false;

  const render = () => {
    root.innerHTML = authMarkup(mode, notice, error);
    const form = root.querySelector("[data-auth-form]");
    if (busy && form) {
      form.setAttribute("aria-busy", "true");
      [...form.elements].forEach((element) => { element.disabled = true; });
    }
  };

  const onClick = (event) => {
    const button = event.target.closest("[data-auth-mode]");
    if (!button || busy) return;
    mode = button.dataset.authMode;
    notice = null;
    error = null;
    render();
  };

  const onSubmit = async (event) => {
    const form = event.target.closest("[data-auth-form]");
    if (!form || busy) return;
    event.preventDefault();
    busy = true;
    notice = null;
    error = null;
    render();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.authForm === "register") {
        const result = await auth.signUp(data.email, data.password);
        if (result.session) {
          completed = true;
          await onAuthenticated(result.session);
          return;
        }
        mode = "login";
        notice = "Cuenta creada. Revisa tu correo, confirma el acceso y luego inicia sesión.";
      } else {
        const session = await auth.signIn(data.email, data.password);
        if (!session) throw new Error("La sesión no pudo iniciarse.");
        completed = true;
        await onAuthenticated(session);
        return;
      }
    } catch (caught) {
      error = authMessage(caught);
    } finally {
      busy = false;
      if (!completed) render();
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  render();
  return {
    destroy() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
    },
  };
}
