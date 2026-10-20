import { setLastApp } from './store';

interface PalmBridge {
  onservicecallback: ((msg: string) => void) | null;
  call(uri: string, params: string): void;
  cancel?: () => void;
}
declare global {
  interface Window {
    PalmServiceBridge?: new () => PalmBridge;
  }
}

const SERVICE = 'luna://com.lghome.app.service/';

export function call<T>(uri: string, params?: object, timeoutMs: number = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const Ctor = window.PalmServiceBridge;
    if (!Ctor) {
      reject(new Error('PalmServiceBridge no disponible'));
      return;
    }
    const bridge = new Ctor();
    let done = false;
    let timer: number | undefined;
    const finish = () => {
      done = true;
      if (timer !== undefined) window.clearTimeout(timer);
      bridge.onservicecallback = null;
      try { if (bridge.cancel) bridge.cancel(); } catch (e) { /* ya cerrado */ }
    };
    bridge.onservicecallback = (msg: string) => {
      if (done) return;
      let res: any;
      try { res = JSON.parse(msg); } catch (e) {
        finish();
        reject(new Error('respuesta no válida de ' + uri));
        return;
      }
      finish();
      if (res && res.returnValue === false) {
        reject(new Error(String(res.errorText || 'error en ' + uri)));
      } else {
        resolve(res as T);
      }
    };
    timer = window.setTimeout(() => {
      if (done) return;
      finish();
      const err: Error & { timeout?: boolean } = new Error('Tiempo agotado llamando a ' + uri);
      err.timeout = true;
      reject(err);
    }, timeoutMs);
    try {
      bridge.call(uri, JSON.stringify(params || {}));
    } catch (e) {
      finish();
      reject(e);
    }
  });
}

export function svc<T>(method: string, params?: object): Promise<T> {
  return call<T>(SERVICE + method, params);
}

/** Espera máxima a la respuesta de applicationManager/launch. */
export const LAUNCH_DIRECT_TIMEOUT_MS = 1500;

/** Abre una app. Primero la API pública de applicationManager (responde en ms y no depende del
 *  servicio); el servicio (root) queda solo como respaldo si la llamada directa falla de forma explícita
 *  (returnValue:false o error del bridge). Si la respuesta no llega a tiempo (p. ej. nuestra app se
 *  suspende al aparecer la otra) se da por lanzada: reintentar por el servicio la abriría dos veces. */
export function launchApp(id: string, params?: object): Promise<void> {
  const body: { id: string; params?: object } = { id };
  if (params) body.params = params;
  return call<unknown>('luna://com.webos.applicationManager/launch', body, LAUNCH_DIRECT_TIMEOUT_MS)
    .catch((e: Error & { timeout?: boolean }) => (e && e.timeout ? undefined : svc<unknown>('launch', body)))
    .then(() => { setLastApp(id); });
}
