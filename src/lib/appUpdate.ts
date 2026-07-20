const UPDATE_PENDING_KEY = "scan:new-version-pending";

type ServiceWorkerUpdateResult = {
  encontrados: number;
  atualizados: number;
};

export type ForceAppUpdateResult = {
  cachesLimpos: number;
  serviceWorkersEncontrados: number;
  serviceWorkersAtualizados: number;
};

async function limparCachesDoApp(): Promise<number> {
  if (!("caches" in window)) return 0;

  try {
    const keys = await window.caches.keys();
    await Promise.allSettled(keys.map((key) => window.caches.delete(key)));
    return keys.length;
  } catch {
    return 0;
  }
}

async function obterServiceWorkers(): Promise<ServiceWorkerRegistration[]> {
  if (!("serviceWorker" in navigator)) return [];

  try {
    if ("getRegistrations" in navigator.serviceWorker) {
      return navigator.serviceWorker.getRegistrations();
    }

    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? [registration] : [];
  } catch {
    return [];
  }
}

async function atualizarServiceWorkers(): Promise<ServiceWorkerUpdateResult> {
  const registrations = await obterServiceWorkers();
  let atualizados = 0;

  await Promise.allSettled(
    registrations.map(async (registration) => {
      await registration.update();
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      atualizados += 1;
    })
  );

  return {
    encontrados: registrations.length,
    atualizados,
  };
}

export async function forcarAtualizacaoApp(): Promise<ForceAppUpdateResult> {
  const [cachesLimpos, serviceWorkers] = await Promise.all([
    limparCachesDoApp(),
    atualizarServiceWorkers(),
  ]);

  try {
    sessionStorage.removeItem(UPDATE_PENDING_KEY);
  } catch {
    // Sessao pode estar bloqueada no navegador.
  }

  return {
    cachesLimpos,
    serviceWorkersEncontrados: serviceWorkers.encontrados,
    serviceWorkersAtualizados: serviceWorkers.atualizados,
  };
}

export function recarregarAppAtualizado() {
  const url = new URL(window.location.href);
  url.searchParams.set("scan_app_refresh", Date.now().toString());
  window.location.replace(url.toString());
}

export function limparCacheBusterDaUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("scan_app_refresh")) return;

  url.searchParams.delete("scan_app_refresh");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}
