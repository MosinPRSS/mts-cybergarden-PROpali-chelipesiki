import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePwa } from "../../../application/usePwa.ts";
import "./pwa.css";

const hasUnfinishedWork = () => !!document.querySelector(
  '[role="dialog"], .drawer, [aria-busy="true"], [data-pwa-busy="true"]',
);

export function PwaShell({ children }: { children: ReactNode }) {
  const pwa = usePwa();
  const [blocked, setBlocked] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const offline = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!pwa.updateAvailable) return;
    const check = () => setBlocked(hasUnfinishedWork());
    const observer = new window.MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-busy", "data-pwa-busy", "class", "role"] });
    check();
    return () => observer.disconnect();
  }, [pwa.updateAvailable]);
  useEffect(() => {
    if (pwa.online) return;
    const previous = document.activeElement;
    offline.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [pwa.online]);

  return <>
    <div className="pwa-content" inert={!pwa.online || pwa.updating}>{children}</div>
    {!pwa.online && <section className="pwa-offline" role="alertdialog" aria-modal="true"
      aria-labelledby="pwa-offline-title" aria-describedby="pwa-offline-description" tabIndex={-1} ref={offline}>
      <div className="pwa-offline-card">
        <img className="pwa-brand" src="./image.png" alt="МТС" width="56" height="56" />
        <h1 id="pwa-offline-title">Нет подключения к сети</h1>
        <p id="pwa-offline-description">Для работы с инцидентами нужно соединение с сервером.
          Когда сеть появится, вы сможете продолжить.</p>
        <span className="pwa-waiting">Ожидаем подключения…</span>
      </div>
    </section>}
    {pwa.online && <aside className="pwa-controls" aria-label="Приложение МТС">
      {pwa.updateAvailable && (!deferred || pwa.updating ? <div className="pwa-card" role="status">
        <strong>{pwa.updating ? "Обновляем приложение…" : "Доступна новая версия"}</strong>
        <p>{blocked ? "Завершите текущее действие и закройте открытое окно перед обновлением." : "Обновление перезагрузит приложение."}</p>
        {pwa.error && <p className="pwa-error">{pwa.error}</p>}
        <div className="pwa-actions">
          <button type="button" disabled={blocked || pwa.updating} onClick={() => {
            // Recheck synchronously: a dialog or save may have started since the last observer callback.
            if (hasUnfinishedWork()) { setBlocked(true); return; }
            void pwa.update?.();
          }}>{pwa.updating ? "Обновление…" : "Обновить"}</button>
          <button type="button" className="pwa-secondary" disabled={pwa.updating} onClick={() => setDeferred(true)}>Позже</button>
        </div>
      </div> : <button className="pwa-compact" type="button" onClick={() => setDeferred(false)}>Доступно обновление</button>)}
      {!pwa.updateAvailable && !pwa.installed && !installDismissed && (pwa.installAvailable || pwa.iosInstallHint) && <div className="pwa-card">
        <button type="button" className="pwa-dismiss" aria-label="Скрыть предложение установки" onClick={() => setInstallDismissed(true)}>×</button>
        <strong>МТС Инциденты</strong>
        <p>Открывайте рабочее место как отдельное приложение.</p>
        {showIosHelp && <p>В Safari нажмите «Поделиться» → «На экран “Домой”» → «Добавить».</p>}
        <button type="button" onClick={() => pwa.iosInstallHint ? setShowIosHelp(true) : void pwa.install?.()}>
          {pwa.iosInstallHint ? "Как установить" : "Установить приложение"}
        </button>
      </div>}
      {!pwa.updateAvailable && pwa.error && <p className="pwa-card pwa-error" role="alert">{pwa.error}</p>}
    </aside>}
  </>;
}
